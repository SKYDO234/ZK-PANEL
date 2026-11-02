import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import Stripe from "stripe";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zk-payments-"));
process.env.DATA_DIR = dir;
process.env.ZK_MODE = "docker";
process.env.ZK_REMOTE_ONLY = "true";
process.env.SESSION_SECRET = "test-only-secret-not-for-production-123456789";
process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_only_local_signature";
process.env.ALLOW_REGISTRATION = "false";
const { mountStripeWebhook } = await import("../server/payments.js");
const { db, invoices, setting, getUser } = await import("../server/db.js");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const app = express();
mountStripeWebhook(app);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const address = server.address() as any;
const url = `http://127.0.0.1:${address.port}/api/webhooks/stripe`;
db.prepare(
  "INSERT INTO users(id,email,name,password,role,balance,created_at) VALUES(?,?,?,?,?,?,?)",
).run(
  "pay-user",
  "pay@example.test",
  "Payment Test",
  "!disabled",
  "user",
  0,
  new Date().toISOString(),
);
const invoice = {
  id: "INV-test",
  userId: "pay-user",
  description: "Test credit",
  amount: 50000,
  type: "credit" as const,
  status: "pending" as const,
  provider: "stripe",
  createdAt: new Date().toISOString(),
};
invoices.save(invoice);
setting("stripe-session:INV-test", "cs_test_local");
function event(
  id: string,
  amount = 50000,
  type = "checkout.session.completed",
) {
  return {
    id,
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_test_local",
        object: "checkout.session",
        payment_status: "paid",
        currency: "inr",
        amount_total: amount,
        metadata: { invoiceId: "INV-test", userId: "pay-user" },
      },
    },
  };
}
async function post(payload: unknown, id: string, signature?: string) {
  const body = JSON.stringify(payload);
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature":
        signature ||
        stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        }),
    },
    body,
  });
}
test.after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  await fs.rm(dir, { recursive: true, force: true });
});
test("webhook rejects missing and invalid signatures without crediting", async () => {
  assert.equal((await fetch(url, { method: "POST", body: "{}" })).status, 400);
  assert.equal(
    (await post(event("evt_bad"), "evt_bad", "invalid")).status,
    400,
  );
  assert.equal(getUser("pay-user")!.balance, 0);
});
test("signed payment credits once, including replay and a different event ID", async () => {
  assert.equal((await post(event("evt_paid"), "evt_paid")).status, 200);
  assert.equal(getUser("pay-user")!.balance, 50000);
  assert.equal(invoices.get("INV-test")!.status, "paid");
  assert.equal((await post(event("evt_paid"), "evt_paid")).status, 200);
  assert.equal((await post(event("evt_other"), "evt_other")).status, 200);
  assert.equal(getUser("pay-user")!.balance, 50000);
});
test("amount mismatch rolls back event marker and does not credit", async () => {
  invoices.save({ ...invoice, id: "INV-mismatch" });
  setting("stripe-session:INV-mismatch", "cs_test_local");
  const e = event("evt_mismatch", 100);
  e.data.object.metadata.invoiceId = "INV-mismatch";
  assert.equal((await post(e, e.id)).status, 400);
  assert.equal(getUser("pay-user")!.balance, 50000);
  assert.equal(invoices.get("INV-mismatch")!.status, "pending");
});
test("expired checkout closes pending invoice without a wallet credit", async () => {
  invoices.save({ ...invoice, id: "INV-expired" });
  setting("stripe-session:INV-expired", "cs_test_local");
  const e = event("evt_expired", 50000, "checkout.session.expired");
  e.data.object.metadata.invoiceId = "INV-expired";
  assert.equal((await post(e, e.id)).status, 200);
  assert.equal(invoices.get("INV-expired")!.status, "failed");
  assert.equal(getUser("pay-user")!.balance, 50000);
});
