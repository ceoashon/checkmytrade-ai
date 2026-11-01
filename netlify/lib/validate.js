'use strict';
const { HttpError } = require('./http');

const RESULTS = ['win', 'loss', 'breakeven', 'open', 'not_taken'];
const DIRECTIONS = ['long', 'short'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function cleanText(v, max) {
  if (v == null) return '';
  // Strip control characters except newlines and tabs.
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function num(v) {
  if (v === '' || v == null) return NaN;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return n;
}

function parseImage(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string' || !dataUrl) return { error: 'Please attach a chart screenshot.' };
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return { error: 'The screenshot could not be read. Please upload a PNG, JPG, or WEBP image.' };
  const mediaType = m[1].toLowerCase();
  if (!IMAGE_TYPES.includes(mediaType)) {
    return { error: 'Please upload a PNG, JPG, WEBP, or GIF screenshot.' };
  }
  const data = m[2].replace(/\s/g, '');
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (bytes < 1000) return { error: 'That screenshot looks empty. Please try a different image.' };
  if (bytes > maxBytes) {
    return { error: `That screenshot is too large. Please keep it under ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  return { mediaType, data, bytes };
}

// Returns a clean trade object or throws HttpError(400) with every problem listed.
function validateGradeInput(body, { maxImageBytes = 4 * 1024 * 1024 } = {}) {
  const errors = [];
  const instrument = cleanText(body.instrument, 40);
  const timeframe = cleanText(body.timeframe, 20);
  const direction = cleanText(body.direction, 10).toLowerCase();
  const result = cleanText(body.result, 20).toLowerCase();
  const notes = cleanText(body.notes, 2000);
  const entry = num(body.entry);
  const stop = num(body.stop);
  const target = num(body.target);

  if (!instrument) errors.push('Instrument is required (for example MNQ or ES).');
  else if (!/^[A-Za-z0-9!_:.\- /]+$/.test(instrument)) errors.push('Instrument has characters we do not recognize.');
  if (!timeframe) errors.push('Timeframe is required (for example 5m or 15m).');
  if (!DIRECTIONS.includes(direction)) errors.push('Direction must be long or short.');
  if (!RESULTS.includes(result)) errors.push(`Result must be one of: ${RESULTS.join(', ')}.`);
  for (const [name, v] of [['Entry', entry], ['Stop', stop], ['Target', target]]) {
    if (!Number.isFinite(v) || v <= 0) errors.push(`${name} must be a positive number.`);
  }
  if (Number.isFinite(entry) && Number.isFinite(stop) && Number.isFinite(target) && DIRECTIONS.includes(direction)) {
    if (direction === 'long' && !(stop < entry && entry < target)) {
      errors.push('For a long trade, the stop should be below the entry and the target above it.');
    }
    if (direction === 'short' && !(stop > entry && entry > target)) {
      errors.push('For a short trade, the stop should be above the entry and the target below it.');
    }
  }

  // Optional numbers for risk sizing.
  const contracts = body.contracts === '' || body.contracts == null ? null : num(body.contracts);
  const account_size = body.account_size === '' || body.account_size == null ? null : num(body.account_size);
  if (contracts !== null && (!Number.isFinite(contracts) || contracts <= 0 || contracts > 1000)) {
    errors.push('Contracts must be a number between 1 and 1000, or left blank.');
  }
  if (account_size !== null && (!Number.isFinite(account_size) || account_size <= 0)) {
    errors.push('Account size must be a positive number, or left blank.');
  }

  const image = parseImage(body.image, maxImageBytes);
  if (image.error) errors.push(image.error);

  if (errors.length) throw new HttpError(400, errors[0], { errors });

  return {
    instrument, timeframe, direction, entry, stop, target, result, notes,
    contracts, account_size,
    image: { mediaType: image.mediaType, data: image.data, bytes: image.bytes },
  };
}

function validateQuestion(body) {
  const question = cleanText(body.question, 1000);
  if (question.length < 3) throw new HttpError(400, 'Please type a question so we can help.');
  let history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  history = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: cleanText(m.content, 2000) }))
    .filter((m) => m.content);
  // Must alternate starting with user for the API.
  while (history.length && history[0].role !== 'user') history.shift();
  const alternating = [];
  for (const m of history) {
    if (alternating.length && alternating[alternating.length - 1].role === m.role) continue;
    alternating.push(m);
  }
  if (alternating.length && alternating[alternating.length - 1].role === 'user') alternating.pop();
  return { question, history: alternating };
}

function validateInviteCode(body) {
  const code = cleanText(body.code, 64).toUpperCase();
  if (!/^[A-Z0-9-]{4,64}$/.test(code)) throw new HttpError(400, 'That invite code does not look right. Please check it and try again.');
  return code;
}

module.exports = { validateGradeInput, validateQuestion, validateInviteCode, parseImage, cleanText, RESULTS, DIRECTIONS };
