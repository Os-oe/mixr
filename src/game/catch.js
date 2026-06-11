// Catch the Toppings — 2D canvas mini game for the waiting phase.
// Uses the guest's own cup + topping colors/sprites.
import { audio } from '../audio.js';

export class CatchGame {
  constructor(canvas, hud, { theme, toppings = [], onEnd, duration = 30 } = {}) {
    this.cv = canvas; this.hud = hud;
    this.theme = theme; this.onEnd = onEnd; this.duration = duration;
    this.items = toppings.length ? toppings : [{ id: 'boba', tint: '#5C4033' }];
    this.images = {};
    for (const t of this.items) {
      if (t.sprite) {
        const img = new Image();
        img.src = '/sprites/' + t.sprite;
        this.images[t.id] = img;
      }
    }
    this.reset();
    this._bind();
  }

  reset() {
    this.score = 0; this.time = this.duration; this.falling = []; this.running = false;
    this.cupX = 0.5; this.combo = 0;
  }

  _bind() {
    const move = (clientX) => {
      const r = this.cv.getBoundingClientRect();
      this.cupX = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    };
    this.cv.addEventListener('pointermove', e => move(e.clientX));
    this.cv.addEventListener('pointerdown', e => move(e.clientX));
    this.cv.addEventListener('touchmove', e => { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  }

  start() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.cv.clientWidth || 320;
    this.W = w; this.H = Math.round(w * 0.9);
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.cv.style.height = this.H + 'px';
    this.ctx = this.cv.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.running = true;
    this.last = performance.now();
    this.spawnT = 0;
    requestAnimationFrame((t) => this._loop(t));
  }

  _loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.time -= dt;
    if (this.time <= 0) return this._end();
    this.spawnT -= dt;
    const speedup = 1 + (this.duration - this.time) / this.duration;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.32, 0.85 / speedup);
      const item = this.items[Math.floor(Math.random() * this.items.length)];
      const bad = Math.random() < 0.18;
      this.falling.push({
        x: 0.08 + Math.random() * 0.84, y: -0.05,
        vy: (0.25 + Math.random() * 0.2) * speedup,
        item, bad, r: bad ? 13 : 11, rot: Math.random() * 6
      });
    }
    for (const f of this.falling) { f.y += f.vy * dt; f.rot += dt * 2; }
    // catch zone
    const cupW = 0.2;
    for (const f of this.falling) {
      if (f.caught || f.missed) continue;
      if (f.y > 0.82 && f.y < 0.92 && Math.abs(f.x - this.cupX) < cupW / 2 + 0.03) {
        f.caught = true;
        if (f.bad) { this.score = Math.max(0, this.score - 5); this.combo = 0; audio.play('bad'); }
        else { this.combo++; this.score += 10 + Math.min(10, this.combo); audio.play('blip'); }
        try { navigator.vibrate?.(6); } catch {}
      } else if (f.y > 1.05) f.missed = true;
    }
    this.falling = this.falling.filter(f => !f.caught && !f.missed);
    this._draw();
    requestAnimationFrame((tt) => this._loop(tt));
  }

  _draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    // falling items
    for (const f of this.falling) {
      const x = f.x * W, y = f.y * H;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.sin(f.rot) * 0.4);
      const img = !f.bad && this.images[f.item.id];
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, -f.r * 1.4, -f.r * 1.4, f.r * 2.8, f.r * 2.8);
      } else {
        ctx.fillStyle = f.bad ? '#8a8093' : (f.item.tint || '#9B7EDE');
        ctx.beginPath(); ctx.arc(0, 0, f.r, 0, 7); ctx.fill();
        if (f.bad) { ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Nunito'; ctx.textAlign = 'center'; ctx.fillText('✕', 0, 4); }
      }
      ctx.restore();
    }
    // cup
    const cx = this.cupX * W, cw = W * 0.2, ch = cw * 1.1, cy = H * 0.86;
    ctx.fillStyle = this.theme?.accent || '#9B7EDE';
    ctx.beginPath();
    ctx.moveTo(cx - cw / 2, cy);
    ctx.lineTo(cx + cw / 2, cy);
    ctx.lineTo(cx + cw * 0.38, cy + ch * 0.7);
    ctx.lineTo(cx - cw * 0.38, cy + ch * 0.7);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(cx - cw * 0.32, cy + 6, 6, ch * 0.45);
    this.hud.textContent = `⭐ ${this.score}   ⏱ ${Math.ceil(this.time)}s`;
  }

  _end() {
    this.running = false;
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(43,35,49,.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '800 26px "Baloo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.score} Punkte!`, W / 2, H / 2 - 8);
    ctx.font = '600 14px Nunito';
    ctx.fillText('Eingetragen im Tages-Highscore', W / 2, H / 2 + 18);
    setTimeout(() => this.onEnd?.(this.score), 1600);
  }
}
