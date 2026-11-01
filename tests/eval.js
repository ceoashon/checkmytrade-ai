#!/usr/bin/env node
'use strict';
// Grading evaluation + Q&A grounding test. Writes tests/REPORT.md.
//   npm run eval                 (mock mode unless ANTHROPIC_API_KEY is set)
//   EVAL_RUNS=5 npm run eval     (repeat each case 5 times for consistency)
//   EVAL_SKIP_UNIT=1 npm run eval
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const { getConfig } = require('../netlify/lib/config');
const ai = require('../netlify/lib/ai');
const { validateGradeInput } = require('../netlify/lib/validate');
const { tradeMath } = require('../netlify/lib/trade-math');
const { gradeRank } = require('../netlify/lib/rubric-config');
const knowledge = require('../netlify/lib/knowledge');

const RUNS = Math.max(1, parseInt(process.env.EVAL_RUNS || '3', 10));
const cfg = getConfig(process.env);
const MODE = cfg.mockAi ? 'MOCK' : 'LIVE';

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] || 'image/png';
}

function inRange(grade, range) {
  const r = gradeRank(grade), lo = gradeRank(range.min), hi = gradeRank(range.max);
  if (r == null || lo == null || hi == null) return null;
  return r >= Math.min(lo, hi) && r <= Math.max(lo, hi);
}

function stats(nums) {
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
  return { mean, sd, min: Math.min(...nums), max: Math.max(...nums) };
}

async function runGrading() {
  const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
  const results = [];
  for (const c of cases) {
    const imgPath = path.join(ROOT, c.image_path);
    if (!fs.existsSync(imgPath)) { results.push({ c, skipped: `image not found: ${c.image_path}` }); continue; }
    let trade;
    try {
      const image = `data:${mimeFor(imgPath)};base64,${fs.readFileSync(imgPath).toString('base64')}`;
      trade = validateGradeInput({ ...c.trade, image }, { maxImageBytes: 20 * 1024 * 1024 });
    } catch (e) {
      results.push({ c, skipped: `trade details incomplete: ${e.message}` });
      continue;
    }
    const math = tradeMath(trade);
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = Date.now();
      try {
        const r = await ai.gradeTrade({ cfg, trade, math });
        runs.push({ grade: r.grade.overall_grade, score: r.grade.overall_score, cost: r.cost, ms: Date.now() - t0, attempts: r.attempts, cacheRead: (r.usage || {}).cache_read_input_tokens || 0 });
      } catch (e) {
        runs.push({ error: e.code || e.message, ms: Date.now() - t0 });
      }
      process.stdout.write('.');
    }
    results.push({ c, runs });
  }
  process.stdout.write('\n');
  return results;
}

async function runQa() {
  const q = JSON.parse(fs.readFileSync(path.join(__dirname, 'qa-cases.json'), 'utf8'));
  const rows = [];
  for (const [group, expected] of [['answerable', true], ['not_in_knowledge', false]]) {
    for (const question of q[group]) {
      try {
        const r = await ai.askCourse({ cfg, question });
        rows.push({ group, question, expected, grounded: r.grounded, pass: r.grounded === expected, answer: r.answer, sources: r.sources, cost: r.cost });
      } catch (e) {
        rows.push({ group, question, expected, grounded: null, pass: false, answer: `ERROR: ${e.message}`, sources: [], cost: 0 });
      }
    }
  }
  return rows;
}

function runUnit() {
  if (process.env.EVAL_SKIP_UNIT) return null;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/unit/'.replace(/\/$/, '/*.test.js')], { cwd: ROOT, encoding: 'utf8', shell: false });
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (k) => { const m = new RegExp(`^# ${k} (\\d+)`, 'm').exec(out); return m ? Number(m[1]) : null; };
  return { tests: num('tests'), pass: num('pass'), fail: num('fail') };
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const money = (n) => `$${Number(n || 0).toFixed(4)}`;

function report({ unit, grading, qa, started }) {
  const k = knowledge.load();
  const L = [];
  L.push('# CheckMyTrade Test Report', '');
  L.push(`Generated ${new Date(started).toISOString()} by \`npm run eval\`.`, '');
  L.push(`- AI mode: **${MODE}**${MODE === 'MOCK' ? ' (no ANTHROPIC_API_KEY, so grades and answers come from the deterministic mock)' : ` (grading model ${cfg.gradeModel}, Q&A model ${cfg.qaModel})`}`);
  L.push(`- Runs per case: ${RUNS}`);
  L.push(`- Knowledge bundle: \`${k.hash}\`. Indicator spec ${k.status.specPending ? '**pending (source code missing)**' : 'extracted'}, chart legend ${k.status.legendPending ? '**pending**' : 'ready'}, glossary ${k.status.glossaryProvisional ? '**provisional**' : 'reviewed'}, study notes files: ${k.status.studyNotes}.`);
  L.push('');

  L.push('## 1. Unit tests', '');
  if (!unit) L.push('Skipped (EVAL_SKIP_UNIT set).');
  else L.push(`${unit.pass} of ${unit.tests} passed, ${unit.fail} failed. Covers input validation, JSON schema validation and retry, rate limiting, auth checks, coach overrides, calibration, and cost math.`);
  L.push('');

  L.push('## 2. Grading evaluation', '');
  const exampleCases = grading.filter((g) => g.c.source === 'example');
  if (!exampleCases.length) {
    L.push('> **No coach example screenshots yet.** `knowledge/examples/` is empty, so the only case below is a synthetic fixture that checks the pipeline end to end. Add screenshots, run `npm run cases:sync`, fill in the details and expected ranges, then run `npm run eval` again.', '');
  }
  L.push('| Case | Source | Expected | Grades over runs | Mean score | Score spread (sd) | Same grade every run | In expected range | Avg cost | Avg time |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  let inCount = 0, judged = 0;
  for (const g of grading) {
    if (g.skipped) { L.push(`| ${esc(g.c.id)} | ${esc(g.c.source)} | | skipped: ${esc(g.skipped)} | | | | | | |`); continue; }
    const ok = g.runs.filter((r) => !r.error);
    const errs = g.runs.filter((r) => r.error);
    if (!ok.length) { L.push(`| ${esc(g.c.id)} | ${esc(g.c.source)} | | all runs failed: ${esc(errs.map((e) => e.error).join(', '))} | | | | | | |`); continue; }
    const s = stats(ok.map((r) => r.score));
    const grades = ok.map((r) => r.grade);
    const counts = grades.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
    const modeShare = Math.max(...Object.values(counts)) / grades.length;
    const ranges = grades.map((x) => inRange(x, g.c.expected_grade_range));
    const hits = ranges.filter(Boolean).length;
    judged += ranges.length; inCount += hits;
    const exp = `${g.c.expected_grade_range.min} to ${g.c.expected_grade_range.max}${/NEEDS COACH REVIEW/.test(g.c.expected_range_status) ? ' (NEEDS COACH REVIEW)' : ''}`;
    L.push(`| ${esc(g.c.id)} | ${esc(g.c.source)} | ${esc(exp)} | ${esc(grades.join(', '))}${errs.length ? ` (+${errs.length} errors)` : ''} | ${s.mean.toFixed(1)} | ${s.sd.toFixed(2)} (${s.min} to ${s.max}) | ${(modeShare * 100).toFixed(0)}% | ${hits}/${ranges.length} | ${money(ok.reduce((a, r) => a + r.cost, 0) / ok.length)} | ${(ok.reduce((a, r) => a + r.ms, 0) / ok.length / 1000).toFixed(1)}s |`);
  }
  L.push('');
  L.push(`Overall: ${inCount}/${judged} graded runs landed in the expected range.`);
  if (MODE === 'MOCK') L.push('', 'Note: mock grades are deterministic by design, so consistency is always 100% in mock mode. Run with a real key to measure real grade consistency.');
  L.push('');

  L.push('## 3. Q&A grounding', '');
  const pass = qa.filter((r) => r.pass).length;
  const a = qa.filter((r) => r.group === 'answerable');
  const n = qa.filter((r) => r.group === 'not_in_knowledge');
  L.push(`${pass}/${qa.length} passed. Answerable questions answered: ${a.filter((r) => r.pass).length}/${a.length}. Out of scope questions declined: ${n.filter((r) => r.pass).length}/${n.length}.`, '');
  L.push('| Group | Question | Expected grounded | Got | Pass | Sources | Answer (start) |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of qa) {
    L.push(`| ${r.group} | ${esc(r.question)} | ${r.expected} | ${r.grounded} | ${r.pass ? 'PASS' : '**FAIL**'} | ${esc((r.sources || []).join(', '))} | ${esc(String(r.answer).slice(0, 110))} |`);
  }
  L.push('');
  L.push('## What this report can and cannot tell you yet', '');
  L.push('- The indicator spec and chart legend are placeholders until the Strat Trader Pine Script is uploaded, so real grading cannot judge indicator specific behavior yet.');
  L.push('- Expected grade ranges are the assistant\'s guesses and are marked NEEDS COACH REVIEW.');
  L.push('- The glossary is provisional, so "answerable" here means answerable from the provisional glossary.');
  return L.join('\n') + '\n';
}

(async () => {
  const started = Date.now();
  console.log(`CheckMyTrade eval in ${MODE} mode, ${RUNS} runs per case`);
  const unit = runUnit();
  if (unit) console.log(`unit tests: ${unit.pass}/${unit.tests} passed`);
  const grading = await runGrading();
  const qa = await runQa();
  const md = report({ unit, grading, qa, started });
  fs.writeFileSync(path.join(__dirname, 'REPORT.md'), md);
  const qaFails = qa.filter((r) => !r.pass).length;
  console.log(`grading cases: ${grading.length}, Q&A failures: ${qaFails}. Wrote tests/REPORT.md`);
  process.exitCode = qaFails || (unit && unit.fail) ? 1 : 0;
})();
