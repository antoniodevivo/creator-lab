// Measures how often Laya agrees with Jev on hook mechanism, using a CSV of Jev-labelled Reels.
// The CSV needs the columns opening, mechanism and mechanismConfidence (the format of the published
// Creator Lab report spreadsheets). Same opening text, same question, one Laya call per row.
// Usage: node scripts/laya-vs-jev.mjs path/to/reels.csv
import { readFile } from 'node:fs/promises';
import { loadLaya } from '../lib/laya.mjs';
import { dimensions, guard } from '../lib/schema.mjs';

if (!process.argv[2]) { console.error('Usage: node scripts/laya-vs-jev.mjs path/to/reels.csv'); process.exit(1); }
const csv = await readFile(process.argv[2], 'utf8');
const rows = [];
{ let row = [], f = '', q = false;
  for (let i = 0; i < csv.length; i++) { const c = csv[i];
    if (q) { if (c === '"' && csv[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += c; } }
const [head, ...body] = rows;
for (const col of ['opening', 'mechanism', 'mechanismConfidence']) if (!head.includes(col)) { console.error(`CSV is missing the ${col} column`); process.exit(1); }
const posts = body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));

const laya = await loadLaya();
const q = dimensions.mechanism.question;
const question = { mechanism: { ...q, instructions: q.instructions.replace(guard, '') } };
const confusion = {};
let agree = 0, agreeConfident = 0, confident = 0;
const begin = Date.now();
for (const p of posts) {
  const r = await laya.systemOne({ opening: p.opening }, question);
  const got = r.answers.mechanism.choice;
  (confusion[p.mechanism] ??= {})[got] = (confusion[p.mechanism][got] || 0) + 1;
  if (got === p.mechanism) agree++;
  if (+p.mechanismConfidence >= 0.7) { confident++; if (got === p.mechanism) agreeConfident++; }
}
console.log(`${posts.length} openings in ${((Date.now() - begin) / 1000).toFixed(1)}s`);
console.log(`Hook mechanism agreement with Jev: ${(agree / posts.length * 100).toFixed(1)}% (${agree}/${posts.length})`);
console.log(`Where Jev confidence >= 0.70: ${(agreeConfident / confident * 100).toFixed(1)}% (${agreeConfident}/${confident})`);
console.log('Jev label -> Laya labels:');
for (const [k, v] of Object.entries(confusion).sort()) console.log(`  ${k.padEnd(14)} ${Object.entries(v).sort((a, b) => b[1] - a[1]).map(([x, n]) => `${x}:${n}`).join(' ')}`);
await laya.close();
