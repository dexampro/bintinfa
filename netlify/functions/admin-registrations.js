const { createClient } = require("@supabase/supabase-js");
const { createRegistrationPdf } = require("./pdf-layout");
const fs = require("fs");
const path = require("path");

const cors = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (statusCode, data) => ({ statusCode, headers: cors, body: JSON.stringify(data) });
const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const adminEmails = () => (process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
const safe = v => typeof v === "string" ? v.trim().slice(0, 2000) : "";

async function requireAdmin(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Please sign in.");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email || !adminEmails().includes(data.user.email.toLowerCase())) {
    throw new Error("You are not authorised to use the admin dashboard.");
  }
  return data.user;
}

function wrap(text, font, size, maxWidth) {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ");
  const lines = []; let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
async function pdfFor(r) {
  return createRegistrationPdf(r, path.join(__dirname, "bintin-fa-logo.jpg"));
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") return { statusCode:204, headers:cors };
  try {
    await requireAdmin(event);
    const client = db();
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      if (params.action === "pdf" && params.id) {
        const { data: row, error } = await client.from("player_registrations").select("*").eq("id",params.id).single();
        if (error || !row) return json(404,{error:"Registration not found."});
        const filePath = `${row.registration_number}.pdf`;
        const bytes = await pdfFor(row);
        const { error: upErr } = await client.storage.from("registration-pdfs").upload(filePath,bytes,{contentType:"application/pdf",upsert:true});
        if (upErr) throw upErr;
        await client.from("player_registrations").update({pdf_path:filePath,updated_at:new Date().toISOString()}).eq("id",row.id);
        const { data, error: signErr } = await client.storage.from("registration-pdfs").createSignedUrl(filePath,60);
        if (signErr) throw signErr;
        return json(200,{url:data.signedUrl});
      }
      let query = client.from("player_registrations").select("id,registration_number,created_at,full_name,date_of_birth,age,phone_number,preferred_position,team_category,registration_fee,coach_name,date_registered,pdf_path").order("created_at",{ascending:false}).limit(500);
      if (params.q) query = query.ilike("full_name",`%${params.q.replace(/[%_,]/g," ")}%`);
      const {data,error} = await query;
      if (error) throw error;
      return json(200,{registrations:data});
    }
    if (event.httpMethod === "POST") {
      let body;
      try { body=JSON.parse(event.body||"{}"); } catch { return json(400,{error:"Invalid JSON."}); }
      if (!body.id) return json(400,{error:"Missing registration id."});
      const allowedTeams = ["Under 10","Under 12","Under 14","Under 16","Under 18","Senior Team"];
      const update = {
        team_category: allowedTeams.includes(body.team_category) ? body.team_category : null,
        registration_fee: safe(body.registration_fee) || null,
        coach_name: safe(body.coach_name) || null,
        updated_at: new Date().toISOString()
      };
      const {data,error} = await client.from("player_registrations").update(update).eq("id",body.id).select("id").single();
      if (error || !data) return json(400,{error:"Could not update registration."});
      return json(200,{ok:true});
    }
    return json(405,{error:"Method not allowed."});
  } catch (e) {
    return json(e.message === "Please sign in." ? 401 : 403,{error:e.message || "Request failed."});
  }
};