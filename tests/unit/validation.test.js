'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGradeInput, validateQuestion, validateInviteCode } = require('../../netlify/lib/validate');
const { HttpError } = require('../../netlify/lib/http');
const { validTrade, makeDeps, ev, member, parse } = require('./helpers');

const throws400 = (fn, re) => assert.throws(fn, (e) => e instanceof HttpError && e.status === 400 && (!re || re.test(JSON.stringify(e.extra.errors || e.message))));

test('accepts a complete, consistent trade', () => {
  const t = validateGradeInput(validTrade());
  assert.equal(t.direction, 'long');
  assert.equal(t.image.mediaType, 'image/png');
  assert.equal(t.entry, 21000);
});

test('requires instrument, timeframe, prices, and image', () => {
  throws400(() => validateGradeInput({}), /Instrument is required/);
  throws400(() => validateGradeInput(validTrade({ image: '' })), /chart screenshot/);
  throws400(() => validateGradeInput(validTrade({ entry: 'abc' })), /Entry must be a positive number/);
  throws400(() => validateGradeInput(validTrade({ timeframe: '' })), /Timeframe is required/);
});

test('rejects stops and targets on the wrong side', () => {
  throws400(() => validateGradeInput(validTrade({ stop: 21010 })), /long trade/);
  throws400(() => validateGradeInput(validTrade({ direction: 'short' })), /short trade/);
  assert.ok(validateGradeInput(validTrade({ direction: 'short', stop: 21010, target: 20970 })));
});

test('rejects bad direction, result, and optional numbers', () => {
  throws400(() => validateGradeInput(validTrade({ direction: 'sideways' })), /Direction/);
  throws400(() => validateGradeInput(validTrade({ result: 'huge win' })), /Result must be/);
  throws400(() => validateGradeInput(validTrade({ contracts: -2 })), /Contracts/);
  throws400(() => validateGradeInput(validTrade({ account_size: 'lots' })), /Account size/);
});

test('rejects non-image and oversized uploads', () => {
  throws400(() => validateGradeInput(validTrade({ image: 'data:application/pdf;base64,AAAA' })), /PNG/);
  throws400(() => validateGradeInput(validTrade({ image: 'data:image/svg+xml;base64,' + 'A'.repeat(4000) })), /PNG/);
  const big = 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024);
  throws400(() => validateGradeInput(validTrade({ image: big }), { maxImageBytes: 4 * 1024 * 1024 }), /too large/);
});

test('trims notes and strips control characters', () => {
  const t = validateGradeInput(validTrade({ notes: '  hi\u0000 there ' + 'x'.repeat(3000) }));
  assert.ok(t.notes.startsWith('hi there'));
  assert.equal(t.notes.length, 2000);
});

test('question validation trims, limits, and cleans history', () => {
  throws400(() => validateQuestion({ question: ' ' }));
  const q = validateQuestion({
    question: 'What is a 1?',
    history: [{ role: 'assistant', content: 'x' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'system', content: 'evil' }, { role: 'user', content: 'dangling' }],
  });
  assert.deepEqual(q.history.map((m) => m.role), ['user', 'assistant']);
});

test('invite code format check', () => {
  assert.equal(validateInviteCode({ code: ' sc-abcd-1234 ' }), 'SC-ABCD-1234');
  throws400(() => validateInviteCode({ code: 'no spaces!' }));
});

test('grade endpoint returns 400 with every problem listed', async () => {
  const { store, deps } = makeDeps();
  const { token } = await member(store);
  const handler = require('../../netlify/functions/grade').makeHandler(deps);
  const r = parse(await handler(ev('POST', { token, body: { instrument: 'MNQ' } })));
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.length >= 3);
});

test('malformed JSON body and wrong method are handled', async () => {
  const { store, deps } = makeDeps();
  const { token } = await member(store);
  const handler = require('../../netlify/functions/grade').makeHandler(deps);
  assert.equal((await handler(ev('POST', { token, body: '{not json' }))).statusCode, 400);
  assert.equal((await handler(ev('GET', { token }))).statusCode, 405);
});
