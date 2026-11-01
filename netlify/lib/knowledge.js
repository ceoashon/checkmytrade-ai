'use strict';
// Loads the bundled knowledge files. Falls back to reading the folder directly
// when the generated bundle is missing (for example in a quick local test).
let bundle;
function load() {
  if (bundle) return bundle;
  try {
    bundle = require('./knowledge.generated.js');
  } catch {
    const crypto = require('crypto');
    const { collect, status } = require('../../scripts/build-knowledge.js');
    const files = collect();
    bundle = {
      hash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16),
      status: status(files),
      files,
    };
  }
  return bundle;
}

function render(files) {
  return files
    .map((f) => `<file path="${f.path}">\n${f.content.trim()}\n</file>`)
    .join('\n\n');
}

const GRADING_FILES = [
  'knowledge/derived/chart-legend.md',
  'knowledge/derived/indicator-spec.md',
  'knowledge/derived/glossary.md',
  'knowledge/derived/rubric.md',
];

function gradingKnowledge() {
  const b = load();
  const files = GRADING_FILES.map((p) => b.files.find((f) => f.path === p)).filter(Boolean);
  return render(files);
}

function qaKnowledge() {
  return render(load().files);
}

// Tiny keyword index used by mock Q&A so grounding still behaves sensibly.
function sections() {
  const out = [];
  for (const f of load().files) {
    const parts = f.content.split(/\n(?=\*\*[^*\n]+\*\*\n|#{2,3} )/);
    for (const p of parts) {
      const head = /^\*\*([^*\n]+)\*\*|^#{2,3} (.+)/.exec(p.trim());
      if (head) out.push({ path: f.path, title: (head[1] || head[2]).trim(), body: p.trim() });
    }
  }
  return out;
}

module.exports = { load, gradingKnowledge, qaKnowledge, sections, GRADING_FILES };
