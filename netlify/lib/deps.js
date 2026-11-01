'use strict';
// Default dependencies for the functions. Tests pass their own.
const { getConfig } = require('./config');
const { getStore } = require('./store');
const ai = require('./ai');

function defaultDeps() {
  return { getConfig: () => getConfig(), getStore, ai };
}

module.exports = { defaultDeps };
