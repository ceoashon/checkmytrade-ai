'use strict';

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const DISCLAIMER = 'Education only, not financial advice.';

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function parseJsonBody(event) {
  if (!event.body) throw new HttpError(400, 'We did not receive any details. Please try again.');
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new HttpError(400, 'That request was not valid JSON. Please refresh and try again.');
  }
}

function bearerToken(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : '';
}

// Wraps a handler: method check, error to JSON, never leaks stack traces.
function wrap(methods, fn) {
  const allowed = Array.isArray(methods) ? methods : [methods];
  return async (event, context) => {
    try {
      if (!allowed.includes(event.httpMethod)) {
        return json(405, { error: 'Method not allowed.' });
      }
      return await fn(event, context);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(err.status, { error: err.message, ...err.extra });
      }
      console.error('[unhandled]', err && err.stack ? err.stack : err);
      return json(500, { error: 'Something went wrong on our side. Please try again in a minute.' });
    }
  };
}

module.exports = { HttpError, json, parseJsonBody, bearerToken, wrap, DISCLAIMER };
