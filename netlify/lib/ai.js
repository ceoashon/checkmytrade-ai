'use strict';
// Calls Claude (or mock mode) for grading and Q&A.
const Anthropic = require('@anthropic-ai/sdk');
const prompts = require('./prompts');
const { GRADE_API_SCHEMA, validateGrade, normalizeGrade, extractJson } = require('./grade-schema');
const { mockGrade, mockQa, mockUsage } = require('./mock');
const { estimateCost } = require('./cost');

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function makeClient(cfg) {
  return new Anthropic({ apiKey: cfg.anthropicKey, maxRetries: 1, timeout: cfg.gradeTimeoutMs });
}

function addUsage(a, b) {
  const keys = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
  const out = {};
  for (const k of keys) out[k] = (a?.[k] || 0) + (b?.[k] || 0);
  return out;
}

function textOf(message) {
  return (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

// Sends a request. Uses the server-side refusal fallback when enabled, and quietly
// drops it if the API rejects the beta (so a beta change never breaks grading).
async function send(client, cfg, params, { allowFallback }) {
  if (allowFallback && cfg.refusalFallback && client.beta && client.beta.messages) {
    try {
      return await client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' });
    } catch (err) {
      if (err && err.status === 400 && /fallback|beta/i.test(String(err.message))) {
        console.warn('[ai] refusal fallback rejected, retrying without it:', err.message);
      } else {
        throw err;
      }
    }
  }
  return client.messages.create(params);
}

/**
 * Grade a trade. Returns { grade, usage, cost, model, mock, attempts }.
 * Validates the JSON against the schema and retries once on failure.
 */
async function gradeTrade({ cfg, trade, math, calibration = [], client, now = () => Date.now() }) {
  if (cfg.mockAi) {
    const usage = mockUsage('grade');
    const grade = prompts.scrubDashes(normalizeGrade(mockGrade(trade, math)));
    return { grade, usage, cost: estimateCost(cfg.gradeModel, usage, { cacheTtl: cfg.cacheTtl, override: cfg.pricingOverride }), model: cfg.gradeModel, mock: true, attempts: 1 };
  }
  client = client || makeClient(cfg);
  const started = now();
  const system = prompts.gradingSystem({ calibration, cacheTtl: cfg.cacheTtl });
  const userContent = prompts.gradingUserContent(trade, math);
  let usage = {};
  let lastErrors = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const messages = [{ role: 'user', content: userContent }];
    if (attempt === 2) {
      messages[0] = {
        role: 'user',
        content: [
          ...userContent,
          { type: 'text', text: `Your previous answer did not match the required JSON schema. Problems: ${lastErrors.slice(0, 8).join('; ')}. Reply again with JSON only, matching the schema exactly.` },
        ],
      };
    }
    const params = {
      model: cfg.gradeModel,
      max_tokens: cfg.gradeMaxTokens,
      system,
      messages,
      output_config: { effort: cfg.gradeEffort, format: { type: 'json_schema', schema: GRADE_API_SCHEMA } },
    };
    const msg = await send(client, cfg, params, { allowFallback: true });
    usage = addUsage(usage, msg.usage);
    if (msg.stop_reason === 'refusal') {
      lastErrors = ['The model declined to grade this request.'];
      break;
    }
    const parsed = extractJson(textOf(msg));
    const check = parsed ? validateGrade(parsed) : { valid: false, errors: ['Response was not valid JSON.'] };
    if (check.valid) {
      const grade = prompts.scrubDashes(normalizeGrade(parsed));
      return { grade, usage, cost: estimateCost(cfg.gradeModel, usage, { cacheTtl: cfg.cacheTtl, override: cfg.pricingOverride }), model: msg.model || cfg.gradeModel, mock: false, attempts: attempt };
    }
    lastErrors = check.errors;
    console.warn(`[ai] grade attempt ${attempt} failed validation:`, lastErrors.slice(0, 5));
    // Netlify synchronous functions stop at about 30 seconds. Skip the retry if it cannot finish.
    if (now() - started > cfg.gradeTimeoutMs * 0.6) break;
  }
  const err = new Error('Grader returned invalid output');
  err.code = 'INVALID_OUTPUT';
  err.details = lastErrors;
  err.usage = usage;
  err.cost = estimateCost(cfg.gradeModel, usage, { cacheTtl: cfg.cacheTtl, override: cfg.pricingOverride });
  throw err;
}

/** Answer a course question. Returns { answer, grounded, sources, usage, cost, model, mock }. */
async function askCourse({ cfg, question, history = [], client }) {
  if (cfg.mockAi) {
    const usage = mockUsage('qa');
    return { ...mockQa(question), usage, cost: estimateCost(cfg.qaModel, usage, { cacheTtl: cfg.cacheTtl, override: cfg.pricingOverride }), model: cfg.qaModel, mock: true };
  }
  client = client || makeClient(cfg);
  const messages = [...history, { role: 'user', content: question }];
  const params = {
    model: cfg.qaModel,
    max_tokens: cfg.qaMaxTokens,
    system: prompts.qaSystem({ cacheTtl: cfg.cacheTtl }),
    messages,
    output_config: { effort: cfg.qaEffort, format: { type: 'json_schema', schema: prompts.QA_API_SCHEMA } },
  };
  // Haiku has no server-side refusal fallback, so plain create.
  const msg = await send(client, cfg, params, { allowFallback: false });
  const usage = msg.usage || {};
  const cost = estimateCost(msg.model || cfg.qaModel, usage, { cacheTtl: cfg.cacheTtl, override: cfg.pricingOverride });
  const parsed = msg.stop_reason === 'refusal' ? null : extractJson(textOf(msg));
  if (!parsed || typeof parsed.answer !== 'string' || typeof parsed.grounded !== 'boolean') {
    return {
      answer: 'Sorry, I could not put together a clear answer to that. Please try rephrasing, or ask your coach.',
      grounded: false, sources: [], usage, cost, model: cfg.qaModel, mock: false,
    };
  }
  return {
    answer: prompts.scrubDashes(parsed.answer),
    grounded: parsed.grounded,
    sources: Array.isArray(parsed.sources) ? parsed.sources.filter((s) => typeof s === 'string').slice(0, 6) : [],
    usage, cost, model: msg.model || cfg.qaModel, mock: false,
  };
}

module.exports = { gradeTrade, askCourse, FALLBACK_BETA };
