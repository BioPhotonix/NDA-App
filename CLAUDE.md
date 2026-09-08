# BioPhotonix NDA — Project Handoff

A web app that lets BioPhotonix Ltd's counterparties (universities, NHS trusts,
companies, individuals) fill in and sign a mutual Non-Disclosure Agreement
online. On submit, the completed PDF is emailed straight to BioPhotonix, with a
copy to the signer. Downloading and printing remain available as a fallback.

The front end is still pure client-side HTML/CSS/JS. The only server-side part
is one serverless function that sends the email, so the Resend API key is never
exposed to the browser.

See `README.md` for deployment and Resend setup.

---

## 1. What it does

- Renders the full NDA text as a live on-screen document that updates as the user types.
- Lets the recipient pick a **recipient type** (Company / Education Institution / Individual / Other) — form labels and the PARTIES clause wording adapt automatically.
- Lets the recipient pick a **governing law** (Scots law / Law of England & Wales) — Clause 17 and related references update automatically.
- Bakes in BioPhotonix director Adail Islam's handwritten signature image on both the on-screen preview and the generated PDF.
- Generates a dated, filled PDF via jsPDF.
- **Emails the signed PDF to BioPhotonix on submit**, and sends the signer their
  own copy. Download and print remain as a fallback if sending fails.
- Validates required fields before generating the PDF, then validates again
  server-side because anyone can POST to the endpoint directly.

No database and no stored state — a submission is validated, emailed, and
forgotten. The only server-side code is `api/_lib/send-nda.js` plus its two
thin host adapters.

---

## 2. File structure

```
.
├── index.html                     # Page markup, inline CSS, NDA clause text, form, toggle UI
├── app.js                         # Live preview, toggles, validation, PDF generation, submit
├── config.js                      # PUBLIC front-end config: API endpoint, contact details.
│                                  #   Never put a secret here — it is served to every visitor.
├── jspdf.umd.min.js               # Vendored jsPDF UMD build (loaded via <script>, NOT npm)
├── adail-signature.png            # Adail Islam's handwritten signature (embedded into PDF + preview)
├── biophotonix-logo.jpg           # BioPhotonix company logo (teal aperture mark)
├── server.js                      # Local dev server: static files + the function in one process.
│                                  #   Development only — the hosts do not use it.
├── api/
│   ├── send-nda.js                # Vercel serverless function (POST /api/send-nda)
│   └── _lib/send-nda.js           # All the real logic: validation, email body, Resend call.
│                                  #   Shared by both host adapters. The `_` prefix keeps
│                                  #   Vercel from exposing it as a route.
├── netlify/functions/send-nda.mjs # Netlify adapter for the same shared logic
├── test/                          # node:test suites for the server-side logic
├── vercel.json                    # Vercel function + security headers config
├── netlify.toml                   # Netlify publish dir, functions dir, /api redirect
├── .env.example                   # Template for the server-side environment variables
├── package.json                   # ESM ("type": "module"); jspdf is listed but vendored,
│                                  #   so `npm install` is NOT required to run the app
├── README.md                      # Deployment, Resend setup, troubleshooting
└── CLAUDE.md                      # This file
```

---

## 3. How to run locally

No build step, and still no `npm install` — jsPDF is vendored and the function
uses only Node built-ins.

```bash
# Full flow, including sending real email (needs a .env — see .env.example)
node --env-file=.env server.js
# then visit http://localhost:8000

# Front end only: any static server works, but /api/send-nda will 404,
# so submitting will fail. Download and print still work.
python3 -m http.server 8000
```

Do not open `index.html` over `file://` — the signature image fetch is blocked
by CORS, and there is no endpoint to submit to.

Run the server-side tests with `npm test` (uses `node:test`; no dependencies).

---

## 4. Technical constraints (important)

These were learned the hard way — respect them or things break silently:

1. **jsPDF must use the UMD build** (`jspdf.umd.min.js`), loaded via a `<script>`
   tag, and the PDF-generation code wrapped in `DOMContentLoaded`. The ES module
   build does not work in the sandboxed preview iframe.

2. **Date parsing**: the signing date input gives `YYYY-MM-DD`. Parse it by splitting
   on `-` as a string — do NOT use `new Date()`, which causes a timezone shift
   that off-by-one the displayed date.

3. **No `node_modules/`**. The security review flagged it as unnecessary (the UMD
   build is already vendored). Do not re-add it.

4. **Sandboxed preview blocks** (only matters when hosting in Perplexity's
   `/computer/a` preview iframe, not a normal static host): `localStorage`,
   `sessionStorage`, `indexedDB`, and `window.open()` with blob URLs are silently
   blocked. The app already avoids all of these. Note that Perplexity Computer
   is static-only, so it cannot run the email function — see section 8.

5. **Signature image**: `adail-signature.png` is fetched at load time and
   converted to a data URL so it can be embedded into the jsPDF output.
   If the file is missing or fails to load, the signature silently does not
   appear in the PDF.

6. **Never put a secret in `config.js`, `app.js` or `index.html`.** They are
   served to every visitor. The Resend API key belongs in a server-side
   environment variable, read only by `api/_lib/send-nda.js`.

7. **The two host adapters must stay thin.** `api/send-nda.js` and
   `netlify/functions/send-nda.mjs` only translate the host's request and
   response shapes. Any behaviour change goes in `api/_lib/send-nda.js` so both
   hosts stay in step, and so the tests still cover it.

8. **Validate on the server, not just in the browser.** `validateForm()` in
   `app.js` is a convenience for the signer; anyone can POST to the endpoint
   directly, so `parseSubmission()` re-checks everything independently.

9. **A failed signer copy must not fail the request.** The NDA has already
   reached BioPhotonix by that point, and failing would make the signer submit
   again and create duplicates.

---

## 5. How the code is organised

### index.html
- Inline `<style>` block: all CSS (design tokens, toggles, form layout, buttons).
- Document preview: the NDA clause text lives here as HTML, with `<span>` elements
  that `app.js` updates live (e.g. `preview-company`, `preview-incorporation`,
  `preview-entity-noun`, `preview-entity-verb`, `preview-entity-number-label`,
  `preview-law-governing`, `preview-law-courts`, `preview-bp-date`, etc.).
- Form: recipient-type toggle (4-way radio), jurisdiction toggle (2-way radio),
  shared field block for Company/Education/Other, separate field block for Individual,
  signer name/title/date, signature pad (draw or type).
- Actions: three buttons — `#submit-btn` (primary: sends the NDA by email),
  `#download-btn` and `#print-btn` (both fallbacks). A `#website` honeypot input
  sits hidden above them; it must stay empty for a submission to be emailed.
  (The old "Email" / *mailto* button is gone and must not come back — real
  sending now goes through the endpoint, not the user's mail client.)
- Banners: `#success-banner` and `#error-banner`, driven by `showBanner()`.

### app.js (single IIFE, runs on DOMContentLoaded)
- **Theme toggle** (dark/light).
- **Live preview**: `[data-preview]` inputs update corresponding `<span>`s.
- **`ENTITY_TYPES` object**: config for each of company / education / other —
  noun ("a company" / "an educational institution" / "an organisation"),
  verb ("incorporated in" / "established in"),
  number label, field labels, and placeholders. `applyEntityLabels(type)`
  applies them to the form and preview. Individual is handled separately.
- **`JURISDICTIONS` object**: `{ scotland: {...}, england: {...} }` with
  `subtitle`, `tradeSecret`, `governing`, `courts` strings. `applyJurisdiction()`
  updates the preview spans.
- **Signature pad**: canvas drawing + typed-name tab.
- **`validateForm()`**: required fields vary by recipient type.
- **`buildPDF()`**: builds the jsPDF document. Branches on `recipientType` for the
  PARTIES clause and title line. Returns `{ doc, filename, recipientName, name }`.
- **`generatePDF()`**: calls `buildPDF()`, saves the file, shows success banner.
- **`openPDFForPrint()`**: builds the PDF, opens in a new tab for printing.
- **`submitNDA()`**: the primary action. Builds the PDF, base64-encodes it via
  `arrayBufferToBase64()` (chunked — `String.fromCharCode(...bytes)` overflows
  the argument limit on a whole document), POSTs it as JSON to
  `CONFIG.endpoint`, and shows a success or error banner. On success the submit
  button is disabled so a second click cannot send a duplicate.
- **`CONFIG`**: `window.NDA_CONFIG` from `config.js`, with defaults merged in.

### api/_lib/send-nda.js (the server-side half)
- **`readConfig(env)`**: reads and validates the environment variables, throwing
  a `RequestError(500)` naming any that are missing.
- **`parseSubmission(body)`**: independent server-side validation — required
  fields, allowed recipient type and jurisdiction, email shape, CR/LF stripping,
  base64 and `%PDF-` header checks, filename sanitising, honeypot.
- **`handleSubmission(body, env, origin)`**: the whole flow. Sends the internal
  notification, then the signer's copy, and returns `{ status, body }`.
- **`toErrorResponse(error)`**: maps a thrown error to a safe status and message.
  Unexpected errors and provider responses are logged but never returned to the
  browser, since they can leak API key state.

---

## 6. The NDA content (current as of 28 Aug 2026)

The agreement is a **mutual** NDA between (1) BioPhotonix Ltd and (2) the Recipient.

**BioPhotonix Ltd legal entity** (baked into PARTIES clause (1)):
BioPhotonix Ltd, a company incorporated in Scotland (company number SC881225),
registered office Thebeyond, Skypark, 8 Elliot Street, Glasgow, G3 8EP.
Director/CEO Adail Islam.

The Recipient's signature block carries Name / Title / **Email** / Date. The
email line was added when submission by email replaced manual return, so the
signed document itself records the address the copy was sent to.

**Key clauses** (clause numbers and headings as in the document):
1. Definitions — Confidential Information, exclusions.
2. Confidentiality Obligations.
3. Exceptions (public domain, prior possession, third-party disclosure, independent development).
4. Copies and Return of Materials.
5. No Licence or Warranty.
6. Trade Secrets (jurisdiction-aware).
7. No Reverse Engineering — the word "analyse" was removed (a regulatory
   consultant needs to analyse CI to give opinions; the reverse-engineering /
   decompile / disassemble / derive protections remain).
8. No Clinical or Patient Use.
9. Regulatory Restrictions — rewritten to bar *submitting or disclosing* CI to a
   regulator/Notified Body without consent, with a carve-out for disclosures
   within the agreed scope of services or required by law. (Lets consultants
   prepare MDR tech files, 510(k)s, Notified Body responses, etc.)
10. Non-Circumvention — mutual, narrowed to knowingly using CI to circumvent a
    specific commercial opportunity introduced by the Disclosing Party, with
    carve-outs for pre-existing relationships, independent awareness, and
    independent contact.
11. No Publicity.
12. Term and Survival — 5 years; obligations survive 5 years post-termination.
13. Assignment.
14. Remedies — injunctive relief.
15. Entire Agreement and Variation.
16. Counterparts — electronic signatures effective. (The document is framed as a
    signed agreement, NOT a deed — "EXECUTED AS A DEED" was changed to "SIGNED"
    because deed has a specific meaning under both English and Scots law that
    does not apply to an IP/confidentiality agreement.)
17. Governing Law and Jurisdiction — toggles between Scots law/Scottish courts
    and English law/English courts.

---

## 7. Recipient types and how they map

| Toggle value   | Noun in clause             | Verb            | Number label        | Field labels                         |
|----------------|----------------------------|-----------------|---------------------|--------------------------------------|
| `company`      | a company                  | incorporated in | company number      | Company Name / Place of Incorporation / Company Number |
| `education`    | an educational institution | established in  | institution number  | Institution Name / Place of Establishment / Institution-Registration Number |
| `individual`   | (an individual)            | residing at     | —                   | Full Legal Name / Residential Address |
| `other`        | an organisation            | established in  | registration number | Organisation Name / Place of Establishment / Registration Number |

Company, education, and other share one field block (`#company-fields`) with
labels swapped at runtime; individual has its own block (`#individual-fields`).

---

## 8. Deployment

Full instructions, including Resend domain verification, are in `README.md`.
The short version:

- The app needs a host that serves static files **and** runs a serverless
  function. Vercel and Netlify both do, and both are configured here already
  (`vercel.json`, `netlify.toml`). Import the repo, set the environment
  variables, deploy.
- **A static-only host is no longer enough.** GitHub Pages, S3 and Perplexity
  Computer can serve the page, but `/api/send-nda` will 404 and submitting will
  fail. If the page must live on a static host, deploy the function separately,
  put its full URL in `config.js`, and set `NDA_ALLOWED_ORIGINS` on the server
  to the page's origin.
- Environment variables are read at deploy time — **redeploy after changing
  them**, or the function keeps the old values.

**Live deployment (Sep 2026):**
- Host: **Netlify** — chosen over Vercel because Vercel's free Hobby tier is
  non-commercial and this is client-facing company use; Netlify's free tier
  permits it.
- Site: https://biophotonix-nda.netlify.app (deploys from this branch on push)
- Email: Resend, sending as `nda@biophotonix.co.uk`.
- **DNS for biophotonix.co.uk is served by Wix**, not by IONOS where the domain
  is registered. Records added in the IONOS panel do nothing — IONOS shows them
  regardless. The Resend verification records live in Wix's DNS editor. See
  `README.md` → *DNS gotchas*; this cost an hour to spot the first time.

Previous Perplexity deployment details (for history — static only, so it
predates the email feature):
- Live URL: https://biophotonix-nda.pplx.app
- Deployed via `pplx-tool deploy_website` / `publish_website`.
- site_id: bc4aa17e-37f0-485f-8faf-e34172d314a4
- asset_id: e585c1f5-0ded-4fe4-ae8a-6461be97c307

---

## 9. Known follow-ups / open items

- The NDA was reviewed and amended (Aug 2026) per feedback from a regulatory
  consultant (Richard, MD Compliance) and a university legal advisor. The
  governing-law toggle was added to satisfy an English NHS trust that required
  English law/courts.
- If BioPhotonix later needs a witness line on the signature block (e.g. for
  jurisdictions where a single-director signature needs attestation), that has
  NOT been added — it was raised as an option but not requested.
- The signature image (`adail-signature.png`) is a 260×90 transparent PNG. If
  Adail's signature changes, replace this one file — no code change needed.
- **No copy of a submitted NDA is kept anywhere.** The email is the only record,
  so the BioPhotonix inbox is the system of record. If an audit trail is ever
  needed, the function is the place to add one (e.g. also writing the PDF to
  object storage) — that would change the privacy note in `index.html`, which
  currently promises nothing is stored.
- **The endpoint has no rate limiting beyond the honeypot.** For the expected
  volume that is fine, but if it is ever abused, add your host's rate limiting
  (Vercel Firewall / Netlify rate limits) rather than building it in the
  function — serverless instances do not share memory.
- **The signer's email address is not verified.** Someone could sign using an
  address that is not theirs; the copy would go to that address. Verifying it
  would mean a confirmation step before the NDA is sent, which was judged not
  worth the friction. Worth revisiting if it ever matters legally.
- The email is sent via Resend. Swapping providers means changing only
  `sendViaResend()` in `api/_lib/send-nda.js` — everything else is
  provider-agnostic.
