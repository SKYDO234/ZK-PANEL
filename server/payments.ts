import type { Express } from "express";
import express from "express";
import Stripe from "stripe";
import { db, transaction, invoices, log, setting } from "./db.js";
import { config } from "./config.js";

export function mountStripeWebhook(app: Express) {
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      const key = process.env.STRIPE_SECRET_KEY,
        secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (config.mode !== "docker" || !key || !secret) {
        res.status(503).json({ error: "Stripe is not configured." });
        return;
      }
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string") {
        res.status(400).json({ error: "Missing signature." });
        return;
      }
      let event: Stripe.Event;
      try {
        event = new Stripe(key).webhooks.constructEvent(
          req.body,
          signature,
          secret,
        );
      } catch {
        res.status(400).json({ error: "Invalid webhook signature." });
        return;
      }
      if (
        event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded"
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        const invoiceId = session.metadata?.invoiceId,
          userId = session.metadata?.userId;
        if (
          !invoiceId ||
          !userId ||
          session.payment_status !== "paid" ||
          session.currency !== "inr"
        ) {
          res.json({ received: true, ignored: true });
          return;
        }
        try {
          transaction(() => {
            // The event ID and balance update commit together: replayed webhooks cannot double-credit.
            const inserted = db
              .prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)")
              .run("stripe-event:" + event.id, event.created.toString());
            if (!inserted.changes) return;
            const invoice = invoices.get(invoiceId);
            if (
              invoice?.status === "paid" &&
              invoice.userId === userId &&
              invoice.provider === "stripe" &&
              invoice.amount === session.amount_total &&
              setting("stripe-session:" + invoiceId) === session.id
            )
              return;
            if (
              !invoice ||
              invoice.userId !== userId ||
              invoice.provider !== "stripe" ||
              invoice.status !== "pending" ||
              invoice.amount !== session.amount_total ||
              setting("stripe-session:" + invoiceId) !== session.id
            )
              throw new Error(
                "Checkout does not match a pending wallet credit.",
              );
            db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(
              invoice.amount,
              userId,
            );
            invoices.save({ ...invoice, status: "paid" });
            log(
              userId,
              "billing.credit",
              "Stripe payment verified and hosting credit added",
              "success",
            );
          });
        } catch (error) {
          console.error(
            "Stripe settlement rejected:",
            error instanceof Error ? error.message : error,
          );
          res.status(400).json({ error: "Checkout could not be reconciled." });
          return;
        }
      }
      if (
        event.type === "checkout.session.expired" ||
        event.type === "checkout.session.async_payment_failed"
      ) {
        const session = event.data.object as Stripe.Checkout.Session;
        const invoiceId = session.metadata?.invoiceId;
        if (invoiceId)
          transaction(() => {
            const i = invoices.get(invoiceId);
            if (
              i?.status === "pending" &&
              i.provider === "stripe" &&
              setting("stripe-session:" + invoiceId) === session.id
            )
              invoices.save({ ...i, status: "failed" });
          });
      }
      res.json({ received: true });
    },
  );
}
