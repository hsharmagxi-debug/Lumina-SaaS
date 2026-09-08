// Real Razorpay-backed subscriptions + one-off credit purchases, replacing the fake
// simulatedSurchargePayment()/self-service-toggle flow closed out on 2026-09-08. See the
// "Lumina Premium Blueprint" plan (linked from handoff.md) for the full pricing rationale.
//
// Three purchasable packages:
//   - Premium Monthly  (recurring subscription, Razorpay Subscriptions API)
//   - Premium Yearly   (recurring subscription, Razorpay Subscriptions API)
//   - Insight Credits  (one-off top-up for the two AI routes, Razorpay Orders API)
//
// The single source of truth for what a user can access is entitlements/{uid} in Firestore --
// written ONLY by the webhook handler below, once Razorpay confirms real money moved. Nothing
// client-facing, and nothing else server-side, ever sets plan:"paid" directly (that's exactly
// the hole closed on 2026-09-08 -- this file exists so it stays closed under a real feature,
// not just a stopgap).
//
// Uses the Firebase ADMIN Firestore SDK throughout, not the client SDK used by /api/profiles in
// server.ts -- confirmed by hand (a real signed-webhook smoke test) that the client SDK fails
// here with permission-denied, since a Razorpay webhook has no Firebase Auth session for
// Firestore Security Rules to recognize. The Admin SDK bypasses rules using the service
// account's own privilege, which is the correct trust boundary once verifyAuth (user routes) or
// the HMAC signature check (webhook) has already established who's allowed to do what.

import crypto from "crypto";
import express from "express";
import Razorpay from "razorpay";
import type { Auth as AdminAuth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

// ---- Package definitions ----
// Amounts are in paise (Razorpay's base unit), matching the "Lumina Premium Blueprint" pricing:
// Rs.299/mo, Rs.2,499/yr, Rs.49/credit (Rs.199 for a 5-pack).
const PREMIUM_MONTHLY = { amount: 29900, interval: 1, period: "monthly" as const, name: "Lumina Premium -- Monthly" };
const PREMIUM_YEARLY = { amount: 249900, interval: 1, period: "yearly" as const, name: "Lumina Premium -- Yearly" };
const CREDIT_UNIT_PAISE = 4900; // Rs.49/credit standalone
const CREDIT_PACK_5_PAISE = 19900; // Rs.199 for 5 (vs Rs.245 at unit price)
const FAIR_USE_AI_CREDITS_PER_PERIOD = 15; // Consensus + Akashic combined, granted per billing period

interface Entitlement {
  plan: "free" | "premium";
  razorpaySubscriptionId?: string;
  currentPeriodEnd?: string;
  aiCreditsRemaining: number;
  updatedAt: string;
}

async function getEntitlement(db: Firestore, uid: string): Promise<Entitlement> {
  const snap = await db.collection("entitlements").doc(uid).get();
  if (snap.exists) return snap.data() as Entitlement;
  return { plan: "free", aiCreditsRemaining: 0, updatedAt: new Date(0).toISOString() };
}

let razorpayInstance: Razorpay | null = null;
function getRazorpay(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured yet (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).");
  }
  if (!razorpayInstance) razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayInstance;
}

// Razorpay Plans are created once and reused -- cached in Firestore (config/razorpay_plans_*)
// rather than requiring manual dashboard clicking or hardcoded plan IDs that would drift between
// test and live keys (each mode has its own separate set of plans).
async function ensurePlans(db: Firestore): Promise<{ monthlyPlanId: string; yearlyPlanId: string }> {
  const rz = getRazorpay();
  const cacheKey = process.env.RAZORPAY_KEY_ID!.startsWith("rzp_live_") ? "live" : "test";
  const configRef = db.collection("config").doc(`razorpay_plans_${cacheKey}`);
  const snap = await configRef.get();
  if (snap.exists) {
    const data = snap.data() as { monthlyPlanId: string; yearlyPlanId: string };
    if (data.monthlyPlanId && data.yearlyPlanId) return data;
  }

  const monthly = await rz.plans.create({
    period: PREMIUM_MONTHLY.period,
    interval: PREMIUM_MONTHLY.interval,
    item: { name: PREMIUM_MONTHLY.name, amount: PREMIUM_MONTHLY.amount, currency: "INR" },
  } as any);
  const yearly = await rz.plans.create({
    period: PREMIUM_YEARLY.period,
    interval: PREMIUM_YEARLY.interval,
    item: { name: PREMIUM_YEARLY.name, amount: PREMIUM_YEARLY.amount, currency: "INR" },
  } as any);

  const result = { monthlyPlanId: monthly.id, yearlyPlanId: yearly.id };
  await configRef.set(result);
  return result;
}

function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
}

export function createBillingRouter(deps: {
  getAdminAuth: () => AdminAuth;
  getAdminDb: () => Firestore;
  verifyAuth: express.RequestHandler;
}): express.Router {
  const router = express.Router();
  const { getAdminDb, verifyAuth } = deps;

  // What the client shows on the Premium tab: current plan, AI credits left, and the 3 packages.
  router.get("/entitlement", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const entitlement = await getEntitlement(getAdminDb(), uid);
      res.json({
        entitlement,
        packages: {
          monthly: { amount: PREMIUM_MONTHLY.amount, currency: "INR", label: "Premium Monthly" },
          yearly: { amount: PREMIUM_YEARLY.amount, currency: "INR", label: "Premium Yearly" },
          creditUnit: CREDIT_UNIT_PAISE,
          creditPack5: CREDIT_PACK_5_PAISE,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load entitlement." });
    }
  });

  // Starts a Premium checkout. Returns a Razorpay subscription_id for Checkout.js -- no money
  // moves here, this just registers intent; the webhook is what actually grants anything.
  router.post("/create-subscription", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const packageKey = req.body?.package;
      if (packageKey !== "monthly" && packageKey !== "yearly") {
        return res.status(400).json({ error: "package must be 'monthly' or 'yearly'." });
      }

      const rz = getRazorpay();
      const { monthlyPlanId, yearlyPlanId } = await ensurePlans(getAdminDb());
      const planId = packageKey === "monthly" ? monthlyPlanId : yearlyPlanId;

      const subscription = await rz.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: packageKey === "monthly" ? 120 : 20, // ~10 years of billing cycles, then re-subscribe
        notes: { uid, package: packageKey },
      } as any);

      res.json({ subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID });
    } catch (e: any) {
      console.error("[billing] create-subscription failed:", e);
      res.status(500).json({ error: e.message || "Could not start checkout." });
    }
  });

  // Starts an Insight Credits purchase (one-off, not recurring).
  router.post("/create-order", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const pack = req.body?.pack; // 'single' | 'pack5'
      if (pack !== "single" && pack !== "pack5") {
        return res.status(400).json({ error: "pack must be 'single' or 'pack5'." });
      }
      const amount = pack === "single" ? CREDIT_UNIT_PAISE : CREDIT_PACK_5_PAISE;
      const credits = pack === "single" ? 1 : 5;

      const rz = getRazorpay();
      const order = await rz.orders.create({
        amount,
        currency: "INR",
        notes: { uid, kind: "insight_credits", credits: String(credits) },
      });

      res.json({ orderId: order.id, amount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID });
    } catch (e: any) {
      console.error("[billing] create-order failed:", e);
      res.status(500).json({ error: e.message || "Could not start checkout." });
    }
  });

  // The only writer of entitlement state. Verifies the signature before trusting anything in the
  // payload -- see the express.json({verify}) hook in server.ts for req.rawBody.
  router.post("/webhook", async (req, res) => {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody || !verifyWebhookSignature(rawBody, signature)) {
      console.error("[billing] webhook signature check failed");
      return res.status(400).json({ error: "Invalid signature." });
    }

    const event = req.body?.event as string;
    const db = getAdminDb();

    try {
      if (event === "subscription.activated" || event === "subscription.charged") {
        const sub = req.body.payload.subscription.entity;
        const uid = sub.notes?.uid;
        if (!uid) throw new Error("subscription has no uid in notes");
        const currentEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : undefined;
        await db.collection("entitlements").doc(uid).set(
          {
            plan: "premium",
            razorpaySubscriptionId: sub.id,
            currentPeriodEnd: currentEnd,
            aiCreditsRemaining: FAIR_USE_AI_CREDITS_PER_PERIOD,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else if (event === "subscription.cancelled" || event === "subscription.completed" || event === "subscription.expired") {
        const sub = req.body.payload.subscription.entity;
        const uid = sub.notes?.uid;
        if (!uid) throw new Error("subscription has no uid in notes");
        await db.collection("entitlements").doc(uid).set(
          { plan: "free", updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } else if (event === "payment.captured") {
        const payment = req.body.payload.payment.entity;
        if (payment.notes?.kind === "insight_credits") {
          const uid = payment.notes.uid;
          const credits = parseInt(payment.notes.credits || "0", 10);
          if (!uid || !credits) throw new Error("credit payment missing uid/credits in notes");
          const ref = db.collection("entitlements").doc(uid);
          const snap = await ref.get();
          if (snap.exists) {
            await ref.update({ aiCreditsRemaining: FieldValue.increment(credits), updatedAt: new Date().toISOString() });
          } else {
            await ref.set({ plan: "free", aiCreditsRemaining: credits, updatedAt: new Date().toISOString() });
          }
        }
      }
      // Other event types are intentionally ignored -- Razorpay sends far more than we act on.
      res.json({ received: true });
    } catch (e: any) {
      console.error(`[billing] webhook handler failed for event ${event}:`, e);
      // Still 200 so Razorpay doesn't retry-storm us over a bug on our side; the failure is logged
      // for manual reconciliation. A production system would also alert on this.
      res.json({ received: true, warning: "processing error, logged" });
    }
  });

  // Cancels at the end of the current billing period -- no refund logic here (Razorpay handles
  // proration/refunds per its own subscription settings), just stops the next charge.
  router.post("/cancel-subscription", verifyAuth, async (req, res) => {
    try {
      const uid = (req as any).uid as string;
      const entitlement = await getEntitlement(getAdminDb(), uid);
      if (!entitlement.razorpaySubscriptionId) {
        return res.status(400).json({ error: "No active subscription to cancel." });
      }
      const rz = getRazorpay();
      await rz.subscriptions.cancel(entitlement.razorpaySubscriptionId, false); // false = cancel at cycle end
      res.json({ success: true, message: "Your subscription will not renew after the current period." });
    } catch (e: any) {
      console.error("[billing] cancel-subscription failed:", e);
      res.status(500).json({ error: e.message || "Could not cancel subscription." });
    }
  });

  return router;
}

// Exported so server.ts's AI routes can spend a credit atomically before calling Gemini --
// the whole reason credits are tracked server-side rather than trusted from the client.
export async function spendAiCredit(db: Firestore, uid: string): Promise<boolean> {
  const ref = db.collection("entitlements").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() as Entitlement;
  if (data.plan !== "premium" || (data.aiCreditsRemaining ?? 0) <= 0) return false;
  await ref.update({ aiCreditsRemaining: FieldValue.increment(-1), updatedAt: new Date().toISOString() });
  return true;
}
