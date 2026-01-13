import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** Split an ISO timestamp into YYYY-MM-DD and HH:MM (24h). */
function splitDateTime(ts: string | null | undefined) {
  if (!ts) return { date: "", time: "" };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function escapeHtml(v: any) {
  const s = String(v ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    // ✅ SAME SOURCES AS CSV:
    // 1) event guests from export_host_guests()
    // 2) priority_leads rows for this host
    const [
      { data: guestData, error: guestError },
      { data: leadData, error: leadError },
    ] = await Promise.all([
      supabase.rpc("export_host_guests", { p_host_id: hostId }),
      supabase
        .from("priority_leads")
        .select(
          `
          first_name,
          last_name,
          email,
          phone,
          city,
          region,
          zip,
          zip_code,
          venue_name,
          product_interest,
          wants_contact,
          scanned_at,
          submitted_at,
          source,
          source_type
        `
        )
        .eq("host_id", hostId)
        .order("submitted_at", { ascending: true }),
    ]);

    if (guestError) {
      console.error("export_host_guests error:", guestError);
      return new NextResponse(JSON.stringify({ error: guestError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (leadError) {
      console.error("priority_leads export error:", leadError);
      return new NextResponse(JSON.stringify({ error: leadError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // ✅ SAME MAPPING AS CSV (shape compatible)
    const guestRows = (guestData ?? []).map((r: any) => ({
      type: "guest",
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      profile_created_date: r.profile_created_date ?? "",
      profile_created_time: r.profile_created_time ?? "",
      joined_date: r.joined_date ?? "",
      joined_time: r.joined_time ?? "",
      event_id: r.event_id ?? "",
      source: r.source ?? "",
      feature: r.feature ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip: r.zip ?? "",
      venue: "",
      product: "",
      wants_contact: "",
    }));

    const priorityRows = (leadData ?? []).map((l: any) => {
      const joinedTs = l.scanned_at ?? l.submitted_at ?? null;
      const { date: joined_date, time: joined_time } = splitDateTime(joinedTs);
      const { date: profile_created_date, time: profile_created_time } =
        splitDateTime(joinedTs);

      return {
        type: "priority",
        first_name: l.first_name ?? "",
        last_name: l.last_name ?? "",
        email: l.email ?? "",
        phone: l.phone ?? "",
        profile_created_date,
        profile_created_time,
        joined_date,
        joined_time,
        event_id: "",
        source: l.source ?? l.source_type ?? "",
        feature: "priority_lead",
        city: l.city ?? "",
        state: l.region ?? "",
        zip: l.zip ?? l.zip_code ?? "",
        venue: l.venue_name ?? "",
        product: l.product_interest ?? "",
        wants_contact:
          l.wants_contact === true
            ? "yes"
            : l.wants_contact === false
            ? "no"
            : "",
      };
    });

    // Combine same as CSV
    const rows = [...guestRows, ...priorityRows];

    const headers = [
      "type",
      "first_name",
      "last_name",
      "email",
      "phone",
      "profile_created_date",
      "profile_created_time",
      "joined_date",
      "joined_time",
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

    const thead = headers
      .map(
        (h, i) =>
          `<th onclick="sortTable('all',${i})" title="Click to sort">${escapeHtml(
            h
          )}</th>`
      )
      .join("");

    const tbody = rows
      .map((r: any) => {
        const tds = headers
          .map((h) => `<td>${escapeHtml(r?.[h] ?? "")}</td>`)
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Guests & Leads Export</title>
<style>
  body{font-family:Arial, sans-serif; padding:20px; color:#111;}
  .topbar{display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;}
  .meta{font-size:12px; color:#555;}
  button{padding:8px 12px; border:1px solid #bbb; background:#fff; border-radius:8px; cursor:pointer;}
  button:hover{background:#f3f3f3;}
  table{border-collapse:collapse; width:100%; font-size:12px;}
  th, td{border:1px solid #ddd; padding:6px; vertical-align:top;}
  th{background:#f2f2f2; position:sticky; top:0; z-index:1; cursor:pointer; user-select:none;}
  tr:nth-child(even) td{background:#fafafa;}
  .hint{font-size:11px; color:#666; margin:8px 0 14px;}
  @media print {
    button{display:none;}
    .hint{display:none;}
    .topbar{margin-bottom:8px;}
    th{position:static;}
  }
</style>
<script>
function sortTable(id,col){
  const t=document.getElementById(id);
  const b=t.tBodies[0];
  const r=[...b.rows];
  const asc=t.dataset.asc!=="true";
  t.dataset.asc=asc;
  r.sort((x,y)=>{
    const a=(x.cells[col]?.innerText||"").trim();
    const c=(y.cells[col]?.innerText||"").trim();
    // try numeric compare first
    const an=Number(a), cn=Number(c);
    if(!Number.isNaN(an) && !Number.isNaN(cn) && a!=="" && c!==""){
      return asc ? an-cn : cn-an;
    }
    return asc ? a.localeCompare(c) : c.localeCompare(a);
  });
  r.forEach(e=>b.appendChild(e));
}
</script>
</head>
<body>
  <div class="topbar">
    <div>
      <div style="font-size:18px;font-weight:700;">Guests & Leads</div>
      <div class="meta">Host ID: ${escapeHtml(hostId)} • Rows: ${rows.length}</div>
    </div>
    <button onclick="window.print()">Print / Save PDF</button>
  </div>

  <div class="hint">Tip: click any column header to sort.</div>

  <table id="all" data-asc="true">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: any) {
    console.error("print export route error:", e);
    return new NextResponse(
      JSON.stringify({ error: e?.message ?? String(e) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
