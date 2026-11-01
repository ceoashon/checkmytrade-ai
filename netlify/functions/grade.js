'use strict';
const crypto = require('crypto');
const { wrap, json, parseJsonBody, HttpError, DISCLAIMER } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const { requireMember } = require('../lib/auth');
const { validateGradeInput } = require('../lib/validate');
const { tradeMath } = require('../lib/trade-math');
const { dayString } = require('../lib/store');

function toCalibration(rows) {
  return rows.map((r) => ({
    trade: { instrument: r.instrument, timeframe: r.timeframe, direction: r.direction, entry: r.entry, stop: r.stop, target: r.target, result: r.result, notes: r.notes },
    ai_grade: r.ai_grade, ai_score: r.ai_score,
    coach_grade: r.coach_grade || r.ai_grade, coach_score: r.coach_score, coach_comment: r.coach_comment,
  }));
}

function makeHandler(deps = defaultDeps()) {
  return wrap('POST', async (event) => {
    const cfg = deps.getConfig();
    const store = deps.getStore(cfg);
    const { user, profile } = await requireMember(event, store);
    const trade = validateGradeInput(parseJsonBody(event), { maxImageBytes: cfg.maxImageBytes });

    // Daily limit (coaches are exempt). Counted before the AI call, refunded on failure.
    const isCoach = profile.role === 'coach';
    const limit = profile.daily_grade_limit != null ? profile.daily_grade_limit : cfg.dailyGradeLimit;
    const day = dayString(cfg.rateLimitTz);
    let quota = { allowed: true, used: null };
    if (!isCoach) {
      quota = await store.consumeQuota(user.id, day, 'grade', limit);
      if (!quota.allowed) {
        throw new HttpError(429, `You have used all ${limit} trade grades for today. Great work putting in the reps! Your grades reset tomorrow.`, { code: 'DAILY_LIMIT', limit });
      }
    }

    const math = tradeMath(trade);
    let result;
    try {
      const calibration = toCalibration(await store.listCalibration(cfg.calibrationExamples));
      result = await deps.ai.gradeTrade({ cfg, trade, math, calibration });
    } catch (err) {
      if (!isCoach) await store.releaseQuota(user.id, day, 'grade');
      if (err && err.code === 'INVALID_OUTPUT') {
        throw new HttpError(502, 'The grader had trouble writing up your results. This did not count against your daily limit. Please try again.');
      }
      if (err && (err.status === 429 || err.status === 529 || err.status >= 500)) {
        throw new HttpError(503, 'The grader is busy right now. This did not count against your daily limit. Please try again in a minute.');
      }
      if (err && (err.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(String(err.message)))) {
        throw new HttpError(504, 'Grading took too long this time. This did not count against your daily limit. Please try again.');
      }
      throw err;
    }

    const id = crypto.randomUUID();
    let imagePath = null;
    try { imagePath = await store.uploadChart(user.id, id, trade.image); } catch (e) { console.error('[grade] upload failed', e); }

    const u = result.usage || {};
    const row = await store.insertSubmission({
      id,
      user_id: user.id,
      instrument: trade.instrument, timeframe: trade.timeframe, direction: trade.direction,
      entry: trade.entry, stop: trade.stop, target: trade.target, result: trade.result,
      contracts: trade.contracts, account_size: trade.account_size, notes: trade.notes,
      image_path: imagePath, math,
      ai_result: result.grade, ai_grade: result.grade.overall_grade, ai_score: result.grade.overall_score,
      model: result.model, mock: result.mock, attempts: result.attempts,
      input_tokens: u.input_tokens || 0, output_tokens: u.output_tokens || 0,
      cache_read_tokens: u.cache_read_input_tokens || 0, cache_write_tokens: u.cache_creation_input_tokens || 0,
      cost_usd: result.cost || 0,
    });

    return json(200, {
      submission_id: row.id,
      grade: result.grade,
      math,
      mock: result.mock,
      disclaimer: DISCLAIMER,
      usage: isCoach ? { unlimited: true } : { used: quota.used, limit },
    });
  });
}

module.exports = { makeHandler, handler: makeHandler(), toCalibration };
