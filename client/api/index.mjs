import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const omittedRequestHeaders = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding']);
const omittedResponseHeaders = new Set(['connection', 'content-length', 'content-encoding', 'transfer-encoding', 'set-cookie']);

export default async function proxy(req, res) {
  const configuredBackend = process.env.BACKEND_URL;
  if (!configuredBackend) return res.status(503).json({error: 'BACKEND_URL is not configured.'});

  let backend;
  try {
    backend = new URL(configuredBackend);
    if (backend.protocol !== 'https:' && !(backend.protocol === 'http:' && backend.hostname === 'localhost')) throw new Error('Invalid backend URL');
  } catch {
    return res.status(503).json({error: 'BACKEND_URL must be an HTTPS origin.'});
  }

  const rewritten = new URL(req.url, 'http://proxy.local');
  const route = rewritten.searchParams.get('__proxy_path');
  if (!route || !/^[A-Za-z0-9/_-]+$/.test(route) || route.includes('//')) {
    return res.status(400).json({error: 'Invalid API path.'});
  }
  rewritten.searchParams.delete('__proxy_path');
  const target = new URL(`/api/${route}${rewritten.search}`, backend);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (omittedRequestHeaders.has(lower) || lower.startsWith('x-forwarded-') || value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
    body = Buffer.isBuffer(req.body) ? req.body : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(target, {method: req.method, headers, body, redirect: 'manual'});
    res.statusCode = upstream.status;
    for (const [key, value] of upstream.headers) {
      if (!omittedResponseHeaders.has(key.toLowerCase())) res.setHeader(key, value);
    }
    res.setHeader('cache-control', 'no-store');
    const cookies = upstream.headers.getSetCookie?.() ?? [];
    if (cookies.length) res.setHeader('set-cookie', cookies);
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    console.error('Backend proxy error:', error);
    if (!res.headersSent) res.status(502).json({error: 'Backend unavailable.'});
    else res.end();
  }
}
