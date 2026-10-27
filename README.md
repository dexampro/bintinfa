# BINTIN FA Player Registration

A deployable Netlify + Supabase starter for public player registration, a protected admin dashboard, private PDF storage, and optional two-address email notifications. The supplied BINTIN FA academy logo is included in the public site and embedded in generated PDFs.

## What it does

- Public registration form with sections A–E based on the supplied BINTIN FA registration form.
- Creates a unique registration number and a separate PDF for every successful submission.
- Stores player records and PDFs in Supabase. The PDF bucket is private.
- Protected admin page: sign in with Supabase Auth; emails must be listed in `ADMIN_EMAILS`.
- Admins can search players, assign team categories, update official-use fields, and generate a fresh PDF.
- Optional email notifications through Resend to two or more addresses.
- The PDF keeps signature lines and an official-use-only section.

## 1. Create Supabase project

Create a project at https://supabase.com. Open SQL Editor and run `supabase/schema.sql`.

In Authentication > Providers, enable Email. Create an Auth user for each administrator (for example, each email in `ADMIN_EMAILS`). Use strong passwords and enable MFA where available.

## 2. Configure environment variables

Copy `.env.example` values into Netlify Site configuration > Environment variables. Set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret only; never put it in frontend HTML)
- `ADMIN_EMAILS` (comma-separated exact admin emails)
- `ALLOWED_ORIGIN` (your exact deployed Netlify origin, e.g. `https://your-site.netlify.app`)

For email notifications, optionally configure `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender/domain in Resend), and `NOTIFY_EMAILS`.

Do not commit `.env` or service-role keys to GitHub.

## 3. Deploy to Netlify

1. Upload this folder to a private GitHub repository, or deploy it using Netlify's supported Git workflow.
2. In Netlify, create a site from the repository.
3. Set the environment variables above in the Netlify dashboard.
4. Deploy. Netlify Functions install the dependencies from `package.json`.
5. Open `https://YOUR-SITE.netlify.app/` and submit a test registration.

You can test locally with Node.js installed:
```bash
npm install
cp .env.example .env
# Fill in .env values, then:
npm run dev
```

## 4. Admin access

Open `/admin.html`. Sign in using the Supabase Auth user email/password you created. Only emails listed in `ADMIN_EMAILS` are accepted by the server functions. Never give the service-role key to an admin or put it in the browser.

## 5. Email notifications

To enable notification emails:
1. Create a Resend account and verify the sending domain/address.
2. Set `RESEND_API_KEY`, `EMAIL_FROM`, and `NOTIFY_EMAILS` in Netlify.
3. Each successful registration triggers a notification to the configured addresses. The email contains the registration number and a link to the admin dashboard; it does not attach medical data or the PDF.

If those variables are not configured, registration/PDF creation still works; email delivery is skipped.

## 6. PDF layout and signatures

The generated PDF uses the included academy logo, BINTIN FA green/gold styling, all six sections, and signature spaces. It is a clean one-page-style printable record, but long answers may continue onto a second page. The official-use section is generated with blank/updated admin fields. Actual handwritten signatures are left blank for printing; typed names are not treated as verified electronic signatures.

## 7. Important security and operational notes

- The database and PDF bucket are private by default. RLS policies deny public direct access.
- Public registration is submitted through a server function that uses the service-role key only server-side.
- This starter includes basic field validation and origin checking, but origin checking is not a substitute for a full anti-abuse system. Before public launch, consider adding CAPTCHA/Turnstile, rate limiting, backups, and a published privacy notice.
- This form collects details about minors and medical conditions. Limit admin access to trusted staff, use strong passwords/MFA, define a retention period, and collect only information genuinely needed for player safety.
- Age is collected as entered; it is not used to make legal or eligibility determinations.
- Admin PDF downloads use short-lived signed URLs.
- Test with fictional player data before collecting real registrations.

## 8. Troubleshooting

- `Server is not configured`: check Netlify environment variables, then redeploy.
- PDF fails: ensure `SUPABASE_SERVICE_ROLE_KEY` is correct and the SQL schema created the private `registration-pdfs` bucket.
- Admin cannot sign in: create the user in Supabase Auth and add the exact email to `ADMIN_EMAILS`.
- Email not sent: verify Resend sender and inspect Netlify Function logs.
