'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validTrade, validGradeJson, fakeClient, makeDeps, ev, member, parse } = require('./helpers');
const ai = require('../../netlify/lib/ai');
const { getConfig } = require('../../netlify/lib/config');
const { validateGradeInput } = require('../../netlify/lib/validate');
const { tradeMath } = require('../../netlify/lib/trade-math');
const { estimateCost } = require('../../netlify/lib/cost');
const { dayString } = require('../../netlify/lib/store');

const LIVE = { ANTHROPIC_API_KEY: 'sk-test', ENABLE_REFUSAL_FALLBACK: 'false' };
const trade = validateGradeInput(validTrade());
const math = tradeMath(trade);

test('mock mode turns on when no API key is set', async () => {
  const cfg = getConfig({});
  assert.equal(cfg.mockAi, true);
  const r = await ai.gradeTrade({ cfg, trade, math });
  assert.equal(r.mock, true);
  assert.match(r.grade.overall_grade, /^[A-DF][+-]?$/);
});

test('mock grades are deterministic for the same trade', async () => {
  const cfg = getConfig({});
  const a = await ai.gradeTrade({ cfg, trade, math });
  const b = await ai.gradeTrade({ cfg, trade, math });
  assert.deepEqual(a.grade, b.grade);
});

test('models come from environment variables, with the requested defaults', () => {
  const d = getConfig({});
  assert.equal(d.gradeModel, 'claude-sonnet-5-5');
  assert.equal(d.qaModel, 'claude-haiku-5-5');
  const o = getConfig({ GRADE_MODEL: 'claude-opus-5-5', QA_MODEL: 'claude-sonnet-5-5' });
  assert.equal(o.gradeModel, 'claude-opus-5-5');
  assert.equal(o.qaModel, 'claude-sonnet-5-5');
});

test('grading request: image, knowledge cache, structured output, model', async () => {
  const client = fakeClient([validGradeJson()]);
  const cfg = getConfig({ ...LIVE, GRADE_MODEL: 'claude-sonnet-5-5' });
  const r = await ai.gradeTrade({ cfg, trade, math, client });
  assert.equal(r.attempts, 1);
  const req = client.calls[0];
  assert.equal(req.model, 'claude-sonnet-5-5');
  assert.equal(req.messages[0].content[0].type, 'image');
  assert.equal(req.messages[0].content[0].source.media_type, 'image/png');
  assert.match(req.messages[0].content[1].text, /"computed"/);
  const knowledgeBlock = req.system.find((b) => b.text.includes('<knowledge>'));
  assert.deepEqual(knowledgeBlock.cache_control, { type: 'ephemeral' });
  for (const f of ['chart-legend.md', 'indicator-spec.md', 'glossary.md', 'rubric.md']) assert.ok(knowledgeBlock.text.includes(f), f);
  assert.equal(req.output_config.format.type, 'json_schema');
  // The cached prefix must not change between requests (no timestamps or ids).
  const client2 = fakeClient([validGradeJson()]);
  await ai.gradeTrade({ cfg, trade: validateGradeInput(validTrade({ notes: 'different' })), math, client: client2 });
  assert.deepEqual(client2.calls[0].system, req.system);
});

test('1 hour cache TTL is configurable', async () => {
  const client = fakeClient([validGradeJson()]);
  await ai.gradeTrade({ cfg: getConfig({ ...LIVE, CACHE_TTL: '1h' }), trade, math, client });
  assert.deepEqual(client.calls[0].system[1].cache_control, { type: 'ephemeral', ttl: '1h' });
});

test('invalid JSON is retried once and then accepted', async () => {
  const client = fakeClient(['this is not json', validGradeJson()]);
  const r = await ai.gradeTrade({ cfg: getConfig(LIVE), trade, math, client });
  assert.equal(r.attempts, 2);
  assert.equal(client.calls.length, 2);
  assert.match(client.calls[1].messages[0].content.at(-1).text, /did not match/);
  assert.equal(r.usage.input_tokens, 200, 'usage from both attempts is counted');
});

test('schema violations are retried once, then the handler fails gracefully and refunds', async () => {
  const bad = validGradeJson();
  bad.criteria.trigger.score = 99;
  const client = fakeClient([bad, bad]);
  await assert.rejects(ai.gradeTrade({ cfg: getConfig(LIVE), trade, math, client }), (e) => e.code === 'INVALID_OUTPUT');
  assert.equal(client.calls.length, 2);

  const client2 = fakeClient([bad, bad]);
  const { store, deps } = makeDeps({ env: LIVE, client: client2 });
  const { token, user } = await member(store);
  const r = parse(await require('../../netlify/functions/grade').makeHandler(deps)(ev('POST', { token, body: validTrade() })));
  assert.equal(r.status, 502);
  assert.equal((await store.getUsage(user.id, dayString('America/New_York'))).grades, 0);
});

test('the overall grade always matches the rubric math', async () => {
  const lying = validGradeJson({ overall_grade: 'A+', overall_score: 100 });
  const r = await ai.gradeTrade({ cfg: getConfig(LIVE), trade, math, client: fakeClient([lying]) });
  assert.equal(r.grade.overall_score, 92);
  assert.equal(r.grade.overall_grade, 'A-');
});

test('em dashes from the model are removed', async () => {
  const g = validGradeJson({ main_mistake: 'You chased \u2014 entry was late' });
  const r = await ai.gradeTrade({ cfg: getConfig(LIVE), trade, math, client: fakeClient([g]) });
  assert.equal(r.grade.main_mistake, 'You chased, entry was late');
});

test('refusal fallback is sent by default and dropped if the API rejects it', async () => {
  const rejected = Object.assign(new Error('400 unknown beta fallbacks'), { status: 400 });
  const client = fakeClient([rejected, validGradeJson()]);
  const r = await ai.gradeTrade({ cfg: getConfig({ ANTHROPIC_API_KEY: 'sk-test' }), trade, math, client });
  assert.equal(r.attempts, 1);
  assert.equal(client.calls[0].fallbacks, 'default');
  assert.deepEqual(client.calls[0].betas, [ai.FALLBACK_BETA]);
  assert.equal(client.calls[1].fallbacks, undefined);
});

test('a model refusal does not crash and does not charge the student', async () => {
  const client = fakeClient([() => ({ model: 'claude-sonnet-5-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 0 } })]);
  await assert.rejects(ai.gradeTrade({ cfg: getConfig(LIVE), trade, math, client }), (e) => e.code === 'INVALID_OUTPUT');
});

test('calibration examples are added to the grading prompt in their own cached block', async () => {
  const client = fakeClient([validGradeJson()]);
  const calibration = [{ trade: { direction: 'long', instrument: 'ES', timeframe: '5m', entry: 1, stop: 0.5, target: 2, result: 'win', notes: 'n' }, ai_grade: 'A', ai_score: 94, coach_grade: 'C', coach_score: 74, coach_comment: 'Entered before the trigger.' }];
  await ai.gradeTrade({ cfg: getConfig(LIVE), trade, math, calibration, client });
  const block = client.calls[0].system.at(-1);
  assert.match(block.text, /coach_calibration/);
  assert.match(block.text, /Entered before the trigger/);
  assert.ok(block.cache_control);
});

test('Q&A uses the Q&A model, caches knowledge, and returns grounded flags', async () => {
  const client = fakeClient([{ answer: 'An inside bar is a 1.', grounded: true, sources: ['knowledge/derived/glossary.md'] }]);
  const r = await ai.askCourse({ cfg: getConfig(LIVE), question: 'What is a 1?', client });
  assert.equal(client.calls[0].model, 'claude-haiku-5-5');
  assert.ok(client.calls[0].system[1].cache_control);
  assert.equal(r.grounded, true);
  assert.equal(r.cost, estimateCost('claude-haiku-5-5', { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 5000 }));
});

test('Q&A falls back to a polite decline on unparseable output', async () => {
  const r = await ai.askCourse({ cfg: getConfig(LIVE), question: 'What is a 1?', client: fakeClient(['garbage']) });
  assert.equal(r.grounded, false);
});

test('cost estimate uses per model pricing and cache rates', () => {
  const c = estimateCost('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 });
  assert.equal(c, 2 + 10 + 0.2 + 2.5);
  assert.equal(estimateCost('unknown-model', { input_tokens: 1e6 }), 0);
  const o = estimateCost('claude-sonnet-5-5', { input_tokens: 1e6 }, { override: '{"claude-sonnet-5-5":{"input":9,"output":0,"cache_read":0,"cache_write_5m":0}}' });
  assert.equal(o, 9);
});
