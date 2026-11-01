'use strict';
// Estimated API cost in US dollars. Prices are per million tokens.
// Override with PRICING_JSON, for example:
// {"claude-sonnet-5-5":{"input":2,"output":10,"cache_read":0.2,"cache_write_5m":2.5,"cache_write_1h":4}}
const DEFAULT_PRICING = {
  'claude-sonnet-5-5': { input: 2.0, output: 10.0, cache_read: 0.2, cache_write_5m: 2.5, cache_write_1h: 4.0 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cache_read: 0.01, cache_write_5m: 0.125, cache_write_1h: 0.2 },
  'claude-opus-5-5': { input: 4.0, output: 20.0, cache_read: 0.2, cache_write_5m: 5.0, cache_write_1h: 8.0 },
};

function pricingTable(override) {
  if (!override) return DEFAULT_PRICING;
  try { return { ...DEFAULT_PRICING, ...JSON.parse(override) }; } catch { return DEFAULT_PRICING; }
}

function estimateCost(model, usage, { cacheTtl = '5m', override = '' } = {}) {
  if (!usage) return 0;
  const p = pricingTable(override)[model];
  if (!p) return 0;
  const writeRate = cacheTtl === '1h' ? p.cache_write_1h : p.cache_write_5m;
  const cost =
    ((usage.input_tokens || 0) * p.input +
      (usage.output_tokens || 0) * p.output +
      (usage.cache_read_input_tokens || 0) * p.cache_read +
      (usage.cache_creation_input_tokens || 0) * writeRate) / 1e6;
  return Math.round(cost * 1e6) / 1e6;
}

module.exports = { estimateCost, pricingTable, DEFAULT_PRICING };
