'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validTrade, validGradeJson, fakeClient, makeDeps, ev, member, parse } = require('./helpers');

const fn = (name, deps) => require(`../../netlify/functions/${name}`).makeHandler(deps);

async function setup(env, client) {
  const { store, deps } = makeDeps({ env, client });
  const student = await member(store, 'student@example.com');
  const coach = await member(store, 'coach@example.com', 'DEMO-COACH');
  const g = parse(await fn('grade', deps)(ev('POST', { token: student.token, body: validTrade() })));
  return { store, deps, student, coach, id: g.body.submission_id };
}

test('coach sees all submissions with student names and cost', async () => {
  const { deps, coach } = await setup();
  const r = parse(await fn('coach', deps)(ev('GET', { token: coach.token, query: { view: 'submissions' } })));
  assert.equal(r.body.submissions.length, 1);
  assert.equal(r.body.submissions[0].student, 'student@example.com');
  assert.ok(r.body.submissions[0].cost_usd > 0);
  assert.ok(r.body.submissions[0].image_url);
});

test('override validation', async () => {
  const { deps, coach, id } = await setup();
  const h = fn('coach', deps);
  const bad = async (body) => parse(await h(ev('POST', { token: coach.token, body: { action: 'override', id, ...body } }))).status;
  assert.equal(await bad({ coach_grade: 'Z' }), 400);
  assert.equal(await bad({ coach_score: 140 }), 400);
  assert.equal(await bad({ is_calibration: true }), 400);
  assert.equal(parse(await h(ev('POST', { token: coach.token, body: { action: 'override', id: '00000000-0000-0000-0000-000000000000', coach_grade: 'B' } }))).status, 404);
});

test('override shows up for the student, and calibration feeds the next grading prompt', async () => {
  const client = fakeClient([validGradeJson(), validGradeJson()]);
  const { deps, coach, student, id } = await setup({ ANTHROPIC_API_KEY: 'sk-test', ENABLE_REFUSAL_FALLBACK: 'false' }, client);
  const ok = parse(await fn('coach', deps)(ev('POST', { token: coach.token, body: { action: 'override', id, coach_grade: 'C+', coach_score: 78, coach_comment: 'Entry was before the trigger broke.', is_calibration: true } })));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.submission.coach_grade, 'C+');

  const hist = parse(await fn('history', deps)(ev('GET', { token: student.token })));
  assert.equal(hist.body.submissions[0].coach_grade, 'C+');
  assert.equal(hist.body.submissions[0].coach_comment, 'Entry was before the trigger broke.');

  await fn('grade', deps)(ev('POST', { token: student.token, body: validTrade() }));
  const sys = client.calls[1].system;
  assert.match(sys.at(-1).text, /Coach corrected to: C\+ \(78\)/);
  assert.match(sys.at(-1).text, /Entry was before the trigger broke/);
});

test('coach can create, list, and pause invite codes', async () => {
  const { deps, coach } = await setup();
  const h = fn('coach', deps);
  const c = parse(await h(ev('POST', { token: coach.token, body: { action: 'create_invite', role: 'student', max_uses: 3, expires_in_days: 30, note: 'Cohort' } })));
  assert.equal(c.status, 200);
  assert.match(c.body.invite.code, /^SC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const dup = parse(await h(ev('POST', { token: coach.token, body: { action: 'create_invite', code: c.body.invite.code } })));
  assert.equal(dup.status, 409);
  assert.equal(parse(await h(ev('POST', { token: coach.token, body: { action: 'create_invite', max_uses: 0 } }))).status, 400);
  const t = parse(await h(ev('POST', { token: coach.token, body: { action: 'toggle_invite', code: c.body.invite.code, active: false } })));
  assert.equal(t.body.invite.active, false);
  const list = parse(await h(ev('GET', { token: coach.token, query: { view: 'invites' } })));
  assert.ok(list.body.invites.some((i) => i.code === c.body.invite.code));
});

test('cost per student adds grade and question costs', async () => {
  const { deps, coach, student } = await setup();
  await fn('ask', deps)(ev('POST', { token: student.token, body: { question: 'What is an inside bar?' } }));
  const r = parse(await fn('coach', deps)(ev('GET', { token: coach.token, query: { view: 'costs' } })));
  const row = r.body.costs.find((x) => x.email === 'student@example.com');
  assert.equal(row.grades, 1);
  assert.equal(row.questions, 1);
  assert.ok(Math.abs(row.total_cost_usd - (row.grade_cost_usd + row.question_cost_usd)) < 1e-9);
});

test('every result carries the education only disclaimer', async () => {
  const { deps, student } = await setup();
  const g = parse(await fn('grade', deps)(ev('POST', { token: student.token, body: validTrade() })));
  assert.equal(g.body.disclaimer, 'Education only, not financial advice.');
  const a = parse(await fn('ask', deps)(ev('POST', { token: student.token, body: { question: 'What is FTFC?' } })));
  assert.equal(a.body.disclaimer, 'Education only, not financial advice.');
});
