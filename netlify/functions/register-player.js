const { createClient } = require("@supabase/supabase-js");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const supabase = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function response(statusCode, payload) {
  return { statusCode, headers, body: JSON.stringify(payload) };
}
function clean(v, max = 2000) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
function escapePdf(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function wrap(text, font, size, maxWidth) {
  const words = escapePdf(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
async function makePdf(record) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.02, 0.22, 0.12);
  const gold = rgb(0.82, 0.48, 0.05);
  const ink = rgb(0.12, 0.16, 0.14);
  const muted = rgb(0.35, 0.39, 0.36);
  const margin = 38;
  let y = height - 30;

  // The logo is bundled with the website and embedded into each PDF.
  try {
    const logoPath = path.join(__dirname, "bintin-fa-logo.jpg");
    const bytes = fs.readFileSync(logoPath);
    const logo = await pdf.embedJpg(bytes);
    const boxW = 76, boxH = 76;
    page.drawImage(logo, { x: (width - boxW) / 2, y: y - boxH + 3, width: boxW, height: boxH });
    y -= 86;
  } catch (_) {
    page.drawText("BINTIN FA", { x: margin, y, size: 18, font: bold, color: green });
    y -= 24;
  }

  page.drawText("BINTIN FA", { x: margin, y, size: 16, font: bold, color: green });
  page.drawText("NEW PLAYER REGISTRATION FORM", {
    x: margin, y: y - 18, size: 11, font: bold, color: gold
  });
  page.drawText("Player Membership and Registration Record", {
    x: margin, y: y - 32, size: 8, font: regular, color: muted
  });
  y -= 44;

  function ensureSpace(need = 35) {
    if (y < margin + need) {
      page = pdf.addPage([595.28, 841.89]);
      y = height - 35;
    }
  }
  function section(title) {
    ensureSpace(34);
    page.drawRectangle({ x: margin, y: y - 15, width: width - margin * 2, height: 19, color: green });
    page.drawText(title, { x: margin + 7, y: y - 10, size: 9, font: bold, color: rgb(1,1,1) });
    y -= 26;
  }
  function field(label, value, opts = {}) {
    const size = opts.size || 7.7;
    const lines = wrap(`${label}: ${value || " "}`, regular, size, width - margin * 2 - 10);
    ensureSpace(lines.length * 11 + 6);
    for (const line of lines) {
      page.drawText(line, { x: margin + 3, y, size, font: regular, color: ink });
      y -= 10;
    }
    y -= 2;
  }
  function paragraph(text) {
    for (const line of wrap(text, regular, 7.4, width - margin * 2 - 10)) {
      ensureSpace(12);
      page.drawText(line, { x: margin + 3, y, size: 7.4, font: regular, color: ink });
      y -= 10;
    }
    y -= 3;
  }

  section("SECTION A: PERSONAL INFORMATION");
  field("Registration Number", record.registration_number);
  field("Full Name", record.full_name);
  field("Date of Birth", record.date_of_birth);
  field("Age", record.age);
  field("Home Address", record.home_address);
  field("Phone Number", record.phone_number);
  field("Parent/Guardian Name (for players under 18)", record.guardian_name);
  field("Parent/Guardian Phone Number", record.guardian_phone);
  field("School/Occupation", record.school_occupation);

  section("SECTION B: FOOTBALL INFORMATION");
  field("Preferred Playing Position", record.preferred_position);
  field("Secondary Position", record.secondary_position);
  field("Preferred Foot", record.preferred_foot);
  field("Previous Club/Academy", record.previous_club);
  field("Previous Competition Experience", record.competition_experience);
  field("Jersey Number Preference", record.jersey_number_preference);
  field("Date Joined Bintin FA", record.date_joined);

  section("SECTION C: EMERGENCY AND MEDICAL INFORMATION");
  field("Emergency Contact Name", record.emergency_contact_name);
  field("Relationship to Player", record.emergency_relationship);
  field("Emergency Contact Phone Number", record.emergency_contact_phone);
  field("Medical condition, allergy, or injury coaches should know about", record.medical_notes || "None provided");

  section("SECTION D: PLAYER COMMITMENT");
  paragraph("I understand that as a registered member of Bintin FA, I am expected to attend training sessions and matches punctually; respect coaches, teammates, referees, opponents and club officials; follow the rules and regulations of Bintin FA; maintain discipline and good sportsmanship; take proper care of club equipment and facilities; and inform the coach when I am unable to attend training or a match.");
  field("Commitment Agreement", record.commitment_agreed ? "Agreed" : "Not recorded");

  section("SECTION E: PLAYER AND PARENT/GUARDIAN DECLARATION");
  paragraph("I confirm that the information provided in this form is accurate to the best of my knowledge. I agree to respect the rules and regulations of Bintin FA.");
  field("Player's Full Name", record.player_declaration_name);
  field("Player's Signature", "____________________________________________");
  field("Player Declaration Date", record.player_declaration_date);
  field("Parent/Guardian Name (if applicable)", record.guardian_declaration_name);
  field("Parent/Guardian Signature", "_________________________________________");
  field("Parent/Guardian Declaration Date", record.guardian_declaration_date);

  section("SECTION F: FOR OFFICIAL USE ONLY");
  field("Registration Number", record.registration_number);
  field("Team Category", record.team_category || "____________________________");
  field("Registration Fee (if applicable)", record.registration_fee || "____________________________");
  field("Date Registered", record.date_registered);
  field("Coach's Name", record.coach_name || "____________________________");
  field("Coach's Signature", "____________________________________________");

  ensureSpace(35);
  page.drawText("BINTIN FA — DISCIPLINE • DEVELOPMENT • TEAMWORK • EXCELLENCE", {
    x: margin, y: margin + 10, size: 7.2, font: bold, color: green
  });
  page.drawText("Keep this record secure. Medical information is confidential.", {
    x: margin, y: margin, size: 6.5, font: regular, color: muted
  });
  return await pdf.save();
}

async function notify(record, siteUrl) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.NOTIFY_EMAILS) return;
  const to = process.env.NOTIFY_EMAILS.split(",").map(x => x.trim()).filter(Boolean);
  if (!to.length) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to,
      subject: `New BINTIN FA registration: ${record.registration_number}`,
      html: `<p>A new BINTIN FA player registration was received.</p>
        <p><strong>Registration number:</strong> ${record.registration_number}</p>
        <p><strong>Player:</strong> ${record.full_name.replace(/[&<>"]/g, "")}</p>
        <p><a href="${siteUrl}/admin.html">Open the secure admin dashboard</a> to view the record and download its PDF.</p>
        <p>For privacy, this notification does not include medical details or attach the PDF.</p>`
    })
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed." });

  const origin = event.headers.origin || event.headers.Origin || "";
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed && origin && origin !== allowed) return response(403, { error: "Origin not allowed." });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return response(500, { error: "Server is not configured. Please contact the academy." });
  }

  let input;
  try { input = JSON.parse(event.body || "{}"); }
  catch { return response(400, { error: "Invalid request body." }); }

  // Honeypot: real visitors leave this hidden field blank.
  if (clean(input.website, 200)) return response(200, { ok: true });

  const required = [
    "full_name", "date_of_birth", "age", "home_address", "phone_number",
    "school_occupation", "preferred_position", "preferred_foot",
    "emergency_contact_name", "emergency_relationship",
    "emergency_contact_phone", "player_declaration_name", "player_declaration_date"
  ];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null || String(input[key]).trim() === "") {
      return response(400, { error: `Please complete the required field: ${key.replaceAll("_", " ")}.` });
    }
  }
  const age = Number(input.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) return response(400, { error: "Enter a valid age." });
  if (!validDate(input.date_of_birth) || !validDate(input.player_declaration_date)) {
    return response(400, { error: "Enter valid dates." });
  }
  if (!["Right", "Left", "Both"].includes(input.preferred_foot)) {
    return response(400, { error: "Choose a valid preferred foot." });
  }
  if (input.commitment_agreed !== true) return response(400, { error: "You must agree to the player commitment." });

  const data = {
    full_name: clean(input.full_name, 150),
    date_of_birth: input.date_of_birth,
    age,
    home_address: clean(input.home_address, 1000),
    phone_number: clean(input.phone_number, 60),
    guardian_name: clean(input.guardian_name, 150) || null,
    guardian_phone: clean(input.guardian_phone, 60) || null,
    school_occupation: clean(input.school_occupation, 200),
    preferred_position: clean(input.preferred_position, 80),
    secondary_position: clean(input.secondary_position, 80) || null,
    preferred_foot: input.preferred_foot,
    previous_club: clean(input.previous_club, 200) || null,
    competition_experience: clean(input.competition_experience, 1500) || null,
    jersey_number_preference: clean(input.jersey_number_preference, 20) || null,
    date_joined: validDate(input.date_joined) ? input.date_joined : null,
    emergency_contact_name: clean(input.emergency_contact_name, 150),
    emergency_relationship: clean(input.emergency_relationship, 100),
    emergency_contact_phone: clean(input.emergency_contact_phone, 60),
    medical_notes: clean(input.medical_notes, 1500) || null,
    commitment_agreed: true,
    player_declaration_name: clean(input.player_declaration_name, 150),
    player_signature_typed: clean(input.player_signature_typed, 150) || null,
    player_declaration_date: input.player_declaration_date,
    guardian_declaration_name: clean(input.guardian_declaration_name, 150) || null,
    guardian_signature_typed: clean(input.guardian_signature_typed, 150) || null,
    guardian_declaration_date: validDate(input.guardian_declaration_date) ? input.guardian_declaration_date : null
  };

  const db = supabase();
  const registrationNumber = `BFA-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
  const { data: inserted, error: insertError } = await db
    .from("player_registrations")
    .insert({ ...data, registration_number: registrationNumber, date_registered: new Date().toISOString().slice(0,10) })
    .select("*").single();

  if (insertError) {
    console.error("Registration insert failed:", insertError.message);
    return response(500, { error: "We could not save your registration. Please try again." });
  }

  try {
    const bytes = await makePdf(inserted);
    const pdfPath = `${inserted.registration_number}.pdf`;
    const { error: uploadError } = await db.storage
      .from("registration-pdfs")
      .upload(pdfPath, bytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;

    const { error: updateError } = await db.from("player_registrations")
      .update({ pdf_path: pdfPath, updated_at: new Date().toISOString() })
      .eq("id", inserted.id);
    if (updateError) throw updateError;

    try {
      await notify(inserted, process.env.URL || process.env.ALLOWED_ORIGIN || "");
    } catch (mailError) {
      console.error("Notification email failed:", mailError.message);
    }

    return response(201, {
      ok: true,
      registration_number: inserted.registration_number,
      message: "Registration received successfully. Keep your registration number."
    });
  } catch (err) {
    console.error("PDF generation/upload failed:", err.message || err);
    // Record remains saved, but explicitly signal that PDF generation needs admin retry.
    return response(202, {
      ok: true,
      pdf_pending: true,
      registration_number: inserted.registration_number,
      message: "Your registration was saved, but the PDF is delayed. Please keep your registration number."
    });
  }
};