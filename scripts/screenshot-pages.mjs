// Throwaway QA helper: screenshots the static marketing pages at desktop
// and mobile widths using the playwright install from the app repo.
// Usage: node scripts/screenshot-pages.mjs
import { chromium } from 'file:///C:/p4/p4-portal/node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.screenshots');
const base = process.env.BASE_URL ?? 'http://localhost:8123';
const pages = ['index', 'about', 'tech', 'faq', 'privacy', 'terms', '404'];

const browser = await chromium.launch();
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  for (const slug of pages) {
    await page.goto(`${base}/${slug === 'index' ? '' : slug}`);
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(outDir, `${slug}-${name}.png`),
      fullPage: true,
    });
    console.log(`shot ${slug} @ ${name}`);
  }
  // Mobile nav open state
  if (name === 'mobile') {
    await page.goto(`${base}/`);
    await page.click('.nav-toggle');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `nav-open-${name}.png`) });
    console.log(`shot nav-open @ ${name}`);
  }
  await ctx.close();
}
await browser.close();
