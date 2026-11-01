'use strict';
const Ajv = require('ajv');
const { CRITERIA, GRADES, scoreToGrade } = require('./rubric-config');

function criterionSchema(c, strict) {
  const score = strict ? { type: 'number', minimum: 0, maximum: c.weight } : { type: 'number' };
  const comment = strict ? { type: 'string', minLength: 1, maxLength: 600 } : { type: 'string' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['score', 'comment'],
    properties: { score, comment },
  };
}

function buildSchema(strict) {
  const str = (max) => (strict ? { type: 'string', minLength: 1, maxLength: max } : { type: 'string' });
  const arr = (items, min, max) => (strict ? { type: 'array', items, minItems: min, maxItems: max } : { type: 'array', items });
  const criteriaProps = {};
  for (const c of CRITERIA) criteriaProps[c.id] = criterionSchema(c, strict);
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'overall_grade', 'overall_score', 'criteria', 'did_well', 'main_mistake',
      'how_to_fix', 'review', 'chart_read', 'missing_info', 'confidence',
    ],
    properties: {
      overall_grade: { type: 'string', enum: GRADES },
      overall_score: strict ? { type: 'number', minimum: 0, maximum: 100 } : { type: 'number' },
      criteria: {
        type: 'object',
        additionalProperties: false,
        required: CRITERIA.map((c) => c.id),
        properties: criteriaProps,
      },
      did_well: arr(str(400), 1, 4),
      main_mistake: str(600),
      how_to_fix: str(800),
      review: arr({
        type: 'object',
        additionalProperties: false,
        required: ['term', 'why'],
        properties: { term: str(120), why: str(300) },
      }, 1, 3),
      chart_read: str(800),
      missing_info: arr(str(200), 0, 6),
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
  };
}

// Strict schema for local validation. Loose schema is what we send to the API
// as a structured output format (it accepts a smaller JSON Schema subset).
const GRADE_SCHEMA = buildSchema(true);
const GRADE_API_SCHEMA = buildSchema(false);

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn = ajv.compile(GRADE_SCHEMA);

function validateGrade(obj) {
  const ok = validateFn(obj);
  if (!ok) {
    return {
      valid: false,
      errors: validateFn.errors.map((e) => `${e.instancePath || '(root)'} ${e.message}`),
    };
  }
  return { valid: true, errors: [] };
}

// After schema validation: recompute the total and the letter so the grade
// always matches the rubric math, and remember if the model disagreed.
function normalizeGrade(obj) {
  const total = CRITERIA.reduce((sum, c) => sum + Number(obj.criteria[c.id].score), 0);
  const overall_score = Math.round(total * 10) / 10;
  const overall_grade = scoreToGrade(overall_score);
  return {
    ...obj,
    overall_score,
    overall_grade,
    model_reported: { overall_score: obj.overall_score, overall_grade: obj.overall_grade },
  };
}

// Pull a JSON object out of model text (handles stray prose or code fences).
function extractJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* fall through */ }
  }
  return null;
}

module.exports = { GRADE_SCHEMA, GRADE_API_SCHEMA, validateGrade, normalizeGrade, extractJson };
