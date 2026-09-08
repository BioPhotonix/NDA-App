// Netlify Functions adapter for POST /api/send-nda.
//
// netlify.toml redirects /api/send-nda here. The shared logic in
// api/_lib/send-nda.js is identical to the one the Vercel adapter uses, so
// the two hosts behave the same.

import {
  handleSubmission,
  RequestError,
  resolveCorsOrigin,
  readConfig,
  toErrorResponse,
} from '../../api/_lib/send-nda.js';

function corsHeaders(request) {
  let allowedOrigins = [];
  try {
    ({ allowedOrigins } = readConfig(process.env));
  } catch {
    return {};
  }
  const origin = resolveCorsOrigin(request.headers.get('origin'), allowedOrigins);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(status, payload, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default async function handler(request) {
  const headers = corsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' }, {
      ...headers,
      Allow: 'POST, OPTIONS',
    });
  }

  try {
    const body = await request.json().catch(() => {
      throw new RequestError(400, 'Expected a JSON body.');
    });
    const { status, body: payload } = await handleSubmission(
      body,
      process.env,
      request.headers.get('origin')
    );
    return json(status, payload, headers);
  } catch (error) {
    const { status, body: payload } = toErrorResponse(error);
    return json(status, payload, headers);
  }
}
