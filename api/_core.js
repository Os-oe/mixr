// MIXR API core — shared by the local dev server (server/dev.js) and the
// Vercel serverless catch-all (api/index.js). In-memory store (demo scope).
import fs from 'node:fs';
import path from 'node:path';

const store = {
  orders: new Map(),
  orderSeq: 0,
  overrides: {},            // ingredientId -> { verfuegbar?, preis? }
  highscore: { date: null, entries: [] },
  menuCache: null,
  menuMtime: 0
};

function menuPath() {
  const candidates = [
    process.env.MENU_PATH,
    path.join(process.cwd(), 'public', 'menu.json'),
    path.join(process.cwd(), 'menu.json'),
    new URL('../public/menu.json', import.meta.url).pathname
  ].filter(Boolean);
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}

export function loadMenu() {
  const p = menuPath();
  if (p) {
    try {
      const mtime = fs.statSync(p).mtimeMs;
      if (!store.menuCache || mtime !== store.menuMtime) {
        store.menuCache = JSON.parse(fs.readFileSync(p, 'utf8'));
        store.menuMtime = mtime;
      }
    } catch (e) { /* keep cache */ }
  }
  if (!store.menuCache) throw new Error('menu.json not found');
  const menu = JSON.parse(JSON.stringify(store.menuCache));
  for (const ing of menu.ingredients) {
    const ov = store.overrides[ing.id];
    if (ov) Object.assign(ing, ov);
  }
  return menu;
}

function today() { return new Date().toISOString().slice(0, 10); }

function ensureHighscoreDay() {
  if (store.highscore.date !== today()) store.highscore = { date: today(), entries: [] };
}

export const STATUS_FLOW = ['eingegangen', 'in_arbeit', 'fast_fertig', 'fertig', 'abgeholt'];

// route(method, pathname, body) -> { status, json }
export function route(method, pathname, body) {
  const seg = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  if (seg[0] === 'menu' && method === 'GET') return ok(loadMenu());

  if (seg[0] === 'admin') {
    if (seg[1] === 'ingredient' && seg[2] && method === 'PATCH') {
      const patch = {};
      if (typeof body?.verfuegbar === 'boolean') patch.verfuegbar = body.verfuegbar;
      if (typeof body?.preis === 'number') patch.preis = body.preis;
      store.overrides[seg[2]] = { ...(store.overrides[seg[2]] || {}), ...patch };
      return ok({ id: seg[2], override: store.overrides[seg[2]] });
    }
    if (seg[1] === 'reset' && method === 'POST') { store.overrides = {}; return ok({ reset: true }); }
    if (seg[1] === 'overrides' && method === 'GET') return ok(store.overrides);
  }

  if (seg[0] === 'orders') {
    if (!seg[1] && method === 'POST') {
      store.orderSeq += 1;
      const id = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const order = {
        id,
        nummer: 'M-' + String(store.orderSeq).padStart(3, '0'),
        drinkName: String(body?.drinkName || 'Mein Drink').slice(0, 60),
        theme: body?.theme || null,
        items: Array.isArray(body?.items) ? body.items.slice(0, 20) : [],
        levels: body?.levels || {},
        allergene: Array.isArray(body?.allergene) ? body.allergene : [],
        preis: typeof body?.preis === 'number' ? body.preis : 0,
        status: 'eingegangen',
        ts: Date.now(),
        statusTs: Date.now()
      };
      store.orders.set(id, order);
      return ok(order, 201);
    }
    if (!seg[1] && method === 'GET') {
      const list = [...store.orders.values()].sort((a, b) => a.ts - b.ts);
      return ok(list.filter(o => o.status !== 'abgeholt'));
    }
    if (seg[1] && method === 'GET') {
      const o = store.orders.get(seg[1]);
      return o ? ok(o) : err(404, 'order not found');
    }
    if (seg[1] && method === 'PATCH') {
      const o = store.orders.get(seg[1]);
      if (!o) return err(404, 'order not found');
      if (body?.status && STATUS_FLOW.includes(body.status)) {
        o.status = body.status;
        o.statusTs = Date.now();
      }
      return ok(o);
    }
  }

  if (seg[0] === 'highscore') {
    ensureHighscoreDay();
    if (method === 'GET') return ok(store.highscore);
    if (method === 'POST') {
      const initialen = String(body?.initialen || '???').toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '').slice(0, 3) || '???';
      const score = Math.max(0, Math.min(999999, Number(body?.score) || 0));
      store.highscore.entries.push({ initialen, score, ts: Date.now() });
      store.highscore.entries.sort((a, b) => b.score - a.score);
      store.highscore.entries = store.highscore.entries.slice(0, 10);
      return ok(store.highscore);
    }
  }

  if (seg[0] === 'health' && method === 'GET') return ok({ ok: true, orders: store.orders.size });

  return err(404, 'not found');
}

function ok(json, status = 200) { return { status, json }; }
function err(status, message) { return { status, json: { error: message } }; }
