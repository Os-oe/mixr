// Share card: drink name + hero shot of the configured cup, savable PNG.
// Theme-gemapptes fotorealistisches Hero-JPG als Hintergrund (src/photoreal.js);
// kein Mapping / Ladefehler -> bestehender illustrierter Snapshot-Look.
import { photorealFor } from './photoreal.js';

export async function buildShareCard(state, cup, theme) {
  const slot = document.querySelector('#share-card-slot');
  if (!slot) return;

  const W = 800, H = 1000;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  const hero = await loadHeroImage(theme);
  if (hero) drawHeroCard(ctx, W, H, hero, state, theme);
  else await drawIllustratedCard(ctx, W, H, cup, theme);

  slot.innerHTML = '';
  const out = new Image();
  out.dataset.bg = hero ? 'photoreal' : 'illustrated';
  out.src = cv.toDataURL('image/png');
  slot.appendChild(out);
}

function loadHeroImage(theme) {
  const url = photorealFor(theme?.id)?.hero;
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null); // Fallback auf illustrierten Look
    img.src = url;
  });
}

// ---------- fotorealistische Card ----------
function drawHeroCard(ctx, W, H, hero, state, theme) {
  // Hero cover-fit, zentriert
  const ratio = hero.width / hero.height;
  let hh = H, ww = hh * ratio;
  if (ww < W) { ww = W; hh = ww / ratio; }
  ctx.drawImage(hero, (W - ww) / 2, (H - hh) / 2, ww, hh);

  // Lesbarkeits-Verläufe oben + unten (Cream & Candy: Ink-Ton statt Schwarz)
  const top = ctx.createLinearGradient(0, 0, 0, 170);
  top.addColorStop(0, 'rgba(43,35,49,0.45)');
  top.addColorStop(1, 'rgba(43,35,49,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 170);
  const bot = ctx.createLinearGradient(0, H * 0.58, 0, H);
  bot.addColorStop(0, 'rgba(43,35,49,0)');
  bot.addColorStop(1, 'rgba(43,35,49,0.72)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, H * 0.58, W, H * 0.42);

  ctx.textAlign = 'center';
  // Logo
  ctx.fillStyle = '#FAF6F0';
  ctx.font = '800 64px "Baloo 2", sans-serif';
  ctx.fillText('MIXR', W / 2, 96);
  // Drink-Name
  ctx.font = '700 48px "Baloo 2", sans-serif';
  ctx.fillStyle = '#FAF6F0';
  wrapText(ctx, document.querySelector('#summary-name')?.textContent || 'Mein Drink', W / 2, 770, W - 120, 56);
  // Zutaten
  ctx.font = '600 26px Nunito, sans-serif';
  ctx.fillStyle = 'rgba(250,246,240,0.92)';
  wrapText(ctx, ingredientLine(state), W / 2, 836, W - 140, 34);
  // Preis in Akzentfarbe
  const price = document.querySelector('#summary-price')?.textContent;
  if (price) {
    ctx.font = '800 34px "Baloo 2", sans-serif';
    ctx.fillStyle = theme?.accent || '#9B7EDE';
    ctx.fillText(price, W / 2, 916);
  }
  // powered by — dezent
  ctx.font = '600 20px Nunito, sans-serif';
  ctx.fillStyle = 'rgba(250,246,240,0.7)';
  ctx.fillText('Live gemixt bei der MIXR Demo Bar · powered by OsAI', W / 2, 962);
}

function ingredientLine(state) {
  const ids = [state.base, ...(state.mixes || []), ...(state.toppings || [])].filter(Boolean);
  const names = ids.map(id => state.menu?.ingredients?.find(i => i.id === id)?.name).filter(Boolean);
  return names.join(' · ');
}

// ---------- illustrierter Fallback (unverändert) ----------
async function drawIllustratedCard(ctx, W, H, cup, theme) {
  const snap = await cup.snapshot();
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = snap; });

  // bg gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#FAF6F0');
  g.addColorStop(1, hexWithAlpha(theme?.accent || '#9B7EDE', 0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // confetti dots
  const cols = [theme?.accent || '#9B7EDE', theme?.accent2 || '#7B5FC7', '#FFB347', '#E84A6F'];
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = hexWithAlpha(cols[i % cols.length], 0.5);
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 4 + Math.random() * 7, 0, 7);
    ctx.fill();
  }
  // cup hero shot
  const ratio = img.width / img.height;
  const hh = 560, ww = hh * ratio;
  ctx.drawImage(img, (W - ww) / 2, 150, ww, hh);
  // title
  ctx.fillStyle = '#2B2331';
  ctx.font = '800 64px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MIXR', W / 2, 96);
  ctx.font = '700 44px "Baloo 2", sans-serif';
  ctx.fillStyle = theme?.accent2 || '#7B5FC7';
  wrapText(ctx, document.querySelector('#summary-name')?.textContent || 'Mein Drink', W / 2, 790, W - 120, 52);
  ctx.font = '600 26px Nunito, sans-serif';
  ctx.fillStyle = '#8a8093';
  ctx.fillText('Live gemixt bei der MIXR Demo Bar', W / 2, 880);
  ctx.font = '600 22px Nunito, sans-serif';
  ctx.fillText('powered by OsAI', W / 2, 950);
}

function hexWithAlpha(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy); line = w; yy += lh;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
}
