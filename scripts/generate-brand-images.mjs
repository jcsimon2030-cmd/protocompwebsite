// Generates og-image.png (1200x630), apple-touch-icon.png (180x180),
// and favicon-32.png from the source brand assets, using headless Chromium.
// Usage: node scripts/generate-brand-images.mjs
import { chromium } from 'file:///C:/p4/p4-portal/node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataUri = (f) =>
  'data:image/png;base64,' +
  readFileSync(path.join(root, 'assets', 'brand', f)).toString('base64');
const out = (f) => path.join(root, 'assets', 'brand', f);

const browser = await chromium.launch();

async function shot(width, height, html, file) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await page.setContent(html);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out(file) });
  console.log(`${file} done`);
}

await shot(1200, 630, `
  <style>
    * { margin: 0; box-sizing: border-box; }
    body {
      width: 1200px; height: 630px; background: #000;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 40px; font-family: 'Segoe UI', system-ui, sans-serif;
      background-image:
        linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 48px 48px;
      border-top: 4px solid #00B7D7;
    }
    img { width: 620px; }
    .tag { color: #F0F0F0; font-size: 34px; font-weight: 600; letter-spacing: -0.01em; }
    .sub { color: rgba(255,255,255,0.45); font-size: 18px; font-family: Consolas, monospace; letter-spacing: 2.5px; text-transform: uppercase; }
  </style>
  <img src="${dataUri('logo-lockup.png')}" />
  <div class="tag">Train around your actual physiology.</div>
  <div class="sub">Train &middot; Fuel &middot; Check in &middot; Coach &mdash; protocomp.health</div>
`, 'og-image.png');

await shot(180, 180, `
  <style>* { margin:0 } body { width:180px; height:180px; background:#000 }
    img { width:180px; height:180px; object-fit:cover }</style>
  <img src="${dataUri('apple-touch-icon-src.png')}" />
`, 'apple-touch-icon.png');

await shot(32, 32, `
  <style>* { margin:0 } body { width:32px; height:32px; background:#000 }
    img { width:32px; height:32px; object-fit:cover }</style>
  <img src="${dataUri('favicon-512.png')}" />
`, 'favicon-32.png');

await browser.close();

// .app-domain OG variant (same card, app domain in the footer line)
const browser2 = await chromium.launch();
{
  const page = await (await browser2.newContext({ viewport: { width: 1200, height: 630 } })).newPage();
  await page.setContent(`
    <style>
      * { margin: 0; box-sizing: border-box; }
      body {
        width: 1200px; height: 630px; background: #000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 40px; font-family: 'Segoe UI', system-ui, sans-serif;
        background-image:
          linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
        background-size: 48px 48px;
        border-top: 4px solid #00B7D7;
      }
      img { width: 620px; }
      .tag { color: #F0F0F0; font-size: 34px; font-weight: 600; letter-spacing: -0.01em; }
      .sub { color: rgba(255,255,255,0.45); font-size: 18px; font-family: Consolas, monospace; letter-spacing: 2.5px; text-transform: uppercase; }
    </style>
    <img src="${dataUri('logo-lockup.png')}" />
    <div class="tag">Training and nutrition that adapt as your body changes.</div>
    <div class="sub">Natural &middot; Enhanced &middot; Coached &mdash; protocomp.app</div>
  `);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('og-image-app.png') });
  console.log('og-image-app.png done');
}
await browser2.close();
