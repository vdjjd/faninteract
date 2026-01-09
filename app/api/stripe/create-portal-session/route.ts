import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    // Client sends a Supabase access token so we can verify ownership
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const hostId = body?.hostId as string | undefined;

    if (!hostId) {
      return NextResponse.json({ error: "Missing hostId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Validate the token
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Invalid auth" }, { status: 401 });
    }

    // Load host row and ensure it belongs to this user
    const { data: host, error: hostErr } = await supabase
      .from("hosts")
      .select("id, auth_id, stripe_customer_id")
      .eq("id", hostId)
      .maybeSingle();

    if (hostErr || !host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    if (host.auth_id !== userRes.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!host.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer on file. Subscribe first." },
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;
    const return_url = new URL(
      "/admin/dashboard?billing=return",
      origin
    ).toString();

    // Create Stripe Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: host.stripe_customer_id,
      return_url,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("create-portal-session error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
