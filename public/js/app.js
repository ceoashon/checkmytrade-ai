import { api, setTokenProvider } from './api.js';
import { $, $$, esc, alertBox, renderGrade, compressImage, fmtDate, money, DISCLAIMER } from './ui.js';

const state = {
  config: null,
  supabase: null,
  me: null,
  image: null,
  chat: [],
  coachTab: 'submissions',
};

const VIEWS = ['loading', 'signin', 'invite', 'grade', 'ask', 'history', 'coach'];

function show(view) {
  for (const v of VIEWS) $(`#view-${v}`).classList.toggle('hidden', v !== view);
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const inApp = ['grade', 'ask', 'history', 'coach'].includes(view);
  $('#tabs').classList.toggle('hidden', !inApp);
  $('#user-box').classList.toggle('hidden', !inApp);
  if (view === 'history') loadHistory();
  if (view === 'coach') loadCoach();
  if (inApp) history.replaceState(null, '', `#${view}`);
}

function safeStorage(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function getToken() {
  if (state.config && state.config.devAuth) return safeStorage(() => localStorage.getItem('cmt-dev-token'));
  if (!state.supabase) return null;
  const { data } = await state.supabase.auth.getSession();
  return data && data.session ? data.session.access_token : null;
}

async function waitForSupabaseLib() {
  for (let i = 0; i < 50 && !window.supabase; i++) await new Promise((r) => setTimeout(r, 100));
  return window.supabase;
}

async function boot() {
  setTokenProvider(getToken);
  try {
    state.config = await api('config');
  } catch (e) {
    $('#view-loading').innerHTML = `<div class="panel">${alertBox('error', e.message)}</div>`;
    return;
  }
  const c = state.config;
  const banner = [];
  if (c.mockAi) banner.push('Mock mode is on: grades and answers are realistic samples, not real AI reviews. Add an ANTHROPIC_API_KEY in Netlify to switch to live grading.');
  if (c.devAuth) banner.push('Local dev sign in is on. Data lives in memory and resets when the server restarts.');
  if (c.knowledge && c.knowledge.specPending) banner.push('Heads up: the Strat Trader indicator guide is still being prepared, so the grader will not interpret indicator colors or lines yet.');
  if (banner.length) {
    $('#mode-banner').innerHTML = banner.map(esc).join('<br>');
    $('#mode-banner').classList.remove('hidden');
  }

  if (c.devAuth) {
    $('#signin-supabase').classList.add('hidden');
    $('#signin-dev').classList.remove('hidden');
  } else if (c.supabaseUrl && c.supabaseAnonKey) {
    const lib = await waitForSupabaseLib();
    if (!lib) {
      $('#view-loading').innerHTML = `<div class="panel">${alertBox('error', 'We could not load the sign in service. Please refresh the page.')}</div>`;
      return;
    }
    state.supabase = lib.createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    state.supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') route();
    });
  } else {
    $('#view-loading').innerHTML = `<div class="panel">${alertBox('error', 'CheckMyTrade is not connected to its sign in service yet. Please let your coach know.')}</div>`;
    return;
  }
  await route();
}

async function route() {
  const token = await getToken();
  if (!token) return show('signin');
  try {
    state.me = await api('me');
  } catch (e) {
    if (e.status === 401) return show('signin');
    $('#view-loading').innerHTML = `<div class="panel">${alertBox('error', e.message)}</div>`;
    return show('loading');
  }
  if (!state.me.profile) return show('invite');
  $('#tab-coach').classList.toggle('hidden', state.me.profile.role !== 'coach');
  updateUsage();
  const wanted = location.hash.replace('#', '');
  const allowed = ['grade', 'ask', 'history'].concat(state.me.profile.role === 'coach' ? ['coach'] : []);
  show(allowed.includes(wanted) ? wanted : 'grade');
}

function updateUsage() {
  const me = state.me;
  if (!me) return;
  $('#usage-pill').textContent = me.unlimited
    ? 'Coach: no daily limit'
    : `Today: ${me.usage.grades}/${me.limits.grades} grades, ${me.usage.questions}/${me.limits.questions} questions`;
}

$('#google-btn').addEventListener('click', async () => {
  const { error } = await state.supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) $('#signin-msg').innerHTML = alertBox('error', error.message);
});

$('#email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const { error } = await state.supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  $('#signin-msg').innerHTML = error
    ? alertBox('error', error.message)
    : alertBox('success', 'Check your inbox. We sent you a sign in link.');
});

$('#dev-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  safeStorage(() => localStorage.setItem('cmt-dev-token', `dev:${$('#dev-email').value.trim().toLowerCase()}`));
  await route();
});

$('#invite-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('redeem-invite', { method: 'POST', body: { code: $('#invite-code').value } });
    $('#invite-msg').innerHTML = alertBox('success', r.message);
    await route();
  } catch (err) {
    $('#invite-msg').innerHTML = alertBox('error', err.message);
  }
});

$('#sign-out').addEventListener('click', async () => {
  if (state.config.devAuth) safeStorage(() => localStorage.removeItem('cmt-dev-token'));
  else await state.supabase.auth.signOut();
  state.me = null;
  show('signin');
});

$$('#tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------
async function takeFile(file) {
  if (!file) return;
  $('#grade-msg').innerHTML = '';
  try {
    state.image = await compressImage(file);
    $('#preview').src = state.image;
    $('#preview').classList.remove('hidden');
    $('#drop-text').innerHTML = '<span class="muted small">Looks good. Click to change the screenshot.</span>';
  } catch (err) {
    state.image = null;
    $('#grade-msg').innerHTML = alertBox('error', err.message);
  }
}

const drop = $('#drop');
drop.addEventListener('click', () => $('#file').click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } });
$('#file').addEventListener('change', (e) => takeFile(e.target.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); takeFile(e.dataTransfer.files[0]); });
document.addEventListener('paste', (e) => {
  if ($('#view-grade').classList.contains('hidden')) return;
  const item = [...(e.clipboardData || {}).items || []].find((i) => i.type.startsWith('image/'));
  if (item) takeFile(item.getAsFile());
});

$('#grade-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#grade-msg');
  msg.innerHTML = '';
  if (!state.image) { msg.innerHTML = alertBox('error', 'Please add a chart screenshot first.'); return; }
  const body = {
    image: state.image,
    instrument: $('#instrument').value.trim(),
    timeframe: $('#timeframe').value,
    direction: $('input[name="direction"]:checked').value,
    entry: $('#entry').value.trim(),
    stop: $('#stop').value.trim(),
    target: $('#target').value.trim(),
    result: $('#result').value,
    contracts: $('#contracts').value.trim(),
    account_size: $('#account').value.trim(),
    notes: $('#notes').value.trim(),
  };
  const btn = $('#grade-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Reviewing your trade...';
  $('#grade-result').innerHTML = '';
  try {
    const r = await api('grade', { method: 'POST', body });
    $('#grade-result').innerHTML = `<div style="margin-top:18px">${renderGrade(r.grade, { math: r.math, mock: r.mock })}</div>`;
    $('#grade-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (r.usage && !r.usage.unlimited) state.me.usage.grades = r.usage.used;
    updateUsage();
  } catch (err) {
    const list = err.data && Array.isArray(err.data.errors) && err.data.errors.length > 1
      ? `<ul class="clean">${err.data.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    msg.innerHTML = `<div class="alert error">${esc(err.message)}${list}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Grade my trade';
  }
});

// ---------------------------------------------------------------------------
// Ask the Course
// ---------------------------------------------------------------------------
function renderChat() {
  const chat = $('#chat');
  if (!state.chat.length) {
    chat.innerHTML = '<p class="muted small">Try: "What is full timeframe continuity?" or "How is risk sizing graded?"</p>';
    return;
  }
  chat.innerHTML = state.chat.map((m) => {
    if (m.role === 'user') return `<div class="msg user">${esc(m.content)}</div>`;
    if (m.pending) return '<div class="msg bot"><div class="spinner light"></div></div>';
    const badge = m.grounded
      ? '<span class="pill good">From the course materials</span>'
      : '<span class="pill warn">Not covered in the materials</span>';
    const src = (m.sources || []).length ? `<span class="small muted">Sources: ${m.sources.map(esc).join(', ')}</span>` : '';
    return `<div class="msg bot">${esc(m.content)}<div class="meta">${badge}${m.mock ? '<span class="pill">Mock</span>' : ''}${src}<span class="disc">${DISCLAIMER}</span></div></div>`;
  }).join('');
  chat.scrollTop = chat.scrollHeight;
}

$('#ask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#question').value.trim();
  if (!q) return;
  $('#ask-msg').innerHTML = '';
  const history = state.chat.filter((m) => !m.pending).slice(-6).map((m) => ({ role: m.role, content: m.content }));
  state.chat.push({ role: 'user', content: q }, { role: 'assistant', pending: true });
  $('#question').value = '';
  $('#ask-btn').disabled = true;
  renderChat();
  try {
    const r = await api('ask', { method: 'POST', body: { question: q, history } });
    state.chat[state.chat.length - 1] = { role: 'assistant', content: r.answer, grounded: r.grounded, sources: r.sources, mock: r.mock };
    if (r.usage && !r.usage.unlimited) state.me.usage.questions = r.usage.used;
    updateUsage();
  } catch (err) {
    state.chat.splice(-2, 2);
    $('#ask-msg').innerHTML = alertBox('error', err.message);
  } finally {
    $('#ask-btn').disabled = false;
    renderChat();
  }
});
renderChat();

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
async function loadHistory() {
  const box = $('#history-list');
  box.innerHTML = '<div class="panel"><div class="spinner light"></div></div>';
  try {
    const { submissions } = await api('history');
    if (!submissions.length) {
      box.innerHTML = '<div class="panel"><p class="muted" style="margin:0">No grades yet. Your first one is a click away on the Grade a Trade tab.</p></div>';
      return;
    }
    box.innerHTML = `<div class="panel table-wrap"><table>
      <thead><tr><th>Date</th><th>Trade</th><th>Result</th><th>AI grade</th><th>Coach</th></tr></thead>
      <tbody>${submissions.map((s, i) => `
        <tr class="clickable" data-i="${i}"><td>${esc(fmtDate(s.created_at))}</td>
          <td>${esc(s.direction)} ${esc(s.instrument)} ${esc(s.timeframe)}</td>
          <td>${esc(s.result)}</td><td class="grade">${esc(s.ai_grade)}</td>
          <td class="grade">${esc(s.coach_grade || (s.coach_comment ? 'Note' : ''))}</td></tr>
        <tr class="detail-row hidden" data-d="${i}"><td colspan="5">${renderGrade(s.grade, { math: s.math, mock: s.mock, coach: s })}</td></tr>`).join('')}
      </tbody></table></div>`;
    $$('tr.clickable', box).forEach((tr) => tr.addEventListener('click', () => {
      $(`tr[data-d="${tr.dataset.i}"]`, box).classList.toggle('hidden');
    }));
  } catch (err) {
    box.innerHTML = `<div class="panel">${alertBox('error', err.message)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------
$$('[data-coach]').forEach((b) => b.addEventListener('click', () => {
  state.coachTab = b.dataset.coach;
  $$('[data-coach]').forEach((x) => x.classList.toggle('active', x === b));
  loadCoach();
}));

const GRADE_OPTIONS = ['', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

async function loadCoach() {
  const body = $('#coach-body');
  body.innerHTML = '<div class="spinner light"></div>';
  try {
    if (state.coachTab === 'submissions') return renderCoachSubmissions(body, (await api('coach?view=submissions')).submissions);
    if (state.coachTab === 'costs') return renderCosts(body, (await api('coach?view=costs')).costs);
    if (state.coachTab === 'invites') return renderInvites(body, (await api('coach?view=invites')).invites);
  } catch (err) {
    body.innerHTML = alertBox('error', err.message);
  }
}

function renderCoachSubmissions(body, rows) {
  if (!rows.length) { body.innerHTML = '<p class="muted">No submissions yet.</p>'; return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Student</th><th>Trade</th><th>AI</th><th>Coach</th><th>Calib.</th><th>Cost</th></tr></thead>
    <tbody>${rows.map((s, i) => `
      <tr class="clickable" data-i="${i}"><td>${esc(fmtDate(s.created_at))}</td><td>${esc(s.student)}</td>
        <td>${esc(s.direction)} ${esc(s.instrument)} ${esc(s.timeframe)}, ${esc(s.result)}</td>
        <td class="grade">${esc(s.ai_grade)} <span class="muted small">${esc(s.ai_score)}</span></td>
        <td class="grade">${esc(s.coach_grade || '')}</td><td>${s.is_calibration ? '<span class="pill gold">Yes</span>' : ''}</td>
        <td>${esc(money(s.cost_usd))}${s.mock ? ' <span class="pill">mock</span>' : ''}</td></tr>
      <tr class="detail-row hidden" data-d="${i}"><td colspan="7">
        <div class="detail">
          <div>
            ${s.image_url ? `<img src="${esc(s.image_url)}" alt="Submitted chart">` : '<p class="muted small">No stored screenshot.</p>'}
            <p class="small"><b>Entry</b> ${esc(s.entry)} <b>Stop</b> ${esc(s.stop)} <b>Target</b> ${esc(s.target)} <b>R:R</b> ${esc(s.math && s.math.rr)}</p>
            <p class="small"><b>Student notes:</b> ${esc(s.notes || '(none)')}</p>
            <form class="override" data-id="${esc(s.id)}">
              <h3>Override</h3>
              <div class="grid two">
                <div class="field"><label>Coach grade</label><select name="coach_grade">${GRADE_OPTIONS.map((g) => `<option value="${g}" ${g === (s.coach_grade || '') ? 'selected' : ''}>${g || 'Keep AI grade'}</option>`).join('')}</select></div>
                <div class="field"><label>Coach score (0 to 100)</label><input name="coach_score" inputmode="decimal" value="${esc(s.coach_score ?? '')}"></div>
              </div>
              <div class="field"><label>Comment to the student</label><textarea name="coach_comment" maxlength="2000">${esc(s.coach_comment || '')}</textarea></div>
              <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" name="is_calibration" style="width:auto" ${s.is_calibration ? 'checked' : ''}> Use as a calibration example in future grading</label>
              <div style="margin-top:12px"><button class="btn primary small" type="submit">Save override</button></div>
              <div class="msg-slot"></div>
            </form>
          </div>
          <div>${renderGrade(s.ai_result, { math: s.math, mock: s.mock })}</div>
        </div>
      </td></tr>`).join('')}
    </tbody></table></div>`;
  $$('tr.clickable', body).forEach((tr) => tr.addEventListener('click', () => $(`tr[data-d="${tr.dataset.i}"]`, body).classList.toggle('hidden')));
  $$('form.override', body).forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const slot = $('.msg-slot', f);
    try {
      await api('coach', {
        method: 'POST',
        body: {
          action: 'override', id: f.dataset.id,
          coach_grade: f.coach_grade.value, coach_score: f.coach_score.value,
          coach_comment: f.coach_comment.value, is_calibration: f.is_calibration.checked,
        },
      });
      slot.innerHTML = alertBox('success', 'Saved. The student will see this on their My Grades page.');
    } catch (err) {
      slot.innerHTML = alertBox('error', err.message);
    }
  }));
}

function renderCosts(body, rows) {
  const total = rows.reduce((a, r) => a + Number(r.total_cost_usd || 0), 0);
  body.innerHTML = `<p class="muted small">Estimated from token usage at list prices. Your Anthropic invoice is the final word.</p>
    <div class="grid three" style="margin-bottom:14px">
      <div class="card gold"><div class="label">Total estimated cost</div><div class="score-big">${esc(money(total))}</div></div>
      <div class="card"><div class="label">Students</div><div class="score-big">${rows.filter((r) => r.role !== 'coach').length}</div></div>
      <div class="card"><div class="label">Grades</div><div class="score-big">${rows.reduce((a, r) => a + Number(r.grades || 0), 0)}</div></div>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>Grades</th><th>Questions</th><th>Grade cost</th><th>Question cost</th><th>Last 30 days</th><th>Total</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${esc(r.display_name || r.email)}${r.role === 'coach' ? ' <span class="pill gold">coach</span>' : ''}</td>
      <td>${esc(r.grades)}</td><td>${esc(r.questions)}</td><td>${esc(money(r.grade_cost_usd))}</td><td>${esc(money(r.question_cost_usd))}</td>
      <td>${esc(money(r.cost_30d_usd))}</td><td><b>${esc(money(r.total_cost_usd))}</b></td></tr>`).join('')}</tbody></table></div>`;
}

function renderInvites(body, rows) {
  body.innerHTML = `
    <form id="invite-create" class="card" style="margin-bottom:16px">
      <h3>Create an invite code</h3>
      <div class="grid four">
        <div class="field"><label>Code</label><input name="code" placeholder="Leave blank to generate" style="text-transform:uppercase"></div>
        <div class="field"><label>Role</label><select name="role"><option value="student">Student</option><option value="coach">Coach</option></select></div>
        <div class="field"><label>Max uses</label><input name="max_uses" value="1" inputmode="numeric"></div>
        <div class="field"><label>Expires in (days)</label><input name="expires_in_days" placeholder="Never" inputmode="numeric"></div>
      </div>
      <div class="field"><label>Note</label><input name="note" placeholder="For example: October cohort" maxlength="200"></div>
      <button class="btn primary small" type="submit">Create code</button>
      <div class="msg-slot"></div>
    </form>
    <div class="table-wrap"><table><thead><tr><th>Code</th><th>Role</th><th>Uses</th><th>Expires</th><th>Note</th><th>Status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.role)}</td><td>${esc(r.uses)} / ${esc(r.max_uses)}</td>
      <td>${r.expires_at ? esc(fmtDate(r.expires_at)) : 'Never'}</td><td>${esc(r.note || '')}</td>
      <td><button class="btn ghost small" data-toggle="${esc(r.code)}" data-active="${r.active ? '1' : '0'}">${r.active ? 'Active, click to pause' : 'Paused, click to activate'}</button></td></tr>`).join('')}</tbody></table></div>`;
  const f = $('#invite-create');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('coach', { method: 'POST', body: { action: 'create_invite', code: f.code.value, role: f.role.value, max_uses: f.max_uses.value, expires_in_days: f.expires_in_days.value, note: f.note.value } });
      $('.msg-slot', f).innerHTML = alertBox('success', `Created ${r.invite.code}. Share it with your student.`);
      setTimeout(loadCoach, 900);
    } catch (err) {
      $('.msg-slot', f).innerHTML = alertBox('error', err.message);
    }
  });
  $$('[data-toggle]', body).forEach((b) => b.addEventListener('click', async () => {
    try {
      await api('coach', { method: 'POST', body: { action: 'toggle_invite', code: b.dataset.toggle, active: b.dataset.active !== '1' } });
      loadCoach();
    } catch (err) {
      alert(err.message);
    }
  }));
}

boot();
