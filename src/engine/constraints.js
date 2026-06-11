// MIXR constraint engine — pure functions over menu.json + selection.

export function themeIngredients(menu, themeId, kategorie) {
  return menu.ingredients.filter(i => i.kategorie === kategorie && i.themes.includes(themeId));
}

export function selectedIngredients(menu, ids) {
  return ids.map(id => menu.ingredients.find(i => i.id === id)).filter(Boolean);
}

export function selectionTags(menu, ids) {
  const tags = new Set();
  for (const ing of selectedIngredients(menu, ids)) for (const t of ing.tags || []) tags.add(t);
  return tags;
}

// Status of one candidate ingredient given current selection.
// -> { ok, soldout, reason }
export function ingredientStatus(menu, ing, selectedIds) {
  if (ing.verfuegbar === false) return { ok: false, soldout: true, reason: 'Heute aus' };
  const selTags = selectionTags(menu, selectedIds);
  for (const t of ing.inkompatibel_mit || []) {
    if (selTags.has(t)) return { ok: false, soldout: false, reason: reasonFor(t) };
  }
  for (const sel of selectedIngredients(menu, selectedIds)) {
    for (const t of sel.inkompatibel_mit || []) {
      if ((ing.tags || []).includes(t)) return { ok: false, soldout: false, reason: `Passt nicht zu ${sel.name}` };
    }
  }
  return { ok: true, soldout: false, reason: null };
}

function reasonFor(tag) {
  if (tag === 'heiss') return 'Nicht für heiße Drinks';
  if (tag === 'milchig') return 'Passt nicht zu Milch';
  if (tag === 'fruchtig') return 'Passt nicht zu Saft';
  return 'Nicht kombinierbar';
}

// Options for a step: every ingredient of the category in this theme,
// annotated with live status (sold-out / incompatible).
export function optionsFor(menu, themeId, kategorie, selectedIds) {
  return themeIngredients(menu, themeId, kategorie).map(ing => ({
    ing, ...ingredientStatus(menu, ing, selectedIds)
  }));
}

export function iceAllowed(menu, selectedIds) {
  const selTags = selectionTags(menu, selectedIds);
  for (const t of menu.levels?.eis?.inkompatibel_mit || []) {
    if (selTags.has(t)) return false;
  }
  return true;
}

export function aggregateAllergens(menu, ids) {
  const set = new Set();
  for (const ing of selectedIngredients(menu, ids)) for (const a of ing.allergene || []) set.add(a);
  return [...set];
}

export function totalPrice(menu, ids) {
  return selectedIngredients(menu, ids).reduce((s, i) => s + (i.preis || 0), 0);
}

export function formatPrice(n) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

const ADJ = ['Wilder', 'Sanfter', 'Frecher', 'Goldener', 'Kühler', 'Verspielter', 'Samtiger', 'Lässiger'];
const SUFFIX = { 'bubble-tea': ['Pearl-Traum', 'Boba-Beat', 'Cloud', 'Shake'], smoothie: ['Sunrise', 'Splash', 'Vibes', 'Glow'], coffee: ['Crema-Kick', 'Brew', 'Moment', 'Buzz'] };

export function drinkName(menu, themeId, baseId, seed = Date.now()) {
  const base = menu.ingredients.find(i => i.id === baseId);
  const adj = ADJ[seed % ADJ.length];
  const suf = (SUFFIX[themeId] || ['Mix'])[(seed >> 3) % (SUFFIX[themeId] || ['Mix']).length];
  return `${adj} ${(base?.name || 'Drink').split(' ')[0].replace(/-$/, '')} ${suf}`;
}
