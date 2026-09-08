# BioPhotonix NDA — Project Handoff

A self-contained static web app that lets BioPhotonix Ltd's counterparties
(universities, NHS trusts, companies, individuals) fill in and sign a mutual
Non-Disclosure Agreement online, then download or print it as a PDF.

Live site (Perplexity Computer hosted): https://biophotonix-nda.pplx.app

---

## 1. What it does

- Renders the full NDA text as a live on-screen document that updates as the user types.
- Lets the recipient pick a **recipient type** (Company / Education Institution / Individual / Other) — form labels and the PARTIES clause wording adapt automatically.
- Lets the recipient pick a **governing law** (Scots law / Law of England & Wales) — Clause 17 and related references update automatically.
- Bakes in BioPhotonix director Adail Islam's handwritten signature image on both the on-screen preview and the generated PDF.
- Generates a dated, filled PDF via jsPDF (download or print).
- Validates required fields before generating the PDF.

No backend, no server, no database. Pure client-side HTML/CSS/JS. Just open
`index.html` in a browser, or serve the folder from any static host.

---

## 2. File structure

```
nda-app/
├── index.html              # Page markup, inline CSS, NDA clause text, form, toggle UI
├── app.js                  # All logic: live preview, toggles, validation, PDF generation
├── jspdf.umd.min.js        # Vendored jsPDF UMD build (loaded via <script>, NOT npm)
├── adail-signature.png     # Adail Islam's handwritten signature (embedded into PDF + preview)
├── biophotonix-logo.jpg    # BioPhotonix company logo (teal aperture mark)
├── package.json            # Lists jspdf dep — but the vendored UMD build is already included,
│                            # so `npm install` is NOT required to run the app
├── package-lock.json
└── CLAUDE.md               # This file
```

---

## 3. How to run locally

The simplest way — no build step:

```bash
# Option A: just open the file
open index.html            # macOS
xdg-open index.html        # Linux

# Option B: serve locally (needed if file:// causes CORS issues with the signature image)
python3 -m http.server 8000
# then visit http://localhost:8000
```

There is no bundler, no framework, no TypeScript, no npm install step required.
All libraries are vendored. It is a single static folder.

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
   blocked. The app already avoids all of these.

5. **Signature image**: `adail-signature.png` is fetched at load time and
   converted to a data URL so it can be embedded into the jsPDF output.
   If the file is missing or fails to load, the signature silently does not
   appear in the PDF.

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
- Actions: only two buttons — `#download-btn` and `#print-btn`. (The "Email"
   / mailto button was removed by request — do not re-add it.)

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

---

## 6. The NDA content (current as of 28 Aug 2026)

The agreement is a **mutual** NDA between (1) BioPhotonix Ltd and (2) the Recipient.

**BioPhotonix Ltd legal entity** (baked into PARTIES clause (1)):
BioPhotonix Ltd, a company incorporated in Scotland (company number SC881225),
registered office Thebeyond, Skypark, 8 Elliot Street, Glasgow, G3 8EP.
Director/CEO Adail Islam.

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

## 8. Deployment (Perplexity Computer — for reference only)

If you are moving this off Perplexity Computer to a normal static host
(Vercel, Netlify, GitHub Pages, S3, etc.), you can ignore this section —
just deploy the folder as a static site. The app has no Perplexity-specific
runtime dependencies.

Previous Perplexity deployment details (for history):
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
