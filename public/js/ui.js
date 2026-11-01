// Small rendering helpers. Everything user or model supplied goes through esc().
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const CRITERIA = [
  ['timeframe_continuity', 'Timeframe Continuity', 15],
  ['setup_validity', 'Setup Validity', 20],
  ['trigger', 'Trigger', 15],
  ['entry_location', 'Entry Location', 10],
  ['stop_placement', 'Stop Placement', 10],
  ['risk_reward', 'Risk to Reward', 10],
  ['risk_sizing', 'Risk Sizing', 10],
  ['discipline', 'Discipline', 10],
];

export const DISCLAIMER = 'Education only, not financial advice.';

export function tierClass(grade) {
  const g = String(grade || '').charAt(0).toLowerCase();
  return g === 'a' ? '' : `tier-${g}`;
}

export function alertBox(kind, text) {
  return `<div class="alert ${kind}">${esc(text)}</div>`;
}

export function money(n) {
  const v = Number(n || 0);
  return v < 0.01 && v > 0 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

export function fmtDate(s) {
  try { return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch { return s; }
}

export function renderGrade(g, { math, mock, coach } = {}) {
  if (!g) return '';
  const crit = CRITERIA.map(([id, name, w]) => {
    const c = (g.criteria || {})[id] || { score: 0, comment: '' };
    const pct = Math.max(0, Math.min(100, (Number(c.score) / w) * 100));
    return `<div class="card">
      <div class="crit-top"><h3>${esc(name)}</h3><span class="crit-score">${esc(c.score)} / ${w}</span></div>
      <div class="meter"><span style="width:${pct.toFixed(0)}%"></span></div>
      <p class="small muted" style="margin:0">${esc(c.comment)}</p>
    </div>`;
  }).join('');
  const stats = [];
  if (math && math.rr != null) stats.push(`<span class="pill purple">R:R ${esc(math.rr)} to 1</span>`);
  if (math && math.dollar_risk != null) stats.push(`<span class="pill">Risk $${esc(math.dollar_risk)}</span>`);
  if (math && math.pct_account_risk != null) stats.push(`<span class="pill">${esc(math.pct_account_risk)}% of account</span>`);
  if (g.confidence) stats.push(`<span class="pill">Grader confidence: ${esc(g.confidence)}</span>`);
  if (mock) stats.push('<span class="pill warn">Mock mode sample</span>');
  const coachCard = coach && (coach.coach_grade || coach.coach_comment) ? `
    <div class="card gold" style="margin-bottom:16px">
      <div class="label">Coach review</div>
      ${coach.coach_grade ? `<h3>Coach grade: ${esc(coach.coach_grade)}${coach.coach_score != null ? ` (${esc(coach.coach_score)})` : ''}</h3>` : ''}
      ${coach.coach_comment ? `<p style="margin:0">${esc(coach.coach_comment)}</p>` : ''}
    </div>` : '';
  return `
  <div class="panel">
    <div class="result-head">
      <div class="grade-badge ${tierClass(g.overall_grade)}" aria-label="Overall grade">${esc(g.overall_grade)}</div>
      <div>
        <div class="label muted small">OVERALL SCORE</div>
        <div class="score-big">${esc(g.overall_score)} / 100</div>
        <div class="stats">${stats.join('')}</div>
      </div>
    </div>
    ${coachCard}
    <div class="grid three" style="margin-bottom:16px">
      <div class="card gold"><div class="label">What you did well</div><ul class="clean">${(g.did_well || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card bad"><div class="label">Main mistake</div><p style="margin:0">${esc(g.main_mistake)}</p></div>
      <div class="card purple"><div class="label">How to fix it</div><p style="margin:0">${esc(g.how_to_fix)}</p></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="label">Review next</div>
      <div class="chips">${(g.review || []).map((r) => `<span class="chip" title="${esc(r.why)}">${esc(r.term)}</span>`).join('')}</div>
      <ul class="clean small muted" style="margin-top:10px">${(g.review || []).map((r) => `<li><b>${esc(r.term)}:</b> ${esc(r.why)}</li>`).join('')}</ul>
    </div>
    <h2>Score breakdown</h2>
    <div class="grid two">${crit}</div>
    <div class="grid two" style="margin-top:16px">
      <div class="card"><div class="label">What the grader saw on your chart</div><p class="small" style="margin:0">${esc(g.chart_read)}</p></div>
      <div class="card"><div class="label">Add next time</div>${(g.missing_info || []).length ? `<ul class="clean small">${g.missing_info.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:0">Nothing missing. Nice and complete.</p>'}</div>
    </div>
    <div class="disclaimer">${DISCLAIMER}</div>
  </div>`;
}

// Downscale and compress screenshots in the browser so uploads stay well under limits.
export async function compressImage(file, { maxDim = 1800, maxBytes = 3.5 * 1024 * 1024 } = {}) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Please choose a PNG, JPG, or WEBP screenshot.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is very large. Please choose a screenshot under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('We could not open that image. Please try another screenshot.'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let q = 0.9;
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length * 0.75 > maxBytes && q > 0.4) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
