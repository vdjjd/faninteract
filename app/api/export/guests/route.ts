import { NextResponse } from "next/server";
import { loadGuestExportRows } from "@/lib/guestExport";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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
    const rows = await loadGuestExportRows(supabase, hostId);

    const headers = [
      "type",
      "first_name",
      "last_name",
      "email",
      "phone",
      "age",
      "date_of_birth",
      "profile_created_date",
      "profile_created_time",
      "joined_date",
      "joined_time",
      "guest_status",
      "visit_number",
      "event_id",
      "source",
      "feature",
      "city",
      "state",
      "zip",
      "venue",
      "product",
      "wants_contact",
    ];

    const escapeCsv = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

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
    console.error("export guests route error:", e);
    return new NextResponse(
      JSON.stringify({ error: e?.message ?? String(e) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
