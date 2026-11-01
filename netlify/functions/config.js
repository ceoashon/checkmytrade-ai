'use strict';
// Public, non-secret settings the browser needs to start.
const { wrap, json, DISCLAIMER } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const knowledge = require('../lib/knowledge');

function makeHandler(deps = defaultDeps()) {
  return wrap('GET', async () => {
    const cfg = deps.getConfig();
    const k = knowledge.load();
    return json(200, {
      supabaseUrl: cfg.supabaseUrl || null,
      supabaseAnonKey: cfg.supabaseAnonKey || null,
      devAuth: cfg.devAuth,
      mockAi: cfg.mockAi,
      limits: { grades: cfg.dailyGradeLimit, questions: cfg.dailyQuestionLimit, timezone: cfg.rateLimitTz },
      knowledge: { hash: k.hash, ...k.status },
      disclaimer: DISCLAIMER,
    });
  });
}

module.exports = { makeHandler, handler: makeHandler() };
