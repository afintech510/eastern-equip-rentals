#!/usr/bin/env python3
"""Apply SQL files to the live Supabase Postgres via the Management API.

Reads SUPABASE_PAT + SUPABASE_URL from .env (never echoed). Usage:
    python scripts/apply_remote_sql.py --query "select version();"
    python scripts/apply_remote_sql.py FILE [FILE ...]
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"


def load_env() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip()
    return out


def run_query(ref: str, pat: str, sql: str) -> tuple[int, str]:
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {pat}",
            "Content-Type": "application/json",
            "User-Agent": "eastern-rentals-migrate/1.0 (+https://github.com/afintech510/eastern-equip-rentals)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


def main() -> int:
    env = load_env()
    pat = env.get("SUPABASE_PAT", "")
    surl = env.get("SUPABASE_URL", "")
    if not pat or not surl:
        print("Missing SUPABASE_PAT / SUPABASE_URL in .env", file=sys.stderr)
        return 2
    ref = surl.replace("https://", "").split(".")[0]

    args = sys.argv[1:]
    if args and args[0] == "--query":
        status, text = run_query(ref, pat, args[1])
        print(f"[{status}] {text[:2000]}")
        return 0 if status < 300 else 1

    if args and args[0] == "--create-user":
        # --create-user EMAIL PASSWORD [FULL_NAME]  (Auth Admin API, service role)
        email, password = args[1], args[2]
        full_name = args[3] if len(args) > 3 else "Eastern Rentals Admin"
        srk = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
        body = json.dumps(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{surl}/auth/v1/admin/users",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {srk}",
                "apikey": srk,
                "Content-Type": "application/json",
                "User-Agent": "eastern-rentals-migrate/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                d = json.loads(resp.read().decode("utf-8"))
                # Never echo the password; only id + email.
                print(f"[{resp.status}] created user id={d.get('id')} email={d.get('email')}")
                return 0
        except urllib.error.HTTPError as e:
            print(f"[{e.code}] {e.read().decode('utf-8')[:1000]}", file=sys.stderr)
            return 1

    if args and args[0] == "--api":
        # --api GET <path> | --api PATCH <path> <json-body>
        method, path = args[1], args[2]
        data = args[3].encode("utf-8") if len(args) > 3 else None
        req = urllib.request.Request(
            f"https://api.supabase.com{path}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {pat}",
                "Content-Type": "application/json",
                "User-Agent": "eastern-rentals-migrate/1.0",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                print(f"[{resp.status}] {resp.read().decode('utf-8')[:200000]}")
                return 0
        except urllib.error.HTTPError as e:
            print(f"[{e.code}] {e.read().decode('utf-8')[:200000]}", file=sys.stderr)
            return 1

    for path in args:
        sql = Path(path).read_text(encoding="utf-8")
        status, text = run_query(ref, pat, sql)
        ok = status < 300
        print(f"{'OK ' if ok else 'ERR'} [{status}] {path}")
        if not ok:
            print(text[:200000], file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
