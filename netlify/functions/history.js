'use strict';
const { wrap, json, DISCLAIMER } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const { requireMember } = require('../lib/auth');

function publicSubmission(s) {
  return {
    id: s.id, created_at: s.created_at, instrument: s.instrument, timeframe: s.timeframe, direction: s.direction,
    entry: s.entry, stop: s.stop, target: s.target, result: s.result, notes: s.notes, math: s.math,
    grade: s.ai_result, ai_grade: s.ai_grade, ai_score: s.ai_score, mock: s.mock,
    coach_grade: s.coach_grade, coach_score: s.coach_score, coach_comment: s.coach_comment,
  };
}

function makeHandler(deps = defaultDeps()) {
  return wrap('GET', async (event) => {
    const cfg = deps.getConfig();
    const store = deps.getStore(cfg);
    const { user } = await requireMember(event, store);
    const rows = await store.listSubmissions({ userId: user.id, limit: 50 });
    return json(200, { submissions: rows.map(publicSubmission), disclaimer: DISCLAIMER });
  });
}

module.exports = { makeHandler, handler: makeHandler(), publicSubmission };
