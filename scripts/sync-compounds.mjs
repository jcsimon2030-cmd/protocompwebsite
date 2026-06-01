// Sync ProtoComp's compound corpus into the public marketing site.
//
// Reads the generated, source-backed corpus from the p4-portal app repo and
// emits two public-safe JSON snapshots consumed by the static encyclopedia and
// reconstitution calculator. READ-ONLY against p4-portal — never writes there.
//
// Re-run whenever the catalog is updated:
//   node scripts/sync-compounds.mjs [path-to-p4-portal]
// Defaults to ../p4/p4-portal relative to this repo.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const portal = resolve(process.argv[2] || resolve(repoRoot, '..', 'p4', 'p4-portal'));

const corpusPath = resolve(portal, 'lib/data/compound-reference-corpus.generated.ts');
const calPath = resolve(portal, 'lib/data/compound-calculator-catalog.generated.ts');
const candidatesPath = resolve(portal, 'lib/data/calculator-compounds.ts');

const INJECTABLE = new Set(['subcutaneous', 'intramuscular', 'iv']);

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Public-safe projection — mirrors the fields the app shows on /peptides/[slug].
function publicFields(name, c) {
  return {
    name: c.name || name,
    slug: slugify(name),
    aliases: c.aliases || [],
    category: c.category || 'other',
    evidenceQuality: c.evidenceQuality || null,
    mechanismOfAction: c.mechanismOfAction || null,
    routes: c.routes || [],
    publishedDoseRange: c.publishedDoseRange ?? null,
    publishedCycleRange: c.publishedCycleRange ?? null,
    publishedFrequency: c.publishedFrequency ?? null,
    timing: c.timing || null,
    safetyFlags: c.safetyFlags || null,
    sexSpecificGuidance: c.sexSpecificGuidance || null,
    legalStatus: c.legalStatus || null,
    commonStacks: c.commonStacks || [],
    stackWarnings: c.stackWarnings || [],
    commonMisconceptions: c.commonMisconceptions || [],
    keyCitations: c.keyCitations || [],
    injectable: (c.routes || []).some((r) => INJECTABLE.has(r)),
  };
}

async function readCandidateNames() {
  // calculator-compounds.ts can't be imported (path aliases); extract the
  // curated RECONSTITUTION_CANDIDATE_NAMES array literal directly.
  try {
    const src = await readFile(candidatesPath, 'utf8');
    const m = src.match(/RECONSTITUTION_CANDIDATE_NAMES\s*=\s*\[([\s\S]*?)\]/);
    if (!m) return null;
    return m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function main() {
  const corpusMod = await import(pathToFileURL(corpusPath).href);
  const corpus = corpusMod.COMPOUND_CORPUS_GENERATED || corpusMod.COMPOUND_CORPUS || {};

  const compounds = Object.entries(corpus)
    .map(([name, c]) => publicFields(name, c))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Reconstitution presets: curated candidate list if available, else any
  // injectable compound from the corpus.
  const candidateNames = await readCandidateNames();
  const candidateSet = candidateNames ? new Set(candidateNames.map(slugify)) : null;
  const presets = compounds
    .filter((c) => (candidateSet ? candidateSet.has(c.slug) : c.injectable))
    .map((c) => ({ name: c.name, slug: c.slug, category: c.category, routes: c.routes }));

  const categories = [...new Set(compounds.map((c) => c.category))].sort();
  const generatedAt = new Date().toISOString().slice(0, 10);

  await mkdir(resolve(repoRoot, 'data'), { recursive: true });
  await writeFile(
    resolve(repoRoot, 'data/peptides.json'),
    JSON.stringify({ generatedAt, count: compounds.length, categories, compounds }, null, 0),
  );
  await writeFile(
    resolve(repoRoot, 'data/calculator-presets.json'),
    JSON.stringify({ generatedAt, count: presets.length, presets }, null, 2),
  );

  console.log(`Synced ${compounds.length} compounds (${categories.length} categories), ${presets.length} reconstitution presets.`);
  console.log(`Source: ${portal}`);
}

main().catch((e) => {
  console.error('Sync failed:', e.message);
  process.exit(1);
});
