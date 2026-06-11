// MIXR guest app — 3-step configurator with live cup animation.
import { Assets } from 'pixi.js';
import { CupScene } from './cup/cupScene.js';
import { api } from './api.js';
import {
  optionsFor, iceAllowed, aggregateAllergens, totalPrice, formatPrice, drinkName
} from './engine/constraints.js';

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
  gameLoaded: false
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

const SCREENS = ['attract', 'step1', 'step2', 'step3', 'summary', 'waiting', 'done'];
const STEP_OF = { step1: 1, step2: 2, step3: 3 };

function selectedIds() {
  return [state.base, ...state.mixes, ...state.toppings].filter(Boolean);
}
function ingredient(id) { return state.menu.ingredients.find(i => i.id === id); }
function themeDef() { return state.menu.themes.find(t => t.id === state.theme); }

function haptic() { try { navigator.vibrate?.(10); } catch {} }

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
async function attractLoop() {
  state.attractRunning = true;
  // sample drink
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
    if (idx > 0) await cup.drop({ id: 'eis', color: '#dff0f7', texture: textures.eis, count: idx, float: true, radius: DROP_TUNING.eis.radius });
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
}

async function animateIngredient(ing) {
  if (ing.tags?.includes('haube')) return cup.addCream({ texture: textures[ing.id] });
  const tun = DROP_TUNING[ing.id] || {};
  switch (ing.animation) {
    case 'drop': {
      const float = ing.tags?.includes('frucht') || ing.tags?.includes('kraut');
      return cup.drop({
        id: ing.id, color: placeholderColor(ing), texture: textures[ing.id],
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
  cup.celebrate();
  cup.shineSweep();
  haptic();
  renderShareCard();
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
  const game = new CatchGame($('#game-canvas'), $('#game-hud'), {
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

async function boot() {
  state.menu = await api.menu();
  [cup] = await Promise.all([CupScene.create($('#stage')), preloadSprites()]);
  window.__mixr = { state, cup, show, api }; // deterministic test hook

  $('#btn-start').onclick = () => {
    haptic();
    state.attractRunning = false;
    cup.reset();
    show('step1');
    renderStep1();
  };
  $('#btn-next').onclick = () => {
    haptic();
    if (state.screen === 'step1') { show('step2'); renderStep2(); }
    else if (state.screen === 'step2') {
      if (state.mixes.length) cup.swirl();
      show('step3'); renderStep3();
    }
    else if (state.screen === 'step3') { show('summary'); renderSummary(); }
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

  // poll menu so sold-out toggles from /admin apply live mid-flow
  menuPollTimer = setInterval(async () => {
    try {
      state.menu = await api.menu();
      if (state.screen === 'step1') renderStep1();
      if (state.screen === 'step2') renderStep2();
      if (state.screen === 'step3') renderStep3();
    } catch {}
  }, 4000);

  show('attract');
  attractLoop();
}

boot();

// PWA service worker
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
