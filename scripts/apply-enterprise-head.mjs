// One-shot transform: per-page canonical + OG/Twitter meta, favicon set,
// logo lockup in nav/footer, mobile nav toggle, skip link, clean URLs.
// Usage: node scripts/apply-enterprise-head.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://protocomp.health';

const PAGES = {
  'index.html': '/',
  'about.html': '/about',
  'tech.html': '/tech',
  'faq.html': '/faq',
  'tools.html': '/tools',
  'peptides.html': '/peptides',
  'reconstitution.html': '/reconstitution',
};

const LINK_MAP = [
  ['href="index.html#waitlist"', 'href="/#waitlist"'],
  ['href="index.html"', 'href="/"'],
  ['href="about.html"', 'href="/about"'],
  ['href="tech.html"', 'href="/tech"'],
  ['href="faq.html"', 'href="/faq"'],
  ['href="tools.html"', 'href="/tools"'],
  ['href="peptides.html"', 'href="/peptides"'],
  ['href="reconstitution.html"', 'href="/reconstitution"'],
];

for (const [file, route] of Object.entries(PAGES)) {
  const p = path.join(root, file);
  let html = readFileSync(p, 'utf8');

  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? 'ProtoComp';
  const desc =
    (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '';
  const canon = SITE + route;

  const headBlock = `  <link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/brand/favicon-512.png" />
  <link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png" />
  <meta name="theme-color" content="#000000" />
  <link rel="canonical" href="${canon}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="ProtoComp" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${canon}" />
  <meta property="og:image" content="${SITE}/assets/brand/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${SITE}/assets/brand/og-image.png" />
`;

  if (!html.includes('rel="canonical"')) {
    html = html.replace('  <link rel="stylesheet" href="styles.css" />', headBlock + '  <link rel="stylesheet" href="styles.css" />');
  }

  // Clean URLs for internal links
  for (const [from, to] of LINK_MAP) html = html.split(from).join(to);

  // Nav brand → logo lockup, add mobile toggle
  html = html.replace(
    /<a href="\/" class="nav-brand">proto<b>comp<\/b><\/a>/,
    '<a href="/" class="nav-brand"><img src="/assets/brand/logo-lockup.png" alt="ProtoComp" /></a>'
  );
  if (!html.includes('nav-toggle')) {
    html = html.replace(
      /(<\/div>\s*<\/div>\s*<\/nav>)/,
      '</div>\n      <button class="nav-toggle" type="button" aria-label="Menu" aria-expanded="false"></button>\n    </div>\n  </nav>'
    );
  }

  // Footer brand → logo lockup
  html = html.replace(
    /<a href="\/" class="nav-brand" style="display: inline-block; margin-bottom: 12px;">proto<b>comp<\/b><\/a>/,
    '<a href="/" class="footer-brand"><img src="/assets/brand/logo-lockup.png" alt="ProtoComp" /></a>'
  );

  // Skip link + content anchor
  if (!html.includes('skip-link')) {
    html = html.replace(/(<body[^>]*>)/, '$1\n  <a class="skip-link" href="#content">Skip to content</a>');
    html = html.replace('</nav>', '</nav>\n  <span id="content"></span>');
  }

  // Shared JS
  if (!html.includes('assets/site.js')) {
    html = html.replace('</body>', '  <script src="/assets/site.js" defer></script>\n</body>');
  }

  writeFileSync(p, html);
  console.log(`done: ${file} (${title})`);
}
