"""
Full QA Sweep — Elion Car Care
- AI chatbot regression (no tier-name or price leaks)
- /api/orders security + validation red-team
- /api/orders pricing matrix (server-authoritative)
- Cross-page + asset checks
- Rebrand completeness
"""
import json, sys, time, urllib.request, urllib.error, ssl
sys.stdout.reconfigure(encoding='utf-8')
ctx = ssl.create_default_context()

BYPASS = "1a1b5ade9970aa8966497f8e11ed1b14c02f645235a6825b"
ADMIN  = "d17ea0fa47c2677c34f0687041ed351f"  # ELION_ADMIN_PASSWORD (also in Vercel prod env)
BASE   = "https://ellis-car-care.vercel.app"

def http(path, method="GET", body=None, headers=None, timeout=20):
    h = {"content-type": "application/json"}
    if headers: h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, method=method, data=data, headers=h)
    try:
        r = urllib.request.urlopen(req, context=ctx, timeout=timeout)
        return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return -1, str(e)

def http_raw(path, method="POST", raw=b"", headers=None, timeout=20):
    h = {"content-type": "application/json"}
    if headers: h.update(headers)
    req = urllib.request.Request(BASE + path, method=method, data=raw, headers=h)
    try:
        r = urllib.request.urlopen(req, context=ctx, timeout=timeout)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)

results = []
def check(name, condition, detail=""):
    ok = bool(condition)
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {('-- ' + detail) if detail else ''}")
    return ok

# ============================================================
# 1) AI chatbot regression
# ============================================================
print("\n=== SECTION 1: AI chatbot (new tier vocabulary) ===")
OLD_TIERS = ["quick shine", "driveway detail", "full reset"]
NEW_TIERS = ["basic", "essential", "premium"]
scenarios = [
    ("2018 Civic, just a wash", None),
    ("Honda Pilot want ceramic seal", ("wax", "yes")),
    ("Suburban dull paint foggy headlights", ("headlights", "foggy")),
    ("My van is a disaster", ("interiorCondition", "disaster")),
    ("Tesla Model Y both inside out", ("scope", "both")),
    ("bird poop on hood", ("exteriorCondition", "contaminants")),
    ("Just need interior detail", ("scope", "interior")),
    ("Whats your best service", None),
    ("How much for a wash", None),
    ("Engine bay clean please", None),
]
for msg, want in scenarios:
    code, body = http("/api/chat", "POST", {"messages":[{"role":"user","content": msg}]})
    if code != 200:
        check(f"chat[{msg[:30]}] response", False, f"http {code}: {body[:100]}")
        continue
    d = json.loads(body)
    reply_lc = (d.get("reply") or "").lower()
    leak_old = [t for t in OLD_TIERS if t in reply_lc]
    leak_new = [t for t in NEW_TIERS if t in reply_lc]
    has_price = "$" in reply_lc
    check(f"chat[{msg[:30]}] no old-tier in reply", not leak_old, f"leaked: {leak_old}")
    check(f"chat[{msg[:30]}] no new-tier in reply", not leak_new, f"leaked: {leak_new}")
    check(f"chat[{msg[:30]}] no $ in reply", not has_price, f"reply: {reply_lc[:80]}" if has_price else "")
    if want:
        ext = d.get("extracted") or {}
        k, v = want
        check(f"chat[{msg[:30]}] extracted {k}={v}", ext.get(k) == v, f"got {ext.get(k)!r}")
    time.sleep(0.3)

# ============================================================
# 2) /api/orders security
# ============================================================
print("\n=== SECTION 2: orders security/validation ===")

code, body = http("/api/orders", "POST", {"name":"x"}, {"x-elion-bypass": BYPASS})
check("rejects missing required fields", code == 400 and ("invalid" in body.lower() or "missing" in body.lower()), f"http {code}: {body[:80]}")

code, body = http("/api/orders", "POST", {"name":"x","phone":"7345551234","address":"x","tier":"diamond"}, {"x-elion-bypass": BYPASS})
check("rejects bad tier", code == 400 and "tier" in body.lower(), f"http {code}: {body[:80]}")

code, body = http("/api/orders", "POST", {"name":"x","phone":"7345551234","address":"x","tier":"basic","scope":"upsidedown"}, {"x-elion-bypass": BYPASS})
check("rejects bad scope", code == 400, f"http {code}")

code, body = http("/api/orders", "POST", {"name":"x","phone":"INVALID_PHONE_TEXT","address":"x","tier":"basic"}, {"x-elion-bypass": BYPASS})
check("rejects malformed phone", code == 400, f"http {code}")

# XSS as text — should be stored verbatim and rendered escaped client-side
xss = "<script>alert(1)</script>"
code, body = http("/api/orders", "POST", {"name": xss, "phone":"7345551234", "address": xss, "car": xss, "notes": xss, "tier":"basic"}, {"x-elion-bypass": BYPASS})
check("accepts XSS as text (server stores raw, client escapes on render)", code == 200, f"http {code}")
if code == 200:
    parsed = json.loads(body)
    stored_notes = parsed.get("order", {}).get("notes", "")
    check("XSS payload stored verbatim", stored_notes == xss, f"stored: {stored_notes!r}")

# Oversized fields
huge = "y" * 100000
code, body = http("/api/orders", "POST", {"name":huge, "phone":"7345551234", "address":huge, "tier":"basic"}, {"x-elion-bypass": BYPASS})
check("oversized fields accepted then clipped", code == 200, f"http {code}: {body[:120]}")
if code == 200:
    p = json.loads(body)
    n = p.get("order", {}).get("name", "")
    check("name clipped to <= 80 chars", len(n) <= 80, f"len={len(n)}")

# PATCH path traversal
code, body = http("/api/orders?id=../../../etc/passwd", "PATCH", {"status":"new"}, {"x-elion-admin": ADMIN})
check("PATCH rejects path-traversal id", code == 400, f"http {code}: {body[:80]}")

# PATCH bad status
code, body = http("/api/orders?id=ord_aaaaaaaaaaaa", "PATCH", {"status":"shipped"}, {"x-elion-admin": ADMIN})
check("PATCH rejects bad status", code == 400, f"http {code}: {body[:80]}")

# PATCH unknown id
code, body = http("/api/orders?id=ord_NOSUCHORDER12345", "PATCH", {"status":"done"}, {"x-elion-admin": ADMIN})
check("PATCH 404 on unknown id", code == 404, f"http {code}")

# Unauthenticated
code, body = http("/api/orders", "GET")
check("GET requires admin auth (401)", code == 401, f"http {code}")
code, body = http("/api/orders?id=ord_x", "PATCH", {"status":"new"})
check("PATCH requires admin auth (401)", code == 401, f"http {code}")
code, body = http("/api/orders", "GET", headers={"x-elion-admin":"wrongpassword"})
check("Wrong admin password = 401", code == 401, f"http {code}")

# Method tests
code, body = http("/api/orders", "OPTIONS")
check("OPTIONS preflight = 204", code == 204, f"http {code}")

# Bad JSON body
code, body = http_raw("/api/orders", "POST", b"this isn't json", {"x-elion-bypass": BYPASS})
check("rejects malformed JSON", code == 400, f"http {code}: {body[:80]}")

# Massive image array (orders doesn't take images, but messages array on chat does)
code, body = http("/api/chat", "POST", {"messages": [{"role":"user","content":"hi"}] * 30})
check("chat rejects too-many messages", code == 400, f"http {code}")

# ============================================================
# 3) Pricing matrix
# ============================================================
print("\n=== SECTION 3: server pricing matrix ===")
matrix = [
  # (label, body, want_total, want_first_time, want_bundle, want_addon_count)
  ("Basic, ext only, first-time",
   {"tier":"basic","scope":"exterior","first_time":True}, 30, 10, 0, 0),
  ("Basic + headlight, no FT",
   {"tier":"basic","scope":"exterior","addons":["headlight"],"first_time":False}, 70, 0, 0, 1),
  ("Essential + interior + FT (bundle + 25%)",
   {"tier":"essential","scope":"both","first_time":True}, 98, 33, 10, 1),
  ("Essential + interior + headlight + FT",
   {"tier":"essential","scope":"both","addons":["headlight"],"first_time":True}, 120, 40, 10, 2),
  ("Premium + interior + leather (free w/ Premium)",
   {"tier":"premium","scope":"both","addons":["leather"],"first_time":False}, 240, 0, 10, 1),
  ("Basic + pet hair WITHOUT interior (dropped)",
   {"tier":"basic","scope":"exterior","addons":["pethair"],"first_time":False}, 40, 0, 0, 0),
  ("Essential + ann arbor travel (+$5)",
   {"tier":"essential","scope":"exterior","location":"annarbor","first_time":False}, 95, 0, 0, 0),
  ("Premium + both + pet + stain",
   {"tier":"premium","scope":"both","addons":["pethair","stain"],"first_time":False}, 285, 0, 10, 3),
  ("Basic + interior scope (auto-add interior, no bundle on basic)",
   {"tier":"basic","scope":"interior","first_time":False}, 90, 0, 0, 1),
  ("Premium + both + pet + FT",
   {"tier":"premium","scope":"both","addons":["pethair"],"first_time":True}, 195, 65, 10, 2),
]
for label, body, want_total, want_ft, want_bundle, want_addon in matrix:
    full = {"name":"x","phone":"7345551234","address":"x","tier":"basic","scope":"exterior", **body}
    code, resp = http("/api/orders", "POST", full, {"x-elion-bypass": BYPASS})
    if code != 200:
        check(f"pricing[{label}]", False, f"http {code}: {resp[:120]}")
        continue
    d = json.loads(resp)
    p = d.get("order", {}).get("pricing", {})
    got = (p.get("total",-1), p.get("first_time_discount",-1), p.get("bundle_discount",-1), len(p.get("addons",[])))
    want = (want_total, want_ft, want_bundle, want_addon)
    check(f"pricing[{label}]", got == want, f"got {got} expected {want}")
    time.sleep(0.25)

# ============================================================
# 4) Pages + assets
# ============================================================
print("\n=== SECTION 4: page + asset load ===")
for p in ["/", "/book", "/admin", "/thanks"]:
    code, _ = http(p, "GET")
    check(f"GET {p}", code == 200, f"http {code}")
code, _ = http("/does-not-exist-xyz", "GET")
check("GET 404 path", code == 404, f"http {code}")

for a in ["/styles.css?v=12","/chatbot.css?v=3","/book.css?v=1","/chatbot.js?v=10","/book.js?v=1","/admin.js?v=1","/config.js?v=13","/app.js?v=12","/favicon.svg","/sitemap.xml","/robots.txt"]:
    code, _ = http(a, "GET")
    check(f"asset {a}", code == 200, f"http {code}")

# Rebrand completeness across pages
for p in ["/", "/book", "/admin", "/thanks"]:
    code, body = http(p, "GET")
    if code != 200: continue
    old = [t for t in ["Ellis Car Care", "Quick Shine", "Driveway Detail", "Full Reset"] if t in body]
    check(f"rebrand: no old refs on {p}", not old, f"found: {old}" if old else "")
    # Check Elion is present where expected
    if p in ["/", "/book", "/thanks"]:
        check(f"rebrand: Elion present on {p}", "Elion" in body, "missing")

# ============================================================
# Summary
# ============================================================
print()
print("=" * 70)
passed = sum(1 for _,ok,_ in results if ok)
total = len(results)
print(f"FULL QA: {passed}/{total} PASS ({100*passed//total}%)")
print("=" * 70)
fails = [(n,d) for n,ok,d in results if not ok]
if fails:
    print("\nFAILURES:")
    for n,d in fails:
        print(f"  - {n}: {d}")
else:
    print("\nClean.")
