const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");

const GREEN = rgb(0.025, 0.22, 0.13);
const GOLD = rgb(0.80, 0.48, 0.08);
const INK = rgb(0.13, 0.17, 0.14);
const MUTED = rgb(0.39, 0.44, 0.40);
const PALE = rgb(0.95, 0.97, 0.95);
const LINE = rgb(0.84, 0.88, 0.84);
const WHITE = rgb(1, 1, 1);
const PAGE_W = 595.28, PAGE_H = 841.89, M = 38;
const clean = v => String(v ?? "").replace(/\s+/g, " ").trim() || "—";

function linesFor(value, font, size, maxWidth, maxLines = 4) {
  const words = clean(value).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line); line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length && font.widthOfTextAtSize(last + "…", size) > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines.length ? lines : ["—"];
}

async function createRegistrationPdf(record, logoPath) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page;
  let y;

  const addPage = (first = false) => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - (first ? 150 : 68);
    if (!first) {
      page.drawRectangle({ x: 0, y: PAGE_H - 8, width: PAGE_W, height: 8, color: GREEN });
      page.drawText("BINTIN FA  |  PLAYER REGISTRATION", { x: M, y: PAGE_H - 34, size: 9, font: bold, color: GREEN });
      page.drawText("CONTINUED", { x: PAGE_W - M - 62, y: PAGE_H - 34, size: 7, font: bold, color: GOLD });
      page.drawLine({ start: { x: M, y: PAGE_H - 44 }, end: { x: PAGE_W - M, y: PAGE_H - 44 }, thickness: 0.7, color: LINE });
    }
  };
  addPage(true);

  page.drawRectangle({ x: 0, y: PAGE_H - 9, width: PAGE_W, height: 9, color: GREEN });
  let logoLoaded = false;
  try {
    const bytes = fs.readFileSync(logoPath);
    const logo = await pdf.embedJpg(bytes);
    const scale = Math.min(54 / logo.width, 54 / logo.height);
    page.drawImage(logo, { x: M, y: PAGE_H - 82, width: logo.width * scale, height: logo.height * scale });
    logoLoaded = true;
  } catch (_) {}
  const titleX = logoLoaded ? M + 68 : M;
  page.drawText("BINTIN FA", { x: titleX, y: PAGE_H - 42, size: 20, font: bold, color: GREEN });
  page.drawText("FOOTBALL ACADEMY", { x: titleX, y: PAGE_H - 57, size: 8, font: bold, color: MUTED });
  page.drawText("NEW PLAYER REGISTRATION FORM", { x: titleX, y: PAGE_H - 73, size: 10, font: bold, color: GOLD });
  page.drawText("DISCIPLINE  •  DEVELOPMENT  •  TEAMWORK  •  EXCELLENCE", { x: titleX, y: PAGE_H - 87, size: 6.5, font: regular, color: MUTED });

  const badgeX = PAGE_W - M - 143;
  page.drawRectangle({ x: badgeX, y: PAGE_H - 91, width: 143, height: 49, color: PALE, borderColor: LINE, borderWidth: 0.8 });
  page.drawText("REGISTRATION NO.", { x: badgeX + 9, y: PAGE_H - 57, size: 6.5, font: bold, color: MUTED });
  const reg = clean(record.registration_number);
  const regSize = reg.length > 18 ? 8 : 9;
  page.drawText(reg, { x: badgeX + 9, y: PAGE_H - 75, size: regSize, font: bold, color: GREEN });
  page.drawLine({ start: { x: M, y: PAGE_H - 105 }, end: { x: PAGE_W - M, y: PAGE_H - 105 }, thickness: 1.5, color: GOLD });
  page.drawText("PLAYER MEMBERSHIP AND REGISTRATION RECORD", { x: M, y: PAGE_H - 124, size: 8, font: bold, color: INK });

  function ensureSpace(height) {
    if (y - height < 45) addPage(false);
  }
  function section(title) {
    ensureSpace(34);
    page.drawRectangle({ x: M, y: y - 17, width: PAGE_W - 2 * M, height: 21, color: GREEN });
    page.drawRectangle({ x: M, y: y - 17, width: 4, height: 21, color: GOLD });
    page.drawText(title.toUpperCase(), { x: M + 11, y: y - 10, size: 8.2, font: bold, color: WHITE });
    y -= 29;
  }
  function drawFieldBox(x, top, w, label, value, wide = false) {
    const labelSize = 6.7, valueSize = 8;
    const pad = 8;
    const valueLines = linesFor(value, regular, valueSize, w - pad * 2, wide ? 4 : 3);
    const h = Math.max(34, 17 + valueLines.length * 10 + 7);
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: WHITE, borderColor: LINE, borderWidth: 0.7 });
    page.drawText(label.toUpperCase(), { x: x + pad, y: top - 12, size: labelSize, font: bold, color: MUTED });
    let vy = top - 25;
    for (const line of valueLines) {
      page.drawText(line, { x: x + pad, y: vy, size: valueSize, font: regular, color: INK });
      vy -= 10;
    }
    return h;
  }
  function fields(items) {
    const gap = 9, colW = (PAGE_W - 2 * M - gap) / 2;
    for (let i = 0; i < items.length;) {
      const item = items[i];
      if (item.wide) {
        const preview = linesFor(item.value, regular, 8, PAGE_W - 2 * M - 16, 4);
        const h = Math.max(34, 17 + preview.length * 10 + 7);
        ensureSpace(h + 5);
        const used = drawFieldBox(M, y, PAGE_W - 2 * M, item.label, item.value, true);
        y -= used + 6; i++;
      } else {
        const next = items[i + 1] && !items[i + 1].wide ? items[i + 1] : null;
        const estimate = item => Math.max(34, 17 + linesFor(item.value, regular, 8, colW - 16, 3).length * 10 + 7);
        const rowH = Math.max(estimate(item), next ? estimate(next) : 0);
        ensureSpace(rowH + 5);
        drawFieldBox(M, y, colW, item.label, item.value, false);
        if (next) drawFieldBox(M + colW + gap, y, colW, next.label, next.value, false);
        y -= rowH + 6;
        i += next ? 2 : 1;
      }
    }
  }
  function paragraph(text) {
    const size = 8;
    const wrapped = linesFor(text, regular, size, PAGE_W - 2 * M - 18, 12);
    const h = wrapped.length * 11 + 16;
    ensureSpace(h + 4);
    page.drawRectangle({ x: M, y: y - h, width: PAGE_W - 2 * M, height: h, color: PALE, borderColor: LINE, borderWidth: 0.6 });
    let py = y - 14;
    for (const line of wrapped) { page.drawText(line, { x: M + 9, y: py, size, font: regular, color: INK }); py -= 11; }
    y -= h + 7;
  }
  function signatures(items) {
    const gap = 16, w = (PAGE_W - 2 * M - gap) / 2;
    const h = 49;
    ensureSpace(h + 6);
    for (let i = 0; i < items.length; i++) {
      const x = M + i * (w + gap);
      page.drawText(items[i].label.toUpperCase(), { x, y: y - 9, size: 6.7, font: bold, color: MUTED });
      page.drawLine({ start: { x, y: y - 34 }, end: { x: x + w, y: y - 34 }, thickness: 0.8, color: INK });
      page.drawText(items[i].date || "SIGNATURE / DATE", { x, y: y - 45, size: 6.5, font: regular, color: MUTED });
    }
    y -= h + 7;
  }

  section("Section A: Personal Information");
  fields([
    {label:"Full Name",value:record.full_name},{label:"Date of Birth",value:record.date_of_birth},
    {label:"Age",value:record.age},{label:"Phone Number",value:record.phone_number},
    {label:"Home Address",value:record.home_address,wide:true},
    {label:"Parent / Guardian Name",value:record.guardian_name},{label:"Parent / Guardian Phone",value:record.guardian_phone},
    {label:"School / Occupation",value:record.school_occupation,wide:true}
  ]);

  section("Section B: Football Information");
  fields([
    {label:"Preferred Playing Position",value:record.preferred_position},{label:"Secondary Position",value:record.secondary_position},
    {label:"Preferred Foot",value:record.preferred_foot},{label:"Jersey Number Preference",value:record.jersey_number_preference},
    {label:"Previous Club / Academy",value:record.previous_club,wide:true},
    {label:"Previous Competition Experience",value:record.competition_experience,wide:true},
    {label:"Date Joined BINTIN FA",value:record.date_joined,wide:true}
  ]);

  section("Section C: Emergency and Medical Information");
  fields([
    {label:"Emergency Contact Name",value:record.emergency_contact_name},{label:"Relationship to Player",value:record.emergency_relationship},
    {label:"Emergency Contact Phone",value:record.emergency_contact_phone,wide:true},
    {label:"Medical Condition / Allergy / Injury",value:record.medical_notes || "None provided",wide:true}
  ]);

  section("Section D: Player Commitment");
  paragraph("I understand that as a registered member of BINTIN FA, I am expected to attend training sessions and matches punctually; respect coaches, teammates, referees, opponents and club officials; follow the rules and regulations of BINTIN FA; maintain discipline and good sportsmanship; take proper care of club equipment and facilities; and inform the coach when I am unable to attend training or a match.");
  fields([{label:"Commitment Agreement",value:record.commitment_agreed ? "Agreed" : "Not recorded",wide:true}]);

  section("Section E: Player and Parent / Guardian Declaration");
  paragraph("I confirm that the information provided in this form is accurate to the best of my knowledge. I agree to respect the rules and regulations of BINTIN FA.");
  fields([
    {label:"Player's Full Name",value:record.player_declaration_name},{label:"Player's Typed Name / Signature",value:record.player_signature_typed},
    {label:"Player Declaration Date",value:record.player_declaration_date},{label:"Parent / Guardian Name",value:record.guardian_declaration_name},
    {label:"Parent / Guardian Typed Name / Signature",value:record.guardian_signature_typed},{label:"Parent / Guardian Declaration Date",value:record.guardian_declaration_date}
  ]);
  signatures([
    {label:"Player Signature",date:"DATE: __________________"},
    {label:"Parent / Guardian Signature",date:"DATE: __________________"}
  ]);

  section("Section F: For Official Use Only");
  fields([
    {label:"Registration Number",value:record.registration_number},{label:"Team Category",value:record.team_category || "To be completed by academy"},
    {label:"Registration Fee",value:record.registration_fee || "To be completed by academy"},{label:"Date Registered",value:record.date_registered},
    {label:"Coach's Name",value:record.coach_name || "To be completed by academy",wide:true}
  ]);
  signatures([{label:"Coach / Authorised Staff Signature",date:"DATE: __________________"},{label:"Academy Stamp",date:"OFFICIAL USE"}]);

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({ start: { x: M, y: 34 }, end: { x: PAGE_W - M, y: 34 }, thickness: 0.6, color: LINE });
    p.drawText("BINTIN FA  •  CONFIDENTIAL PLAYER RECORD", { x: M, y: 21, size: 6.5, font: bold, color: MUTED });
    p.drawText("Medical information: authorised access only", { x: M + 210, y: 21, size: 6.2, font: regular, color: MUTED });
    const pageText = "PAGE " + (index + 1) + " OF " + pages.length;
    p.drawText(pageText, { x: PAGE_W - M - bold.widthOfTextAtSize(pageText, 6.5), y: 21, size: 6.5, font: bold, color: GREEN });
  });
  return await pdf.save();
}

module.exports = { createRegistrationPdf };
