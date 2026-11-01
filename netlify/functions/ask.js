'use strict';
const { wrap, json, parseJsonBody, HttpError, DISCLAIMER } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const { requireMember } = require('../lib/auth');
const { validateQuestion } = require('../lib/validate');
const { dayString } = require('../lib/store');

function makeHandler(deps = defaultDeps()) {
  return wrap('POST', async (event) => {
    const cfg = deps.getConfig();
    const store = deps.getStore(cfg);
    const { user, profile } = await requireMember(event, store);
    const { question, history } = validateQuestion(parseJsonBody(event));

    const isCoach = profile.role === 'coach';
    const limit = profile.daily_question_limit != null ? profile.daily_question_limit : cfg.dailyQuestionLimit;
    const day = dayString(cfg.rateLimitTz);
    let quota = { allowed: true, used: null };
    if (!isCoach) {
      quota = await store.consumeQuota(user.id, day, 'question', limit);
      if (!quota.allowed) {
        throw new HttpError(429, `You have asked all ${limit} questions for today. Love the curiosity! Your questions reset tomorrow.`, { code: 'DAILY_LIMIT', limit });
      }
    }

    let r;
    try {
      r = await deps.ai.askCourse({ cfg, question, history });
    } catch (err) {
      if (!isCoach) await store.releaseQuota(user.id, day, 'question');
      if (err && (err.status === 429 || err.status === 529 || err.status >= 500)) {
        throw new HttpError(503, 'The course assistant is busy right now. This did not count against your daily limit. Please try again in a minute.');
      }
      throw err;
    }

    const u = r.usage || {};
    await store.insertQuestion({
      user_id: user.id, question, answer: r.answer, grounded: r.grounded, sources: r.sources,
      model: r.model, mock: r.mock,
      input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0,
      cache_read_tokens: u.cache_read_input_tokens || 0, cache_write_tokens: u.cache_creation_input_tokens || 0,
      cost_usd: r.cost || 0,
    });

    return json(200, {
      answer: r.answer, grounded: r.grounded, sources: r.sources, mock: r.mock,
      disclaimer: DISCLAIMER,
      usage: isCoach ? { unlimited: true } : { used: quota.used, limit },
    });
  });
}

module.exports = { makeHandler, handler: makeHandler() };
