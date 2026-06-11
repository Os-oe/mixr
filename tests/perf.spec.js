// Phase-2 gate: 60-fps check under 4x CPU throttle (mid-range phone proxy)
// + visual snapshot of the configured cup with real sprites.
import { test, expect } from '@playwright/test';

test('animation holds ~60fps under 4x CPU throttle while pouring + dropping', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="bubble-tea"]').click();

  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // kick off pour + drops, measure median frame time during the busy window
  // (median is robust against startup/GC spikes; 60fps -> ~16.7ms)
  await page.locator('#base-cards .opt-card[data-id="taro"]').click();
  const stats = await page.evaluate(() => new Promise(res => {
    const deltas = [];
    let last = 0;
    const t0 = performance.now();
    function f(t) {
      if (last && t - t0 > 500) deltas.push(t - last); // 500ms warmup
      last = t;
      if (t - t0 < 2600) requestAnimationFrame(f);
      else {
        deltas.sort((a, b) => a - b);
        res({
          median: deltas[Math.floor(deltas.length / 2)],
          p90: deltas[Math.floor(deltas.length * 0.9)],
          n: deltas.length
        });
      }
    }
    requestAnimationFrame(f);
  }));
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`FPS @4x throttle: median ${(1000 / stats.median).toFixed(1)}fps (frame ${stats.median.toFixed(1)}ms, p90 ${stats.p90.toFixed(1)}ms, n=${stats.n})`);
  expect(stats.median).toBeLessThan(20); // >=50fps median under 4x throttle
});

test('visual: sprites land in cup (screenshot artifact)', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start').click();
  await page.locator('#theme-tabs button[data-theme="bubble-tea"]').click();
  await page.locator('#base-cards .opt-card[data-id="taro"]').click();
  await page.waitForTimeout(1700);
  await page.getByTestId('next').click();
  await page.locator('#mix-cards .chip[data-id="vollmilch"]').click();
  await page.waitForTimeout(1300);
  await page.getByTestId('next').click();
  await page.locator('#topping-chips .chip[data-id="tapioka"]').click();
  await page.waitForTimeout(1100);
  await page.locator('#topping-chips .chip[data-id="erdbeere"]').click();
  await page.waitForTimeout(1100);
  // sprites present in the pixi scene?
  const counts = await page.evaluate(() => {
    const m = window.__mixr;
    return {
      items: [...m.cup.items.keys()],
      sprites: [...m.cup.items.values()].flat().length
    };
  });
  expect(counts.items).toContain('tapioka');
  expect(counts.items).toContain('erdbeere');
  expect(counts.sprites).toBeGreaterThanOrEqual(3);
  await page.screenshot({ path: 'assets-src/_visual-step3.png' });
});
