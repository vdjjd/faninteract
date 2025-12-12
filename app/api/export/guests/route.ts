import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new NextResponse(
      "Missing Supabase env vars",
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { searchParams } = new URL(req.url);
  const hostId = searchParams.get("hostId");
  if (!hostId) return new NextResponse("Missing hostId", { status: 400 });

  const [{ data: guests, error: guestError }, { data: leads, error: leadError }] =
    await Promise.all([
      supabase
        .from("guest_profiles")
        .select("first_name,last_name,email,phone,age,city,state,zip,created_at")
        .eq("host_id", hostId),

      supabase
        .from("priority_leads")
        .select("first_name,last_name,email,phone,city,region,zip,country,venue_name,product_interest,wants_contact,scanned_at,submitted_at")
        .eq("host_id", hostId),
    ]);

  if (guestError || leadError) {
    return new NextResponse(
      JSON.stringify(guestError || leadError),
      { status: 500 }
    );
  }

  const rows = [
    ...(leads ?? []).map((l) => ({
      type: "priority",
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email,
      phone: l.phone,
      city: l.city,
      state: l.region,
      zip: l.zip,
      venue: l.venue_name,
      product: l.product_interest,
      wants_contact: l.wants_contact,
      created_at: l.scanned_at,
    })),
    ...(guests ?? []).map((g) => ({
      type: "guest",
      first_name: g.first_name,
      last_name: g.last_name,
      email: g.email,
      phone: g.phone,
      city: g.city,
      state: g.state,
      zip: g.zip,
      venue: "",
      product: "",
      wants_contact: "",
      created_at: g.created_at,
    })),
  ];

  if (!rows.length) return new NextResponse("No data", { status: 204 });

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r =>
      headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=guests.csv",
    },
  });
}
