'use strict';
const fs = require('fs');
const path = require('path');
const { createMemoryStore } = require('../../netlify/lib/store');
const { getConfig } = require('../../netlify/lib/config');
const ai = require('../../netlify/lib/ai');
const { CRITERIA } = require('../../netlify/lib/rubric-config');

const SAMPLE_IMAGE = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-chart.png')).toString('base64')}`;

function validTrade(over = {}) {
  return {
    instrument: 'MNQ', timeframe: '5m', direction: 'long', entry: 21000, stop: 20990, target: 21030,
    result: 'win', notes: '2-1-2 reversal with FTFC green, followed my plan', contracts: 2, account_size: 10000,
    image: SAMPLE_IMAGE, ...over,
  };
}

function validGradeJson(over = {}) {
  const criteria = {};
  for (const c of CRITERIA) criteria[c.id] = { score: c.weight - 1, comment: `Solid ${c.name}.` };
  return {
    overall_grade: 'A-', overall_score: 92, criteria,
    did_well: ['Clean trigger.'], main_mistake: 'Entry was a touch late.', how_to_fix: 'Set the order at the trigger.',
    review: [{ term: 'Trigger', why: 'Entry timing.' }], chart_read: 'Three candles near entry.', missing_info: [], confidence: 'high',
    ...over,
  };
}

// Fake Anthropic client that returns queued responses and records requests.
function fakeClient(responses) {
  const calls = [];
  const queue = [...responses];
  const create = async (params) => {
    calls.push(params);
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(params);
    return {
      model: params.model,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: typeof next === 'string' ? next : JSON.stringify(next) }],
      usage: { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 },
    };
  };
  return { calls, messages: { create }, beta: { messages: { create } } };
}

function makeDeps({ env = {}, client, store } = {}) {
  store = store || createMemoryStore();
  const cfgEnv = { ALLOW_DEV_AUTH: 'true', ...env };
  const wrappedAi = {
    gradeTrade: (args) => ai.gradeTrade({ ...args, client }),
    askCourse: (args) => ai.askCourse({ ...args, client }),
  };
  return { store, deps: { getConfig: () => getConfig(cfgEnv), getStore: () => store, ai: wrappedAi } };
}

function ev(method, { token, body, query } = {}) {
  return {
    httpMethod: method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
    queryStringParameters: query || {},
  };
}

async function member(store, email = 'student@example.com', code = 'DEMO-STUDENT') {
  const token = `dev:${email}`;
  const user = await store.getUserFromToken(token);
  await store.redeemInvite(user.id, user.email, code);
  return { token, user };
}

const parse = (res) => ({ status: res.statusCode, body: JSON.parse(res.body) });

module.exports = { SAMPLE_IMAGE, validTrade, validGradeJson, fakeClient, makeDeps, ev, member, parse };
