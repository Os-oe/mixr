// Photoreal-Gate: Attract-Video-Loop (theme-gemappt) + Sprite-Fallback +
// Share-Card mit fotorealistischem Hero-Hintergrund.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/admin/reset'); });

test('attract zeigt fotorealistisches Video bei bubble-tea, Start-Tap bleibt möglich', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('#attract-video');
  await expect(video).toHaveClass(/playing/, { timeout: 10000 });
  await expect(video).toBeVisible();
  expect(await video.getAttribute('src')).toContain('/assets/photoreal/attract-bubble-tea.mp4');
  // Boot-Race-Lesson: Start-Tap funktioniert und beendet den Loop sauber
  await page.getByTestId('start').click();
  await expect(page.locator('[data-screen-id="step1"]')).toHaveClass(/active/, { timeout: 15000 });
  await expect(video).toBeHidden();
});

test('attract fällt bei coffee (kein Loop produziert) auf Sprite-Explosion zurück', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__mixr);
  await page.evaluate(() => {
    window.__mixr.state.attractRunning = false;
    window.__mixr.startAttract('coffee');
  });
  await expect(page.locator('#attract-video')).not.toHaveClass(/playing/);
  await expect(page.locator('#attract-video')).toBeHidden();
  // Sprite-Fallback läuft: Beispiel-Drink füllt den Becher (pour + tapioka-Drop)
  await page.waitForFunction(
    () => (window.__mixr.cup.items.get('tapioka') || []).length > 0,
    null, { timeout: 15000 }
  );
});

test('share-card nutzt theme-gemapptes Hero-Bild als Hintergrund', async ({ page, request }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="bubble-tea"]').click();
  await page.locator('#base-cards .opt-card[data-id="taro"]').click();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await page.getByTestId('order').click();
  await expect(page.locator('[data-screen-id="waiting"]')).toHaveClass(/active/, { timeout: 20000 });
  const orderId = await page.evaluate(() => window.__mixr.state.order.id);
  await request.patch(`/api/orders/${orderId}`, { data: { status: 'fertig' } });
  await expect(page.locator('[data-screen-id="done"]')).toHaveClass(/active/, { timeout: 10000 });
  const img = page.locator('#share-card-slot img');
  await expect(img).toBeVisible({ timeout: 10000 });
  await expect(img).toHaveAttribute('data-bg', 'photoreal');
  expect(await img.getAttribute('src')).toMatch(/^data:image\/png/);
});
