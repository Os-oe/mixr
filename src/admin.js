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

document.querySelector('#reset').onclick = async () => { await api.resetAdmin(); render(); };
render();
window.__mixrAdmin = { render };
