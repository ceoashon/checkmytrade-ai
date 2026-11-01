'use strict';
// Coach view: all submissions, overrides, calibration flags, cost per student, invite codes.
const crypto = require('crypto');
const { wrap, json, parseJsonBody, HttpError } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const { requireCoach } = require('../lib/auth');
const { GRADES } = require('../lib/rubric-config');
const { cleanText } = require('../lib/validate');

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
  return `SC-${pick(4)}-${pick(4)}`;
}

function validateOverride(body) {
  const id = cleanText(body.id, 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Missing or invalid submission id.');
  const patch = {};
  if (body.coach_grade != null && body.coach_grade !== '') {
    if (!GRADES.includes(body.coach_grade)) throw new HttpError(400, `Grade must be one of ${GRADES.join(', ')}.`);
    patch.coach_grade = body.coach_grade;
  } else {
    patch.coach_grade = null;
  }
  if (body.coach_score != null && body.coach_score !== '') {
    const n = Number(body.coach_score);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Score must be between 0 and 100.');
    patch.coach_score = n;
  } else {
    patch.coach_score = null;
  }
  patch.coach_comment = cleanText(body.coach_comment, 2000) || null;
  patch.is_calibration = body.is_calibration === true;
  if (patch.is_calibration && !patch.coach_grade && !patch.coach_comment) {
    throw new HttpError(400, 'A calibration example needs a corrected grade or a comment so the grader knows what to learn.');
  }
  return { id, patch };
}

function validateInvite(body) {
  const role = body.role === 'coach' ? 'coach' : 'student';
  let code = cleanText(body.code, 64).toUpperCase();
  if (!code) code = randomCode();
  if (!/^[A-Z0-9-]{4,64}$/.test(code)) throw new HttpError(400, 'Codes can use letters, numbers, and dashes (4 to 64 characters).');
  const maxUses = body.max_uses == null || body.max_uses === '' ? 1 : Number(body.max_uses);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) throw new HttpError(400, 'Max uses must be a whole number from 1 to 1000.');
  let expires_at = null;
  if (body.expires_in_days != null && body.expires_in_days !== '') {
    const d = Number(body.expires_in_days);
    if (!Number.isFinite(d) || d <= 0 || d > 365) throw new HttpError(400, 'Expiry must be between 1 and 365 days.');
    expires_at = new Date(Date.now() + d * 86400000).toISOString();
  }
  return { code, role, max_uses: maxUses, expires_at, note: cleanText(body.note, 200) || null };
}

function makeHandler(deps = defaultDeps()) {
  return wrap(['GET', 'POST'], async (event) => {
    const cfg = deps.getConfig();
    const store = deps.getStore(cfg);
    const { user } = await requireCoach(event, store);

    if (event.httpMethod === 'GET') {
      const view = (event.queryStringParameters || {}).view || 'submissions';
      if (view === 'submissions') {
        const [rows, profiles] = await Promise.all([store.listSubmissions({ limit: 200 }), store.listProfiles()]);
        const emails = new Map(profiles.map((p) => [p.user_id, p.display_name || p.email]));
        const out = await Promise.all(rows.map(async (s) => ({
          ...s,
          student: emails.get(s.user_id) || s.user_id,
          image_url: await store.signedChartUrl(s.image_path),
        })));
        return json(200, { submissions: out });
      }
      if (view === 'costs') return json(200, { costs: await store.costSummary() });
      if (view === 'invites') return json(200, { invites: await store.listInvites() });
      throw new HttpError(400, 'Unknown view.');
    }

    const body = parseJsonBody(event);
    if (body.action === 'override') {
      const { id, patch } = validateOverride(body);
      const existing = await store.getSubmission(id);
      if (!existing) throw new HttpError(404, 'That submission was not found.');
      const row = await store.updateSubmission(id, { ...patch, overridden_by: user.id, overridden_at: new Date().toISOString() });
      return json(200, { submission: row });
    }
    if (body.action === 'create_invite') {
      const rec = validateInvite(body);
      const row = await store.createInvite({ ...rec, created_by: user.id });
      return json(200, { invite: row });
    }
    if (body.action === 'toggle_invite') {
      const code = cleanText(body.code, 64).toUpperCase();
      const row = await store.setInviteActive(code, body.active === true);
      if (!row) throw new HttpError(404, 'That invite code was not found.');
      return json(200, { invite: row });
    }
    throw new HttpError(400, 'Unknown action.');
  });
}

module.exports = { makeHandler, handler: makeHandler(), validateOverride, validateInvite, randomCode };
