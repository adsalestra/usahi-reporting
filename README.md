# USAHI Marketing Workspace — Vercel edition

A new, independent Next.js client reporting platform. The original Apps Script deployment is not modified. Google Sheets is accessed with **read-only API scope**. Reports, review requests, approval decisions, and comments live in a separate Supabase database.

## Features
- Clear client view: **Overview · Reports · Reviews**.
- Professional responsive layout using USAHI blue `#16357a`, red `#cc2027`, light neutrals.
- Paid media summary with collapsible campaign, keyword, lead, and opportunity details.
- One-form HTML import: title, report format, date, summary, `.html` file, local preview, publish/draft.
- Safe report display with server-side HTML sanitization and iframe sandbox.
- Approve, request changes, and comment on proposed links; event history with verified user email.
- Supabase email/password login, admin role limited to `ADMIN_EMAIL`.
- Demo preview when Supabase is unconfigured; **no fake live metrics**.

## Installation — no terminal needed

### A. Create the two services (one time)
1. Create a **Supabase** project at https://supabase.com/dashboard.
2. Go to **SQL Editor** → **New query**. Paste the entire `supabase/setup.sql` file and select **Run**.
3. Go to **Authentication → Users**. Create an admin user using a real email and password (you will need to confirm the user if email confirmation is on). The same email must go into `ADMIN_EMAIL`.
4. Create client users in **Authentication → Users** as needed. They can see published reports and submit approvals, but cannot publish.
5. Under Supabase **Project Settings → API Keys**, locate Project URL, publishable/anon key, and service role secret. **Never commit the service role key to GitHub.**

### B. Connect GitHub to Vercel
1. Unzip this package. Create a **new private GitHub repository**. Upload all project files preserving their folders. Do not upload `.env` or `.env.local`.
2. On https://vercel.com/new, select **Import Git Repository**, choose your repo, Framework **Next.js**, and **Deploy**.
3. On Vercel, open **Project → Settings → Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` — Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable/anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role secret
   - `ADMIN_EMAIL` — email of the admin created above
4. Apply these variables to Production and Preview as appropriate. Then go to **Deployments → Redeploy** to load them. The first deployment without credentials shows a design preview, not real data.
5. Sign in using the admin email and password you created in Supabase.

### C. Connect the existing Google Ads spreadsheet without editing it
1. In https://console.cloud.google.com, make a project (or select one). Enable **Google Sheets API**.
2. Go to **IAM & Admin → Service Accounts → Create service account**. Create a **JSON key** (Keys → Add Key → Create New Key → JSON). Keep it private.
3. From the downloaded JSON, copy `client_email` and `private_key`.
4. In your *existing* Google Ads spreadsheet, use **Share**, add the service account email with **Viewer** permission only. Do not give Editor access.
5. In Vercel Environment Variables set:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = JSON `client_email`
   - `GOOGLE_PRIVATE_KEY` = JSON `private_key` including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. If inserting as one line, preserve `\n` characters.
   - `GOOGLE_SHEETS_IDS` = the report sheet ID. It is not written here on purpose:
     that sheet is shared as link-editable, so anyone holding the ID can change the
     live report. Take it from the private handoff notes or from the sheet URL.
6. Redeploy. On Overview, pick a date range and use Refresh. If needed, add multiple Google spreadsheet IDs separated by commas. The app only reads the known Google Ads tab names.

**Privacy:** Ads account data and lead names are accessible to all authenticated dashboard users. Create accounts only for people permitted to see that information. For stricter role-based access, customize the authorization before onboarding more clients.

### D. Publish a report (two steps)
1. Prepare a self-contained HTML report using any editor or AI. Include headings, paragraphs, tables, internal/external links, and embedded images.
2. Sign in as admin → **Reports → New report → Choose HTML report → Set title, date and report format → Preview → Publish report**.

Saved HTML is sanitized. No JavaScript executes in reports. The upload maximum is 3.5MB because of serverless request size constraints. For larger reports, compress screenshots or use images from reliable HTTPS URLs. The system does **not** upload Word or Google Docs automatically; export/convert to HTML first. Relative image file paths from a downloaded HTML package will not work. Use embedded `data:image/png;base64,...` images or HTTPS image URLs.

### E. Ask for page approval
1. Admin → **Reviews → Request review**. Either one page (title + URL), or **Paste many links** for a whole list, one per line; each page is named from its own address and a page already on the list is skipped.
2. Client signs in → **Reviews**, opens link, clicks Approve or writes a reason and chooses Request changes.
3. Comments and decisions are stored with email + timestamp.
4. **Cards** or **Compact** switches the layout; the choice is remembered per browser. Compact is one page per row with its address shown.
5. **Edit** and **Remove** appear only for the admin. The client can open the page, comment, approve or request changes — nothing else.

### F. Customize company branding
- Edit `app/globals.css`: `--navy`, `--red`, and other design tokens.
- The exact USAHI logo embedded in the SEO document provided by the user is included at `public/usahi-logo.png`. You may replace it with a higher-resolution official file later.
- Vercel → Settings → Domains: add an owned custom subdomain e.g. `reports.gousahi.com`; follow DNS instructions. This gives you a short branded URL.

## Security and limitations
- All API endpoints verify a current Supabase Auth token server-side; Admin operations also require the exact email set in `ADMIN_EMAIL`.
- Database tables have RLS enabled with no direct anon/authenticated access; server uses service role after checks.
- No old Apps Script data is written. This new app does **not** save lead statuses into your old workbook; this is intentional to honor your strict read-only requirement.
- **The month-by-month table shows three bases, and never merges them.** A won deal is reported in the month its opportunity was created, in the month its lead was created, and — only when the lead month and the contract-effective month are the same month — as a same-month sale. No column is labelled as the revenue for a month. The lead month comes from the `Lead Created` column the sales team already fills on the Opportunities tab; **no fuzzy phone/email matching is performed**, unlike the old Apps Script portal, so an opportunity with that column blank falls back to its own created date and is never guessed into another month.
- Google Ads spend divided by Salesforce estimates or won deals (cost per estimate, ROAS) crosses two accounting systems. The dashboard says so under those tiles; treat the ratios as directional.
- Google Ads and CallRail metrics are different accounting systems; they are labelled separately.
- Preview builds with an unconfigured Supabase show sample SEO content from your uploaded files; no live metrics are invented.
- To keep setup simple, reports are stored as HTML text in Supabase Postgres. Very large report archives should later use object storage.
- Login/password settings, limits, and email verification are controlled by Supabase. Configure MFA and abuse protection there before wide deployment.

## Local development (optional)
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Validation
```bash
npm install
npm run check    # TypeScript
npm test         # offline tests for the report sanitizer and the Ads summary maths
npm run build    # production build
```
All four pass on Node 24 with Next 16.4.3. Browser testing with your Google/Supabase accounts is still required; offline packaging cannot validate remote permissions or live spreadsheet shape.

Once deployed, open `/api/health` to see which environment variables Vercel actually received. It returns yes/no per setting and never returns a key, an email or a spreadsheet ID:
```json
{"ok":false,"checks":{"supabase":false,...},"missing":["ADMIN_EMAIL"],"mode":"design preview"}
```

## Turning the weekly Word report into an HTML upload

Download the report from Google Docs as `.docx` (File → Download → Microsoft Word), then:

```bash
node scripts/docx-to-report-html.mjs "USA Home Improvement Weekly Report.docx" "weekly.html"
```

It keeps the document's own words, headings, lists, tables and links, embeds every
screenshot as base64, and prints the finished size so you know it is under the 3.5 MB
upload limit. It adds nothing of its own: the only thing it drops is the printed page
number after each table-of-contents line, which means nothing on a scrolling page.
Both files in `examples/` were produced this way and are character-for-character
identical to the Word originals in `handoff/seo_original_documents/`.

If you would rather not run a command, copy the following into ChatGPT with your
Google Doc attached — check the result against the original before uploading, because
a model may paraphrase:

> Convert this USA Home Improvement SEO report into a single self-contained HTML file. Keep all actual text, facts, URL links and their order. Include the original images in their matching sections, embedded inside the HTML as base64 images if possible. Do not invent numbers or outcomes. Use accessible headings, paragraphs, lists and tables. Keep the design clean and legible. Make the final file less than 3.5 MB by resizing images where necessary. Give me the `.html` file.

Open the resulting file locally, check text and screenshots, then upload it from Reports → New report. The dashboard removes custom JavaScript and styling and applies standard USAHI formatting for safety.
