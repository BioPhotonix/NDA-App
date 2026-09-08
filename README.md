# BioPhotonix NDA

An online mutual Non-Disclosure Agreement. Counterparties fill it in, sign it in
the browser, and press **Sign & Send to BioPhotonix** — the completed PDF is
emailed straight to BioPhotonix, with a copy to the signer. No downloading and
re-attaching by hand.

---

## Setup — one time, about 15 minutes

### 1. Get a Resend account and verify your domain

1. Sign up at [resend.com](https://resend.com) (the free tier covers 3,000
   emails a month — far more than this needs).
2. Go to **Domains → Add Domain** and add `biophotonix.co.uk`.
3. Resend shows you a handful of DNS records to add — a DKIM `TXT`, two
   `CNAME`s, and an optional DMARC `TXT`. **Use the values Resend shows you**,
   not any written down here: the DKIM key is unique to the account, and Resend
   has changed the shape of this record set before (it previously used a TXT
   SPF record plus an MX record for bounces).

   This step matters: the NDA email is sent *from* your domain, and without
   these records it will land in spam or be rejected outright.

   Two things that reliably go wrong — see **DNS gotchas** below before you
   start.
4. Go to **API Keys → Create API Key** and copy the key (it starts with `re_`).
   Choose **Sending access**, not Full access. You only get to see the key once;
   if it is lost or exposed, delete it and issue another.

### DNS gotchas

**1. Find out which control panel actually serves your DNS.** The registrar you
bought the domain from is not necessarily the one answering for it. If the
nameservers point elsewhere — a site builder like Wix or Squarespace, or a CDN
like Cloudflare — then records added at the registrar are inert, and the
registrar's DNS page will still happily show them to you as though they were
live. IONOS, for one, displays a small grey note to this effect and is otherwise
indistinguishable from a working setup.

Check the domain's `NS` records first (dnschecker.org, or the registrar's
nameserver settings). Resend's own domain page also names the provider it
detects, and is worth believing.

*As deployed for BioPhotonix:* the domain is registered with IONOS, the website
runs on Wix, and **Wix serves the DNS** — so the Resend records live in Wix's
DNS editor, not in IONOS.

**2. Providers disagree about how to write the record name.** For a record whose
real name is `resend._domainkey.biophotonix.co.uk`:

| Provider style | What to enter |
|---|---|
| Appends the domain for you (IONOS, most registrars) | `resend._domainkey` |
| Wants the full name (Wix) | `resend._domainkey.biophotonix.co.uk` |

Get this backwards and you create `resend._domainkey.biophotonix.co.uk.biophotonix.co.uk`,
which verification will never find and which gives no useful error. Look at how
an existing record in the same table is written and match it.

**3. Use the copy button for the DKIM value.** It runs to several hundred
characters, and a hand-selected paste that clips the end fails silently.

### 2. Deploy

The app is a static folder plus one serverless function, so it needs a host that
runs both. Either of these works, and both have a free tier.

**Vercel**

1. Push this repository to GitHub.
2. At [vercel.com/new](https://vercel.com/new), import the repository.
3. Leave every build setting at its default and deploy — `vercel.json` already
   describes the function.

**Netlify**

1. Push this repository to GitHub.
2. At [app.netlify.com](https://app.netlify.com), **Add new site → Import an
   existing project**.
3. Leave the build settings alone — `netlify.toml` sets the publish directory
   and the functions directory.

### 3. Set the environment variables

In Vercel: **Project Settings → Environment Variables**.
In Netlify: **Site configuration → Environment variables**.

| Variable | Required | Example |
|---|---|---|
| `RESEND_API_KEY` | yes | `re_xxxxxxxxxxxx` |
| `NDA_TO_EMAIL` | yes | `info@biophotonix.co.uk` |
| `NDA_FROM_EMAIL` | yes | `BioPhotonix NDA <nda@biophotonix.co.uk>` |
| `NDA_ALLOWED_ORIGINS` | no | only if the page and API are on different domains |
| `NDA_COPY_SIGNER` | no | `false` to stop emailing the signer their copy |
| `NDA_COMPANY_NAME` | no | defaults to `BioPhotonix Ltd` |

`NDA_FROM_EMAIL` must use the domain you verified in step 1.
`NDA_TO_EMAIL` accepts a comma-separated list if more than one person should
receive completed NDAs.

**Redeploy after setting these** — environment variables are only read at
deploy time.

### 4. Send yourself a test NDA

Open the deployed site, fill it in with your own email address, and submit. You
should get two emails: the notification with the PDF attached, and the signer's
copy. If nothing arrives, see Troubleshooting below.

---

## Running it locally

```bash
cp .env.example .env      # then paste your real Resend key into .env
node --env-file=.env server.js
# open http://localhost:8000
```

`server.js` serves the static files and runs the function in one process, so the
local behaviour matches the deployed site. It is a development convenience only
and is not used in production.

To check the front end without sending real email, just leave `.env` unset —
submitting will return a clear "not configured" error, and the download and
print buttons still work.

Run the tests with:

```bash
npm test
```

No `npm install` is needed for either. jsPDF is vendored as
`jspdf.umd.min.js`, and the function uses only Node built-ins.

---

## How submission works

1. `app.js` validates the form and builds the PDF with jsPDF, exactly as the
   download button always has.
2. The PDF is base64-encoded and POSTed as JSON to `/api/send-nda`, along with
   the form fields.
3. `api/send-nda.js` (Vercel) or `netlify/functions/send-nda.mjs` (Netlify)
   hands the request to the shared logic in `api/_lib/send-nda.js`, which
   validates everything again server-side and calls the Resend API twice: once
   to BioPhotonix, once to the signer.
4. The signer sees a confirmation, or an error telling them to fall back to
   downloading and emailing manually.

The Resend API key is only ever read from a server-side environment variable.
It is never sent to the browser.

### Server-side checks

The endpoint validates every submission independently of the browser, since
anyone can POST to it directly:

- Required fields present, recipient type and jurisdiction from a fixed list.
- Email address checked for shape.
- CR/LF and control characters stripped from anything that reaches an email
  header, so a crafted field value cannot inject extra headers.
- Attachment must be valid base64, under 4 MB, and start with the `%PDF-`
  header — so the endpoint cannot be used to email arbitrary files.
- Filenames reduced to safe characters.
- A hidden honeypot field catches form-filling bots; those submissions get a
  success response but are never emailed.
- Field values are HTML-escaped before going into the email body.
- Provider errors are logged server-side but never echoed to the browser.

---

## Troubleshooting

**"Email delivery is not configured on the server."**
One of the three required environment variables is missing, or you set them but
did not redeploy. The message names which ones.

**"The email service rejected the message."**
Usually the domain in `NDA_FROM_EMAIL` is not verified in Resend, or the API key
is wrong. The browser deliberately does not show why, since Resend's reply can
reveal API key state — but the reason is recorded in two places:

- **Resend → Logs** is the quickest. Open the failed `POST /emails` entry: it
  shows the status, Resend's own explanation, and the exact request the function
  sent (addresses, subject, reply-to), which is also a good way to confirm the
  app is composing the message correctly.
- Your host's function logs carry the same thing, logged as
  `Resend rejected the message <status> <body>`.

The status tells you which problem you have:

| Status | Meaning |
|---|---|
| `401` | Bad or deleted API key — reissue it and update the host, then redeploy |
| `403` | Domain not verified — a DNS problem, not a code or key problem |

**Emails go to spam.** The DNS records from step 1 are missing or incomplete.
Resend's Domains page shows which ones are not verified.

**The signer did not get their copy, but you did.** That is by design: if the
signer's copy fails, the submission still counts as successful, because the NDA
already reached BioPhotonix. The on-screen message tells them to download a copy
instead. Check the function logs for the reason.

**Nothing happens when you press submit.** Open the browser console. If you see
a CORS error, the page and the API are on different domains — set
`NDA_ALLOWED_ORIGINS` to the page's origin and put the full API URL in
`config.js`.

---

## Files

```
index.html                     Page markup, inline CSS, NDA clause text, form
app.js                         Live preview, toggles, validation, PDF, submit
config.js                      Public front-end config (API endpoint, contact)
jspdf.umd.min.js               Vendored jsPDF UMD build
adail-signature.png            Director's signature, embedded into the PDF
biophotonix-logo.jpg           Company logo
server.js                      Local dev server (not used in production)
api/send-nda.js                Vercel function
api/_lib/send-nda.js           Shared validation, email composition, delivery
netlify/functions/send-nda.mjs Netlify function
test/                          Tests for the server-side logic
vercel.json / netlify.toml     Deploy config for each host
.env.example                   Template for the environment variables
```

See `CLAUDE.md` for the NDA's legal content, the recipient-type and
jurisdiction behaviour, and the technical constraints to respect when changing
the PDF code.
