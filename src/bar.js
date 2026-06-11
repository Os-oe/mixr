// MIXR Theken-Display — drives guest order status across devices.
import { api } from './api.js';

const NEXT = {
  eingegangen: { label: '▶ In Arbeit', status: 'in_arbeit', cls: 'primary' },
  in_arbeit: { label: '✨ Fast fertig', status: 'fast_fertig', cls: 'primary' },
  fast_fertig: { label: '✅ Fertig!', status: 'fertig', cls: 'done' },
  fertig: { label: '🛍 Abgeholt', status: 'abgeholt', cls: '' }
};

async function refresh() {
  let orders = [];
  try { orders = await api.orders(); } catch { return; }
  const main = document.querySelector('#orders');
  document.querySelector('#count').textContent = orders.filter(o => o.status !== 'fertig').length;
  if (!orders.length) {
    main.innerHTML = '<div class="empty">Noch keine Bestellungen — Gäste scannen den QR-Code.</div>';
    return;
  }
  main.innerHTML = orders.map(o => `
    <div class="order-card ${o.status}" data-order="${o.id}" data-status="${o.status}">
      <span class="age">${age(o.ts)}</span>
      <div class="nummer">${o.nummer} <span class="price">${o.preis.toFixed(2).replace('.', ',')} €</span></div>
      <div class="dname">${esc(o.drinkName)}</div>
      <div class="items">${o.items.map(i => esc(i.name)).join(' · ')}<br/>Süße ${['0%','25%','50%','75%','100%'][o.levels?.suesse ?? 2]} · Eis ${['kein','wenig','normal','viel'][o.levels?.eis ?? 2]}</div>
      ${o.allergene?.length ? `<div class="allergen">⚠ Allergene: ${o.allergene.join(', ')}</div>` : ''}
      <div class="actions">
        <button class="${NEXT[o.status]?.cls || ''}" data-id="${o.id}" data-next="${NEXT[o.status]?.status || ''}">${NEXT[o.status]?.label || '—'}</button>
      </div>
    </div>`).join('');
  main.querySelectorAll('button[data-next]').forEach(b => {
    b.onclick = async () => {
      if (!b.dataset.next) return;
      b.disabled = true;
      try { await api.setStatus(b.dataset.id, b.dataset.next); } catch {}
      refresh();
    };
  });
}

function age(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  return m < 1 ? 'gerade eben' : `vor ${m} min`;
}
function esc(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

refresh();
setInterval(refresh, 2000);
window.__mixrBar = { refresh };
