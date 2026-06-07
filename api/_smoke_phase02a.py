"""Local integration smoke for Phase 02a endpoints against LIVE Supabase.
Loads repo-root .env, then exercises the public catalog/availability/calendar
routes and an admin-auth guard. Run: api/.venv/Scripts/python _smoke_phase02a.py
(from the api/ directory). Not committed-critical; a dev aid."""

import os
from datetime import date, timedelta
from pathlib import Path

# Load repo-root .env into the environment.
env_path = Path(__file__).resolve().parent.parent / ".env"
for line in env_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

fails = []


def check(name, cond, detail=""):
    print(f"{'PASS' if cond else 'FAIL'}: {name} {detail}")
    if not cond:
        fails.append(name)


with TestClient(app) as client:
    r = client.get("/api/v1/products")
    products = r.json() if r.status_code == 200 else []
    check("GET /products 200", r.status_code == 200, f"(status={r.status_code})")
    check("catalog has active products", len(products) >= 1, f"(n={len(products)})")

    if products:
        pid = products[0]["id"]
        start = (date.today() + timedelta(days=30)).isoformat()
        end = (date.today() + timedelta(days=32)).isoformat()
        a = client.get(f"/api/v1/products/{pid}/availability", params={"start": start, "end": end})
        check("GET availability 200", a.status_code == 200, f"(status={a.status_code} body={a.text[:120]})")
        if a.status_code == 200:
            check("available with no rentals", a.json()["available"] is True, str(a.json()))

        month = (date.today() + timedelta(days=30)).strftime("%Y-%m")
        c = client.get(f"/api/v1/products/{pid}/calendar", params={"month": month})
        check("GET calendar 200", c.status_code == 200, f"(status={c.status_code})")
        if c.status_code == 200:
            cal = c.json()
            check("calendar has days", len(cal["days"]) >= 28, f"(days={len(cal['days'])})")

        # max-duration guard
        far = (date.today() + timedelta(days=400)).isoformat()
        m = client.get(f"/api/v1/products/{pid}/availability", params={"start": start, "end": far})
        check("availability rejects over-max span (400)", m.status_code == 400, f"(status={m.status_code})")

    # admin guard: no token → 401
    g = client.get("/api/v1/admin/products")
    check("admin requires auth (401)", g.status_code == 401, f"(status={g.status_code})")

print("\nRESULT:", "ALL PASS" if not fails else f"FAILURES: {fails}")
raise SystemExit(1 if fails else 0)
