const { createClient } = require("@supabase/supabase-js");
const { createRegistrationPdf } = require("./pdf-layout");
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
  return createRegistrationPdf(record, path.join(__dirname, "bintin-fa-logo.jpg"));
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
  const allowed = (process.env.ALLOWED_ORIGIN || "").trim().replace(/\/+$/, "");
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
