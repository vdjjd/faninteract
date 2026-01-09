// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isActiveStripeStatus = (status: any) => {
  const s = String(status || "").toLowerCase();
  return s === "active" || s === "trialing";
};

const updateHostSubscription = async (args: {
  hostId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string | null;
}) => {
  const { hostId, customerId, subscriptionId, status } = args;

  const supabase = getSupabaseAdmin();

  // Prefer hostId if available (best)
  if (hostId) {
    const { error } = await supabase
      .from("hosts")
      .update({
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: subscriptionId ?? null,
        stripe_status: status ?? null,
        subscription_active: isActiveStripeStatus(status),
      })
      .eq("id", hostId);

    if (error) throw error;
    return;
  }

  // Fallback: update by stripe_customer_id
  if (customerId) {
    const { error } = await supabase
      .from("hosts")
      .update({
        stripe_subscription_id: subscriptionId ?? null,
        stripe_status: status ?? null,
        subscription_active: isActiveStripeStatus(status),
      })
      .eq("stripe_customer_id", customerId);

    if (error) throw error;
    return;
  }

  // If we got here, we didn’t have enough info
  throw new Error("Webhook: missing hostId and customerId; cannot update host");
};

const getHostIdFromSession = (session: Stripe.Checkout.Session) => {
  // Best: client_reference_id set when creating session
  const crid = session.client_reference_id;
  if (crid) return crid;

  // Also common: metadata.hostId
  const metaHostId =
    (session.metadata && (session.metadata as any).hostId) ||
    (session.metadata && (session.metadata as any).supabaseHostId);
  if (metaHostId) return String(metaHostId);

  return null;
};

export async function POST(req: Request) {
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }

    const whsec = process.env.STRIPE_WEBHOOK_SECRET;
    if (!whsec) {
      return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
    }

    // IMPORTANT: raw body for signature verification
    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, whsec);
    } catch (err: any) {
      console.error("❌ Stripe signature verify failed:", err?.message || err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Handle only what we need
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only subscription checkouts
        if (session.mode !== "subscription") break;

        const hostId = getHostIdFromSession(session);

        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        // Pull actual subscription status from Stripe (more reliable)
        let status: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = sub.status ?? null;
        }

        await updateHostSubscription({
          hostId,
          customerId,
          subscriptionId,
          status,
        });

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
        const subscriptionId = sub.id ?? null;
        const status = (sub.status as any) ?? null;

        await updateHostSubscription({
          customerId,
          subscriptionId,
          status,
        });

        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      default:
        // ignore for now
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ webhook error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Webhook error" }, { status: 500 });
  }
}
