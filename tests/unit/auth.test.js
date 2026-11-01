'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDeps, ev, member, parse, validTrade } = require('./helpers');
const { getConfig } = require('../../netlify/lib/config');
const { getStore } = require('../../netlify/lib/store');

const fn = (name, deps) => require(`../../netlify/functions/${name}`).makeHandler(deps);

test('no token gets 401 on every protected endpoint', async () => {
  const { deps } = makeDeps();
  for (const [name, method] of [['grade', 'POST'], ['ask', 'POST'], ['history', 'GET'], ['coach', 'GET'], ['me', 'GET'], ['redeem-invite', 'POST']]) {
    const r = await fn(name, deps)(ev(method, { body: {} }));
    assert.equal(r.statusCode, 401, name);
  }
});

test('an unknown token gets 401', async () => {
  const { deps } = makeDeps();
  const r = parse(await fn('grade', deps)(ev('POST', { token: 'forged-token', body: validTrade() })));
  assert.equal(r.status, 401);
});

test('signed in without an invite gets 403 NEEDS_INVITE', async () => {
  const { deps } = makeDeps();
  const r = parse(await fn('grade', deps)(ev('POST', { token: 'dev:new@example.com', body: validTrade() })));
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'NEEDS_INVITE');
});

test('invite redemption: bad code, good code, used up code', async () => {
  const { store, deps } = makeDeps();
  await store.createInvite({ code: 'ONE-TIME', role: 'student', max_uses: 1 });
  const redeem = fn('redeem-invite', deps);
  assert.equal((await redeem(ev('POST', { token: 'dev:a@example.com', body: { code: 'NOPE-NOPE' } }))).statusCode, 400);
  assert.equal((await redeem(ev('POST', { token: 'dev:a@example.com', body: { code: 'one-time' } }))).statusCode, 200);
  const used = parse(await redeem(ev('POST', { token: 'dev:b@example.com', body: { code: 'ONE-TIME' } })));
  assert.equal(used.status, 400);
  assert.match(used.body.error, /already been used/);
});

test('expired and paused invites are refused', async () => {
  const { store, deps } = makeDeps();
  await store.createInvite({ code: 'OLD-CODE', role: 'student', max_uses: 5, expires_at: new Date(Date.now() - 1000).toISOString() });
  await store.createInvite({ code: 'PAUSED', role: 'student', max_uses: 5, active: false });
  const redeem = fn('redeem-invite', deps);
  assert.match(parse(await redeem(ev('POST', { token: 'dev:a@example.com', body: { code: 'OLD-CODE' } }))).body.error, /expired/);
  assert.match(parse(await redeem(ev('POST', { token: 'dev:a@example.com', body: { code: 'PAUSED' } }))).body.error, /not valid/);
});

test('students cannot use the coach endpoint', async () => {
  const { store, deps } = makeDeps();
  const { token } = await member(store);
  const r = parse(await fn('coach', deps)(ev('GET', { token })));
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'NOT_COACH');
  const p = parse(await fn('coach', deps)(ev('POST', { token, body: { action: 'create_invite' } })));
  assert.equal(p.status, 403);
});

test('a coach can use the coach endpoint', async () => {
  const { store, deps } = makeDeps();
  const { token } = await member(store, 'coach@example.com', 'DEMO-COACH');
  assert.equal((await fn('coach', deps)(ev('GET', { token, query: { view: 'costs' } }))).statusCode, 200);
});

test('paused students are blocked', async () => {
  const { store, deps } = makeDeps();
  const { token, user } = await member(store);
  (await store.getProfile(user.id)).active = false;
  const r = parse(await fn('grade', deps)(ev('POST', { token, body: validTrade() })));
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'INACTIVE');
});

test('students only see their own history', async () => {
  const { store, deps } = makeDeps();
  const a = await member(store, 'a@example.com');
  const b = await member(store, 'b@example.com');
  await fn('grade', deps)(ev('POST', { token: a.token, body: validTrade() }));
  const hb = parse(await fn('history', deps)(ev('GET', { token: b.token })));
  assert.equal(hb.body.submissions.length, 0);
  const ha = parse(await fn('history', deps)(ev('GET', { token: a.token })));
  assert.equal(ha.body.submissions.length, 1);
});

test('dev sign in is refused on the production deploy', () => {
  assert.equal(getConfig({ ALLOW_DEV_AUTH: 'true', CONTEXT: 'production' }).devAuth, false);
  assert.equal(getConfig({ ALLOW_DEV_AUTH: 'true', CONTEXT: 'deploy-preview' }).devAuth, true);
  assert.equal(getConfig({ ALLOW_DEV_AUTH: 'true', SUPABASE_URL: 'https://x.supabase.co' }).devAuth, false);
});

test('no database configured returns a friendly 503, not a crash', async () => {
  const cfg = getConfig({ CONTEXT: 'production' });
  assert.throws(() => getStore(cfg), (e) => e.status === 503);
  const handler = require('../../netlify/functions/grade').makeHandler({ getConfig: () => cfg, getStore, ai: {} });
  assert.equal((await handler(ev('POST', { token: 'x', body: {} }))).statusCode, 503);
});

test('config endpoint never exposes secrets', async () => {
  const deps = { getConfig: () => getConfig({ ANTHROPIC_API_KEY: 'sk-ant-secret', SUPABASE_SERVICE_ROLE_KEY: 'service-secret', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }) };
  const r = await require('../../netlify/functions/config').makeHandler(deps)(ev('GET'));
  assert.ok(!r.body.includes('sk-ant-secret'));
  assert.ok(!r.body.includes('service-secret'));
  assert.ok(r.body.includes('anon'));
});
