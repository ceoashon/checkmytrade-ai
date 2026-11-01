'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validTrade, makeDeps, ev, member, parse, fakeClient } = require('./helpers');
const { dayString } = require('../../netlify/lib/store');

const gradeFn = (deps) => require('../../netlify/functions/grade').makeHandler(deps);
const askFn = (deps) => require('../../netlify/functions/ask').makeHandler(deps);

test('default limit is 5 grades per day, then a friendly 429', async () => {
  const { store, deps } = makeDeps();
  const { token } = await member(store);
  const h = gradeFn(deps);
  for (let i = 1; i <= 5; i++) {
    const r = parse(await h(ev('POST', { token, body: validTrade() })));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.usage, { used: i, limit: 5 });
  }
  const r = parse(await h(ev('POST', { token, body: validTrade() })));
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'DAILY_LIMIT');
  assert.ok(!/—/.test(r.body.error), 'no em dashes in user copy');
});

test('default limit is 20 questions per day', async () => {
  const { store, deps } = makeDeps();
  const { token } = await member(store);
  const h = askFn(deps);
  for (let i = 0; i < 20; i++) assert.equal((await h(ev('POST', { token, body: { question: 'What is an inside bar?' } }))).statusCode, 200);
  assert.equal((await h(ev('POST', { token, body: { question: 'What is an inside bar?' } }))).statusCode, 429);
});

test('limits are configurable by environment variable', async () => {
  const { store, deps } = makeDeps({ env: { DAILY_GRADE_LIMIT: '2' } });
  const { token } = await member(store);
  const h = gradeFn(deps);
  assert.equal((await h(ev('POST', { token, body: validTrade() }))).statusCode, 200);
  assert.equal((await h(ev('POST', { token, body: validTrade() }))).statusCode, 200);
  assert.equal((await h(ev('POST', { token, body: validTrade() }))).statusCode, 429);
});

test('a per student override beats the default', async () => {
  const { store, deps } = makeDeps();
  const { token, user } = await member(store);
  (await store.getProfile(user.id)).daily_grade_limit = 1;
  const h = gradeFn(deps);
  assert.equal((await h(ev('POST', { token, body: validTrade() }))).statusCode, 200);
  assert.equal((await h(ev('POST', { token, body: validTrade() }))).statusCode, 429);
});

test('students are not charged when the AI call fails', async () => {
  const client = fakeClient([Object.assign(new Error('overloaded'), { status: 529 })]);
  const { store, deps } = makeDeps({ env: { ANTHROPIC_API_KEY: 'sk-test', ENABLE_REFUSAL_FALLBACK: 'false' }, client });
  const { token, user } = await member(store);
  const r = parse(await gradeFn(deps)(ev('POST', { token, body: validTrade() })));
  assert.equal(r.status, 503);
  assert.match(r.body.error, /did not count/);
  const usage = await store.getUsage(user.id, dayString('America/New_York'));
  assert.equal(usage.grades, 0);
});

test('invalid input does not use quota', async () => {
  const { store, deps } = makeDeps();
  const { token, user } = await member(store);
  await gradeFn(deps)(ev('POST', { token, body: validTrade({ entry: '' }) }));
  assert.equal((await store.getUsage(user.id, dayString('America/New_York'))).grades, 0);
});

test('coaches have no daily limit', async () => {
  const { store, deps } = makeDeps({ env: { DAILY_GRADE_LIMIT: '1' } });
  const { token } = await member(store, 'coach@example.com', 'DEMO-COACH');
  const h = gradeFn(deps);
  for (let i = 0; i < 3; i++) {
    const r = parse(await h(ev('POST', { token, body: validTrade() })));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.usage, { unlimited: true });
  }
});

test('limits are per student', async () => {
  const { store, deps } = makeDeps({ env: { DAILY_GRADE_LIMIT: '1' } });
  const a = await member(store, 'a@example.com');
  const b = await member(store, 'b@example.com');
  const h = gradeFn(deps);
  assert.equal((await h(ev('POST', { token: a.token, body: validTrade() }))).statusCode, 200);
  assert.equal((await h(ev('POST', { token: a.token, body: validTrade() }))).statusCode, 429);
  assert.equal((await h(ev('POST', { token: b.token, body: validTrade() }))).statusCode, 200);
});

test('day boundary follows the configured time zone', () => {
  const t = new Date('2026-11-02T03:30:00Z'); // 10:30 pm Nov 1 in New York
  assert.equal(dayString('America/New_York', t), '2026-11-01');
  assert.equal(dayString('UTC', t), '2026-11-02');
});
