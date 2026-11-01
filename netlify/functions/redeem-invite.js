'use strict';
const { wrap, json, parseJsonBody } = require('../lib/http');
const { defaultDeps } = require('../lib/deps');
const { authenticate } = require('../lib/auth');
const { validateInviteCode } = require('../lib/validate');

function makeHandler(deps = defaultDeps()) {
  return wrap('POST', async (event) => {
    const cfg = deps.getConfig();
    const store = deps.getStore(cfg);
    const { user } = await authenticate(event, store);
    const code = validateInviteCode(parseJsonBody(event));
    const profile = await store.redeemInvite(user.id, user.email, code);
    return json(200, { profile: { role: profile.role, active: profile.active }, message: 'You are in. Welcome to CheckMyTrade!' });
  });
}

module.exports = { makeHandler, handler: makeHandler() };
