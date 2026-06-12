async function j(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
  return res.json();
}

export const api = {
  menu: () => j('GET', '/api/menu'),
  signatureMenu: () => j('GET', '/api/signature-menu'),
  toggleSignatureDrink: (id, verfuegbar) => j('PATCH', `/api/admin/signature/${id}`, { verfuegbar }),
  setDefaultMode: (defaultMode) => j('PATCH', '/api/admin/config', { defaultMode }),
  createOrder: (order) => j('POST', '/api/orders', order),
  order: (id) => j('GET', `/api/orders/${id}`),
  orders: () => j('GET', '/api/orders'),
  setStatus: (id, status) => j('PATCH', `/api/orders/${id}`, { status }),
  toggleIngredient: (id, verfuegbar) => j('PATCH', `/api/admin/ingredient/${id}`, { verfuegbar }),
  setPrice: (id, preis) => j('PATCH', `/api/admin/ingredient/${id}`, { preis }),
  resetAdmin: () => j('POST', '/api/admin/reset'),
  highscore: () => j('GET', '/api/highscore'),
  submitScore: (initialen, score) => j('POST', '/api/highscore', { initialen, score })
};
