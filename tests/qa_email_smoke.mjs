/**
 * Email pipeline smoke test — sends one real email via the same module
 * that /api/orders calls. Run with:
 *   GMAIL_USER=... GMAIL_APP_PASSWORD=... ELION_NOTIFY_EMAIL=... node tests/qa_email_smoke.mjs
 */
import { sendEmail, customerConfirmationEmail, elionNotificationEmail } from "../api/_email.js";

const testOrder = {
  id: "ord_TEST" + Math.random().toString(36).slice(2, 10),
  name: "Email Smoke Test",
  phone: "(734)555-0001",
  email: process.env.ELION_NOTIFY_EMAIL,
  address: "100 Cambridge Rd, Ann Arbor, MI",
  car: "2024 Test Vehicle",
  tier: "essential",
  scope: "both",
  preferred_timing: "Saturday morning",
  notes: "Smoke test of Gmail SMTP path",
  location: "burns",
  first_time: true,
  created_at: new Date().toISOString(),
  pricing: {
    base: 90,
    addons: [{ id: "headlight", price: 30 }, { id: "interior", price: 50 }],
    addon_total: 80,
    travel: 0,
    bundle_discount: 10,
    first_time_discount: 40,
    first_time_rate_pct: 25,
    total: 120,
  },
};

const target = process.env.ELION_NOTIFY_EMAIL;
if (!target) {
  console.error("Set ELION_NOTIFY_EMAIL to a real address to receive the test mail.");
  process.exit(1);
}

console.log("Sending customer confirmation to:", target);
const cust = customerConfirmationEmail(testOrder);
const r1 = await sendEmail({
  to: target,
  subject: cust.subject,
  html: cust.html,
  text: cust.text,
  replyTo: "info@elioncarcare.com",
  tags: [{ name: "type", value: "smoke_test_customer" }],
});
console.log("Customer email:", JSON.stringify(r1, null, 2));

console.log("\nSending Elion notification to:", target);
const note = elionNotificationEmail(testOrder);
const r2 = await sendEmail({
  to: target,
  subject: note.subject,
  html: note.html,
  text: note.text,
  tags: [{ name: "type", value: "smoke_test_elion" }],
});
console.log("Elion email:", JSON.stringify(r2, null, 2));

if (r1.ok && r2.ok) {
  console.log("\nBoth emails accepted by SMTP. Check the inbox for", target);
  process.exit(0);
} else {
  console.error("\nAt least one send failed. See output above.");
  process.exit(1);
}
