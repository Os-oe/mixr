// MIXR cup scene — PixiJS v8 + GSAP. Persistent animated cup with the five
// primitives (pour / drop / layer / sprinkle / swirl) + exploded view.
// Phase 1: procedural placeholder graphics. Sprite textures plug into the
// same API later (drop({texture}) / setCupTextures()).
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';

const VW = 360, VH = 430;
const CUP = { cx: VW / 2, topY: 96, botY: 336, topW: 172, botW: 128, inset: 9 };

function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToNum([r, g, b]) { return (r << 16) + (g << 8) + b; }
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + [0, 1, 2].map(i => Math.round(lerp(A[i], B[i], t)).toString(16).padStart(2, '0')).join('');
}
// cup half-width at height y
function halfW(y) {
  const t = (y - CUP.topY) / (CUP.botY - CUP.topY);
  return lerp(CUP.topW / 2, CUP.botW / 2, t);
}

export class CupScene {
  static async create(el, opts = {}) {
    const s = new CupScene();
    s.app = new Application();
    await s.app.init({
      backgroundAlpha: 0, antialias: true, resizeTo: el,
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true
    });
    el.appendChild(s.app.canvas);
    s._build(opts);
    s._bindResize(el);
    return s;
  }

  _build() {
    this.onFx = null;
    this.root = new Container();
    this.app.stage.addChild(this.root);

    // layer order: back, syrup bands+liquid (masked), content, surface, front, hat, fx
    this.backC = new Container();
    this.liquidC = new Container();
    this.bandC = new Container();
    this.contentC = new Container();
    this.surfaceC = new Container();
    this.frontC = new Container();
    this.hatC = new Container();
    this.fxC = new Container();
    this.root.addChild(this.backC, this.liquidC, this.bandC, this.contentC, this.surfaceC, this.frontC, this.hatC, this.fxC);

    this.liquidG = new Graphics();
    this.liquidC.addChild(this.liquidG);
    this.bandG = new Graphics();
    this.bandC.addChild(this.bandG);

    // mask = inner cup shape, shared by liquid + bands + content
    this.maskG = new Graphics();
    this._drawCupPoly(this.maskG, CUP.inset, 0xff0000);
    this.root.addChild(this.maskG);
    this.liquidC.mask = this.maskG;
    this.bandC.mask = this.maskG;
    this.contentC.mask = this.maskG;
    this.surfaceC.mask = this.maskG;

    this.backG = new Graphics();
    this.backC.addChild(this.backG);
    this.frontG = new Graphics();
    this.frontC.addChild(this.frontG);

    // state
    this.level = 0;             // 0..1
    this.color = '#cccccc';
    this.waveAmp = 1.4;
    this.wavePhase = 0;
    this.bands = [];            // {color, frac, h}
    this.items = new Map();     // id -> [sprites]
    this.creamSprite = null;
    this.exploded = false;
    this.theme = null;
    this.accent = '#9B7EDE';
    this.cupTextures = null;    // phase 2: {back, front, hat}
    this.backSprite = null; this.frontSprite = null; this.hatSprite = null;

    this._drawCup();
    this.app.ticker.add((tk) => this._tick(tk));
  }

  _bindResize(el) {
    const fit = () => {
      const w = el.clientWidth || VW, h = el.clientHeight || VH;
      const sc = Math.min(w / VW, h / VH);
      this.root.scale.set(sc);
      this.root.position.set((w - VW * sc) / 2, (h - VH * sc) / 2);
    };
    fit();
    new ResizeObserver(fit).observe(el);
  }

  _drawCupPoly(g, inset, color, alpha = 1) {
    const { cx, topY, botY, topW, botW } = CUP;
    g.clear();
    g.poly([
      cx - topW / 2 + inset, topY + inset,
      cx + topW / 2 - inset, topY + inset,
      cx + botW / 2 - inset, botY - inset,
      cx - botW / 2 + inset, botY - inset
    ]).fill({ color, alpha });
  }

  _drawCup(themeId = null) {
    const { cx, topY, botY, topW, botW } = CUP;
    const edge = 0xe7e0ee;
    const accentNum = rgbToNum(hexToRgb(this.accent || '#9B7EDE'));
    // back wall
    this.backG.clear();
    this.backG.poly([
      cx - topW / 2, topY, cx + topW / 2, topY,
      cx + botW / 2, botY, cx - botW / 2, botY
    ]).fill({ color: 0xffffff, alpha: 0.5 });
    this.backG.ellipse(cx, topY, topW / 2, 10).fill({ color: 0xffffff, alpha: 0.6 });
    // straw behind everything (theme accent), not for coffee
    if (themeId && themeId !== 'coffee') {
      const sw = themeId === 'bubble-tea' ? 17 : 11;
      this.backG.roundRect(cx + 26, topY - 64, sw, 78, sw / 2).fill({ color: accentNum, alpha: 0.95 });
      this.backG.roundRect(cx + 26 + sw * 0.22, topY - 64, sw * 0.22, 78, 2).fill({ color: 0xffffff, alpha: 0.35 });
    }
    // front wall: rim + glass edges + gloss stripe
    this.frontG.clear();
    this.frontG.moveTo(cx - topW / 2, topY).lineTo(cx - botW / 2, botY)
      .moveTo(cx + topW / 2, topY).lineTo(cx + botW / 2, botY)
      .stroke({ width: 4.5, color: edge });
    this.frontG.moveTo(cx - botW / 2 + 1, botY).lineTo(cx + botW / 2 - 1, botY).stroke({ width: 6, color: edge });
    // base shadow
    this.frontG.ellipse(cx, botY + 8, botW / 2 + 8, 7).fill({ color: 0x2b2331, alpha: 0.08 });
    // rim: coffee gets a lid, others an open rim ring
    if (themeId === 'coffee') {
      this.frontG.roundRect(cx - topW / 2 - 7, topY - 14, topW + 14, 16, 7).fill({ color: 0xfdfbf7 }).stroke({ width: 2.5, color: edge });
      this.frontG.roundRect(cx - 24, topY - 22, 48, 10, 5).fill({ color: 0xfdfbf7 }).stroke({ width: 2.5, color: edge });
    } else {
      this.frontG.ellipse(cx, topY, topW / 2, 10).stroke({ width: 4.5, color: edge });
    }
    // gloss
    this.frontG.roundRect(cx - topW / 2 + 16, topY + 26, 13, botY - topY - 60, 7).fill({ color: 0xffffff, alpha: 0.32 });
    this.frontG.roundRect(cx + topW / 2 - 30, topY + 40, 7, botY - topY - 110, 4).fill({ color: 0xffffff, alpha: 0.22 });
  }

  // phase 2: swap placeholder graphics for sprite textures
  setCupTextures({ back, front, hat } = {}) {
    const place = (tex, container, old) => {
      if (old) old.destroy();
      if (!tex) return null;
      const sp = new Sprite(tex);
      const targetH = (CUP.botY - CUP.topY) + 56;
      const sc = targetH / sp.texture.height;
      sp.scale.set(sc);
      sp.anchor.set(0.5);
      sp.position.set(CUP.cx, (CUP.topY + CUP.botY) / 2 + 2);
      container.addChild(sp);
      return sp;
    };
    if (back) { this.backG.clear(); this.backSprite = place(back, this.backC, this.backSprite); }
    if (front) { this.frontG.clear(); this.frontSprite = place(front, this.frontC, this.frontSprite); }
    this.cupTextures = { back, front, hat };
  }

  setTheme(themeId, accent) {
    this.theme = themeId;
    this.accent = accent || this.accent;
    if (!this.cupTextures) this._drawCup(themeId);
  }

  _surfaceY() {
    const innerTop = CUP.topY + 18, innerBot = CUP.botY - CUP.inset - 2;
    return innerBot - this.level * (innerBot - innerTop);
  }

  _tick(tk) {
    // only animate the liquid while something is happening (perf on mobile)
    const active = performance.now() < (this.activeUntil || 0);
    if (!active) {
      if (!this._idleDrawn) { this.waveAmp = 0; this._drawLiquid(); this._idleDrawn = true; }
      return;
    }
    this._idleDrawn = false;
    this.wavePhase += tk.deltaMS / 280;
    if (this.waveAmp > 1.4) this.waveAmp *= 0.985;
    this._drawLiquid();
  }

  _wake(ms = 2600) { this.activeUntil = performance.now() + ms; this._idleDrawn = false; }

  _drawLiquid() {
    const g = this.liquidG;
    g.clear();
    if (this.level <= 0.005) { this._drawBands(); return; }
    const yS = this._surfaceY();
    const yB = CUP.botY - CUP.inset - 2;
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = CUP.cx - halfW(yS) + t * 2 * halfW(yS);
      const y = yS + Math.sin(this.wavePhase + t * Math.PI * 2.2) * this.waveAmp;
      pts.push(x, y);
    }
    pts.push(CUP.cx + halfW(yB), yB, CUP.cx - halfW(yB), yB);
    g.poly(pts).fill({ color: rgbToNum(hexToRgb(this.color)), alpha: 0.92 });
    // lighter surface ellipse
    g.ellipse(CUP.cx, yS, halfW(yS) * 0.92, 6).fill({ color: 0xffffff, alpha: 0.22 });
    this._drawBands();
  }

  _drawBands() {
    const g = this.bandG;
    g.clear();
    const yB = CUP.botY - CUP.inset - 2;
    const innerTop = CUP.topY + 18;
    for (const b of this.bands) {
      const y0 = yB - b.frac * (yB - innerTop);
      g.poly([
        CUP.cx - halfW(y0 - b.h), y0 - b.h,
        CUP.cx + halfW(y0 - b.h), y0 - b.h,
        CUP.cx + halfW(y0), y0,
        CUP.cx - halfW(y0), y0
      ]).fill({ color: rgbToNum(hexToRgb(b.color)), alpha: b.alpha ?? 0.85 });
    }
  }

  // ---- PRIMITIVE 1: pour -------------------------------------------------
  pour({ color = '#A9743F', add = 0.5, duration = 1.5, blend = 0.65 } = {}) {
    this.onFx?.('pour');
    this._wake(duration * 1000 + 1800);
    const target = Math.min(0.86, this.level + add);
    const startColor = this.level <= 0.01 ? color : this.color;
    const endColor = this.level <= 0.01 ? color : mixHex(this.color, color, blend);
    const stream = new Graphics();
    this.fxC.addChild(stream);
    const sx = CUP.cx + 14;
    const self = this;
    const st = { p: 0 };
    return new Promise(resolve => {
      gsap.to(st, {
        p: 1, duration, ease: 'sine.inOut',
        onUpdate() {
          self.level = lerp(self.level, target, st.p * 0.16 + 0.02);
          self.color = mixHex(startColor, endColor, st.p);
          self.waveAmp = 5;
          const yS = self._surfaceY();
          stream.clear();
          const w = 9 + Math.sin(st.p * 30) * 1.5;
          stream.roundRect(sx - w / 2, 18, w, yS - 18, w / 2).fill({ color: rgbToNum(hexToRgb(color)), alpha: 0.95 });
          stream.ellipse(sx, yS, 14, 5).fill({ color: 0xffffff, alpha: 0.5 });
        },
        onComplete() {
          self.level = target;
          gsap.to(stream, {
            alpha: 0, duration: 0.22, onComplete() { stream.destroy(); resolve(); }
          });
        }
      });
    });
  }

  // ---- PRIMITIVE 2: drop -------------------------------------------------
  drop({ id = 'x', color = '#5C4033', texture = null, count = 5, float = false, radius = 9 } = {}) {
    this.onFx?.('drop');
    this._wake(2400);
    const sprites = this.items.get(id) || [];
    const yB = CUP.botY - CUP.inset - 6;
    const proms = [];
    for (let i = 0; i < count; i++) {
      let sp;
      if (texture) {
        sp = new Sprite(texture);
        sp.anchor.set(0.5);
        sp.scale.set((radius * 2.4) / sp.texture.width);
      } else {
        const g = new Graphics();
        g.circle(0, 0, radius).fill(rgbToNum(hexToRgb(color)));
        g.circle(-radius * 0.3, -radius * 0.3, radius * 0.32).fill({ color: 0xffffff, alpha: 0.45 });
        sp = g;
      }
      const targetY = float
        ? this._surfaceY() + 8 + Math.random() * 14
        : yB - radius - Math.random() * 16;
      const x = CUP.cx + (Math.random() - 0.5) * (halfW(targetY) * 1.5);
      sp.position.set(x, 30);
      sp.rotation = (Math.random() - 0.5) * 0.8;
      sp.__float = float; sp.__targetY = targetY;
      this.contentC.addChild(sp);
      sprites.push(sp);
      proms.push(new Promise(res => {
        gsap.to(sp, {
          y: targetY, duration: 0.55 + Math.random() * 0.2, delay: i * 0.09,
          ease: 'bounce.out',
          onStart: () => { this.waveAmp = 4; this._splash(x); },
          onComplete: res
        });
        gsap.to(sp, { rotation: (Math.random() - 0.5) * 0.6, duration: 0.7, delay: i * 0.09 });
      }));
    }
    this.items.set(id, sprites);
    return Promise.all(proms);
  }

  _splash(x) {
    const yS = this._surfaceY();
    for (let i = 0; i < 5; i++) {
      const p = new Graphics();
      p.circle(0, 0, 2.2).fill({ color: rgbToNum(hexToRgb(this.color)), alpha: 0.9 });
      p.position.set(x + (Math.random() - 0.5) * 10, yS);
      this.fxC.addChild(p);
      gsap.to(p, {
        x: p.x + (Math.random() - 0.5) * 34, y: yS - 18 - Math.random() * 16, alpha: 0,
        duration: 0.45, ease: 'power1.out', onComplete: () => p.destroy()
      });
    }
  }

  removeItem(id) {
    const sprites = this.items.get(id);
    if (!sprites) return;
    for (const sp of sprites) {
      gsap.to(sp, { y: sp.y - 26, alpha: 0, duration: 0.3, onComplete: () => sp.destroy() });
    }
    this.items.delete(id);
  }

  // ---- PRIMITIVE 3: layer ------------------------------------------------
  layerBand({ id = 'band', color = '#8B5A2B' } = {}) {
    this.onFx?.('layer');
    this._wake(1600);
    const band = { id, color, frac: Math.max(0.06, this.level * 0.3), h: 0, alpha: 0.9 };
    this.bands.push(band);
    return new Promise(res => {
      gsap.to(band, { h: 26, duration: 0.8, ease: 'sine.out', onComplete: res });
    });
  }

  removeBand(id) {
    const b = this.bands.find(b => b.id === id);
    if (!b) return;
    gsap.to(b, { h: 0, duration: 0.3, onComplete: () => { this.bands = this.bands.filter(x => x !== b); } });
  }

  // ---- PRIMITIVE 4: sprinkle ----------------------------------------------
  sprinkle({ id = 'sprk', color = '#5C3A21', count = 22 } = {}) {
    this.onFx?.('sprinkle');
    this._wake(2200);
    const sprites = this.items.get(id) || [];
    const proms = [];
    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      p.circle(0, 0, 1.6 + Math.random() * 1.2).fill(rgbToNum(hexToRgb(color)));
      const yT = this._surfaceY() + Math.random() * 6 - 2;
      const x = CUP.cx + (Math.random() - 0.5) * halfW(yT) * 1.6;
      p.position.set(x, 26 + Math.random() * 14);
      p.__float = true; p.__targetY = yT;
      this.surfaceC.addChild(p);
      sprites.push(p);
      proms.push(new Promise(res => {
        gsap.to(p, { y: yT, duration: 0.5 + Math.random() * 0.35, delay: i * 0.025, ease: 'power2.in', onComplete: res });
      }));
    }
    this.items.set(id, sprites);
    return Promise.all(proms);
  }

  // ---- PRIMITIVE 5: swirl --------------------------------------------------
  swirl({ duration = 1.1 } = {}) {
    this.onFx?.('swirl');
    this._wake(2200);
    const tl = gsap.timeline();
    const all = [...this.contentC.children, ...this.surfaceC.children];
    tl.to(this.root, { rotation: 0.05, duration: 0.09, yoyo: true, repeat: 5, transformOrigin: '50% 80%' }, 0);
    tl.to(this.root.scale, { x: 1.04, y: 0.95, duration: 0.12, yoyo: true, repeat: 5 }, 0);
    for (const sp of all) {
      tl.to(sp, {
        x: sp.x + (Math.random() - 0.5) * 26,
        rotation: sp.rotation + (Math.random() - 0.5) * 1.6,
        duration: duration * 0.7, ease: 'sine.inOut'
      }, 0.05);
    }
    this.waveAmp = 6;
    return new Promise(res => tl.eventCallback('onComplete', () => { this.root.rotation = 0; this.root.scale.set(this.root.scale.x, this.root.scale.x); res(); }));
  }

  // cream / whipped hat (placeholder swirl shape)
  addCream({ texture = null } = {}) {
    if (this.creamSprite) return Promise.resolve();
    let sp;
    if (texture) {
      sp = new Sprite(texture);
      sp.anchor.set(0.5, 1);
      sp.scale.set((CUP.topW * 0.85) / sp.texture.width);
    } else {
      const g = new Graphics();
      g.ellipse(0, -8, 62, 22).fill(0xfff8ef);
      g.ellipse(-22, -22, 34, 18).fill(0xfff8ef);
      g.ellipse(20, -24, 30, 16).fill(0xfff8ef);
      g.ellipse(0, -36, 26, 16).fill(0xfff4e4);
      sp = g;
    }
    sp.position.set(CUP.cx, CUP.topY + 10);
    sp.alpha = 0;
    this.hatC.addChild(sp);
    this.creamSprite = sp;
    return new Promise(res => {
      gsap.fromTo(sp, { y: CUP.topY - 36, alpha: 0 }, { y: CUP.topY + 10, alpha: 1, duration: 0.5, ease: 'bounce.out', onComplete: res });
    });
  }

  removeCream() {
    if (!this.creamSprite) return;
    const sp = this.creamSprite;
    this.creamSprite = null;
    gsap.to(sp, { y: sp.y - 30, alpha: 0, duration: 0.3, onComplete: () => sp.destroy() });
  }

  // ---- EXPLODED VIEW -------------------------------------------------------
  explode({ hold = 1.6 } = {}) {
    if (this.exploded) return Promise.resolve();
    this.exploded = true;
    this.onFx?.('explode');
    this._wake(2000);
    const tl = gsap.timeline();
    this._explodeTl = tl;
    const cy = (CUP.topY + CUP.botY) / 2;
    // squash anticipation
    tl.to(this.root.scale, { x: this.root.scale.x * 1.05, y: this.root.scale.y * 0.92, duration: 0.14, yoyo: true, repeat: 1 });
    // un-mask content so pieces can fly out
    tl.add(() => { this.contentC.mask = null; this.surfaceC.mask = null; }, '>');
    tl.to(this.backC, { y: 64, alpha: 0.85, duration: 0.7, ease: 'power3.out' }, '<');
    tl.to(this.frontC, { y: 116, alpha: 0.8, duration: 0.7, ease: 'power3.out' }, '<');
    tl.to(this.liquidC, { y: -34, duration: 0.7, ease: 'power3.out' }, '<');
    tl.to(this.bandC, { y: -78, duration: 0.7, ease: 'power3.out' }, '<');
    if (this.creamSprite) tl.to(this.creamSprite, { y: this.creamSprite.y - 120, duration: 0.7, ease: 'power3.out' }, '<');
    // every dropped ingredient flies to its hover slot on a ring
    const sprites = [...this.items.values()].flat().filter(s => !s.destroyed);
    sprites.forEach((sp, i) => {
      const ang = (i / Math.max(1, sprites.length)) * Math.PI * 2 - Math.PI / 2;
      const rx = 132 + (i % 3) * 16, ry = 120 + (i % 2) * 22;
      sp.__ex = sp.x; sp.__ey = sp.y;
      tl.to(sp, {
        x: CUP.cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry,
        rotation: sp.rotation + (Math.random() - 0.5) * 2,
        duration: 0.75, ease: 'back.out(1.4)'
      }, 0.18 + i * 0.045);
      tl.to(sp, { y: '+=7', duration: 0.9, yoyo: true, repeat: Math.ceil(hold), ease: 'sine.inOut' }, '>');
    });
    tl.to({}, { duration: Math.max(0.2, hold - 1) });
    return new Promise(res => tl.eventCallback('onComplete', res));
  }

  unexplode() {
    if (!this.exploded) return Promise.resolve();
    const tl = gsap.timeline();
    const sprites = [...this.items.values()].flat().filter(s => !s.destroyed);
    sprites.forEach((sp, i) => {
      tl.to(sp, { x: sp.__ex, y: sp.__ey, duration: 0.55, ease: 'power3.inOut' }, i * 0.03);
    });
    tl.to([this.backC, this.frontC, this.liquidC, this.bandC], { y: 0, alpha: 1, duration: 0.55, ease: 'power3.inOut' }, 0.1);
    if (this.creamSprite) tl.to(this.creamSprite, { y: CUP.topY + 10, duration: 0.55, ease: 'power3.inOut' }, 0.1);
    tl.add(() => {
      this.contentC.mask = this.maskG; this.surfaceC.mask = this.maskG;
      this.exploded = false;
      this.waveAmp = 5;
      this._wake(2000);
    });
    return new Promise(res => tl.eventCallback('onComplete', res));
  }

  // confetti celebration
  celebrate() {
    this.onFx?.('confetti');
    const colors = [0x9B7EDE, 0xFFB347, 0xE84A6F, 0x7FA85C, 0xE8C39E];
    for (let i = 0; i < 56; i++) {
      const p = new Graphics();
      p.roundRect(-3, -5, 6, 10, 2).fill(colors[i % colors.length]);
      p.position.set(Math.random() * VW, -16 - Math.random() * 60);
      p.rotation = Math.random() * Math.PI;
      this.fxC.addChild(p);
      gsap.to(p, {
        y: VH + 30, x: p.x + (Math.random() - 0.5) * 90, rotation: p.rotation + (Math.random() - 0.5) * 8,
        duration: 1.6 + Math.random() * 1.4, ease: 'power1.in', onComplete: () => p.destroy()
      });
    }
  }

  shineSweep() {
    const g = new Graphics();
    g.roundRect(-26, CUP.topY - 6, 26, CUP.botY - CUP.topY + 12, 13).fill({ color: 0xffffff, alpha: 0.45 });
    g.rotation = 0.18;
    this.fxC.addChild(g);
    gsap.fromTo(g, { x: CUP.cx - 120 }, { x: CUP.cx + 120, duration: 0.7, ease: 'power2.inOut', onComplete: () => g.destroy() });
  }

  reset() {
    if (this._explodeTl) { this._explodeTl.kill(); this._explodeTl = null; }
    this.level = 0; this.color = '#cccccc'; this.bands = [];
    for (const arr of this.items.values()) for (const sp of arr) { gsap.killTweensOf(sp); sp.destroy(); }
    this.items.clear();
    if (this.creamSprite) gsap.killTweensOf(this.creamSprite);
    this.removeCream();
    [this.backC, this.frontC, this.liquidC, this.bandC, this.root, this.root.scale].forEach(t => gsap.killTweensOf(t));
    this.fxC.removeChildren().forEach(c => { gsap.killTweensOf(c); c.destroy(); });
    [this.backC, this.frontC, this.liquidC, this.bandC].forEach(c => { c.y = 0; c.alpha = 1; });
    this.contentC.mask = this.maskG; this.surfaceC.mask = this.maskG;
    this.exploded = false;
    this._wake(400);
  }

  async snapshot() {
    return await this.app.renderer.extract.base64({ target: this.app.stage });
  }
}
