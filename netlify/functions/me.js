'use strict';
const { wrap, json } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const { authenticate } = require('../lib/auth');
const { dayString } = require('../lib/store');

function makeHandler(deps = defaultDeps()) {
  return wrap('GET', async (event) => {
    const cfg = deps.getConfig();
    const store = deps.getStore(cfg);
    const { user, profile } = await authenticate(event, store);
    const day = dayString(cfg.rateLimitTz);
    const usage = profile ? await store.getUsage(user.id, day) : { grades: 0, questions: 0 };
    const limits = {
      grades: profile && profile.daily_grade_limit != null ? profile.daily_grade_limit : cfg.dailyGradeLimit,
      questions: profile && profile.daily_question_limit != null ? profile.daily_question_limit : cfg.dailyQuestionLimit,
    };
    return json(200, {
      user: { id: user.id, email: user.email },
      profile: profile ? { role: profile.role, display_name: profile.display_name, active: profile.active } : null,
      usage, limits, day,
      unlimited: !!(profile && profile.role === 'coach'),
    });
  });
}

module.exports = { makeHandler, handler: makeHandler() };
