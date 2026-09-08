import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { handleSubmission, toErrorResponse } from '../api/_lib/send-nda.js';

const PDF_BASE64 = Buffer.from('%PDF-1.4\nfake\n%%EOF').toString('base64');

const ENV = {
  RESEND_API_KEY: 're_test_key',
  NDA_TO_EMAIL: 'info@biophotonix.co.uk',
  NDA_FROM_EMAIL: 'BioPhotonix NDA <nda@biophotonix.co.uk>',
};

function body(overrides = {}) {
  return {
    recipientType: 'company',
    jurisdiction: 'england',
    recipientName: 'Acme Diagnostics Ltd',
    signerName: 'Jane Doe',
    signerTitle: 'Director',
    signerEmail: 'jane@acme.example',
    signedDate: '08/09/2026',
    address: '1 Test Street, London, EC1A 1AA',
    registrationNumber: '12345678',
    incorporation: 'England',
    filename: 'NDA_Acme.pdf',
    pdfBase64: PDF_BASE64,
    ...overrides,
  };
}

let sent;
const realFetch = globalThis.fetch;

function stubFetch(responder) {
  sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push({ url, payload: JSON.parse(options.body), headers: options.headers });
    return responder(sent.length);
  };
}

const okResponse = () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });

beforeEach(() => stubFetch(okResponse));
afterEach(() => { globalThis.fetch = realFetch; });

test('emails BioPhotonix and copies the signer', async () => {
  const result = await handleSubmission(body(), ENV, undefined);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, signerCopySent: true });
  assert.equal(sent.length, 2);

  const [internal, copy] = sent;
  assert.equal(internal.url, 'https://api.resend.com/emails');
  assert.equal(internal.headers.Authorization, 'Bearer re_test_key');
  assert.deepEqual(internal.payload.to, ['info@biophotonix.co.uk']);
  // Replying to the notification should reach the signer.
  assert.equal(internal.payload.reply_to, 'jane@acme.example');
  assert.match(internal.payload.subject, /Acme Diagnostics Ltd/);
  assert.equal(internal.payload.attachments[0].filename, 'NDA_Acme.pdf');
  assert.equal(internal.payload.attachments[0].content, PDF_BASE64);
  // Both a plain-text and an HTML part, so it renders anywhere.
  assert.match(internal.payload.text, /Governing law: Law of England & Wales/);
  assert.match(internal.payload.html, /Acme Diagnostics Ltd/);

  assert.deepEqual(copy.payload.to, ['jane@acme.example']);
  assert.equal(copy.payload.reply_to, 'info@biophotonix.co.uk');
  assert.equal(copy.payload.attachments[0].content, PDF_BASE64);
});

test('NDA_COPY_SIGNER=false sends only the internal notification', async () => {
  const result = await handleSubmission(body(), { ...ENV, NDA_COPY_SIGNER: 'false' }, undefined);
  assert.deepEqual(result.body, { ok: true, signerCopySent: false });
  assert.equal(sent.length, 1);
});

test('a failed signer copy still reports success', async () => {
  // The NDA has already reached BioPhotonix; failing the request here would
  // only make the signer submit again and create duplicates.
  stubFetch(call => (call === 1
    ? okResponse()
    : new Response('rate limited', { status: 429 })));

  const result = await handleSubmission(body(), ENV, undefined);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, signerCopySent: false });
});

test('a failed internal send surfaces as a 502 with no provider detail', async () => {
  stubFetch(() => new Response('{"message":"API key re_live_abc is invalid"}', { status: 401 }));

  let thrown;
  try {
    await handleSubmission(body(), ENV, undefined);
  } catch (error) {
    thrown = error;
  }
  const response = toErrorResponse(thrown);
  assert.equal(response.status, 502);
  // The provider's message can leak key state, so it must not be echoed back.
  assert.ok(!response.body.error.includes('re_live_abc'));
});

test('honeypot submissions are accepted but never emailed', async () => {
  const result = await handleSubmission(body({ website: 'spam' }), ENV, undefined);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(sent.length, 0);
});

test('multiple recipients in NDA_TO_EMAIL all receive the NDA', async () => {
  await handleSubmission(body(), { ...ENV, NDA_TO_EMAIL: 'a@x.example, b@x.example' }, undefined);
  assert.deepEqual(sent[0].payload.to, ['a@x.example', 'b@x.example']);
});

test('a disallowed origin is rejected before any email is sent', async () => {
  let thrown;
  try {
    await handleSubmission(
      body(),
      { ...ENV, NDA_ALLOWED_ORIGINS: 'https://nda.biophotonix.co.uk' },
      'https://evil.example'
    );
  } catch (error) {
    thrown = error;
  }
  assert.equal(toErrorResponse(thrown).status, 403);
  assert.equal(sent.length, 0);
});

test('an unexpected error becomes a generic 500', () => {
  const response = toErrorResponse(new TypeError('x is not a function'));
  assert.equal(response.status, 500);
  assert.ok(!response.body.error.includes('not a function'));
});

test('field values are escaped before reaching the HTML email body', async () => {
  await handleSubmission(
    body({ recipientName: 'Acme <img src=x onerror=alert(1)> Ltd' }),
    ENV,
    undefined
  );
  assert.ok(!sent[0].payload.html.includes('<img'));
  assert.match(sent[0].payload.html, /&lt;img/);
});

test('an individual gets no redundant "Title: Individual" row', async () => {
  await handleSubmission(
    body({ recipientType: 'individual', signerTitle: 'Individual', incorporation: '9 Vine Lane' }),
    ENV,
    undefined
  );
  assert.ok(!sent[0].payload.text.includes('Title / capacity'));
  assert.match(sent[0].payload.text, /Residential address: 9 Vine Lane/);
});
