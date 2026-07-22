import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const archive = process.argv[2]
  || '/Users/admin/Documents/workspaces/data/fairmenu-menu-sources/candidates';
const output = new URL('../review-candidates.js', import.meta.url);

const slugs = [];
for (const entry of await readdir(archive, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = path.join(archive, entry.name, 'source.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.review_status === 'needs_review' && manifest.tenant?.slug) {
      slugs.push(manifest.tenant.slug);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

slugs.sort((a, b) => a.localeCompare(b));
const body = `// Generated from the FairMenu source archive. Do not edit by hand.\n`
  + `// ${slugs.length} candidate sources currently need a human review.\n`
  + `export default ${JSON.stringify(slugs, null, 2)};\n`;
await writeFile(output, body);
console.log(`Wrote ${slugs.length} review candidates to ${output.pathname}`);
