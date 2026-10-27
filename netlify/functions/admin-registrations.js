const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
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
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.02, 0.22, 0.12), gold = rgb(0.82, 0.48, 0.05), ink = rgb(0.12,0.16,0.14);
  const margin = 38; let y = height - 30;
  try {
    const img = await pdf.embedJpg(fs.readFileSync(path.join(__dirname, "bintin-fa-logo.jpg")));
    page.drawImage(img, { x: (width - 64)/2, y: y-64, width: 64, height: 64 }); y -= 74;
  } catch (_) {}
  page.drawText("BINTIN FA — NEW PLAYER REGISTRATION FORM", { x: margin, y, size: 11, font: bold, color: green }); y -= 24;
  function section(title) {
    if (y < 75) { page = pdf.addPage([595.28,841.89]); y = height-35; }
    page.drawRectangle({ x: margin, y:y-14, width:width-2*margin, height:18, color:green });
    page.drawText(title,{x:margin+6,y:y-9,size:8.5,font:bold,color:rgb(1,1,1)}); y-=24;
  }
  function field(label,value) {
    const lines = wrap(`${label}: ${value || "____________________________"}`, regular, 7.3, width-2*margin-10);
    for (const line of lines) {
      if (y < 48) { page = pdf.addPage([595.28,841.89]); y=height-35; }
      page.drawText(line,{x:margin+3,y,size:7.3,font:regular,color:ink}); y-=10;
    }
    y-=2;
  }
  section("SECTION A: PERSONAL INFORMATION");
  field("Registration Number",r.registration_number); field("Full Name",r.full_name); field("Date of Birth",r.date_of_birth);
  field("Age",r.age); field("Home Address",r.home_address); field("Phone Number",r.phone_number);
  field("Parent/Guardian Name",r.guardian_name); field("Parent/Guardian Phone",r.guardian_phone); field("School/Occupation",r.school_occupation);
  section("SECTION B: FOOTBALL INFORMATION");
  field("Preferred Position",r.preferred_position); field("Secondary Position",r.secondary_position); field("Preferred Foot",r.preferred_foot);
  field("Previous Club/Academy",r.previous_club); field("Previous Competition Experience",r.competition_experience);
  field("Jersey Number Preference",r.jersey_number_preference); field("Date Joined Bintin FA",r.date_joined);
  section("SECTION C: EMERGENCY AND MEDICAL INFORMATION");
  field("Emergency Contact Name",r.emergency_contact_name); field("Relationship",r.emergency_relationship);
  field("Emergency Contact Phone",r.emergency_contact_phone); field("Medical condition/allergy/injury",r.medical_notes || "None provided");
  section("SECTION D: PLAYER COMMITMENT");
  field("Commitment", "I agree to attend punctually, respect club members and officials, follow club rules, maintain sportsmanship, care for facilities, and notify the coach when absent.");
  section("SECTION E: PLAYER AND PARENT/GUARDIAN DECLARATION");
  field("Declaration", "I confirm that the information is accurate and agree to respect BINTIN FA rules and regulations.");
  field("Player's Full Name",r.player_declaration_name); field("Player's Signature","____________________________"); field("Player Declaration Date",r.player_declaration_date);
  field("Parent/Guardian Name",r.guardian_declaration_name); field("Parent/Guardian Signature","____________________________"); field("Parent/Guardian Date",r.guardian_declaration_date);
  section("SECTION F: FOR OFFICIAL USE ONLY");
  field("Registration Number",r.registration_number); field("Team Category",r.team_category); field("Registration Fee",r.registration_fee);
  field("Date Registered",r.date_registered); field("Coach's Name",r.coach_name); field("Coach's Signature","____________________________");
  if (y < 40) { page = pdf.addPage([595.28,841.89]); y=height-35; }
  page.drawText("BINTIN FA — DISCIPLINE • DEVELOPMENT • TEAMWORK • EXCELLENCE",{x:margin,y:25,size:7,font:bold,color:green});
  return await pdf.save();
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