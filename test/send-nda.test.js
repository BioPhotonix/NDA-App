import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RequestError,
  assertOriginAllowed,
  escapeHtml,
  parseSubmission,
  readConfig,
  resolveCorsOrigin,
} from '../api/_lib/send-nda.js';

const PDF_BASE64 = Buffer.from('%PDF-1.4\nfake pdf body\n%%EOF').toString('base64');

function validBody(overrides = {}) {
  return {
    recipientType: 'company',
    jurisdiction: 'scotland',
    recipientName: 'Acme Diagnostics Ltd',
    signerName: 'Jane Doe',
    signerTitle: 'Director',
    signerEmail: 'jane@acme.example',
    signedDate: '08/09/2026',
    address: '1 Test Street, Glasgow, G1 1AA',
    registrationNumber: 'SC123456',
    incorporation: 'Scotland',
    filename: 'NDA_Acme.pdf',
    pdfBase64: PDF_BASE64,
    ...overrides,
  };
}

// node:assert's throws() returns undefined, so capture the error ourselves
// in order to assert on its HTTP status.
function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected the call to throw, but it returned normally');
}

function rejects(body, status, messageMatch) {
  const error = capture(() => parseSubmission(body));
  assert.ok(error instanceof RequestError, `expected a RequestError, got ${error}`);
  assert.equal(error.status, status);
  if (messageMatch) assert.match(error.message, messageMatch);
}

test('accepts a well-formed company submission', () => {
  const result = parseSubmission(validBody());
  assert.equal(result.spam, false);
  assert.equal(result.recipientName, 'Acme Diagnostics Ltd');
  assert.equal(result.signerEmail, 'jane@acme.example');
  assert.equal(result.pdf.base64, PDF_BASE64);
});

test('keeps spaces and hyphens in names and addresses', () => {
  // Regression guard: an over-broad sanitising regex once stripped these.
  const result = parseSubmission(validBody({
    recipientName: 'Smith-Jones Bio Ltd',
    address: '1 Test Street, Glasgow, G1 1AA',
  }));
  assert.equal(result.recipientName, 'Smith-Jones Bio Ltd');
  assert.equal(result.address, '1 Test Street, Glasgow, G1 1AA');
});

test('strips CR/LF so field values cannot inject email headers', () => {
  const result = parseSubmission(validBody({
    signerName: 'Jane Doe\r\nBcc: attacker@evil.example',
  }));
  assert.ok(!result.signerName.includes('\r'));
  assert.ok(!result.signerName.includes('\n'));
  assert.equal(result.signerName, 'Jane Doe Bcc: attacker@evil.example');
});

test('an individual does not need a title, a company does', () => {
  const individual = parseSubmission(validBody({
    recipientType: 'individual',
    signerTitle: '',
  }));
  assert.equal(individual.recipientType, 'individual');
  rejects(validBody({ signerTitle: '' }), 400, /title/i);
});

test('rejects unknown recipient types and jurisdictions', () => {
  rejects(validBody({ recipientType: 'charity' }), 400, /recipient type/i);
  rejects(validBody({ jurisdiction: 'france' }), 400, /governing law/i);
});

test('rejects missing and malformed email addresses', () => {
  rejects(validBody({ signerEmail: '' }), 400, /email/i);
  rejects(validBody({ signerEmail: 'not-an-email' }), 400, /valid/i);
  rejects(validBody({ signerEmail: 'jane@acme' }), 400, /valid/i);
});

test('rejects anything that is not actually a PDF', () => {
  rejects(validBody({ pdfBase64: '' }), 400, /missing/i);
  rejects(validBody({ pdfBase64: 'not base64!!' }), 400, /base64/i);
  rejects(
    validBody({ pdfBase64: Buffer.from('<html>hi</html>').toString('base64') }),
    400,
    /not a PDF/i
  );
});

test('rejects an oversized attachment', () => {
  rejects(validBody({ pdfBase64: 'A'.repeat(4 * 1024 * 1024 + 4) }), 413, /too large/i);
});

test('honeypot submissions are reported as spam, not as errors', () => {
  const result = parseSubmission(validBody({ website: 'https://spam.example' }));
  assert.equal(result.spam, true);
});

test('filenames are reduced to safe characters', () => {
  const result = parseSubmission(validBody({ filename: '../../etc/passwd NDA.pdf' }));
  assert.equal(result.filename, '.._.._etc_passwd_NDA.pdf');
  assert.ok(!result.filename.includes('/'));
});

test('rejects a non-object body', () => {
  rejects(null, 400, /JSON body/i);
  rejects([], 400, /JSON body/i);
});

test('readConfig names every missing variable', () => {
  const error = capture(() => readConfig({}));
  assert.ok(error instanceof RequestError);
  assert.equal(error.status, 500);
  assert.match(error.message, /RESEND_API_KEY/);
  assert.match(error.message, /NDA_TO_EMAIL/);
  assert.match(error.message, /NDA_FROM_EMAIL/);
});

test('readConfig splits recipients and defaults the signer copy on', () => {
  const config = readConfig({
    RESEND_API_KEY: 're_test',
    NDA_TO_EMAIL: 'a@example.com, b@example.com',
    NDA_FROM_EMAIL: 'NDA <nda@example.com>',
  });
  assert.deepEqual(config.to, ['a@example.com', 'b@example.com']);
  assert.equal(config.copySigner, true);
  assert.deepEqual(config.allowedOrigins, []);
});

test('NDA_COPY_SIGNER=false turns off the signer copy', () => {
  const config = readConfig({
    RESEND_API_KEY: 're_test',
    NDA_TO_EMAIL: 'a@example.com',
    NDA_FROM_EMAIL: 'nda@example.com',
    NDA_COPY_SIGNER: 'false',
  });
  assert.equal(config.copySigner, false);
});

test('CORS allows only configured origins', () => {
  const allowed = ['https://nda.biophotonix.co.uk'];
  assert.equal(resolveCorsOrigin('https://nda.biophotonix.co.uk/', allowed), 'https://nda.biophotonix.co.uk');
  assert.equal(resolveCorsOrigin('https://evil.example', allowed), null);
  assert.equal(resolveCorsOrigin(undefined, allowed), null);

  // Same-origin requests send no Origin header, so they must pass.
  assert.doesNotThrow(() => assertOriginAllowed(undefined, allowed));
  // With no allowlist configured, cross-origin checks are not enforced here;
  // the browser's own same-origin policy is what protects the endpoint.
  assert.doesNotThrow(() => assertOriginAllowed('https://evil.example', []));
  assert.throws(() => assertOriginAllowed('https://evil.example', allowed), RequestError);
});

test('escapeHtml neutralises markup in email bodies', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});
