'use strict';
// Data access. Two implementations with the same methods:
//  - Supabase (production): uses the service role key, server side only.
//  - Memory (local dev and tests): in-process, nothing persists.
const crypto = require('crypto');
const { HttpError } = require('./http');

const INVITE_ERRORS = {
  INVITE_INVALID: 'That invite code is not valid. Please double check it with your coach.',
  INVITE_EXPIRED: 'That invite code has expired. Please ask your coach for a new one.',
  INVITE_USED_UP: 'That invite code has already been used. Please ask your coach for a new one.',
};

function dayString(tz, date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function extFor(mediaType) {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mediaType] || 'img';
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
function createSupabaseStore(cfg) {
  const { createClient } = require('@supabase/supabase-js');
  const db = createClient(cfg.supabaseUrl, cfg.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const must = ({ data, error }, what) => {
    if (error) {
      console.error(`[store] ${what}:`, error.message || error);
      throw new HttpError(500, 'We could not reach the database. Please try again shortly.');
    }
    return data;
  };

  return {
    kind: 'supabase',
    async getUserFromToken(token) {
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      if (error || !data || !data.user) return null;
      return { id: data.user.id, email: data.user.email || '' };
    },
    async getProfile(userId) {
      return must(await db.from('cmt_profiles').select('*').eq('user_id', userId).maybeSingle(), 'getProfile');
    },
    async redeemInvite(userId, email, code) {
      const { data, error } = await db.rpc('cmt_redeem_invite', { p_user: userId, p_email: email, p_code: code });
      if (error) {
        const key = Object.keys(INVITE_ERRORS).find((k) => String(error.message).includes(k));
        if (key) throw new HttpError(400, INVITE_ERRORS[key]);
        console.error('[store] redeemInvite:', error.message);
        throw new HttpError(500, 'We could not check that invite code right now. Please try again.');
      }
      return data;
    },
    async consumeQuota(userId, day, kind, limit) {
      const n = must(await db.rpc('cmt_consume_quota', { p_user: userId, p_day: day, p_kind: kind, p_limit: limit }), 'consumeQuota');
      return { allowed: n !== -1, used: n === -1 ? limit : n };
    },
    async releaseQuota(userId, day, kind) {
      const { error } = await db.rpc('cmt_release_quota', { p_user: userId, p_day: day, p_kind: kind });
      if (error) console.error('[store] releaseQuota:', error.message);
    },
    async getUsage(userId, day) {
      const row = must(await db.from('cmt_daily_usage').select('grades,questions').eq('user_id', userId).eq('day', day).maybeSingle(), 'getUsage');
      return { grades: row ? row.grades : 0, questions: row ? row.questions : 0 };
    },
    async uploadChart(userId, id, image) {
      const path = `${userId}/${id}.${extFor(image.mediaType)}`;
      const { error } = await db.storage.from(cfg.chartBucket).upload(path, Buffer.from(image.data, 'base64'), {
        contentType: image.mediaType, upsert: false,
      });
      if (error) {
        console.error('[store] uploadChart:', error.message);
        return null; // grading still works without the stored copy
      }
      return path;
    },
    async signedChartUrl(path) {
      if (!path) return null;
      const { data, error } = await db.storage.from(cfg.chartBucket).createSignedUrl(path, 60 * 60);
      return error ? null : data.signedUrl;
    },
    async insertSubmission(rec) {
      return must(await db.from('cmt_submissions').insert(rec).select('*').single(), 'insertSubmission');
    },
    async listSubmissions({ userId, limit = 50 } = {}) {
      let q = db.from('cmt_submissions').select('*').order('created_at', { ascending: false }).limit(limit);
      if (userId) q = q.eq('user_id', userId);
      return must(await q, 'listSubmissions');
    },
    async getSubmission(id) {
      return must(await db.from('cmt_submissions').select('*').eq('id', id).maybeSingle(), 'getSubmission');
    },
    async updateSubmission(id, patch) {
      return must(await db.from('cmt_submissions').update(patch).eq('id', id).select('*').maybeSingle(), 'updateSubmission');
    },
    async listCalibration(limit) {
      if (!limit) return [];
      return must(await db.from('cmt_submissions').select('*').eq('is_calibration', true)
        .order('overridden_at', { ascending: false }).limit(limit), 'listCalibration');
    },
    async insertQuestion(rec) {
      return must(await db.from('cmt_questions').insert(rec).select('*').single(), 'insertQuestion');
    },
    async listProfiles() {
      return must(await db.from('cmt_profiles').select('*'), 'listProfiles');
    },
    async costSummary() {
      return must(await db.from('cmt_student_costs').select('*').order('total_cost_usd', { ascending: false }), 'costSummary');
    },
    async listInvites() {
      return must(await db.from('cmt_invite_codes').select('*').order('created_at', { ascending: false }).limit(200), 'listInvites');
    },
    async createInvite(rec) {
      const { data, error } = await db.from('cmt_invite_codes').insert(rec).select('*').single();
      if (error) {
        if (/duplicate key/i.test(error.message)) throw new HttpError(409, 'That code already exists. Please pick another.');
        console.error('[store] createInvite:', error.message);
        throw new HttpError(500, 'We could not create that invite code. Please try again.');
      }
      return data;
    },
    async setInviteActive(code, active) {
      return must(await db.from('cmt_invite_codes').update({ active }).eq('code', code).select('*').maybeSingle(), 'setInviteActive');
    },
  };
}

// ---------------------------------------------------------------------------
// Memory (dev + tests)
// ---------------------------------------------------------------------------
function createMemoryStore({ seedInvites = true } = {}) {
  const users = new Map(); // token -> user
  const profiles = new Map();
  const invites = new Map();
  const submissions = [];
  const questions = [];
  const usage = new Map(); // `${user}|${day}` -> {grades, questions}
  const charts = new Map();

  if (seedInvites) {
    invites.set('DEMO-STUDENT', { code: 'DEMO-STUDENT', role: 'student', max_uses: 1000, uses: 0, active: true, expires_at: null, created_at: new Date().toISOString() });
    invites.set('DEMO-COACH', { code: 'DEMO-COACH', role: 'coach', max_uses: 1000, uses: 0, active: true, expires_at: null, created_at: new Date().toISOString() });
  }

  const now = () => new Date().toISOString();
  const usageRow = (u, d) => {
    const k = `${u}|${d}`;
    if (!usage.has(k)) usage.set(k, { grades: 0, questions: 0 });
    return usage.get(k);
  };

  const store = {
    kind: 'memory',
    _state: { users, profiles, invites, submissions, questions, usage, charts },
    // Dev tokens look like "dev:someone@example.com".
    async getUserFromToken(token) {
      if (!token) return null;
      if (users.has(token)) return users.get(token);
      const m = /^dev:([^\s@]+@[^\s@]+)$/.exec(token);
      if (!m) return null;
      const email = m[1].toLowerCase();
      const id = crypto.createHash('sha256').update(email).digest('hex').slice(0, 32)
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      const user = { id, email };
      users.set(token, user);
      return user;
    },
    async getProfile(userId) { return profiles.get(userId) || null; },
    async redeemInvite(userId, email, code) {
      const inv = invites.get(code.toUpperCase());
      if (!inv || !inv.active) throw new HttpError(400, INVITE_ERRORS.INVITE_INVALID);
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) throw new HttpError(400, INVITE_ERRORS.INVITE_EXPIRED);
      const existing = profiles.get(userId);
      if (existing) {
        if (inv.role === 'coach' && existing.role !== 'coach') {
          if (inv.uses >= inv.max_uses) throw new HttpError(400, INVITE_ERRORS.INVITE_USED_UP);
          existing.role = 'coach';
          inv.uses += 1;
        }
        return existing;
      }
      if (inv.uses >= inv.max_uses) throw new HttpError(400, INVITE_ERRORS.INVITE_USED_UP);
      const prof = { user_id: userId, email, display_name: null, role: inv.role, invite_code: inv.code, daily_grade_limit: null, daily_question_limit: null, active: true, created_at: now() };
      profiles.set(userId, prof);
      inv.uses += 1;
      return prof;
    },
    async consumeQuota(userId, day, kind, limit) {
      const row = usageRow(userId, day);
      const key = kind === 'grade' ? 'grades' : 'questions';
      if (row[key] >= limit) return { allowed: false, used: row[key] };
      row[key] += 1;
      return { allowed: true, used: row[key] };
    },
    async releaseQuota(userId, day, kind) {
      const row = usageRow(userId, day);
      const key = kind === 'grade' ? 'grades' : 'questions';
      row[key] = Math.max(0, row[key] - 1);
    },
    async getUsage(userId, day) { return { ...usageRow(userId, day) }; },
    async uploadChart(userId, id, image) {
      const path = `${userId}/${id}.${extFor(image.mediaType)}`;
      charts.set(path, `data:${image.mediaType};base64,${image.data}`);
      return path;
    },
    async signedChartUrl(path) { return charts.get(path) || null; },
    async insertSubmission(rec) {
      const row = { id: rec.id || crypto.randomUUID(), created_at: now(), coach_grade: null, coach_score: null, coach_comment: null, is_calibration: false, overridden_by: null, overridden_at: null, ...rec };
      submissions.unshift(row);
      return row;
    },
    async listSubmissions({ userId, limit = 50 } = {}) {
      return submissions.filter((s) => !userId || s.user_id === userId).slice(0, limit);
    },
    async getSubmission(id) { return submissions.find((s) => s.id === id) || null; },
    async updateSubmission(id, patch) {
      const s = submissions.find((x) => x.id === id);
      if (!s) return null;
      Object.assign(s, patch);
      return s;
    },
    async listCalibration(limit) {
      return submissions.filter((s) => s.is_calibration)
        .sort((a, b) => String(b.overridden_at).localeCompare(String(a.overridden_at)))
        .slice(0, limit);
    },
    async insertQuestion(rec) {
      const row = { id: crypto.randomUUID(), created_at: now(), ...rec };
      questions.unshift(row);
      return row;
    },
    async listProfiles() { return [...profiles.values()]; },
    async costSummary() {
      return [...profiles.values()].map((p) => {
        const s = submissions.filter((x) => x.user_id === p.user_id);
        const q = questions.filter((x) => x.user_id === p.user_id);
        const gc = s.reduce((a, x) => a + Number(x.cost_usd || 0), 0);
        const qc = q.reduce((a, x) => a + Number(x.cost_usd || 0), 0);
        return { user_id: p.user_id, email: p.email, display_name: p.display_name, role: p.role, grades: s.length, questions: q.length, grade_cost_usd: gc, question_cost_usd: qc, total_cost_usd: gc + qc, cost_30d_usd: gc + qc };
      }).sort((a, b) => b.total_cost_usd - a.total_cost_usd);
    },
    async listInvites() { return [...invites.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); },
    async createInvite(rec) {
      if (invites.has(rec.code)) throw new HttpError(409, 'That code already exists. Please pick another.');
      const row = { uses: 0, active: true, expires_at: null, note: null, created_at: now(), ...rec };
      invites.set(rec.code, row);
      return row;
    },
    async setInviteActive(code, active) {
      const inv = invites.get(code);
      if (!inv) return null;
      inv.active = active;
      return inv;
    },
  };
  return store;
}

let memorySingleton;
function getStore(cfg) {
  if (cfg.supabaseUrl && cfg.supabaseServiceKey) return createSupabaseStore(cfg);
  if (cfg.devAuth) {
    if (!memorySingleton) memorySingleton = createMemoryStore();
    return memorySingleton;
  }
  throw new HttpError(503, 'CheckMyTrade is not connected to its database yet. Please let your coach know.');
}

module.exports = { getStore, createMemoryStore, createSupabaseStore, dayString, INVITE_ERRORS };
