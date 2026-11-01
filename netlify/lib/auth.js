'use strict';
const { HttpError, bearerToken } = require('./http');

async function authenticate(event, store) {
  const token = bearerToken(event);
  if (!token) throw new HttpError(401, 'Please sign in to continue.', { code: 'SIGN_IN' });
  const user = await store.getUserFromToken(token);
  if (!user) throw new HttpError(401, 'Your session has expired. Please sign in again.', { code: 'SIGN_IN' });
  const profile = await store.getProfile(user.id);
  return { user, profile };
}

async function requireMember(event, store) {
  const ctx = await authenticate(event, store);
  if (!ctx.profile) {
    throw new HttpError(403, 'Welcome! Please enter your invite code to unlock CheckMyTrade.', { code: 'NEEDS_INVITE' });
  }
  if (ctx.profile.active === false) {
    throw new HttpError(403, 'Your access is paused right now. Please reach out to your coach.', { code: 'INACTIVE' });
  }
  return ctx;
}

async function requireCoach(event, store) {
  const ctx = await requireMember(event, store);
  if (ctx.profile.role !== 'coach') throw new HttpError(403, 'This area is for coaches only.', { code: 'NOT_COACH' });
  return ctx;
}

module.exports = { authenticate, requireMember, requireCoach };
