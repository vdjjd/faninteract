import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new NextResponse("Missing Supabase env vars", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { searchParams } = new URL(req.url);
  const hostId = searchParams.get("hostId");
  if (!hostId) return new NextResponse("Missing hostId", { status: 400 });

  const [{ data: leads }, { data: guests }] = await Promise.all([
    supabase
      .from("priority_leads")
      .select("first_name,last_name,email,phone,city,region,zip,venue_name,product_interest,wants_contact,scanned_at")
      .eq("host_id", hostId)
      .order("scanned_at", { ascending: false }),

    supabase
      .from("guest_profiles")
      .select("first_name,last_name,email,phone,age,city,state,zip,created_at")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false }),
  ]);

  const rows = (rows: any[], cols: string[]) =>
    rows.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Guest Export</title>
<style>
body{font-family:Arial;padding:20px}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #ccc;padding:6px;cursor:pointer}
th{background:#eee}
button{margin-bottom:10px}
@media print{button{display:none}}
</style>
<script>
function sortTable(id,col){
 const t=document.getElementById(id),b=t.tBodies[0];
 const r=[...b.rows],a=t.dataset.asc!=="true";
 t.dataset.asc=a;
 r.sort((x,y)=>a?x.cells[col].innerText.localeCompare(y.cells[col].innerText)
               :y.cells[col].innerText.localeCompare(x.cells[col].innerText));
 r.forEach(e=>b.appendChild(e));
}
</script>
</head>
<body>

<button onclick="window.print()">Print / Save PDF</button>

<h2>🔥 Priority Leads</h2>
<table id="priority" data-asc="true">
<thead><tr>${["First","Last","Email","Phone","City","Region","ZIP","Venue","Product","Contact","Scanned"]
.map((h,i)=>`<th onclick="sortTable('priority',${i})">${h}</th>`).join("")}</tr></thead>
<tbody>${rows(leads??[],["first_name","last_name","email","phone","city","region","zip","venue_name","product_interest","wants_contact","scanned_at"])}</tbody>
</table>

<h2>Guests</h2>
<table id="guests" data-asc="true">
<thead><tr>${["First","Last","Email","Phone","Age","City","State","ZIP","Created"]
.map((h,i)=>`<th onclick="sortTable('guests',${i})">${h}</th>`).join("")}</tr></thead>
<tbody>${rows(guests??[],["first_name","last_name","email","phone","age","city","state","zip","created_at"])}</tbody>
</table>

</body>
</html>
`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
