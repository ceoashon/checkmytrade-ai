'use strict';
// MOCK MODE: realistic fake results so the app works end to end with no API key.
// Scores are deterministic for the same input, so eval consistency tests are stable.
const crypto = require('crypto');
const { CRITERIA, scoreToGrade } = require('./rubric-config');
const knowledge = require('./knowledge');

function seeded(str) {
  let h = crypto.createHash('sha256').update(str).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) { h = crypto.createHash('sha256').update(h).digest(); i = 0; }
    const v = h.readUInt32BE(i) / 0xffffffff;
    i += 4;
    return v;
  };
}

function mockGrade(trade, math) {
  const rand = seeded(JSON.stringify([trade.instrument, trade.timeframe, trade.direction, trade.entry, trade.stop, trade.target, trade.result, trade.notes, trade.image && trade.image.bytes]));
  const notes = (trade.notes || '').toLowerCase();
  const frac = {};
  // Heuristics that roughly mirror the rubric so fake grades feel believable.
  frac.timeframe_continuity = /ftfc|continuity|htf|higher time/.test(notes) ? 0.85 + rand() * 0.15 : 0.5 + rand() * 0.25;
  frac.setup_validity = /2-1-2|3-1-2|2-2|rev ?strat|1-2-2|inside bar|hammer|shooter/.test(notes) ? 0.75 + rand() * 0.25 : 0.45 + rand() * 0.3;
  frac.trigger = /trigger|break of|broke/.test(notes) ? 0.8 + rand() * 0.2 : 0.55 + rand() * 0.25;
  frac.entry_location = /chas|late|fomo/.test(notes) ? 0.2 + rand() * 0.2 : 0.65 + rand() * 0.3;
  frac.stop_placement = /moved (my )?stop|no stop/.test(notes) ? 0.1 + rand() * 0.2 : 0.6 + rand() * 0.35;
  const rr = math.rr || 0;
  frac.risk_reward = rr >= 3 ? 1 : rr >= 2 ? 0.9 : rr >= 1.5 ? 0.65 : rr >= 1 ? 0.4 : 0.1;
  frac.risk_sizing = math.pct_account_risk == null ? 0.5 : math.pct_account_risk <= 1 ? 0.95 : math.pct_account_risk <= 2 ? 0.6 : 0.2;
  frac.discipline = /revenge|moved (my )?stop|fomo|emotional|tilt/.test(notes) ? 0.15 + rand() * 0.2 : /plan|followed/.test(notes) ? 0.85 + rand() * 0.15 : 0.6 + rand() * 0.25;

  const comments = {
    timeframe_continuity: 'Mock mode: continuity was judged from your notes. Mention the higher timeframe colors next time so this can be checked.',
    setup_validity: 'Mock mode: setup scored from the pattern named in your notes.',
    trigger: 'Mock mode: trigger scored from your notes.',
    entry_location: 'Mock mode: entry location estimated from your notes.',
    stop_placement: 'Mock mode: stop placement estimated from your notes.',
    risk_reward: `Your planned risk to reward is ${rr ? rr.toFixed(2) : 'unknown'} to 1, based on the entry, stop, and target you entered.`,
    risk_sizing: math.pct_account_risk == null
      ? 'Contracts or account size were not provided, so this gets half credit.'
      : `This trade risked about ${math.pct_account_risk}% of the account at the stop.`,
    discipline: 'Mock mode: discipline scored from the words in your notes.',
  };
  const criteria = {};
  for (const c of CRITERIA) {
    const s = Math.round(Math.min(1, Math.max(0, frac[c.id])) * c.weight * 2) / 2;
    criteria[c.id] = { score: s, comment: comments[c.id] };
  }
  const total = CRITERIA.reduce((a, c) => a + criteria[c.id].score, 0);
  const weakest = CRITERIA.slice().sort((a, b) => criteria[a.id].score / a.weight - criteria[b.id].score / b.weight)[0];
  const strongest = CRITERIA.slice().sort((a, b) => criteria[b.id].score / b.weight - criteria[a.id].score / a.weight)[0];
  const missing = [];
  if (math.pct_account_risk == null) missing.push('Contracts and account size, so risk sizing can be checked.');
  if (!trade.notes) missing.push('Trade notes explaining the setup and your plan.');
  return {
    overall_grade: scoreToGrade(total),
    overall_score: total,
    criteria,
    did_well: [`Your strongest area on this trade was ${strongest.name.toLowerCase()}. Nice work keeping that consistent.`],
    main_mistake: `The biggest opportunity is ${weakest.name.toLowerCase()}.`,
    how_to_fix: `Before your next entry, write down how this trade meets the ${weakest.name.toLowerCase()} standard in the rubric, then only take it if it does.`,
    review: [{ term: weakest.review, why: `It covers the ${weakest.name.toLowerCase()} part of the rubric where you lost the most points.` }],
    chart_read: 'Mock mode: the chart image was received but not analyzed. Add an ANTHROPIC_API_KEY to get a real chart read.',
    missing_info: missing,
    confidence: 'low',
  };
}

const STOP = new Set('what is a an the of in on to do does how why when for and or my i me you your is are it this that with about explain mean means define tell can should'.split(' '));

function mockAnswer(question) {
  const words = question.toLowerCase().replace(/[^a-z0-9\- ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  if (!words.length) return null;
  let best = null;
  for (const s of knowledge.sections()) {
    const title = s.title.toLowerCase();
    const titleWords = title.replace(/[^a-z0-9\- ]/g, ' ').split(/\s+/).filter(Boolean);
    const hits = words.filter((w) => titleWords.includes(w) || title === w).length;
    const score = hits / Math.max(words.length, 1);
    if (hits && (!best || score > best.score)) best = { ...s, score };
  }
  return best && best.score >= 0.5 ? best : null;
}

function mockQa(question) {
  const hit = mockAnswer(question);
  if (!hit) {
    return {
      answer: 'That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, and it may get added to the knowledge base. (Mock mode)',
      grounded: false,
      sources: [],
    };
  }
  const body = hit.body
    .replace(/^\*\*[^*]+\*\*\n?/, '')
    .replace(/^#{2,3} .+\n?/, '')
    .replace(/^_.*_$/gm, '') // drop italic reviewer notes
    .replace(/[*_`]/g, '')
    .trim();
  const provisional = /provisional|NEEDS COACH REVIEW/i.test(hit.body) || hit.path.endsWith('glossary.md');
  return {
    answer: `${hit.title}: ${body.split('\n').filter(Boolean).slice(0, 4).join(' ')}${provisional ? ' Note: this definition is still being reviewed by the coach.' : ''} (Mock mode)`,
    grounded: true,
    sources: [hit.path],
  };
}

function mockUsage(kind) {
  return kind === 'grade'
    ? { input_tokens: 1800, output_tokens: 900, cache_read_input_tokens: 6200, cache_creation_input_tokens: 0 }
    : { input_tokens: 60, output_tokens: 150, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0 };
}

module.exports = { mockGrade, mockQa, mockUsage };
