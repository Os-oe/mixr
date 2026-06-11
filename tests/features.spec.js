// Phase-3 gate: all 3 themes, upselling, waiting phase (game + highscore +
// fun facts), share card, true two-client device sync (separate contexts).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/admin/reset'); });

async function buildDrink(page, { theme, base, mix, topping }) {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator(`#theme-tabs button[data-theme="${theme}"]`).click();
  await page.locator(`#base-cards .opt-card[data-id="${base}"]`).click();
  await page.getByTestId('next').click();
  if (mix) await page.locator(`#mix-cards .chip[data-id="${mix}"]`).click();
  await page.getByTestId('next').click();
  if (topping) await page.locator(`#topping-chips .chip[data-id="${topping}"]`).click();
  await page.getByTestId('next').click();
}

test('smoothie theme completes end-to-end with theme accent + chia sprinkle', async ({ page }) => {
  await buildDrink(page, { theme: 'smoothie', base: 'mango-mix', mix: 'kokoswasser', topping: 'chia' });
  await expect(page.locator('#summary-price')).toContainText('7,20'); // 5.90+0.70+0.60
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent).toBe('#FFB347');
});

test('coffee theme: cream + caramel drizzle land as cup content', async ({ page }) => {
  await buildDrink(page, { theme: 'coffee', base: 'cold-brew', mix: 'karamell-sirup', topping: 'sahnehaube' });
  const hasCream = await page.evaluate(() => !!window.__mixr.cup.creamSprite);
  expect(hasCream).toBe(true);
  await expect(page.getByTestId('allergene')).toContainText('Milch');
});

test('upselling: max one suggestion, trial item drops in, yes adds topping', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="bubble-tea"]').click();
  await page.locator('#base-cards .opt-card[data-id="schwarztee"]').click();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await page.locator('#topping-chips .chip[data-id="tapioka"]').click();
  await expect(page.getByTestId('upsell')).toBeVisible({ timeout: 5000 });
  // trial sprite is in the cup
  const trial = await page.evaluate(() => (window.__mixr.cup.items.get('__upsell') || []).length);
  expect(trial).toBeGreaterThan(0);
  const suggested = await page.getByTestId('upsell').textContent();
  await page.getByTestId('upsell-yes').click();
  await page.waitForTimeout(900);
  const st = await page.evaluate(() => ({ toppings: window.__mixr.state.toppings, trial: (window.__mixr.cup.items.get('__upsell') || []).length }));
  expect(st.toppings.length).toBe(2);
  expect(st.trial).toBe(0);
  // no second suggestion
  await page.locator('#topping-chips .chip[data-id="minze"]').click();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('upsell')).toHaveCount(0);
});

test('two devices: bar context drives guest status, share card renders', async ({ browser }) => {
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const barCtx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await guestCtx.newPage();
  await buildDrink(page, { theme: 'bubble-tea', base: 'taro', mix: 'vollmilch', topping: 'tapioka' });
  await page.getByTestId('order').click();
  await expect(page.locator('[data-screen-id="waiting"]')).toHaveClass(/active/, { timeout: 20000 });

  const orderId = await page.evaluate(() => window.__mixr.state.order.id);
  const bar = await barCtx.newPage();
  await bar.goto('/bar');
  const card = bar.locator(`.order-card[data-order="${orderId}"]`);
  await expect(card).toBeVisible({ timeout: 8000 });

  // status story follows each bar action on the OTHER client
  await card.locator('button[data-next="in_arbeit"]').click();
  await expect(page.locator('.story-step[data-status="in_arbeit"]')).toHaveClass(/current/, { timeout: 8000 });
  await card.locator('button[data-next="fast_fertig"]').click();
  await expect(page.locator('.story-step[data-status="fast_fertig"]')).toHaveClass(/current/, { timeout: 8000 });
  await card.locator('button[data-next="fertig"]').click();
  await expect(page.locator('[data-screen-id="done"]')).toHaveClass(/active/, { timeout: 10000 });

  // share card image rendered
  await expect(page.locator('#share-card-slot img')).toBeVisible({ timeout: 10000 });
  const src = await page.locator('#share-card-slot img').getAttribute('src');
  expect(src).toMatch(/^data:image\/png/);
  await guestCtx.close(); await barCtx.close();
});

test('waiting phase: fun facts show, game runs and submits daily highscore', async ({ page, request }) => {
  await buildDrink(page, { theme: 'bubble-tea', base: 'matcha', mix: null, topping: 'tapioka' });
  await page.getByTestId('order').click();
  await expect(page.locator('[data-screen-id="waiting"]')).toHaveClass(/active/, { timeout: 20000 });
  // fun fact visible
  await expect(page.locator('#funfact-card')).toBeVisible();
  await expect(page.locator('#funfact-card')).toContainText(/Tapioka|Matcha/);
  // start game, score deterministically, force end
  await page.getByTestId('play-game').click();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForTimeout(800);
  const before = (await (await request.get('/api/highscore')).json()).entries.length;
  await page.evaluate(() => { const g = window.__mixrGame; g.score = 77; g.time = 0.05; ; 1 });
  await page.waitForTimeout(2600);
  const hs = await (await request.get('/api/highscore')).json();
  expect(hs.entries.length).toBeGreaterThan(before);
  expect(hs.entries.some(e => e.score === 77)).toBeTruthy();
});
