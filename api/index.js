// Vercel serverless catch-all for /api/* (single function => single warm
// instance keeps the in-memory demo store consistent).
import { route } from './_core.js';

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const url = new URL(req.url, 'http://x');
  const { status, json } = route(req.method, url.pathname, body || {});
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(json);
}
