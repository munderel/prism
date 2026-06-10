// Row-count parity check: every public table, both DBs.
import fs from 'fs';
import pkg from 'pg';
const { Client } = pkg;

const urls = JSON.parse(fs.readFileSync('.audit-urls.json', 'utf8'));

async function tableCounts(url) {
  const c = new Client({ connectionString: url });
  await c.connect();
  const t = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name NOT LIKE '\\_prisma\\_%' ESCAPE '\\' ORDER BY table_name`);
  const counts = {};
  for (const row of t.rows) {
    const r = await c.query(`SELECT count(*)::int AS n FROM ${JSON.stringify(row.table_name)}`);
    counts[row.table_name] = r.rows[0].n;
  }
  await c.end();
  return counts;
}

const oldCounts = await tableCounts(urls.oldDirect);
const newCounts = await tableCounts(urls.newDirect);

const rows = [];
let mismatches = 0;
for (const t of Object.keys(oldCounts).sort()) {
  const o = oldCounts[t];
  const n = newCounts[t] ?? 0;
  const match = o === n;
  if (!match) mismatches++;
  rows.push({ table: t, old: o, new: n, match: match ? '✓' : '✗' });
}
console.table(rows);
console.log(`\nTotal tables: ${rows.length}, mismatches: ${mismatches}`);
