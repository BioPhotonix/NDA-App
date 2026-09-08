// Local development server — NOT used in production.
//
// Serves the static app and runs the /api/send-nda function in one process, so
// you can test the full submit-and-email flow on your own machine exactly as it
// behaves on Vercel or Netlify.
//
//   node --env-file=.env server.js      # then open http://localhost:8000
//
// On the real hosts, the static files are served by their CDN and the function
// by their runtime; this file just glues the two together locally.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

import { handleSubmission, toErrorResponse } from './api/_lib/send-nda.js';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT) || 8000;

// Anything the browser is allowed to fetch. Everything else — the function,
// its shared library, .env, package files — stays off the static server, the
// same way vercel.json and netlify.toml keep them off the real hosts.
const PUBLIC_FILES = new Set([
  '/index.html',
  '/app.js',
  '/config.js',
  '/jspdf.umd.min.js',
  '/adail-signature.png',
  '/biophotonix-logo.jpg',
]);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      // Mirror the 4.5 MB request cap the hosted runtimes enforce.
      if (size > 4.5 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

async function handleApi(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  try {
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { ok: false, error: 'Expected a JSON body.' });
      return;
    }
    const result = await handleSubmission(body, process.env, req.headers.origin);
    sendJson(res, result.status, result.body);
  } catch (error) {
    const result = toErrorResponse(error);
    sendJson(res, result.status, result.body);
  }
}

async function handleStatic(req, res, pathname) {
  const file = pathname === '/' ? '/index.html' : normalize(pathname);
  if (!PUBLIC_FILES.has(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const content = await readFile(join(ROOT, file));
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export function createDevServer() {
  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname === '/api/send-nda') {
      await handleApi(req, res);
    } else {
      await handleStatic(req, res, pathname);
    }
  });
}

// Only listen when run directly, so tests can import createDevServer.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  createDevServer().listen(PORT, () => {
    console.log(`NDA app running at http://localhost:${PORT}`);
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY is not set — submitting will return a 500.');
      console.warn('Run with: node --env-file=.env server.js');
    }
  });
}
