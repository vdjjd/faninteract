import { NextResponse } from "next/server";
import { loadGuestExportRows } from "@/lib/guestExport";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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
  @page { size: landscape; margin: 10mm; }
  @media print {
    table{font-size:8px; table-layout:fixed;}
    th, td{padding:3px; overflow-wrap:anywhere;}
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
    <tbody>${tbody || `<tr><td colspan="${headers.length}">No guests or leads found for this host.</td></tr>`}</tbody>
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
