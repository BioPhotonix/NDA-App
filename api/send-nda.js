// Vercel serverless function: POST /api/send-nda
//
// Receives the signed NDA from the browser and emails it to BioPhotonix.
// All the real work lives in _lib/send-nda.js so the Netlify adapter can
// share it. Files under api/_lib/ are treated as private by Vercel and are
// not exposed as routes.

import {
  handleSubmission,
  RequestError,
  resolveCorsOrigin,
  readConfig,
  toErrorResponse,
} from './_lib/send-nda.js';

function applyCors(req, res) {
  // Only echo an origin we have been explicitly configured to allow. When
  // NDA_ALLOWED_ORIGINS is unset, no CORS headers are sent and the endpoint
  // is same-origin only.
  let allowedOrigins = [];
  try {
    ({ allowedOrigins } = readConfig(process.env));
  } catch {
    // Misconfigured server — handled properly below; no CORS headers here.
    return;
  }
  const origin = resolveCorsOrigin(req.headers.origin, allowedOrigins);
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    // Vercel parses application/json for us, but a raw string can still
    // arrive if the client sends an unexpected content type.
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        throw new RequestError(400, 'Expected a JSON body.');
      }
    }
    const { status, body: payload } = await handleSubmission(
      body,
      process.env,
      req.headers.origin
    );
    res.status(status).json(payload);
  } catch (error) {
    const { status, body: payload } = toErrorResponse(error);
    res.status(status).json(payload);
  }
}
