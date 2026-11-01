'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGrade, normalizeGrade, extractJson, GRADE_API_SCHEMA } = require('../../netlify/lib/grade-schema');
const { scoreToGrade, CRITERIA, TOTAL_POINTS } = require('../../netlify/lib/rubric-config');
const { validGradeJson } = require('./helpers');

test('rubric weights add to 100', () => assert.equal(TOTAL_POINTS, 100));

test('a well formed grade passes', () => {
  assert.deepEqual(validateGrade(validGradeJson()), { valid: true, errors: [] });
});

test('missing fields fail', () => {
  const g = validGradeJson();
  delete g.main_mistake;
  const r = validateGrade(g);
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /main_mistake/);
});

test('missing criterion fails', () => {
  const g = validGradeJson();
  delete g.criteria.discipline;
  assert.equal(validateGrade(g).valid, false);
});

test('criterion score above its weight fails', () => {
  const g = validGradeJson();
  g.criteria.risk_reward.score = 11;
  assert.equal(validateGrade(g).valid, false);
});

test('unknown grade letter and extra properties fail', () => {
  assert.equal(validateGrade(validGradeJson({ overall_grade: 'E' })).valid, false);
  assert.equal(validateGrade(validGradeJson({ surprise: true })).valid, false);
  assert.equal(validateGrade(validGradeJson({ confidence: 'very' })).valid, false);
});

test('review must have 1 to 3 items', () => {
  assert.equal(validateGrade(validGradeJson({ review: [] })).valid, false);
  const four = Array.from({ length: 4 }, () => ({ term: 'Stop', why: 'x' }));
  assert.equal(validateGrade(validGradeJson({ review: four })).valid, false);
});

test('normalize recomputes the total and letter from criteria', () => {
  const g = validGradeJson({ overall_grade: 'A+', overall_score: 100 });
  const n = normalizeGrade(g);
  assert.equal(n.overall_score, 92);
  assert.equal(n.overall_grade, 'A-');
  assert.deepEqual(n.model_reported, { overall_score: 100, overall_grade: 'A+' });
});

test('letter scale boundaries', () => {
  const cases = [[100, 'A+'], [97, 'A+'], [96.6, 'A+'], [93, 'A'], [90, 'A-'], [89, 'B+'], [80, 'B-'], [70, 'C-'], [60, 'D-'], [59, 'F'], [0, 'F'], [-5, 'F']];
  for (const [s, g] of cases) assert.equal(scoreToGrade(s), g, `score ${s}`);
});

test('extractJson tolerates fences and stray prose', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":1} thanks'), { a: 1 });
  assert.equal(extractJson('no json here'), null);
});

test('API schema requires every criterion and avoids numeric constraints', () => {
  assert.deepEqual(GRADE_API_SCHEMA.properties.criteria.required, CRITERIA.map((c) => c.id));
  assert.ok(!JSON.stringify(GRADE_API_SCHEMA).includes('maximum'));
});
