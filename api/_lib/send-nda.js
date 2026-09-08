// Shared, host-agnostic logic for receiving a signed NDA and emailing it on.
//
// Hosts (Vercel / Netlify / anything else) provide a thin adapter that parses
// the request and hands the parsed JSON body here. This module has no
// framework or npm dependencies — it only needs global `fetch` (Node 18+).

// --- Limits -----------------------------------------------------------------

// Vercel's serverless request body cap is 4.5 MB. A signed NDA is typically
// 60-250 KB, so 4 MB of base64 is generous while still rejecting junk early.
const MAX_PDF_BASE64_BYTES = 4 * 1024 * 1024;
const MAX_FIELD_LENGTH = 500;
const MAX_ADDRESS_LENGTH = 1000;

// RFC 5322 in full is not worth it here; this rejects the mistakes people
// actually make (missing @, spaces, no TLD) without false negatives.
const EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@,;:<>()[\]\\]+\.[a-z]{2,}$/i;

const RECIPIENT_TYPES = ['company', 'education', 'individual', 'other'];
const JURISDICTIONS = ['scotland', 'england'];

// --- Small helpers ----------------------------------------------------------

export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Strip CR/LF and other control characters. Anything that reaches an email
// header (subject, display name, reply-to) must go through this, or a crafted
// field value could inject extra headers.
function sanitiseHeaderValue(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

function text(value, { max = MAX_FIELD_LENGTH } = {}) {
  return sanitiseHeaderValue(value).slice(0, max);
}

// Escape before interpolating any user-supplied value into the HTML email body.
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function requireField(body, key, label, { max = MAX_FIELD_LENGTH } = {}) {
  const value = text(body[key], { max });
  if (!value) throw new RequestError(400, `Missing required field: ${label}`);
  return value;
}

// --- Config -----------------------------------------------------------------

export function readConfig(env) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.NDA_TO_EMAIL;
  const from = env.NDA_FROM_EMAIL;

  const missing = [];
  if (!apiKey) missing.push('RESEND_API_KEY');
  if (!to) missing.push('NDA_TO_EMAIL');
  if (!from) missing.push('NDA_FROM_EMAIL');
  if (missing.length) {
    throw new RequestError(
      500,
      `Email delivery is not configured on the server (missing ${missing.join(', ')}).`
    );
  }

  return {
    apiKey,
    to: to.split(',').map(a => a.trim()).filter(Boolean),
    from: from.trim(),
    // Comma-separated list of origins allowed to call this endpoint from a
    // browser. Unset means same-origin only, which is the safe default when
    // the API and the page are deployed together.
    allowedOrigins: (env.NDA_ALLOWED_ORIGINS || '')
      .split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean),
    // Send the signer their own copy. Set to "false" to disable.
    copySigner: env.NDA_COPY_SIGNER !== 'false',
    companyName: env.NDA_COMPANY_NAME || 'BioPhotonix Ltd',
  };
}

export function resolveCorsOrigin(requestOrigin, allowedOrigins) {
  if (!requestOrigin) return null;
  const origin = requestOrigin.replace(/\/$/, '');
  return allowedOrigins.includes(origin) ? origin : null;
}

// A cross-origin POST is only allowed from an explicitly configured origin.
// Same-origin requests send no Origin header for us to check, so they pass.
export function assertOriginAllowed(requestOrigin, allowedOrigins) {
  if (!requestOrigin) return;
  if (allowedOrigins.length === 0) return;
  if (!resolveCorsOrigin(requestOrigin, allowedOrigins)) {
    throw new RequestError(403, 'Requests from this origin are not allowed.');
  }
}

// --- Payload validation -----------------------------------------------------

function validatePdf(base64) {
  const raw = String(base64 == null ? '' : base64).trim();
  if (!raw) throw new RequestError(400, 'The signed NDA document is missing.');
  if (raw.length > MAX_PDF_BASE64_BYTES) {
    throw new RequestError(413, 'The signed NDA document is too large to email.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new RequestError(400, 'The signed NDA document is not valid base64.');
  }

  const buffer = Buffer.from(raw, 'base64');
  // Every PDF starts with the %PDF- header. This stops the endpoint being
  // used as a generic "attach anything and email it" relay.
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new RequestError(400, 'The uploaded file is not a PDF.');
  }
  return { base64: raw, byteLength: buffer.length };
}

export function parseSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'Expected a JSON body.');
  }

  // Honeypot: a hidden field no real signer ever fills in. Bots that blindly
  // complete every input get a 200 back, so they do not learn to work around it.
  if (text(body.website)) {
    return { spam: true };
  }

  const recipientType = text(body.recipientType).toLowerCase();
  if (!RECIPIENT_TYPES.includes(recipientType)) {
    throw new RequestError(400, 'Unknown recipient type.');
  }

  const jurisdiction = text(body.jurisdiction).toLowerCase();
  if (!JURISDICTIONS.includes(jurisdiction)) {
    throw new RequestError(400, 'Unknown governing law.');
  }

  const signerEmail = requireField(body, 'signerEmail', 'your email address');
  if (!EMAIL_RE.test(signerEmail)) {
    throw new RequestError(400, 'That email address does not look valid.');
  }

  const submission = {
    spam: false,
    recipientType,
    jurisdiction,
    recipientName: requireField(body, 'recipientName', 'recipient name'),
    signerName: requireField(body, 'signerName', 'your name'),
    signerTitle: text(body.signerTitle),
    signerEmail,
    signedDate: requireField(body, 'signedDate', 'date of signing'),
    address: text(body.address, { max: MAX_ADDRESS_LENGTH }),
    registrationNumber: text(body.registrationNumber),
    incorporation: text(body.incorporation),
    filename: text(body.filename).replace(/[^A-Za-z0-9._-]/g, '_') || 'NDA.pdf',
    pdf: validatePdf(body.pdfBase64),
  };

  if (recipientType !== 'individual' && !submission.signerTitle) {
    throw new RequestError(400, 'Missing required field: your title / capacity.');
  }

  return submission;
}

// --- Email composition ------------------------------------------------------

const RECIPIENT_TYPE_LABELS = {
  company: 'Company',
  education: 'Education institution',
  individual: 'Individual',
  other: 'Other organisation',
};

const JURISDICTION_LABELS = {
  scotland: 'Scots law / Scottish courts',
  england: 'Law of England & Wales / English courts',
};

function detailRows(submission) {
  const rows = [
    ['Recipient', submission.recipientName],
    ['Recipient type', RECIPIENT_TYPE_LABELS[submission.recipientType]],
  ];
  if (submission.incorporation) {
    const label = submission.recipientType === 'individual'
      ? 'Residential address'
      : 'Place of incorporation / establishment';
    rows.push([label, submission.incorporation]);
  }
  if (submission.registrationNumber) {
    rows.push(['Registration number', submission.registrationNumber]);
  }
  if (submission.address) rows.push(['Registered address', submission.address]);
  rows.push(['Signed by', submission.signerName]);
  // An individual signs in no other capacity, so the title row would just
  // read "Individual" — noise in the notification email.
  if (submission.recipientType !== 'individual' && submission.signerTitle) {
    rows.push(['Title / capacity', submission.signerTitle]);
  }
  rows.push(['Email', submission.signerEmail]);
  rows.push(['Date of signing', submission.signedDate]);
  rows.push(['Governing law', JURISDICTION_LABELS[submission.jurisdiction]]);
  return rows;
}

function renderHtml(intro, rows) {
  const cells = rows.map(([label, value]) => `
      <tr>
        <td style="padding:6px 16px 6px 0;color:#5b6770;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:6px 0;color:#11181c;vertical-align:top;">${escapeHtml(value)}</td>
      </tr>`).join('');

  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#11181c;">
    <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
    <table style="border-collapse:collapse;margin:0 0 20px;">${cells}
    </table>
    <p style="margin:0;color:#5b6770;font-size:13px;">The signed PDF is attached to this email.</p>
  </div>`;
}

function renderText(intro, rows) {
  const body = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  return `${intro}\n\n${body}\n\nThe signed PDF is attached to this email.`;
}

// --- Delivery ---------------------------------------------------------------

async function sendViaResend(apiKey, payload) {
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new RequestError(502, 'Could not reach the email service.');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // Log the provider's reason server-side; never return it to the browser,
    // as it can echo the API key state or internal addresses.
    console.error('Resend rejected the message', response.status, detail);
    throw new RequestError(502, 'The email service rejected the message.');
  }

  return response.json().catch(() => ({}));
}

/**
 * Validate a submission and email the signed NDA.
 *
 * @param {object} body   Parsed JSON request body.
 * @param {object} env    Environment variables (process.env or equivalent).
 * @param {string} origin The request's Origin header, if any.
 * @returns {Promise<{status:number, body:object}>}
 */
export async function handleSubmission(body, env, origin) {
  const config = readConfig(env);
  assertOriginAllowed(origin, config.allowedOrigins);

  const submission = parseSubmission(body);
  // Silently accept honeypot hits so bots see no difference from success.
  if (submission.spam) {
    return { status: 200, body: { ok: true } };
  }

  const rows = detailRows(submission);
  const attachment = { filename: submission.filename, content: submission.pdf.base64 };
  const subject = `Signed NDA — ${submission.recipientName} (${submission.signerName})`;

  const internalIntro =
    `${submission.recipientName} has completed and signed the ${config.companyName} mutual NDA.`;

  await sendViaResend(config.apiKey, {
    from: config.from,
    to: config.to,
    // Replying to the notification reaches the signer directly.
    reply_to: submission.signerEmail,
    subject,
    html: renderHtml(internalIntro, rows),
    text: renderText(internalIntro, rows),
    attachments: [attachment],
  });

  let signerCopySent = false;
  if (config.copySigner) {
    const signerIntro =
      `Thank you for signing the mutual Non-Disclosure Agreement with ${config.companyName}. ` +
      'A copy of the agreement you signed is attached for your records.';
    try {
      await sendViaResend(config.apiKey, {
        from: config.from,
        to: [submission.signerEmail],
        reply_to: config.to[0],
        subject: `Your copy — ${config.companyName} mutual NDA`,
        html: renderHtml(signerIntro, rows),
        text: renderText(signerIntro, rows),
        attachments: [attachment],
      });
      signerCopySent = true;
    } catch (error) {
      // The submission has already reached BioPhotonix, which is what the
      // signer actually needs. A failed courtesy copy must not fail the
      // request, or they will submit again and create duplicates.
      console.error('Could not send the signer their copy', error);
    }
  }

  return { status: 200, body: { ok: true, signerCopySent } };
}

/** Map any thrown error to a safe HTTP status and message for the browser. */
export function toErrorResponse(error) {
  if (error instanceof RequestError) {
    return { status: error.status, body: { ok: false, error: error.message } };
  }
  console.error('Unexpected error handling NDA submission', error);
  return {
    status: 500,
    body: { ok: false, error: 'Something went wrong sending the NDA. Please try again.' },
  };
}
