#!/usr/bin/env node
'use strict';
// Adds a stub to tests/cases.json for every screenshot in knowledge/examples/
// that does not have a case yet. Never overwrites existing cases.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EX = path.join(ROOT, 'knowledge', 'examples');
const FILE = path.join(ROOT, 'tests', 'cases.json');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const have = new Set(data.cases.map((c) => c.image_path));
const shots = fs.existsSync(EX) ? fs.readdirSync(EX).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : [];
let added = 0;
for (const f of shots) {
  const rel = `knowledge/examples/${f}`;
  if (have.has(rel)) continue;
  data.cases.push({
    id: f.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    source: 'example',
    filename: f,
    image_path: rel,
    details_source: 'NEEDS COACH INPUT: fill in what is visible on the chart or known about the trade.',
    trade: { instrument: '', timeframe: '', direction: 'long', entry: null, stop: null, target: null, result: 'win', contracts: null, account_size: null, notes: '' },
    expected_grade_range: { min: 'C', max: 'A' },
    expected_range_status: 'NEEDS COACH REVIEW',
    why: 'Placeholder range. Replace with your expected grades.',
  });
  added++;
}
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(`${shots.length} screenshots in knowledge/examples, ${added} new case stubs added, ${data.cases.length} cases total.`);
