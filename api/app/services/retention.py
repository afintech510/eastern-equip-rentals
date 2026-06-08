"""Retention purge honoring legal-hold (§7.3, V3-002, REV-005/013/031).

PII windows (from `config`): licenses → `license_retention_months` (12),
contracts/waivers → `contract_retention_years` (6), condition photos →
`photo_retention_years` (6). For every purgeable record we:

1. **Skip if held.** A `rentals`/`condition_photos`/`rental_documents` record is
   skipped when its rental's `legal_hold` is true. A customer-scoped
   `license_uploads` record is skipped when its owning **customer's** `legal_hold`
   is true *or any of that customer's rentals is held* — so identity PII can't be
   purged at the 12-month window during litigation (V3-002).
2. **Delete the Storage object before the DB row** (REV-013/031). The storage
   delete is retryable; if it fails we leave the row so the next run retries, and
   we never orphan a row whose object still exists.

An orphan-object sweep removes Storage objects that no live DB row references.

The boolean rules are factored into pure helpers so Phase 07 can assert the
hold logic without a database.
"""

import logging
from datetime import date

from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api.jobs")

LICENSE_BUCKET = "licenses"
DOCUMENT_BUCKET = "signed-documents"
PHOTO_BUCKET = "condition-photos"


# ---------- pure decision helpers (unit-tested) ----------
def due_for_purge(purge_after: date | None, today: date) -> bool:
    """A windowed record is due when its purge_after date has arrived."""
    return purge_after is not None and purge_after <= today


def license_is_held(customer_legal_hold: bool, rental_holds: list[bool]) -> bool:
    """V3-002: a license is held if the owning customer is held OR any of that
    customer's rentals is held."""
    return bool(customer_legal_hold) or any(rental_holds)


def record_is_held(rental_legal_hold: bool) -> bool:
    """A rental-scoped artifact (document / condition photo) is held iff its
    rental is held."""
    return bool(rental_legal_hold)


# ---------- storage helper ----------
def _delete_object(svc, bucket: str, path: str | None) -> bool:
    """Delete a Storage object first (REV-013). Returns True if the object is
    gone (deleted now or already absent), False on a retryable error."""
    if not path:
        return True
    try:
        svc.storage.from_(bucket).remove([path])
        return True
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if "not found" in msg or "404" in msg:
            return True  # already gone — safe to delete the row
        logger.warning("retention: storage delete failed %s/%s: %s — will retry", bucket, path, exc)
        return False


# ---------- executors ----------
def purge_licenses(svc, today: date) -> dict:
    processed = skipped = 0
    rows = (
        svc.table("license_uploads")
        .select("id,customer_id,storage_path,purge_after")
        .lte("purge_after", today.isoformat())
        .execute()
        .data
        or []
    )
    for lu in rows:
        cust = (
            svc.table("customers")
            .select("legal_hold")
            .eq("id", lu["customer_id"])
            .execute()
            .data
        )
        customer_hold = bool(cust[0]["legal_hold"]) if cust else False
        rental_holds = [
            bool(r["legal_hold"])
            for r in (
                svc.table("rentals")
                .select("legal_hold")
                .eq("customer_id", lu["customer_id"])
                .execute()
                .data
                or []
            )
        ]
        if license_is_held(customer_hold, rental_holds):
            skipped += 1
            logger.info("retention: license %s skipped (legal hold)", lu["id"])
            continue
        if not _delete_object(svc, LICENSE_BUCKET, lu["storage_path"]):
            skipped += 1
            continue
        svc.table("license_uploads").delete().eq("id", lu["id"]).execute()
        processed += 1
    return {"processed": processed, "skipped": skipped}


def _purge_rental_scoped(svc, table: str, bucket: str, path_col: str, cutoff: date) -> dict:
    """Shared body for rental_documents / condition_photos: anything created on
    or before `cutoff` whose rental is not held."""
    processed = skipped = 0
    rows = (
        svc.table(table)
        .select(f"id,rental_id,{path_col},created_at")
        .lte("created_at", cutoff.isoformat())
        .execute()
        .data
        or []
    )
    for row in rows:
        rental = (
            svc.table("rentals").select("legal_hold").eq("id", row["rental_id"]).execute().data
        )
        rental_hold = bool(rental[0]["legal_hold"]) if rental else False
        if record_is_held(rental_hold):
            skipped += 1
            continue
        if not _delete_object(svc, bucket, row.get(path_col)):
            skipped += 1
            continue
        svc.table(table).delete().eq("id", row["id"]).execute()
        processed += 1
    return {"processed": processed, "skipped": skipped}


def purge_documents(svc, today: date, retention_years: int) -> dict:
    cutoff = today.replace(year=today.year - retention_years)
    return _purge_rental_scoped(svc, "rental_documents", DOCUMENT_BUCKET, "signed_pdf_path", cutoff)


def purge_condition_photos(svc, today: date, retention_years: int) -> dict:
    cutoff = today.replace(year=today.year - retention_years)
    # condition_photos.created_at doesn't exist; it records taken_at instead.
    processed = skipped = 0
    rows = (
        svc.table("condition_photos")
        .select("id,rental_id,storage_path,taken_at")
        .lte("taken_at", cutoff.isoformat())
        .execute()
        .data
        or []
    )
    for row in rows:
        rental = (
            svc.table("rentals").select("legal_hold").eq("id", row["rental_id"]).execute().data
        )
        if record_is_held(bool(rental[0]["legal_hold"]) if rental else False):
            skipped += 1
            continue
        if not _delete_object(svc, PHOTO_BUCKET, row["storage_path"]):
            skipped += 1
            continue
        svc.table("condition_photos").delete().eq("id", row["id"]).execute()
        processed += 1
    return {"processed": processed, "skipped": skipped}


def _all_db_paths(svc) -> set[str]:
    """Every Storage path referenced by a live DB row, namespaced by bucket so
    an orphan in one bucket can't be masked by a path collision in another."""
    paths: set[str] = set()
    for row in svc.table("license_uploads").select("storage_path").execute().data or []:
        paths.add(f"{LICENSE_BUCKET}/{row['storage_path']}")
    for row in svc.table("condition_photos").select("storage_path").execute().data or []:
        paths.add(f"{PHOTO_BUCKET}/{row['storage_path']}")
    for row in svc.table("rental_documents").select("signed_pdf_path").execute().data or []:
        if row.get("signed_pdf_path"):
            paths.add(f"{DOCUMENT_BUCKET}/{row['signed_pdf_path']}")
    return paths


def orphan_sweep(svc, *, delete: bool = False) -> dict:
    """Find Storage objects with no live DB reference (REV-013).

    Defaults to **report-only**: orphan candidates are logged and counted but not
    removed. Deletion is gated behind `delete=True` because mis-listing PII
    buckets is irreversible — flip it on only after the listing is validated in
    ops. `created_at`/`taken_at`/`signed_pdf_path` already drop with their rows,
    so true orphans are rare (failed mid-write uploads)."""
    referenced = _all_db_paths(svc)
    candidates: list[str] = []
    for bucket, prefix_paths in (
        (LICENSE_BUCKET, _list_object_paths(svc, LICENSE_BUCKET)),
        (PHOTO_BUCKET, _list_object_paths(svc, PHOTO_BUCKET)),
        (DOCUMENT_BUCKET, _list_object_paths(svc, DOCUMENT_BUCKET)),
    ):
        for path in prefix_paths:
            if f"{bucket}/{path}" not in referenced:
                candidates.append(f"{bucket}/{path}")
                if delete:
                    _delete_object(svc, bucket, path)
    if candidates:
        logger.warning(
            "retention orphan sweep: %d candidate(s)%s",
            len(candidates),
            " removed" if delete else " (report-only)",
        )
    return {"orphans": len(candidates), "deleted": len(candidates) if delete else 0}


def _list_object_paths(svc, bucket: str, prefix: str = "") -> list[str]:
    """Best-effort recursive listing of object paths under a bucket. Storage
    'folders' have no metadata id; files do. One level of recursion covers our
    `{owner}/file` and `{rental}/file` layouts."""
    out: list[str] = []
    try:
        entries = svc.storage.from_(bucket).list(prefix)
    except Exception as exc:  # noqa: BLE001
        logger.warning("retention: could not list %s/%s: %s", bucket, prefix, exc)
        return out
    for e in entries or []:
        name = e.get("name")
        if not name:
            continue
        full = f"{prefix}/{name}" if prefix else name
        if e.get("id"):  # a file
            out.append(full)
        else:  # a folder — descend once
            out.extend(_list_object_paths(svc, bucket, full))
    return out


def run_retention(svc=None, today: date | None = None) -> dict:
    """Orchestrate all purge passes + the orphan sweep. Returns aggregate
    processed/skipped counts for the job_runs record."""
    svc = svc if svc is not None else service_client()
    if svc is None:
        logger.info("retention: Supabase unconfigured — nothing to purge")
        return {"processed": 0, "skipped": 0, "detail": {"note": "no db"}}
    today = today or date.today()
    cfg = svc.table("config").select("*").eq("id", True).execute().data
    contract_years = int(cfg[0]["contract_retention_years"]) if cfg else 6
    photo_years = int(cfg[0]["photo_retention_years"]) if cfg else 6

    lic = purge_licenses(svc, today)
    docs = purge_documents(svc, today, contract_years)
    photos = purge_condition_photos(svc, today, photo_years)
    orphans = orphan_sweep(svc, delete=False)  # report-only by default
    detail = {
        "licenses": lic,
        "documents": docs,
        "condition_photos": photos,
        "orphans": orphans,
    }
    logger.info("retention purge done: %s", detail)
    return {
        "processed": lic["processed"] + docs["processed"] + photos["processed"],
        "skipped": lic["skipped"] + docs["skipped"] + photos["skipped"],
        "detail": detail,
    }
