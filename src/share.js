// Share card: drink name + hero shot of the configured cup, savable PNG.
export async function buildShareCard(state, cup, theme) {
  const slot = document.querySelector('#share-card-slot');
  if (!slot) return;
  const snap = await cup.snapshot();
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = snap; });

  const W = 800, H = 1000;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

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

  slot.innerHTML = '';
  const out = new Image();
  out.src = cv.toDataURL('image/png');
  slot.appendChild(out);
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
