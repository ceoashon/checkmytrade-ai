'use strict';
const { CRITERIA } = require('./rubric-config');
const knowledge = require('./knowledge');

const VOICE = [
  'Voice: you are a warm, direct trading mentor at Solomon\'s Circle reviewing a student\'s work.',
  'Talk to the student as "you". Be encouraging and specific, never harsh, never vague.',
  'Never use em dashes or en dashes. Use commas, periods, or the word "to" instead.',
  'Never give trade signals, predictions, or financial advice. This is education only.',
].join('\n');

const GRADER_INSTRUCTIONS = `You are the CheckMyTrade grader for Solomon's Circle, a futures mentorship that teaches Rob Smith's TheStrat using the coach's Strat Trader TradingView indicator.

${VOICE}

How to grade:
1. Grade the PROCESS, not the outcome, using only the rubric in rubric.md. Score every criterion from 0 to its weight. The criteria and weights are: ${CRITERIA.map((c) => `${c.id} (${c.weight})`).join(', ')}.
2. Use the definitions in glossary.md. When a glossary entry is marked provisional, still use it, but do not present it as the coach's final word.
3. Read the chart using chart-legend.md and indicator-spec.md. If either says NOT YET EXTRACTED, follow its temporary instructions exactly: never assign meaning to Strat Trader colors, lines, labels, or tables. Read only plain candle structure and literal text.
4. The "computed" numbers in the trade details (risk points, reward points, R:R, dollar risk, percent of account) were calculated by the app and are correct. Use them instead of doing your own arithmetic.
5. If something needed for a criterion is missing or unreadable, give half of that criterion's weight, explain what was missing, and add it to missing_info.
6. If the image is not a trading chart, set confidence to "low", say so in chart_read, and grade only from the typed details.
7. If coach calibration examples are provided, match the coach's standards shown in them.
8. Every term in "review" must be a glossary term or a rubric lesson name.
9. chart_read is a short, factual description of what you can actually see on the chart (candle sequence near the entry, visible levels, timeframe if printed). Do not guess hidden information.
10. overall_score is the sum of the criterion scores. overall_grade follows the letter scale in rubric.md.

Respond with JSON only, matching the provided schema.`;

const QA_INSTRUCTIONS = `You are "Ask the Course", the study helper for Solomon's Circle, a futures mentorship that teaches Rob Smith's TheStrat with the coach's Strat Trader indicator.

${VOICE}

Grounding rules (these matter more than being helpful):
1. Answer ONLY from the knowledge files below. Do not use outside knowledge, even if you are confident it is correct.
2. If the files do not clearly answer the question, set grounded to false and reply warmly that this is not covered in the course materials yet, and suggest asking the coach. Do not guess or give a partial outside answer.
3. If the question is about live markets, a specific trade call, a prediction, or anything not in the files, it is not grounded.
4. If the source you used is marked PROVISIONAL or NEEDS COACH REVIEW, say briefly that it is still being reviewed by the coach.
5. If a file says NOT YET EXTRACTED, you cannot answer questions about what that file would cover.
6. List the file paths you used in sources. Keep answers short: a few sentences or a short list.

Respond with JSON only, matching the provided schema.`;

const QA_API_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'grounded', 'sources'],
  properties: {
    answer: { type: 'string' },
    grounded: { type: 'boolean' },
    sources: { type: 'array', items: { type: 'string' } },
  },
};

function cacheControl(ttl) {
  return ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}

function calibrationText(examples) {
  if (!examples || !examples.length) return '';
  const lines = examples.map((ex, i) => {
    const t = ex.trade || {};
    return [
      `Example ${i + 1}: ${t.direction || '?'} ${t.instrument || '?'} on ${t.timeframe || '?'}, entry ${t.entry}, stop ${t.stop}, target ${t.target}, result ${t.result}.`,
      `Student notes: ${t.notes || '(none)'}`,
      `AI graded: ${ex.ai_grade} (${ex.ai_score}). Coach corrected to: ${ex.coach_grade}${ex.coach_score != null ? ` (${ex.coach_score})` : ''}.`,
      `Coach comment: ${ex.coach_comment || '(none)'}`,
    ].join('\n');
  });
  return `<coach_calibration>\nThese are past grades the coach corrected. Learn the coach's standards from them.\n\n${lines.join('\n\n')}\n</coach_calibration>`;
}

// System blocks: static instructions + knowledge (cached), then calibration (cached separately
// so a new calibration example does not throw away the large knowledge cache).
function gradingSystem({ calibration = [], cacheTtl = '5m' } = {}) {
  const blocks = [
    { type: 'text', text: GRADER_INSTRUCTIONS },
    { type: 'text', text: `<knowledge>\n${knowledge.gradingKnowledge()}\n</knowledge>`, cache_control: cacheControl(cacheTtl) },
  ];
  const cal = calibrationText(calibration);
  if (cal) blocks.push({ type: 'text', text: cal, cache_control: cacheControl(cacheTtl) });
  return blocks;
}

function gradingUserContent(trade, math) {
  const details = {
    instrument: trade.instrument,
    timeframe: trade.timeframe,
    direction: trade.direction,
    entry: trade.entry,
    stop: trade.stop,
    target: trade.target,
    result: trade.result,
    contracts: trade.contracts,
    account_size: trade.account_size,
    student_notes: trade.notes || '(none)',
    computed: math,
  };
  return [
    { type: 'image', source: { type: 'base64', media_type: trade.image.mediaType, data: trade.image.data } },
    { type: 'text', text: `Please grade this trade.\n\n<trade_details>\n${JSON.stringify(details, null, 2)}\n</trade_details>` },
  ];
}

function qaSystem({ cacheTtl = '5m' } = {}) {
  return [
    { type: 'text', text: QA_INSTRUCTIONS },
    { type: 'text', text: `<knowledge>\n${knowledge.qaKnowledge()}\n</knowledge>`, cache_control: cacheControl(cacheTtl) },
  ];
}

// Belt and braces for the "never use em dashes" rule.
function scrubDashes(value) {
  if (typeof value === 'string') return value.replace(/\s*\u2014\s*/g, ', ').replace(/\u2013/g, '-');
  if (Array.isArray(value)) return value.map(scrubDashes);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDashes(v);
    return out;
  }
  return value;
}

module.exports = {
  GRADER_INSTRUCTIONS, QA_INSTRUCTIONS, QA_API_SCHEMA,
  gradingSystem, gradingUserContent, qaSystem, calibrationText, scrubDashes,
};
