// MIXR guest app — 3-step configurator with live cup animation.
import { Assets } from 'pixi.js';
import { CupScene } from './cup/cupScene.js';
import { api } from './api.js';
import { audio } from './audio.js';
import {
  optionsFor, iceAllowed, aggregateAllergens, totalPrice, formatPrice, drinkName
} from './engine/constraints.js';
import { photorealFor } from './photoreal.js';
import { SignatureMode } from './signature-mode.js';

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

const state = {
  menu: null,
  screen: 'attract',
  theme: null,
  base: null,
  mixes: [],
  toppings: [],
  suesse: 2,
  eis: 2,
  order: null,
  attractRunning: false,
  gameLoaded: false,
  // Signature-Modus (parallel zum Classic-Konfigurator, Default laut /admin)
  mode: 'signature',
  sigMenu: null,
  sig: null,
  sigOrderMeta: null
};

let cup = null;
const textures = {}; // ingredientId -> Pixi texture
// cluster sprites contain several pieces — tune drop count/size per id
const DROP_TUNING = {
  tapioka: { count: 2, radius: 27 }, 'popping-boba': { count: 2, radius: 25 },
  'kokos-jelly': { count: 2, radius: 23 }, erdbeere: { count: 2, radius: 25 },
  'mango-wuerfel': { count: 2, radius: 23 }, banane: { count: 2, radius: 21 },
  blaubeeren: { count: 2, radius: 21 }, kiwi: { count: 1, radius: 25 },
  minze: { count: 1, radius: 23 }, eis: { radius: 21 }
};
let menuPollTimer = null;
let orderPollTimer = null;
let funfactTimer = null;

const SCREENS = ['attract', 'step1', 'step2', 'step3', 'summary', 'waiting', 'done', 'sig-gallery', 'sig-story', 'sig-custom'];
const STEP_OF = { step1: 1, step2: 2, step3: 3 };

// ---------- mode handling (Signature-Karte | Create your own) ----------
function setMode(mode, remember = true) {
  state.mode = mode;
  app.dataset.mode = mode;
  if (remember) { try { localStorage.setItem('mixr-mode', mode); } catch {} }
  applyModeCtas();
}

// Der gemerkte/Default-Modus bestimmt, welcher CTA primär wirkt — beide bleiben tappbar.
function applyModeCtas() {
  const sigBtn = $('#btn-signature'), startBtn = $('#btn-start');
  if (!sigBtn || !startBtn) return;
  sigBtn.hidden = !state.sigMenu;
  sigBtn.classList.toggle('ghost', state.mode === 'classic');
  startBtn.classList.toggle('ghost', state.mode !== 'classic');
}

function selectedIds() {
  return [state.base, ...state.mixes, ...state.toppings].filter(Boolean);
}
function ingredient(id) { return state.menu.ingredients.find(i => i.id === id); }
function themeDef() { return state.menu.themes.find(t => t.id === state.theme); }

function haptic() { try { navigator.vibrate?.(10); } catch {} audio.play('tap'); }

function setAccent(theme) {
  if (!theme) return;
  document.documentElement.style.setProperty('--accent', theme.accent);
  document.documentElement.style.setProperty('--accent2', theme.accent2);
}

// ---------- screen handling ----------
function show(screen) {
  state.screen = screen;
  app.dataset.screen = screen;
  document.querySelectorAll('.screen').forEach(el =>
    el.classList.toggle('active', el.dataset.screenId === screen));
  // stepper
  const step = STEP_OF[screen] || 0;
  document.querySelectorAll('#stepper li').forEach(li => {
    const n = Number(li.dataset.step);
    li.classList.toggle('active', n === step);
    li.classList.toggle('done', step > 0 ? n < step : ['summary', 'waiting', 'done'].includes(screen));
  });
  // nav buttons
  const back = $('#btn-back'), next = $('#btn-next');
  back.hidden = !STEP_OF[screen] && screen !== 'summary';
  next.hidden = !STEP_OF[screen];
  if (STEP_OF[screen]) {
    next.textContent = screen === 'step3' ? 'Zur Übersicht' : 'Weiter';
    updateNextEnabled();
  }
  $('#drink-label').hidden = !['step2', 'step3', 'summary', 'waiting', 'done'].includes(screen) || !state.base;
}

function updateNextEnabled() {
  const next = $('#btn-next');
  if (state.screen === 'step1') next.disabled = !state.base;
  else next.disabled = false;
}

// ---------- attract loop ----------
// Fotorealistischer Video-Loop (theme-gemappt, src/photoreal.js). Lädt lazy,
// nie blockierend: null-Mapping, Ladefehler oder canplay-Timeout (1,5 s)
// -> bestehende Sprite-Explosion als Fallback. Start-Tap bleibt jederzeit
// möglich (Boot-Race-Lesson: UI ist gebunden, Handler awaitet `ready`).
const ATTRACT_VIDEO_TIMEOUT = 1500;
let attractVideoGen = 0; // entwertet überholte Ladeversuche (geteiltes <video>)

function stopAttractVideo() {
  attractVideoGen++;
  const v = $('#attract-video');
  if (!v) return;
  v.classList.remove('playing');
  $('#stage-wrap').classList.remove('video-active');
  try { v.pause(); } catch {}
  v.removeAttribute('src');
  // removeAttribute('src') verwirft die laufende Media-Resource NICHT (HTML-Spec)
  // -> load() bricht den Fetch wirklich ab, sonst feuert canplay trotzdem und
  // ein verstecktes Video dekodiert die ganze Session weiter (P1-Fix 12.06.).
  try { v.load(); } catch {}
}

async function tryAttractVideo(themeId) {
  const conf = photorealFor(themeId);
  const v = $('#attract-video');
  if (!conf?.video || !v) { stopAttractVideo(); return false; }
  const gen = ++attractVideoGen;
  try {
    if (conf.poster) v.poster = conf.poster;
    v.src = conf.video;
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('canplay timeout')), ATTRACT_VIDEO_TIMEOUT);
      v.addEventListener('canplay', () => { clearTimeout(to); res(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(to); rej(new Error('video error')); }, { once: true });
      v.load();
    });
    // überholt (Stop oder neuerer Versuch) -> Wiedergabe gar nicht erst starten
    if (gen !== attractVideoGen) return true;
    await v.play();
    // überholt WÄHREND play(): nach reinem Stop gibt es keinen neueren Versuch,
    // der pausieren würde -> selbst pausieren, sonst läuft das versteckte Video
    // die ganze Session weiter. `.playing` gesetzt = neuerer Versuch besitzt das
    // Element und Wiedergabe ist gewollt -> dann nichts anfassen.
    if (gen !== attractVideoGen) {
      if (!v.classList.contains('playing')) { try { v.pause(); } catch {} }
      return true;
    }
    // User kann während des Ladens schon getippt haben -> nicht reaktivieren
    if (!state.attractRunning || state.screen !== 'attract') { stopAttractVideo(); return true; }
    v.classList.add('playing');
    $('#stage-wrap').classList.add('video-active');
    return true;
  } catch (e) {
    if (gen !== attractVideoGen) return true; // überholt -> kein Fallback-Start
    console.warn('attract video -> sprite fallback', e?.message || e);
    stopAttractVideo();
    return false;
  }
}

async function attractLoop(themeId = state.theme || 'bubble-tea') {
  state.attractRunning = true;
  if (await tryAttractVideo(themeId)) return; // Video loopt selbst (loop-Attribut)
  if (!state.attractRunning) return;
  // sample drink (Sprite-Explosion — Fallback, unverändert)
  cup.setTheme('bubble-tea', '#9B7EDE');
  await cup.pour({ color: '#9B7EDE', add: 0.55, duration: 1.2 });
  if (!state.attractRunning) return;
  await cup.drop({ id: 'tapioka', color: '#3a2a24', texture: textures.tapioka, ...(DROP_TUNING.tapioka) });
  if (!state.attractRunning) return;
  await cup.drop({ id: 'erdbeere', color: '#E84A6F', texture: textures.erdbeere, float: true, ...(DROP_TUNING.erdbeere) });
  while (state.attractRunning) {
    await cup.explode({ hold: 2.0 });
    if (!state.attractRunning) break;
    await cup.unexplode();
    cup.shineSweep();
    await wait(1600);
  }
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- step 1: theme + base ----------
function renderStep1() {
  const tabs = $('#theme-tabs');
  tabs.innerHTML = '';
  for (const t of state.menu.themes.filter(t => t.aktiv !== false)) {
    const b = document.createElement('button');
    b.role = 'tab';
    b.dataset.theme = t.id;
    b.textContent = `${t.emoji} ${t.name}`;
    b.classList.toggle('active', state.theme === t.id);
    b.onclick = () => { haptic(); pickTheme(t.id); };
    tabs.appendChild(b);
  }
  renderBaseCards();
}

function pickTheme(id) {
  if (state.theme === id) return;
  state.theme = id;
  state.base = null; state.mixes = []; state.toppings = [];
  cup.reset();
  const t = themeDef();
  setAccent(t);
  cup.setTheme(id, t.accent);
  renderStep1();
  updateNextEnabled();
}

function renderBaseCards() {
  const wrap = $('#base-cards');
  wrap.innerHTML = '';
  if (!state.theme) { wrap.innerHTML = '<p class="hint">Wähle oben eine Kategorie</p>'; return; }
  for (const opt of optionsFor(state.menu, state.theme, 'basis', [])) {
    wrap.appendChild(optCard(opt, state.base === opt.ing.id, () => pickBase(opt.ing.id)));
  }
}

function optCard(opt, selected, onPick) {
  const { ing, ok, soldout, reason } = opt;
  const card = document.createElement('button');
  card.className = 'opt-card' + (selected ? ' selected' : '');
  card.dataset.id = ing.id;
  if (!ok) card.disabled = true;
  card.innerHTML = `
    ${soldout ? '<span class="soldout-badge">AUS</span>' : ''}
    <div class="swatch" style="${ing.sprite ? `background-image:url(/sprites/${ing.sprite})` : `background:${ing.tint || '#ddd'}`}"></div>
    <div class="name">${ing.name}</div>
    <div class="price">${formatPrice(ing.preis)}</div>
    ${!ok && !soldout ? `<div class="why">${reason}</div>` : ''}`;
  card.onclick = () => { if (ok) { haptic(); onPick(); } };
  return card;
}

async function pickBase(id) {
  if (state.base === id) return;
  const prev = state.base;
  state.base = id;
  renderBaseCards();
  updateNextEnabled();
  const ing = ingredient(id);
  if (prev) { cup.reset(); }
  $('#drink-label').textContent = drinkNameNow();
  await cup.pour({ color: ing.tint, add: 0.5, duration: 1.4 });
  // re-validate downstream picks against new base (e.g. hot espresso kills tapioka)
  pruneInvalid();
}

function drinkNameNow() {
  return drinkName(state.menu, state.theme, state.base, state._nameSeed ||= Math.floor(Math.random() * 9999));
}

function pruneInvalid() {
  const keep = [];
  for (const id of state.toppings) {
    const st = optionsFor(state.menu, state.theme, 'topping', [state.base, ...state.mixes]).find(o => o.ing.id === id);
    if (st?.ok) keep.push(id); else cup.removeItem(id);
  }
  state.toppings = keep;
  const keepMix = [];
  for (const id of state.mixes) {
    const st = optionsFor(state.menu, state.theme, 'mix', [state.base]).find(o => o.ing.id === id);
    if (st?.ok) keepMix.push(id); else { cup.removeBand(id); }
  }
  state.mixes = keepMix;
  if (!iceAllowed(state.menu, selectedIds()) && state.eis !== 0) {
    state.eis = 0;
    cup.removeItem('eis');
  }
}

// ---------- step 2: mix + levels ----------
function renderStep2() {
  const wrap = $('#mix-cards');
  wrap.innerHTML = '';
  for (const opt of optionsFor(state.menu, state.theme, 'mix', [state.base, ...state.mixes])) {
    const sel = state.mixes.includes(opt.ing.id);
    const chip = chipEl(opt, sel, () => toggleMix(opt.ing.id));
    wrap.appendChild(chip);
  }
  renderLevels();
}

function chipEl(opt, selected, onToggle) {
  const { ing, ok, soldout, reason } = opt;
  const chip = document.createElement('button');
  chip.className = 'chip' + (selected ? ' selected' : '');
  chip.dataset.id = ing.id;
  if (!ok && !selected) chip.disabled = true;
  chip.title = reason || '';
  chip.innerHTML = `
    <span class="dot" style="${ing.sprite ? `background-image:url(/sprites/${ing.sprite})` : `background:${ing.tint || '#ccc'}`}"></span>
    ${ing.name} <span class="plus">${soldout ? 'aus' : '+' + formatPrice(ing.preis)}</span>`;
  chip.onclick = () => { if (ok || selected) { haptic(); onToggle(); } };
  return chip;
}

async function toggleMix(id) {
  const ing = ingredient(id);
  if (state.mixes.includes(id)) {
    state.mixes = state.mixes.filter(m => m !== id);
    if (ing.animation === 'layer') cup.removeBand(id);
    renderStep2();
    return;
  }
  if (state.mixes.length >= 2) return;
  state.mixes.push(id);
  renderStep2();
  if (ing.animation === 'layer') await cup.layerBand({ id, color: ing.tint });
  else await cup.pour({ color: ing.tint, add: 0.16, duration: 1.0, blend: 0.45 });
  pruneInvalid();
  renderStep2();
}

function renderLevels() {
  const mkRow = (el, key, def) => {
    const lv = state.menu.levels[key];
    el.innerHTML = `<div class="lbl">${lv.label}</div>`;
    const opts = document.createElement('div');
    opts.className = 'opts';
    const allowed = key !== 'eis' || iceAllowed(state.menu, selectedIds());
    lv.optionen.forEach((o, idx) => {
      const b = document.createElement('button');
      b.textContent = o;
      b.classList.toggle('active', state[key] === idx);
      if (!allowed && idx > 0) b.disabled = true;
      b.onclick = () => { haptic(); setLevel(key, idx); };
      opts.appendChild(b);
    });
    if (!allowed) {
      const note = document.createElement('div');
      note.className = 'hint';
      note.textContent = 'Kein Eis bei heißen Drinks';
      el.append(opts, note);
    } else el.appendChild(opts);
  };
  mkRow($('#level-suesse'), 'suesse');
  mkRow($('#level-eis'), 'eis');
}

async function setLevel(key, idx) {
  const prev = state[key];
  state[key] = idx;
  renderLevels();
  if (key === 'eis' && idx !== prev) {
    cup.removeItem('eis');
    if (idx > 0) await cup.drop({ id: 'eis', color: '#dff0f7', texture: textures.eis, count: idx, float: true, radius: DROP_TUNING.eis.radius, label: 'Eis' });
  }
}

// ---------- step 3: toppings ----------
function renderStep3() {
  const wrap = $('#topping-chips');
  wrap.innerHTML = '';
  for (const opt of optionsFor(state.menu, state.theme, 'topping', [state.base, ...state.mixes, ...state.toppings])) {
    const sel = state.toppings.includes(opt.ing.id);
    wrap.appendChild(chipEl(opt, sel, () => toggleTopping(opt.ing.id)));
  }
}

async function toggleTopping(id) {
  const ing = ingredient(id);
  if (state.toppings.includes(id)) {
    state.toppings = state.toppings.filter(t => t !== id);
    if (ing.tags?.includes('haube')) cup.removeCream();
    else if (ing.animation === 'layer') cup.removeBand(id);
    else cup.removeItem(id);
    renderStep3();
    return;
  }
  state.toppings.push(id);
  renderStep3();
  await animateIngredient(ing);
  setTimeout(maybeUpsell, 1200); // let the drop animation finish first
}

// ---------- visual upselling: max 1 suggestion, drops into the cup on trial ----------
function maybeUpsell() {
  if (state.upsellDone || state.screen !== 'step3') return;
  const opts = optionsFor(state.menu, state.theme, 'topping', selectedIds())
    .filter(o => o.ok && !state.toppings.includes(o.ing.id) && o.ing.animation === 'drop' && textures[o.ing.id]);
  if (!opts.length) return;
  state.upsellDone = true;
  const pick = opts.find(o => o.ing.tags?.includes('frucht')) || opts[0];
  const ing = pick.ing;
  // trial drop: one translucent sample falls in
  const tun = DROP_TUNING[ing.id] || {};
  cup.drop({ id: '__upsell', texture: textures[ing.id], count: 1, radius: tun.radius ?? 22, float: ing.tags?.includes('frucht') });
  setTimeout(() => {
    const arr = cup.items.get('__upsell') || [];
    for (const sp of arr) sp.alpha = 0.55;
  }, 700);
  const slot = $('#upsell-slot');
  slot.innerHTML = `
    <div class="upsell" data-testid="upsell">
      <span>✨ Dazu passt: <b>${ing.name}</b> (+${formatPrice(ing.preis)})</span>
      <button class="yes" data-testid="upsell-yes">Ja!</button>
      <button class="no">Nein</button>
    </div>`;
  slot.querySelector('.yes').onclick = () => {
    haptic();
    cup.removeItem('__upsell');
    slot.innerHTML = '';
    toggleTopping(ing.id);
  };
  slot.querySelector('.no').onclick = () => {
    haptic();
    cup.removeItem('__upsell');
    slot.innerHTML = '';
  };
}

async function animateIngredient(ing) {
  if (ing.tags?.includes('haube')) return cup.addCream({ texture: textures[ing.id] });
  const tun = DROP_TUNING[ing.id] || {};
  switch (ing.animation) {
    case 'drop': {
      const float = ing.tags?.includes('frucht') || ing.tags?.includes('kraut');
      return cup.drop({
        id: ing.id, color: placeholderColor(ing), texture: textures[ing.id], label: ing.name,
        count: tun.count ?? (ing.tags?.includes('perle') ? 7 : 4), radius: tun.radius ?? 9, float
      });
    }
    case 'sprinkle': return cup.sprinkle({ id: ing.id, color: ing.tint || '#5C3A21' });
    case 'layer':
      // drizzle with a sprite lands on top instead of a band
      if (ing.kategorie === 'topping' && textures[ing.id]) {
        return cup.drop({ id: ing.id, texture: textures[ing.id], count: 1, radius: 30, float: true });
      }
      return cup.layerBand({ id: ing.id, color: ing.tint || '#C77B33' });
    case 'pour': return cup.pour({ color: ing.tint, add: 0.1, duration: 0.8 });
    default: return cup.drop({ id: ing.id, color: placeholderColor(ing), texture: textures[ing.id] });
  }
}

const PLACEHOLDER_COLORS = {
  tapioka: '#3a2a24', 'popping-boba': '#FFB347', 'kokos-jelly': '#fdfaf4',
  erdbeere: '#E84A6F', 'mango-wuerfel': '#FFB347', banane: '#F5E27A',
  blaubeeren: '#5C6BC0', kiwi: '#8BC34A', minze: '#4CAF50', eis: '#dff0f7'
};
function placeholderColor(ing) { return PLACEHOLDER_COLORS[ing.id] || ing.tint || '#999'; }

// ---------- summary ----------
function renderSummary() {
  $('#summary-name').textContent = drinkNameNow();
  $('#drink-label').textContent = drinkNameNow();
  const items = $('#summary-items');
  items.innerHTML = '';
  const ids = selectedIds();
  for (const id of ids) {
    const ing = ingredient(id);
    const li = document.createElement('li');
    li.innerHTML = `<span>${ing.name}</span><span>${formatPrice(ing.preis)}</span>`;
    items.appendChild(li);
  }
  const lv = state.menu.levels;
  const liLv = document.createElement('li');
  liLv.innerHTML = `<span>Süße ${lv.suesse.optionen[state.suesse]} · Eis: ${lv.eis.optionen[state.eis]}</span><span></span>`;
  items.appendChild(liLv);
  $('#summary-price').textContent = formatPrice(totalPrice(state.menu, ids));
  renderAmpel(ids);
}

function renderAmpel(ids) {
  const el = $('#allergen-ampel');
  const allergens = aggregateAllergens(state.menu, ids);
  if (!allergens.length) {
    el.innerHTML = `<div class="ampel-row"><span class="ampel-light gruen"></span><span class="ampel-ok">Keine der 14 LMIV-Allergene enthalten</span></div>`;
  } else {
    el.innerHTML = `<div class="ampel-row"><span class="ampel-light gelb"></span>${allergens.map(a => `<span class="allergen-tag">${state.menu.allergene_legende[a] || a}</span>`).join('')}</div>`;
  }
}

// ---------- order + waiting ----------
async function placeOrder() {
  state.sigOrderMeta = null; // Classic-Order -> Share-Card nutzt Theme-Hero/Snapshot
  const ids = selectedIds();
  const order = await api.createOrder({
    drinkName: drinkNameNow(),
    theme: state.theme,
    items: ids.map(id => ({ id, name: ingredient(id).name, kategorie: ingredient(id).kategorie })),
    levels: { suesse: state.suesse, eis: state.eis },
    allergene: aggregateAllergens(state.menu, ids),
    preis: totalPrice(state.menu, ids)
  });
  state.order = order;
  // the moment: your own drink explodes
  await cup.explode({ hold: 2.4 });
  await cup.unexplode();
  show('waiting');
  startWaiting();
}

const STORY = [
  { status: 'eingegangen', ico: '📥', txt: 'Bestellung ist an der Theke angekommen' },
  { status: 'in_arbeit', ico: '🧋', txt: 'Dein Drink wird gerade gemixt' },
  { status: 'fast_fertig', ico: '✨', txt: 'Fast fertig — Deckel drauf!' },
  { status: 'fertig', ico: '🎉', txt: 'Fertig! Hol ihn dir ab' }
];

function startWaiting() {
  renderStory('eingegangen');
  startFunFacts();
  refreshHighscore();
  orderPollTimer = setInterval(async () => {
    try {
      const o = await api.order(state.order.id);
      state.order = o;
      renderStory(o.status);
      if (o.status === 'fertig') {
        clearInterval(orderPollTimer);
        clearInterval(funfactTimer);
        onReady();
      }
    } catch {}
  }, 2000);
}

function renderStory(status) {
  const idx = Math.max(0, STORY.findIndex(s => s.status === status));
  const el = $('#order-status-story');
  el.innerHTML = STORY.map((s, i) => `
    <div class="story-step ${i <= idx ? 'reached' : ''} ${i === idx ? 'current' : ''}" data-status="${s.status}">
      <span class="story-ico">${s.ico}</span><span class="story-txt">${s.txt}</span>
    </div>`).join('');
}

function startFunFacts() {
  const facts = selectedIds().map(id => ingredient(id)).filter(i => i?.funfact)
    .map(i => `<b>${i.name}:</b> ${i.funfact}`);
  if (!facts.length) return;
  let i = 0;
  const card = $('#funfact-card');
  const showFact = () => { card.hidden = false; card.innerHTML = `💡 ${facts[i % facts.length]}`; i++; };
  showFact();
  funfactTimer = setInterval(showFact, 7000);
}

async function refreshHighscore() {
  try {
    const hs = await api.highscore();
    const box = $('#highscore-box');
    if (!hs.entries.length) { box.innerHTML = '<p class="hint">Noch kein Tages-Highscore — hol ihn dir! 🏆</p>'; return; }
    box.innerHTML = `<div class="lbl" style="font-weight:800;font-size:13px;color:var(--muted)">🏆 TAGES-HIGHSCORE</div><table>` +
      hs.entries.slice(0, 5).map((e, i) => `<tr><td>${i + 1}. ${e.initialen}</td><td style="text-align:right">${e.score}</td></tr>`).join('') + '</table>';
  } catch {}
}

async function onReady() {
  $('#pickup-nummer').textContent = state.order.nummer;
  show('done');
  await renderShareCard(); // snapshot the clean hero shot BEFORE confetti
  if (state.mode === 'classic') { // Signature: Bühne ist ausgeblendet, ruhig bleiben
    cup.celebrate();
    cup.shineSweep();
  }
  audio.play('chime');
  try { navigator.vibrate?.([30, 40, 60]); } catch {}
}

async function renderShareCard() {
  try {
    const { buildShareCard } = await import('./share.js');
    await buildShareCard(state, cup, themeDef());
  } catch (e) { console.warn('share card', e); }
}

// ---------- game ----------
async function startGame() {
  const { CatchGame } = await import('./game/catch.js');
  $('#game-wrap').hidden = false;
  $('#btn-game').hidden = true;
  const game = window.__mixrGame = new CatchGame($('#game-canvas'), $('#game-hud'), {
    theme: themeDef(),
    toppings: state.toppings.map(id => ingredient(id)),
    onEnd: async (score) => {
      const initialen = (state.order?.nummer || 'MIX').slice(-3);
      try { await api.submitScore(initialen, score); } catch {}
      refreshHighscore();
      $('#game-wrap').hidden = true;
      $('#btn-game').hidden = false;
    }
  });
  game.start();
}

// ---------- bootstrap ----------
async function preloadSprites() {
  const jobs = [];
  const seen = new Set();
  for (const ing of state.menu.ingredients) {
    if (ing.sprite && !seen.has(ing.sprite)) {
      seen.add(ing.sprite);
      jobs.push(Assets.load(`/sprites/${ing.sprite}`).then(t => { textures[ing.id] = t; }).catch(() => {}));
    }
  }
  jobs.push(Assets.load('/sprites/eiswuerfel.png').then(t => { textures.eis = t; }).catch(() => {}));
  await Promise.all(jobs);
}

// UI is bound immediately; slow networks may tap "start" before menu/sprites
// finished loading — the handler awaits `ready` instead of being a no-op.
let readyResolve;
const ready = new Promise(r => { readyResolve = r; });

function bindUI() {
  const soundBtn = $('#sound-toggle');
  soundBtn.textContent = audio.enabled ? '🔊' : '🔇';
  soundBtn.onclick = () => { soundBtn.textContent = audio.toggle() ? '🔊' : '🔇'; audio.play('tap'); };

  $('#btn-start').onclick = async () => {
    audio.ensure(); // first user gesture unlocks audio (mobile autoplay policy)
    const btn = $('#btn-start');
    btn.disabled = true;
    await ready;
    btn.disabled = false;
    haptic();
    setMode('classic');
    state.sigOrderMeta = null;
    state.attractRunning = false;
    stopAttractVideo();
    cup.reset();
    show('step1');
    renderStep1();
  };
  $('#btn-signature').onclick = async () => {
    audio.ensure();
    const btn = $('#btn-signature');
    btn.disabled = true;
    await ready;
    btn.disabled = false;
    if (!state.sig) return; // signature-menu.json nicht ladbar -> Classic bleibt
    haptic();
    setMode('signature');
    state.attractRunning = false;
    stopAttractVideo();
    state.sig.openGallery();
  };
  $('#btn-next').onclick = () => {
    haptic();
    if (state.screen === 'step1') {
      show('step2'); renderStep2();
      // default ice level is visible in the cup too (summary must match cup)
      if (state.eis > 0 && !cup.items.has('eis') && iceAllowed(state.menu, selectedIds())) {
        cup.drop({ id: 'eis', color: '#dff0f7', texture: textures.eis, count: state.eis, float: true, radius: DROP_TUNING.eis.radius });
      }
    }
    else if (state.screen === 'step2') {
      if (state.mixes.length) cup.swirl();
      show('step3'); renderStep3();
    }
    else if (state.screen === 'step3') {
      cup.removeItem('__upsell');
      $('#upsell-slot').innerHTML = '';
      show('summary'); renderSummary();
    }
  };
  $('#btn-back').onclick = () => {
    haptic();
    if (state.screen === 'step2') { show('step1'); renderStep1(); }
    else if (state.screen === 'step3') { show('step2'); renderStep2(); }
    else if (state.screen === 'summary') { show('step3'); renderStep3(); }
  };
  $('#btn-order').onclick = () => { haptic(); $('#btn-order').disabled = true; placeOrder().finally(() => $('#btn-order').disabled = false); };
  $('#btn-game').onclick = startGame;
  $('#btn-restart').onclick = () => location.reload();
  $('#btn-share').onclick = async () => {
    const img = document.querySelector('#share-card-slot img, #share-card-slot canvas');
    if (!img) return;
    const url = img.tagName === 'IMG' ? img.src : img.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'mixr-drink.png'; a.click();
  };

}

async function boot() {
  bindUI();
  state.menu = await api.menu();
  [cup] = await Promise.all([
    CupScene.create($('#stage')),
    preloadSprites(),
    // Signature-Karte ist optional: schlägt der Fetch fehl, bleibt Classic nutzbar
    api.signatureMenu().then(m => { state.sigMenu = m; }).catch(e => console.warn('signature menu', e?.message || e))
  ]);
  // gemerkte Wahl (localStorage) schlägt den /admin-Default
  let saved = null;
  try { saved = localStorage.getItem('mixr-mode'); } catch {}
  const fallback = state.sigMenu ? (state.sigMenu.defaultMode || 'signature') : 'classic';
  setMode(saved === 'signature' || saved === 'classic' ? saved : fallback, false);
  if (state.sigMenu) {
    state.sig = new SignatureMode({ state, show, startWaiting, haptic });
    state.onSignatureExit = () => { attractLoop(); }; // zurück zum Attract -> Loop wieder an
  }
  window.__mixr = { state, cup, show, api, startAttract: attractLoop, stopAttractVideo, setMode }; // deterministic test hook
  cup.onFx = (name) => audio.play(name);
  $('#sound-toggle').hidden = false;

  // poll menu so sold-out toggles from /admin apply live mid-flow
  menuPollTimer = setInterval(async () => {
    try {
      state.menu = await api.menu();
      if (state.screen === 'step1') renderStep1();
      if (state.screen === 'step2') renderStep2();
      if (state.screen === 'step3') renderStep3();
    } catch {}
    if (state.screen === 'sig-gallery') state.sig?.poll();
  }, 4000);

  show('attract');
  attractLoop();
  readyResolve();
}

boot().catch((e) => {
  console.error('boot failed', e);
  const panel = document.querySelector('#panel');
  panel.innerHTML = `
    <div class="screen active" style="text-align:center;padding-top:30px">
      <h2 class="step-title">Kurz durchatmen ☕</h2>
      <p class="hero-sub">MIXR konnte nicht laden — bitte Verbindung prüfen und neu versuchen.</p>
      <button class="cta" onclick="location.reload()">Neu laden</button>
    </div>`;
});

// PWA service worker
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
