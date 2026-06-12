// Signature-Gate: kuratierte Foto-Karte (Galerie -> Story -> Anpassen ->
// Order-Pipeline), Mode-Switch + Persistenz, Admin-Sold-out/Default,
// Share-Card mit Drink-Hero. Classic-Flow bleibt davon unberührt.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/admin/reset');
});

test('signature flow: Galerie -> Story -> Anpassen (L) -> Bestellung erreicht /bar inkl. Anpassungen', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('mode-signature').click();
  await expect(page.locator('[data-screen-id="sig-gallery"]')).toHaveClass(/active/, { timeout: 15000 });

  // Galerie: alle 7 Drinks, Kategorie-Filter wirkt
  await expect(page.locator('.sig-card')).toHaveCount(7);
  await page.locator('.sig-chip[data-cat="bubble-tea"]').click();
  await expect(page.locator('.sig-card')).toHaveCount(2);
  await page.locator('.sig-chip[data-cat=""]').click();
  await expect(page.locator('.sig-card')).toHaveCount(7);

  // Story: Name, Beschreibung, Zutaten, Allergen-Ampel, Preis
  await page.getByTestId('sig-drink-brown-sugar').click();
  await expect(page.locator('[data-screen-id="sig-story"]')).toHaveClass(/active/);
  await expect(page.locator('#sig-story-name')).toHaveText('Brown Sugar Milk Tea');
  await expect(page.locator('#sig-story-zutaten li')).toHaveCount(4);
  await expect(page.getByTestId('sig-allergene')).toContainText('Milch');
  await expect(page.locator('#sig-story-price')).toHaveText('6,20 €');

  // Anpassen: Größe L = +0,50 €, Süße/Eis wählbar — Preis additiv aus Basis
  await page.getByTestId('sig-customize').click();
  await expect(page.locator('[data-screen-id="sig-custom"]')).toHaveClass(/active/);
  await page.locator('#sig-size-row button[data-size="L"]').click();
  await expect(page.getByTestId('sig-price')).toHaveText('6,70 €');
  await page.locator('#sig-size-row button[data-size="S"]').click();
  await expect(page.getByTestId('sig-price')).toHaveText('5,70 €');
  await page.locator('#sig-size-row button[data-size="L"]').click();
  await page.locator('#sig-suesse-row button[data-idx="1"]').click();
  await page.locator('#sig-eis-row button[data-idx="3"]').click();

  // Bestellen -> bestehende Wartephase
  await page.getByTestId('sig-order').click();
  await expect(page.locator('[data-screen-id="waiting"]')).toHaveClass(/active/, { timeout: 15000 });
  await expect(page.getByTestId('status-story').locator('.story-step[data-status="eingegangen"]')).toHaveClass(/current/);

  // /bar sieht die Bestellung inkl. Anpassungen als Text
  const orderId = await page.evaluate(() => window.__mixr.state.order.id);
  const bar = await context.newPage();
  await bar.goto('/bar');
  const card = bar.locator(`.order-card[data-order="${orderId}"]`);
  await expect(card).toBeVisible({ timeout: 8000 });
  await expect(card).toContainText('Brown Sugar Milk Tea');
  await expect(card).toContainText('Tapioka-Perlen');
  await expect(card).toContainText('Größe L · Süße 25% · Eis viel');
  await expect(card).toContainText('6,70 €');
  await expect(card).toContainText('milch');
  await bar.close();
});

test('story-medien: Loop-Video spielt bei brown-sugar, Hero+Ken-Burns bei Drink ohne Loop', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-signature').click();
  await expect(page.locator('[data-screen-id="sig-gallery"]')).toHaveClass(/active/, { timeout: 15000 });

  // Drink mit Loop: Video crossfadet rein
  await page.getByTestId('sig-drink-brown-sugar').click();
  const video = page.getByTestId('sig-video');
  await expect(video).toHaveClass(/playing/, { timeout: 10000 });
  expect(await video.getAttribute('src')).toContain('signature-brown-sugar-loop.mp4');

  // zurück zur Galerie -> Stop-Pfad räumt das Video wirklich auf (LESSONS)
  await page.locator('#btn-sig-back').click();
  await expect(video).not.toHaveClass(/playing/);
  expect(await video.getAttribute('src')).toBeNull();

  // Drink ohne Loop: Hero bleibt, kein Video
  await page.getByTestId('sig-drink-mango-maracuja').click();
  await expect(page.locator('#sig-story-hero')).toBeVisible();
  await page.waitForTimeout(2000); // canplay-Timeout-Fenster verstreichen lassen
  await expect(video).not.toHaveClass(/playing/);
});

test('mode-persistenz: Wahl überlebt Reload (localStorage), Admin-Default greift ohne gemerkte Wahl', async ({ page, request }) => {
  // Admin-Default auf classic -> frische Gäste sehen Classic als Primär-CTA
  await request.patch('/api/admin/config', { data: { defaultMode: 'classic' } });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__mixr);
  expect(await page.evaluate(() => window.__mixr.state.mode)).toBe('classic');
  await expect(page.getByTestId('start')).not.toHaveClass(/ghost/);
  await expect(page.getByTestId('mode-signature')).toHaveClass(/ghost/);

  // User wählt Signature -> localStorage merkt sich das über Reload hinweg
  await page.getByTestId('mode-signature').click();
  await expect(page.locator('[data-screen-id="sig-gallery"]')).toHaveClass(/active/, { timeout: 15000 });
  await page.reload();
  await page.waitForFunction(() => !!window.__mixr);
  expect(await page.evaluate(() => window.__mixr.state.mode)).toBe('signature');
  await expect(page.getByTestId('mode-signature')).not.toHaveClass(/ghost/);

  // Classic bleibt von dort aus voll erreichbar (Parallelmodus)
  await page.getByTestId('start').click();
  await expect(page.locator('[data-screen-id="step1"]')).toHaveClass(/active/, { timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem('mixr-mode'))).toBe('classic');
});

test('admin sold-out: Signature-Drink wird live in der Galerie gesperrt und wieder freigegeben', async ({ page, request }) => {
  const r = await request.patch('/api/admin/signature/taro-milk-tea', { data: { verfuegbar: false } });
  expect(r.ok()).toBeTruthy();
  await page.goto('/');
  await page.getByTestId('mode-signature').click();
  const card = page.getByTestId('sig-drink-taro-milk-tea');
  await expect(card).toBeDisabled({ timeout: 15000 });
  await expect(card).toContainText('AUS');
  // wieder verfügbar -> Galerie-Polling hebt die Sperre live auf
  await request.patch('/api/admin/signature/taro-milk-tea', { data: { verfuegbar: true } });
  await expect(card).toBeEnabled({ timeout: 10000 });
});

test('share-card nutzt das Signature-Drink-Hero direkt', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('mode-signature').click();
  await expect(page.locator('[data-screen-id="sig-gallery"]')).toHaveClass(/active/, { timeout: 15000 });
  await page.getByTestId('sig-drink-strawberry-mojito').click();
  await page.getByTestId('sig-customize').click();
  await page.getByTestId('sig-order').click();
  await expect(page.locator('[data-screen-id="waiting"]')).toHaveClass(/active/, { timeout: 15000 });
  const orderId = await page.evaluate(() => window.__mixr.state.order.id);
  await request.patch(`/api/orders/${orderId}`, { data: { status: 'fertig' } });
  await expect(page.locator('[data-screen-id="done"]')).toHaveClass(/active/, { timeout: 10000 });
  await expect(page.locator('#pickup-nummer')).toContainText('M-');
  const img = page.locator('#share-card-slot img');
  await expect(img).toBeVisible({ timeout: 10000 });
  await expect(img).toHaveAttribute('data-bg', 'photoreal');
  expect(await page.evaluate(() => window.__mixr.state.sigOrderMeta?.hero)).toContain('signature-strawberry-mojito-hero.jpg');
});
