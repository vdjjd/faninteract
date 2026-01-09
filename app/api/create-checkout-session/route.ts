// app/api/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const hostId = body?.hostId;

    if (!hostId) {
      return NextResponse.json({ error: "Missing hostId" }, { status: 400 });
    }

    if (!process.env.STRIPE_PRICE_ID) {
      return NextResponse.json({ error: "Missing STRIPE_PRICE_ID" }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    // Build redirect base from actual request URL (localhost or prod)
    const origin = new URL(req.url).origin;
    const success_url = new URL("/admin/dashboard?success=true", origin).toString();
    const cancel_url = new URL("/admin/dashboard?canceled=true", origin).toString();

    // Supabase server client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Load host
    const { data: host, error: hostError } = await supabase
      .from("hosts")
      .select("*")
      .eq("id", hostId)
      .single();

    if (hostError || !host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    // Create Stripe customer if needed
    let customerId = host.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: host.email ?? undefined,
        metadata: { hostId: host.id }, // ✅ webhook-friendly
      });

      customerId = customer.id;

      await supabase
        .from("hosts")
        .update({ stripe_customer_id: customerId })
        .eq("id", host.id);
    }

    // Create Checkout Session (subscription)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId!,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url,
      cancel_url,

      // ✅ critical for webhook mapping
      client_reference_id: host.id,
      metadata: { hostId: host.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("create-checkout-session error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
