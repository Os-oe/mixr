// MIXR Phase-1 gate suite: full guest flow, constraint engine, sold-out live,
// menu.json hot-reload, bar sync, highscore API.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MENU = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'menu.json');

test.beforeEach(async ({ request }) => {
  await request.post('/api/admin/reset');
});

test('full flow: configure drink, order reaches /bar, bar drives status to done', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('start').click();

  // step 1: theme + base
  await page.locator('#theme-tabs button[data-theme="bubble-tea"]').click();
  await page.locator('#base-cards .opt-card[data-id="taro"]').click();
  await expect(page.locator('#base-cards .opt-card[data-id="taro"]')).toHaveClass(/selected/);
  await page.getByTestId('next').click();

  // step 2: mix + levels
  await page.locator('#mix-cards .chip[data-id="vollmilch"]').click();
  await expect(page.locator('#mix-cards .chip[data-id="vollmilch"]')).toHaveClass(/selected/);
  await page.getByTestId('next').click();

  // step 3: toppings
  await page.locator('#topping-chips .chip[data-id="tapioka"]').click();
  await expect(page.locator('#topping-chips .chip[data-id="tapioka"]')).toHaveClass(/selected/);
  await page.getByTestId('next').click();

  // summary: price + allergen traffic light
  await expect(page.locator('#summary-price')).toContainText('€');
  const priceText = await page.locator('#summary-price').textContent();
  expect(priceText).toMatch(/6,60/); // 5.40 taro + 0.40 vollmilch + 0.80 tapioka
  await expect(page.getByTestId('allergene')).toContainText('Milch');

  // order
  await page.getByTestId('order').click();
  await expect(page.locator('[data-screen-id="waiting"]')).toHaveClass(/active/, { timeout: 20000 });
  await expect(page.getByTestId('status-story').locator('.story-step[data-status="eingegangen"]')).toHaveClass(/current/);

  // bar tab (second client, same server) sees the order
  const orderId = await page.evaluate(() => window.__mixr.state.order.id);
  const bar = await context.newPage();
  await bar.goto('/bar');
  const card = bar.locator(`.order-card[data-order="${orderId}"]`);
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card).toContainText('Taro');

  // drive status: eingegangen -> in_arbeit -> fast_fertig -> fertig
  for (const next of ['in_arbeit', 'fast_fertig', 'fertig']) {
    await card.locator(`button[data-next="${next}"]`).click();
    await expect(card).toHaveAttribute('data-status', next, { timeout: 8000 });
  }
  // guest screen celebrates
  await expect(page.locator('[data-screen-id="done"]')).toHaveClass(/active/, { timeout: 10000 });
  await expect(page.locator('#pickup-nummer')).toContainText('M-');
  await bar.close();
});

test('constraint engine: hot espresso disables ice + cold toppings stay hidden', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="coffee"]').click();
  await page.locator('#base-cards .opt-card[data-id="espresso-heiss"]').click();
  await page.getByTestId('next').click();
  // ice level options >0 disabled
  const iceButtons = page.locator('#level-eis .opts button');
  await expect(iceButtons.nth(1)).toBeDisabled();
  await expect(iceButtons.nth(3)).toBeDisabled();
  await expect(page.locator('#level-eis')).toContainText('Kein Eis');
  // coffee theme must not offer tapioka at all
  await page.getByTestId('next').click();
  await expect(page.locator('#topping-chips .chip[data-id="tapioka"]')).toHaveCount(0);
  await expect(page.locator('#topping-chips .chip[data-id="sahnehaube"]')).toBeVisible();
});

test('constraint engine: juice excludes milk in smoothie theme', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="smoothie"]').click();
  await page.locator('#base-cards .opt-card[data-id="mango-mix"]').click();
  await page.getByTestId('next').click();
  await page.locator('#mix-cards .chip[data-id="orangensaft"]').click();
  await expect(page.locator('#mix-cards .chip[data-id="orangensaft"]')).toHaveClass(/selected/);
  // joghurt (milchig) now incompatible with fruchtig juice
  await expect(page.locator('#mix-cards .chip[data-id="joghurt"]')).toBeDisabled();
});

test('sold-out toggle via admin API applies live in guest flow', async ({ page, request }) => {
  const r = await request.patch('/api/admin/ingredient/tapioka', { data: { verfuegbar: false } });
  expect(r.ok()).toBeTruthy();
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="bubble-tea"]').click();
  await page.locator('#base-cards .opt-card[data-id="schwarztee"]').click();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  const chip = page.locator('#topping-chips .chip[data-id="tapioka"]');
  await expect(chip).toBeDisabled();
  await expect(chip).toContainText('aus');
  // back on: applies again
  await request.patch('/api/admin/ingredient/tapioka', { data: { verfuegbar: true } });
  await page.getByTestId('back').or(page.locator('#btn-back')).first().click();
  await page.getByTestId('next').click();
  await expect(page.locator('#topping-chips .chip[data-id="tapioka"]')).toBeEnabled();
});

test('menu.json edit (sold-out) is served live without code change', async ({ request }) => {
  const original = fs.readFileSync(MENU, 'utf8');
  try {
    const menu = JSON.parse(original);
    menu.ingredients.find(i => i.id === 'jasmintee').verfuegbar = false;
    fs.writeFileSync(MENU, JSON.stringify(menu));
    // bump mtime reliably
    const now = new Date();
    fs.utimesSync(MENU, now, now);
    const res = await request.get('/api/menu');
    const live = await res.json();
    expect(live.ingredients.find(i => i.id === 'jasmintee').verfuegbar).toBe(false);
  } finally {
    fs.writeFileSync(MENU, original);
  }
});

test('order API: create + status flow + bar list', async ({ request }) => {
  const created = await (await request.post('/api/orders', {
    data: { drinkName: 'Test Drink', theme: 'coffee', items: [{ id: 'espresso', name: 'Espresso', kategorie: 'basis' }], preis: 4.6 }
  })).json();
  expect(created.nummer).toMatch(/^M-\d{3}$/);
  expect(created.status).toBe('eingegangen');
  const list = await (await request.get('/api/orders')).json();
  expect(list.some(o => o.id === created.id)).toBeTruthy();
  await request.patch(`/api/orders/${created.id}`, { data: { status: 'fertig' } });
  const got = await (await request.get(`/api/orders/${created.id}`)).json();
  expect(got.status).toBe('fertig');
});

test('highscore API: submit + daily top list', async ({ request }) => {
  await request.post('/api/highscore', { data: { initialen: 'osm', score: 120 } });
  await request.post('/api/highscore', { data: { initialen: 'abc', score: 80 } });
  const hs = await (await request.get('/api/highscore')).json();
  expect(hs.entries[0].score).toBeGreaterThanOrEqual(hs.entries[1]?.score ?? 0);
  expect(hs.entries[0].initialen).toMatch(/^[A-Z0-9]{1,3}$/);
});
