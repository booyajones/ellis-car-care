/* Unit tests for the loyalty core (pure logic). Run: node scripts/qa_loyalty.mjs
   Requires LOYALTY_HASH_SECRET to be set (the script sets a test value). */
process.env.LOYALTY_HASH_SECRET = process.env.LOYALTY_HASH_SECRET || "test-secret-do-not-use-in-prod";

const {
  normalizeEmail, hashEmail, signToken, verifyToken, timingSafeHex,
  newCustomer, recompute, computeCard, JOBS_PER_FREE, CARD_SLOTS,
} = await import("../api/_loyalty.js");

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`FAIL: ${msg}\n  expected ${e}\n  got      ${a}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`FAIL: ${msg}`); } }

// --- normalizeEmail ---
eq(normalizeEmail("  Foo.Bar+promo@Gmail.com "), "foobar@gmail.com", "gmail strips dots + plus, lowercases");
eq(normalizeEmail("foo.bar@googlemail.com"), "foobar@gmail.com", "googlemail normalizes to gmail, dots stripped");
eq(normalizeEmail("a.b.c+x@outlook.com"), "a.b.c@outlook.com", "non-gmail keeps dots, strips plus");
eq(normalizeEmail("Plain@Example.COM"), "plain@example.com", "lowercase only when no dots/plus");
eq(normalizeEmail("notanemail"), "notanemail", "non-email returned as-is");

// --- hashEmail determinism + format ---
const h1 = hashEmail("foobar@gmail.com");
const h2 = hashEmail("foobar@gmail.com");
eq(h1, h2, "hashEmail deterministic");
ok(/^[a-f0-9]{64}$/.test(h1), "hashEmail is 64-char hex");
ok(hashEmail("foobar@gmail.com") !== hashEmail("other@gmail.com"), "different emails -> different hash");
// gmail variants collapse to the same hash
ok(hashEmail(normalizeEmail("Foo.Bar+x@gmail.com")) === hashEmail(normalizeEmail("foobar@gmail.com")), "gmail variants share a hash");

// --- token sign/verify ---
const tok = signToken("markdone:UID123:" + h1);
ok(verifyToken("markdone:UID123:" + h1, tok), "token verifies for matching payload");
ok(!verifyToken("markdone:UID999:" + h1, tok), "token rejects tampered payload");
ok(!verifyToken("markdone:UID123:" + h1, "deadbeef"), "token rejects bad token");
ok(timingSafeHex("abc", "abc") && !timingSafeHex("abc", "abd") && !timingSafeHex("abc", "abcd"), "timingSafeHex basic");

// --- recompute + computeCard ---
function recWith(statuses) {
  const r = newCustomer("h");
  statuses.forEach((s, i) => { r.bookings["u" + i] = { status: s, eventType: "essential", addons: [] }; });
  return recompute(r);
}
let r0 = recWith([]);
eq(computeCard(r0), { completedJobs: 0, stampsFilled: 1, totalSlots: CARD_SLOTS, nextRewardIn: JOBS_PER_FREE, cardComplete: false, freeEarned: 0, freeRedeemed: 0, freeAvailable: 0, firstTimeEligible: true, returning: false }, "empty card: 1 courtesy stamp, 4 to go");

let r3 = recWith(["completed", "completed", "completed", "booked", "cancelled"]);
eq(r3.completedJobs, 3, "3 completed (booked + cancelled excluded)");
const c3 = computeCard(r3);
eq([c3.stampsFilled, c3.nextRewardIn, c3.freeAvailable], [4, 1, 0], "3 done -> 4/5 stamps, 1 to go, no free yet");

let r4 = recWith(["completed", "completed", "completed", "completed"]);
const c4 = computeCard(r4);
eq([c4.completedJobs, c4.freeEarned, c4.freeAvailable, c4.stampsFilled, c4.nextRewardIn, c4.cardComplete], [4, 1, 1, 5, 0, true], "4 done -> free earned, card shows FULL 5/5 (not reset) while unredeemed");

let r4r = recWith(["completed", "completed", "completed", "completed"]);
r4r.freeRedeemed = 1;
const c4r = computeCard(recompute(r4r));
eq([c4r.freeAvailable, c4r.stampsFilled, c4r.nextRewardIn, c4r.cardComplete], [0, 1, 4, false], "after redeeming, card resets to 1/5 with 4 to go");

let r8 = recWith(Array(8).fill("completed"));
const c8 = computeCard(r8);
eq([c8.freeEarned, c8.freeAvailable], [2, 2], "8 done -> 2 free earned");

// idempotency-by-recompute: marking the same uid completed twice = still 1
let ri = newCustomer("h");
ri.bookings["x"] = { status: "completed" };
recompute(ri); const first = ri.completedJobs;
ri.bookings["x"] = { status: "completed" }; // duplicate write
recompute(ri);
eq([first, ri.completedJobs], [1, 1], "duplicate completed write is a no-op (recompute from ledger)");

console.log(`\nloyalty tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
