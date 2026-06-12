// MIXR admin mini view — toggle availability + edit prices, live effect.
import { api } from './api.js';

const KAT = { basis: 'Basis-Getränke', mix: 'Mix & Sirupe', topping: 'Toppings' };

async function render() {
  const menu = await api.menu();
  const lists = document.querySelector('#lists');
  lists.innerHTML = '';
  for (const [kat, label] of Object.entries(KAT)) {
    const h = document.createElement('h2');
    h.textContent = label;
    lists.appendChild(h);
    for (const ing of menu.ingredients.filter(i => i.kategorie === kat)) {
      const row = document.createElement('div');
      row.className = 'row' + (ing.verfuegbar === false ? ' soldout' : '');
      row.dataset.id = ing.id;
      row.innerHTML = `
        <div class="name">${ing.name}<small>${ing.themes.join(' · ')}</small></div>
        <input class="preis-input" type="number" step="0.1" min="0" value="${ing.preis}" aria-label="Preis" />
        <button class="toggle ${ing.verfuegbar !== false ? 'on' : ''}" aria-label="verfügbar" data-testid="toggle-${ing.id}"></button>`;
      const toggle = row.querySelector('.toggle');
      toggle.onclick = async () => {
        const newVal = !(toggle.classList.contains('on'));
        toggle.classList.toggle('on', newVal);
        row.classList.toggle('soldout', !newVal);
        await api.toggleIngredient(ing.id, newVal);
      };
      const inp = row.querySelector('.preis-input');
      inp.onchange = async () => { await api.setPrice(ing.id, Number(inp.value) || 0); };
      lists.appendChild(row);
    }
  }
}

// ---------- Signature-Karte: Sold-out-Toggles + Default-Modus ----------
async function renderSignature() {
  const wrap = document.querySelector('#signature-admin');
  if (!wrap) return;
  let menu;
  try { menu = await api.signatureMenu(); } catch { wrap.innerHTML = ''; return; }

  wrap.innerHTML = '<h2>Signature-Karte</h2><div class="mode-row" id="mode-row"></div><div id="sig-rows"></div>';

  // Default-Modus für Gäste ohne gemerkte Wahl (kleiner Toggle, kein Overengineering)
  const modeRow = wrap.querySelector('#mode-row');
  modeRow.innerHTML = `
    <span class="mode-lbl">Start-Modus für Gäste:</span>
    <button class="mode-btn ${menu.defaultMode !== 'classic' ? 'active' : ''}" data-mode="signature" data-testid="default-signature">Signature-Karte</button>
    <button class="mode-btn ${menu.defaultMode === 'classic' ? 'active' : ''}" data-mode="classic" data-testid="default-classic">Create your own</button>`;
  modeRow.querySelectorAll('.mode-btn').forEach(b => {
    b.onclick = async () => {
      await api.setDefaultMode(b.dataset.mode);
      modeRow.querySelectorAll('.mode-btn').forEach(x => x.classList.toggle('active', x === b));
    };
  });

  const rows = wrap.querySelector('#sig-rows');
  for (const d of menu.drinks) {
    const row = document.createElement('div');
    row.className = 'row' + (d.verfuegbar === false ? ' soldout' : '');
    row.dataset.id = d.id;
    row.innerHTML = `
      <div class="name">${d.name}<small>${d.kategorie} · ${d.preis.toFixed(2).replace('.', ',')} €</small></div>
      <button class="toggle ${d.verfuegbar !== false ? 'on' : ''}" aria-label="verfügbar" data-testid="toggle-sig-${d.id}"></button>`;
    const toggle = row.querySelector('.toggle');
    toggle.onclick = async () => {
      const newVal = !(toggle.classList.contains('on'));
      toggle.classList.toggle('on', newVal);
      row.classList.toggle('soldout', !newVal);
      await api.toggleSignatureDrink(d.id, newVal);
    };
    rows.appendChild(row);
  }
}

document.querySelector('#reset').onclick = async () => { await api.resetAdmin(); render(); renderSignature(); };
render();
renderSignature();
window.__mixrAdmin = { render, renderSignature };
