import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SupabaseClient = ReturnType<typeof createClient>;

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  hostId: string,
  orderColumn: string = "created_at"
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq("host_id", hostId)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as T[];
    all.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

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

  try {
    const [guests, leads] = await Promise.all([
      fetchAll<any>(
        supabase,
        "guest_profiles",
        "first_name,last_name,email,phone,age,date_of_birth,city,state,zip,created_at",
        hostId,
        "created_at"
      ),
      fetchAll<any>(
        supabase,
        "priority_leads",
        "first_name,last_name,email,phone,city,region,zip,country,venue_name,product_interest,wants_contact,scanned_at,submitted_at",
        hostId,
        "submitted_at" // if this column exists; otherwise use created_at or scanned_at
      ),
    ]);

    const rows = [
      ...(leads ?? []).map((l: any) => ({
        type: "priority",
        first_name: l.first_name ?? "",
        last_name: l.last_name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        age: "",
        birthday: "",
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

    // BOM helps Excel open UTF-8 correctly
    const bom = "\ufeff";
    const csv =
      bom +
      [
        headers.join(","),
        ...rows.map((r: any) => headers.map((h) => escapeCsv(r[h])).join(",")),
      ].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=guests.csv",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    return new NextResponse(
      JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500 }
    );
  }
}
