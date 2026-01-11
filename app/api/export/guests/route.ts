import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { searchParams } = new URL(req.url);
  const hostId = searchParams.get("hostId");
  if (!hostId) return new NextResponse("Missing hostId", { status: 400 });

  // ✅ Pull DOB + age from guests
  // ✅ IMPORTANT: include date_of_birth (birthday) explicitly in select
  const [
    { data: guests, error: guestError },
    { data: leads, error: leadError },
  ] = await Promise.all([
    supabase
      .from("guest_profiles")
      .select(
        "first_name,last_name,email,phone,age,date_of_birth,city,state,zip,created_at"
      )
      .eq("host_id", hostId),

    supabase
      .from("priority_leads")
      .select(
        "first_name,last_name,email,phone,city,region,zip,country,venue_name,product_interest,wants_contact,scanned_at,submitted_at"
      )
      .eq("host_id", hostId),
  ]);

  if (guestError || leadError) {
    return new NextResponse(JSON.stringify(guestError || leadError), {
      status: 500,
    });
  }

  // ✅ Build rows with a consistent schema so headers include birthday+age
  const rows = [
    ...(leads ?? []).map((l: any) => ({
      type: "priority",
      first_name: l.first_name ?? "",
      last_name: l.last_name ?? "",
      email: l.email ?? "",
      phone: l.phone ?? "",
      age: "", // priority leads don't have age
      birthday: "", // priority leads don't have birthday
      city: l.city ?? "",
      state: l.region ?? "",
      zip: l.zip ?? "",
      venue: l.venue_name ?? "",
      product: l.product_interest ?? "",
      wants_contact: l.wants_contact ?? "",
      created_at: l.scanned_at ?? l.submitted_at ?? "",
    })),
    ...(guests ?? []).map((g: any) => ({
      type: "guest",
      first_name: g.first_name ?? "",
      last_name: g.last_name ?? "",
      email: g.email ?? "",
      phone: g.phone ?? "",
      age: g.age ?? "",
      // ✅ birthday column (mapped from DB date_of_birth)
      birthday: g.date_of_birth ?? "",
      city: g.city ?? "",
      state: g.state ?? "",
      zip: g.zip ?? "",
      venue: "",
      product: "",
      wants_contact: "",
      created_at: g.created_at ?? "",
    })),
  ];

  if (!rows.length) return new NextResponse("No data", { status: 204 });

  // ✅ Fixed headers (don’t rely on first row, which could be a lead)
  const headers = [
    "type",
    "first_name",
    "last_name",
    "email",
    "phone",
    "age",
    "birthday",
    "city",
    "state",
    "zip",
    "venue",
    "product",
    "wants_contact",
    "created_at",
  ];

  const escapeCsv = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.join(","),
    ...rows.map((r: any) => headers.map((h) => escapeCsv(r[h])).join(",")),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=guests.csv",
    },
  });
}
