"""Identity-document image sanitize / re-encode (REV-022, §7.3).

Driver's-license images are uploaded straight to the private `licenses` bucket
by the browser. Before they enter the review queue we re-encode them server-side:
Pillow decodes the bytes (rejecting anything that isn't a real raster image),
drops every EXIF/ICC/metadata chunk, flattens to RGB, and re-uploads the clean
copy in place. This neutralises polyglot/EXIF-payload uploads and steganographic
metadata on PII we're obliged to hold.

Best-effort by contract: any failure (Pillow missing, decode error, storage
hiccup) is logged and swallowed — the upload flow must never block on it.
"""

import io
import logging

from app.supa import service_client

logger = logging.getLogger("eastern-rentals-api")

MAX_DECODE_BYTES = 15 * 1024 * 1024  # refuse to decode absurdly large blobs


def sanitize_license_image(bucket: str, path: str) -> bool:
    """Download, re-encode (stripping metadata), and re-upload the object.
    Returns True if a sanitized copy was written, False otherwise (logged)."""
    svc = service_client()
    if svc is None:
        return False
    try:
        from PIL import Image, UnidentifiedImageError
    except Exception as exc:  # noqa: BLE001 — dependency not installed
        logger.warning("imaging: Pillow unavailable (%s) — skipping re-encode of %s", exc, path)
        return False

    try:
        raw = svc.storage.from_(bucket).download(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("imaging: download failed for %s/%s: %s", bucket, path, exc)
        return False

    if not raw or len(raw) > MAX_DECODE_BYTES:
        logger.warning("imaging: %s empty or too large to sanitize", path)
        return False

    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.load()  # force full decode — corrupt/polyglot inputs raise here
            clean = img.convert("RGB")
        out = io.BytesIO()
        clean.save(out, format="JPEG", quality=90)  # JPEG carries no input metadata
        out.seek(0)
    except UnidentifiedImageError:
        logger.warning("imaging: %s is not a decodable image — leaving as-is for admin review", path)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("imaging: re-encode failed for %s: %s", path, exc)
        return False

    try:
        svc.storage.from_(bucket).update(
            path, out.read(), {"content-type": "image/jpeg", "upsert": "true"}
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("imaging: re-upload failed for %s: %s", path, exc)
        return False
