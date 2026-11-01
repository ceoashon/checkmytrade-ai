'use strict';
// Plain arithmetic the app does itself so the model never has to.
// Point values are dollars per 1.00 point move for one contract.
// NEEDS COACH REVIEW: confirm the instruments your students trade.
const POINT_VALUES = {
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5,
  CL: 1000, MCL: 100, GC: 100, MGC: 10, SI: 5000, NG: 10000,
  '6E': 125000, ZB: 1000, ZN: 1000,
};

function rootSymbol(instrument) {
  if (!instrument) return '';
  // "MNQZ5", "NQ1!", "CME_MINI:NQ1!", "es" -> root
  let s = String(instrument).toUpperCase().trim();
  if (s.includes(':')) s = s.split(':').pop();
  s = s.replace(/[0-9]*!$/, '');
  const keys = Object.keys(POINT_VALUES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (s === k) return k;
    // contract month codes like NQZ5, NQZ25
    if (s.startsWith(k) && /^[FGHJKMNQUVXZ][0-9]{1,2}$/.test(s.slice(k.length))) return k;
  }
  return s;
}

function tradeMath({ direction, entry, stop, target, contracts, account_size, instrument }) {
  const e = Number(entry), s = Number(stop), t = Number(target);
  const risk = direction === 'long' ? e - s : s - e;
  const reward = direction === 'long' ? t - e : e - t;
  const rr = risk > 0 ? reward / risk : null;
  const root = rootSymbol(instrument);
  const pv = POINT_VALUES[root] || null;
  const n = Number(contracts) || null;
  const dollarRisk = pv && n ? Math.abs(risk) * pv * n : null;
  const acct = Number(account_size) || null;
  const pctRisk = dollarRisk && acct ? (dollarRisk / acct) * 100 : null;
  const round = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
  return {
    risk_points: round(risk, 4),
    reward_points: round(reward, 4),
    rr: round(rr, 2),
    instrument_root: root || null,
    point_value: pv,
    dollar_risk: round(dollarRisk),
    pct_account_risk: round(pctRisk),
  };
}

module.exports = { tradeMath, rootSymbol, POINT_VALUES };
