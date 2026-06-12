// MIXR Signature-Modus — kuratierte, 100% fotorealistische Drink-Karte.
// Parallel zum freien Konfigurator (Classic): Galerie -> Drink-Story ->
// Anpassen -> bestehende Order-Pipeline. Die Foto-Heroes sind der Star,
// die UI tritt zurück. Kein Eingriff in den Classic-Flow.
import { api } from './api.js';
import { audio } from './audio.js';
import { formatPrice } from './engine/constraints.js';

const $ = (sel) => document.querySelector(sel);

// Loop lädt lazy (preload=none); canplay-Timeout -> Hero mit Ken-Burns bleibt.
const STORY_VIDEO_TIMEOUT = 1500;

// Kategorie-Akzente (Cream & Candy: Taro / Mango / Espresso / Candy-Pink)
export const KATEGORIE_ACCENT = {
  'bubble-tea': { accent: '#9B7EDE', accent2: '#7B5FC7' },
  smoothie: { accent: '#FFB347', accent2: '#E84A6F' },
  kaffee: { accent: '#6F4E37', accent2: '#C77B33' },
  mocktail: { accent: '#E84A6F', accent2: '#9B7EDE' }
};

export class SignatureMode {
  // hooks: { state, show, startWaiting, haptic } — vom main.js gestellt,
  // damit Wartephase/Screen-System unverändert wiederverwendet werden.
  constructor(hooks) {
    this.state = hooks.state;
    this.show = hooks.show;
    this.startWaiting = hooks.startWaiting;
    this.haptic = hooks.haptic;
    this.drink = null;          // aktuell geöffneter Drink
    this.kategorie = null;      // aktiver Galerie-Filter (null = Alle)
    this.size = 'M';
    this.suesse = 2;
    this.eis = 2;
    this._videoGen = 0;         // entwertet überholte Lade-Versuche (LESSONS)
    this._bindStatic();
  }

  get menu() { return this.state.sigMenu; }

  _bindStatic() {
    $('#btn-sig-gallery-back').onclick = () => { this.haptic(); this.exitToAttract(); };
    $('#btn-sig-back').onclick = () => { this.haptic(); this.stopStoryVideo(); this.show('sig-gallery'); this.renderGallery(); };
    $('#btn-sig-customize').onclick = () => { this.haptic(); this.openCustomize(); };
    $('#btn-sig-custom-back').onclick = () => { this.haptic(); this.openDrink(this.drink.id); };
    $('#btn-sig-order').onclick = () => {
      this.haptic();
      const btn = $('#btn-sig-order');
      btn.disabled = true;
      this.placeOrder().catch(e => console.warn('signature order', e)).finally(() => { btn.disabled = false; });
    };
  }

  exitToAttract() {
    this.stopStoryVideo();
    this.show('attract');
    if (this.state.onSignatureExit) this.state.onSignatureExit();
  }

  openGallery() {
    this.stopStoryVideo();
    this.show('sig-gallery');
    this.renderGallery();
  }

  // Galerie nur bei Datenänderung neu bauen (Polling-Lesson: DOM-Churn frisst Taps)
  renderGallery() {
    if (!this.menu) return;
    const drinks = this.menu.drinks.filter(d => !this.kategorie || d.kategorie === this.kategorie);
    const sig = JSON.stringify([this.kategorie, drinks.map(d => [d.id, d.verfuegbar])]);
    if (sig === this._gallerySig && $('#sig-drink-cards').children.length) return;
    this._gallerySig = sig;

    const chips = $('#sig-category-chips');
    const cats = this.menu.kategorien.filter(k => this.menu.drinks.some(d => d.kategorie === k.id));
    chips.innerHTML =
      `<button class="sig-chip ${!this.kategorie ? 'active' : ''}" data-cat="">Alle</button>` +
      cats.map(k => `<button class="sig-chip ${this.kategorie === k.id ? 'active' : ''}" data-cat="${k.id}">${k.name}</button>`).join('');
    chips.querySelectorAll('button').forEach(b => {
      b.onclick = () => { this.haptic(); this.kategorie = b.dataset.cat || null; this._gallerySig = null; this.renderGallery(); };
    });

    const grid = $('#sig-drink-cards');
    grid.innerHTML = drinks.map(d => `
      <button class="sig-card" data-id="${d.id}" data-testid="sig-drink-${d.id}" ${d.verfuegbar === false ? 'disabled' : ''}>
        ${d.verfuegbar === false ? '<span class="soldout-badge">AUS</span>' : ''}
        <img class="sig-card-img" src="${d.hero}" alt="${d.name}" loading="lazy" />
        <span class="sig-card-body">
          <span class="sig-card-name">${d.name}</span>
          <span class="sig-card-meta">${this.catName(d.kategorie)} · ${formatPrice(d.preis)}</span>
        </span>
      </button>`).join('');
    grid.querySelectorAll('button[data-id]').forEach(b => {
      b.onclick = () => { this.haptic(); this.openDrink(b.dataset.id); };
    });
  }

  catName(id) { return this.menu.kategorien.find(k => k.id === id)?.name || id; }

  poll() {
    api.signatureMenu().then(m => {
      this.state.sigMenu = m;
      if (this.state.screen === 'sig-gallery') this.renderGallery();
    }).catch(() => {});
  }

  // ---------- Drink-Story ----------
  openDrink(id) {
    this.drink = this.menu.drinks.find(d => d.id === id);
    if (!this.drink) return;
    this.size = 'M'; this.suesse = 2; this.eis = 2;
    this.show('sig-story');
    this.renderStory();
    this.playStoryVideo();
  }

  renderStory() {
    const d = this.drink;
    const acc = KATEGORIE_ACCENT[d.kategorie] || KATEGORIE_ACCENT.mocktail;
    document.documentElement.style.setProperty('--accent', acc.accent);
    document.documentElement.style.setProperty('--accent2', acc.accent2);
    $('#sig-story-name').textContent = d.name;
    $('#sig-story-kat').textContent = this.catName(d.kategorie);
    $('#sig-story-desc').textContent = d.beschreibung;
    $('#sig-story-price').textContent = formatPrice(d.preis);
    $('#sig-story-zutaten').innerHTML = (d.zutaten || []).map(z => `<li>${z}</li>`).join('');
    this.renderAmpel($('#sig-story-allergen'), d.allergene);
    // Medien: Hero sofort (Ken-Burns), Loop-Video crossfadet darüber, wenn da
    const img = $('#sig-story-hero');
    img.src = d.hero;
    img.alt = d.name;
  }

  renderAmpel(el, allergene) {
    const legende = this.state.menu?.allergene_legende || {};
    if (!allergene?.length) {
      el.innerHTML = '<div class="ampel-row"><span class="ampel-light gruen"></span><span class="ampel-ok">Keine der 14 LMIV-Allergene enthalten</span></div>';
    } else {
      el.innerHTML = `<div class="ampel-row"><span class="ampel-light gelb"></span>${allergene.map(a => `<span class="allergen-tag">${legende[a] || a}</span>`).join('')}</div>`;
    }
  }

  async playStoryVideo() {
    const d = this.drink;
    const v = $('#sig-story-video');
    this.stopStoryVideo();           // vorherigen Versuch hart beenden
    if (!d.loop || !v) return;
    const gen = ++this._videoGen;
    try {
      if (d.poster) v.poster = d.poster;
      v.src = d.loop;
      await new Promise((res, rej) => {
        const to = setTimeout(() => rej(new Error('canplay timeout')), STORY_VIDEO_TIMEOUT);
        v.addEventListener('canplay', () => { clearTimeout(to); res(); }, { once: true });
        v.addEventListener('error', () => { clearTimeout(to); rej(new Error('video error')); }, { once: true });
        v.load();
      });
      if (gen !== this._videoGen) return; // überholt -> gar nicht erst starten
      await v.play();
      // Gen-Token nach JEDER await-Grenze prüfen (LESSONS): im Stale-Branch
      // selbst pausieren, außer ein neuerer Versuch besitzt das Element schon.
      if (gen !== this._videoGen) {
        if (!v.classList.contains('playing')) { try { v.pause(); } catch {} }
        return;
      }
      if (this.state.screen !== 'sig-story') { this.stopStoryVideo(); return; }
      v.classList.add('playing');   // CSS-Crossfade vom Hero/Poster (~250ms)
    } catch (e) {
      if (gen !== this._videoGen) return;
      // Fallback: Hero mit Ken-Burns bleibt einfach stehen
      console.warn('sig story video -> hero fallback', e?.message || e);
      this.stopStoryVideo();
    }
  }

  stopStoryVideo() {
    this._videoGen++;
    const v = $('#sig-story-video');
    if (!v) return;
    v.classList.remove('playing');
    try { v.pause(); } catch {}
    v.removeAttribute('src');
    // load() ist Pflicht: erst das verwirft die laufende Media-Resource
    // (sonst dekodiert ein unsichtbares Video die ganze Session weiter).
    try { v.load(); } catch {}
  }

  // ---------- Anpassen ----------
  openCustomize() {
    this.stopStoryVideo();
    this.show('sig-custom');
    this.renderCustomize();
  }

  renderCustomize() {
    const d = this.drink;
    $('#sig-custom-thumb').src = d.hero;
    $('#sig-custom-name').textContent = d.name;
    $('#sig-custom-base').textContent = `Basis ${formatPrice(d.preis)}`;

    // Größe S/M/L mit Preisdelta
    const sizes = this.menu.groessen || [{ id: 'S', label: 'S', delta: -0.5 }, { id: 'M', label: 'M', delta: 0 }, { id: 'L', label: 'L', delta: 0.5 }];
    const sizeRow = $('#sig-size-row');
    sizeRow.innerHTML = '<div class="lbl">Größe</div><div class="opts">' + sizes.map(s => `
      <button data-size="${s.id}" class="${this.size === s.id ? 'active' : ''}">
        ${s.label}<small>${s.delta === 0 ? 'Basis' : (s.delta > 0 ? '+' : '−') + formatPrice(Math.abs(s.delta))}</small>
      </button>`).join('') + '</div>';
    sizeRow.querySelectorAll('button').forEach(b => {
      b.onclick = () => { this.haptic(); this.size = b.dataset.size; this.renderCustomize(); };
    });

    // Süße + Eis — gleiche Stufen/Labels wie im Classic-Flow (menu.json)
    const lv = this.state.menu.levels;
    const mkRow = (el, key, label, opts) => {
      el.innerHTML = `<div class="lbl">${label}</div><div class="opts">` + opts.map((o, i) => `
        <button data-idx="${i}" class="${this[key] === i ? 'active' : ''}">${o}</button>`).join('') + '</div>';
      el.querySelectorAll('button').forEach(b => {
        b.onclick = () => { this.haptic(); this[key] = Number(b.dataset.idx); this.renderCustomize(); };
      });
    };
    mkRow($('#sig-suesse-row'), 'suesse', lv.suesse.label, lv.suesse.optionen);
    mkRow($('#sig-eis-row'), 'eis', lv.eis.label, lv.eis.optionen);

    $('#sig-custom-price').textContent = formatPrice(this.totalPrice());
  }

  sizeDelta() {
    const sizes = this.menu.groessen || [];
    return sizes.find(s => s.id === this.size)?.delta ?? 0;
  }
  // Preis immer additiv aus Basis neu rechnen (nie relativ aufkumulieren)
  totalPrice() { return Math.max(0, Math.round((this.drink.preis + this.sizeDelta()) * 100) / 100); }

  // ---------- Bestellen über die bestehende Order-Pipeline ----------
  async placeOrder() {
    const d = this.drink;
    const lv = this.state.menu.levels;
    const preis = this.totalPrice();
    const order = await api.createOrder({
      drinkName: d.name,
      theme: null, // Signature-Drinks haben kein Konfigurator-Theme
      items: (d.zutaten || []).map(z => ({
        id: z.toLowerCase().replace(/[^a-zä-ü0-9]+/gi, '-'), name: z, kategorie: 'signature'
      })),
      levels: { suesse: this.suesse, eis: this.eis, size: this.size },
      allergene: d.allergene || [],
      preis
    });
    this.state.order = order;
    // Quelle für die Share-Card: Drink-Hero direkt + Bestell-Texte
    this.state.sigOrderMeta = {
      name: `${d.name} (${this.size})`,
      hero: d.hero,
      zutatenLine: (d.zutaten || []).join(' · '),
      detailLine: `Größe ${this.size} · ${lv.suesse.label} ${lv.suesse.optionen[this.suesse]} · ${lv.eis.label} ${lv.eis.optionen[this.eis]}`,
      preisText: formatPrice(preis),
      accent: (KATEGORIE_ACCENT[d.kategorie] || KATEGORIE_ACCENT.mocktail).accent
    };
    this.show('waiting');
    this.startWaiting();
  }
}
