/* =====================================================
   CONFIG
   ===================================================== */
const CONFIG = {
  // The publishable key is meant to be public. What it can do is limited
  // by the security rules in supabase.sql, not by hiding it.
  SUPABASE_URL: 'https://gwbotqxpkqqpblgccktb.supabase.co',
  SUPABASE_KEY: 'sb_publishable_f-JvJOINx3iV2GUZ05pm4w_zGeTRCA-',
  PAGE_SIZE: 25,
  FETCH_CHUNK: 1000   // Supabase returns at most 1000 rows per request
};

const STATUSES = ['pending', 'accepted', 'rejected'];

/* =====================================================
   Helpers
   ===================================================== */
const $ = (sel, root = document) => root.querySelector(sel);

// Applicant data is typed by the public, so it is NEVER trusted as HTML.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

const state = {
  rows: [],
  status: 'all',
  query: '',
  sort: 'new',
  page: 1,
  openId: null,
  busy: false,
  confirmDelete: false
};

let toastTimer;
function toast(msg, kind) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

function fmtDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDob(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function ageFrom(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date();
  let age = t.getFullYear() - y;
  if (t.getMonth() + 1 < mo || (t.getMonth() + 1 === mo && t.getDate() < d)) age--;
  return age;
}
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const first = [...parts[0]][0] || '?';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] : '';
  return (first + last).toUpperCase();
}
function avatarColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 70% 45%))`;
}
const badge = s => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const byId = id => state.rows.find(r => r.id === id);

/* =====================================================
   Views
   ===================================================== */
function showView(name) {
  $('#authView').hidden = name !== 'auth';
  $('#deniedView').hidden = name !== 'denied';
  $('#appView').hidden = name !== 'app';
  if (name !== 'app') closeDrawer(true);
}

function resetState() {
  state.rows = [];
  state.status = 'all';
  state.query = '';
  state.page = 1;
  $('#search').value = '';
  $('#tbody').innerHTML = '';
  $('#drawerBody').innerHTML = '';
}

/** Handle a failed database call. Expired sessions send you back to sign-in. */
function dbError(err, fallback) {
  console.error(err);
  const msg = String((err && (err.message || err.code)) || '');
  if ((err && err.status === 401) || /jwt|token|expired/i.test(msg)) {
    toast('Your session expired. Please sign in again.', 'err');
    sb.auth.signOut();
    return;
  }
  toast(fallback, 'err');
}

/* =====================================================
   Sign in / out
   ===================================================== */
const loginBtn = $('#loginBtn');

function setLoginError(msg) {
  const el = $('#loginError');
  el.textContent = msg;
  el.classList.remove('show');
  if (msg) { void el.offsetWidth; el.classList.add('show'); }
}
function setLoginLoading(on) {
  loginBtn.disabled = on;
  loginBtn.classList.toggle('loading', on);
  $('.lbl', loginBtn).textContent = on ? 'Signing in…' : 'Sign in';
}

$('#pwToggle').addEventListener('click', () => {
  const input = $('#loginPass');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('#pwToggle').textContent = show ? 'Hide' : 'Show';
  $('#pwToggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  setLoginError('');
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPass').value;
  if (!email || !password) return setLoginError('Enter your email and password.');

  setLoginLoading(true);
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.status === 429 || error.code === 'over_request_rate_limit') {
        setLoginError('Too many attempts. Please wait a few minutes and try again.');
      } else if (error.status === 400 || error.code === 'invalid_credentials') {
        setLoginError('Incorrect email or password.');
      } else {
        setLoginError('Could not sign in. Check your connection and try again.');
      }
      return;
    }
    $('#loginPass').value = '';
    await enter(data.session);
  } catch (err) {
    console.error(err);
    setLoginError('Could not sign in. Check your connection and try again.');
  } finally {
    setLoginLoading(false);
  }
});

async function signOut() {
  try { await sb.auth.signOut(); } catch (err) { console.error(err); }
  // The SIGNED_OUT listener below resets the screen.
}
$('#signOutBtn').addEventListener('click', signOut);
$('#deniedOut').addEventListener('click', signOut);

// Keep this callback synchronous (supabase-js requirement).
sb.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT') {
    resetState();
    showView('auth');
  }
});

/** After a valid session: confirm the account is on the admin list, then load. */
async function enter(session) {
  const email = (session && session.user && session.user.email) || '';
  const { data, error } = await sb.rpc('is_admin');
  if (error) {
    console.error(error);
    showView('auth');
    setLoginError('Could not verify your account. Check your connection and try again.');
    return;
  }
  if (data !== true) {
    $('#deniedEmail').textContent = email;
    showView('denied');
    return;
  }
  $('#whoEmail').textContent = email;
  showView('app');
  await loadAll();
}

/* =====================================================
   Loading data
   ===================================================== */
function setLoading(on) {
  $('#loading').hidden = !on;
  if (on) { $('#empty').hidden = true; $('#tableWrap').hidden = true; $('#pager').hidden = true; }
}

async function loadAll() {
  setLoading(true);
  const rows = [];
  for (let from = 0; ; from += CONFIG.FETCH_CHUNK) {
    const { data, error } = await sb.from('applications')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + CONFIG.FETCH_CHUNK - 1);
    if (error) {
      dbError(error, 'Could not load applications.');
      setLoading(false);
      const empty = $('#empty');
      empty.hidden = false;
      empty.innerHTML = '<h3>Could not load applications</h3><p>Check your connection, then press Refresh.</p>';
      return;
    }
    rows.push(...data);
    if (data.length < CONFIG.FETCH_CHUNK) break;
  }
  state.rows = rows;
  setLoading(false);
  renderAll();
}

$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  await loadAll();
  btn.disabled = false;
  if (state.openId && !byId(state.openId)) closeDrawer();
});

/* =====================================================
   Filtering, sorting, rendering
   ===================================================== */
const haystack = r => [r.full_name, r.email, r.phone, r.discord, r.slack_id, r.class_name, r.languages, r.skills]
  .filter(Boolean).join('\n').toLowerCase();

function filtered() {
  const q = state.query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  let list = state.rows.filter(r => state.status === 'all' || r.status === state.status);
  if (q) {
    list = list.filter(r =>
      haystack(r).includes(q) ||
      (qDigits.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(qDigits)));
  }
  const by = {
    new: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    old: (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    name: (a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
  }[state.sort];
  return list.slice().sort(by);
}

function renderStats() {
  const c = { pending: 0, accepted: 0, rejected: 0 };
  state.rows.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
  $('#stats').innerHTML = [
    ['total', 'Total', state.rows.length],
    ['pending', 'Pending', c.pending],
    ['accepted', 'Accepted', c.accepted],
    ['rejected', 'Rejected', c.rejected]
  ].map(([k, l, n]) => `<div class="stat ${k}"><span class="n">${n}</span><span class="l">${l}</span></div>`).join('');

  const counts = { all: state.rows.length, ...c };
  $('#chips').innerHTML = ['all', ...STATUSES].map(k =>
    `<button type="button" class="chip${state.status === k ? ' active' : ''}" data-status="${k}" role="tab" aria-selected="${state.status === k}">` +
    `${k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1)}<span class="c">${counts[k]}</span></button>`).join('');
}

function renderList() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / CONFIG.PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  const start = (state.page - 1) * CONFIG.PAGE_SIZE;
  const slice = list.slice(start, start + CONFIG.PAGE_SIZE);

  const empty = $('#empty');
  const wrap = $('#tableWrap');
  const pager = $('#pager');

  $('#count').textContent = list.length
    ? `Showing ${start + 1}–${start + slice.length} of ${list.length}` +
      (list.length !== state.rows.length ? ` (filtered from ${state.rows.length})` : '')
    : '';

  if (!state.rows.length) {
    wrap.hidden = true; pager.hidden = true; empty.hidden = false;
    empty.innerHTML = '<h3>No applications yet</h3><p>They will appear here as soon as someone submits the form.</p>';
    return;
  }
  if (!list.length) {
    wrap.hidden = true; pager.hidden = true; empty.hidden = false;
    empty.innerHTML = '<h3>No matches</h3><p>Try a different search or filter.</p>';
    return;
  }

  empty.hidden = true;
  wrap.hidden = false;
  $('#tbody').innerHTML = slice.map(r => {
    const exp = r.has_experience ? `Yes <span class="muted">· ★ ${esc(r.rating)}/5</span>` : 'No';
    return `<tr data-id="${esc(r.id)}" tabindex="0" role="button" aria-label="Open application from ${esc(r.full_name)}">
      <td><div class="person">
        <span class="avatar" style="background:${avatarColor(r.full_name)}">${esc(initials(r.full_name))}</span>
        <div><div class="p-name">${esc(r.full_name)}</div><div class="p-mail">${esc(r.email)}</div><div class="p-date">${esc(fmtDate(r.created_at))}</div></div>
      </div></td>
      <td class="hide-m">${esc(r.class_name)}</td>
      <td class="hide-m">${esc(r.gender)}</td>
      <td class="hide-m nowrap">${esc(r.phone)}</td>
      <td class="hide-m nowrap">${exp}</td>
      <td class="hide-xs nowrap muted">${esc(fmtDate(r.created_at))}</td>
      <td>${badge(r.status)}</td>
    </tr>`;
  }).join('');

  pager.hidden = pages <= 1;
  $('#pageInfo').textContent = `Page ${state.page} of ${pages}`;
  $('#prevBtn').disabled = state.page <= 1;
  $('#nextBtn').disabled = state.page >= pages;
}

function renderAll() {
  renderStats();
  renderList();
  if (state.openId) renderDrawer();
}

/* ---- toolbar wiring ---- */
let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value; state.page = 1; renderList(); }, 120);
});
$('#sort').addEventListener('change', e => { state.sort = e.target.value; state.page = 1; renderList(); });
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  state.status = b.dataset.status;
  state.page = 1;
  renderStats();
  renderList();
});
$('#prevBtn').addEventListener('click', () => { state.page--; renderList(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('#nextBtn').addEventListener('click', () => { state.page++; renderList(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

const tbody = $('#tbody');
tbody.addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) openDrawer(tr.dataset.id);
});
tbody.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest('tr[data-id]');
  if (tr) { e.preventDefault(); openDrawer(tr.dataset.id); }
});

/* =====================================================
   Detail drawer
   ===================================================== */
const drawer = $('#drawer');
const scrim = $('#scrim');
let lastFocus = null;

function kv(label, valueHtml) {
  return `<div class="kv"><dt>${esc(label)}</dt><dd>${valueHtml}</dd></div>`;
}
const orDash = v => (v ? esc(v) : '<span class="muted">—</span>');

function renderDrawer() {
  const r = byId(state.openId);
  if (!r) return closeDrawer();

  const age = ageFrom(r.dob);
  const stars = r.has_experience && r.rating
    ? `<span class="stars" aria-label="${esc(r.rating)} out of 5">${[1, 2, 3, 4, 5].map(i => `<span class="${i <= r.rating ? 'on' : ''}">★</span>`).join('')}</span> ${esc(r.rating)}/5`
    : '<span class="muted">—</span>';
  const tel = String(r.phone || '').replace(/[^\d+]/g, '');

  $('#drawerBody').innerHTML = `
    <div class="d-top">
      <span class="avatar" style="background:${avatarColor(r.full_name)}">${esc(initials(r.full_name))}</span>
      <div>
        <div class="d-name">${esc(r.full_name)}</div>
        <div class="d-sub">Applied ${esc(fmtDate(r.created_at))}</div>
      </div>
    </div>

    <div class="seg" role="group" aria-label="Application status">
      ${STATUSES.map(s => `<button type="button" class="${s}${r.status === s ? ' on' : ''}" data-set-status="${s}"${state.busy ? ' disabled' : ''} aria-pressed="${r.status === s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>
    <div class="reviewed">${r.reviewed_by
      ? `Last changed by ${esc(r.reviewed_by)} on ${esc(fmtDate(r.reviewed_at))}`
      : 'Not reviewed yet'}</div>

    <div class="d-sec"><h3>Personal</h3><dl>
      ${kv('Full name', esc(r.full_name))}
      ${kv('Date of birth', esc(fmtDob(r.dob)) + (age !== null ? ` <span class="muted">(age ${age})</span>` : ''))}
      ${kv('Class', esc(r.class_name))}
      ${kv('Gender', esc(r.gender))}
    </dl></div>

    <div class="d-sec"><h3>Contact</h3><dl>
      ${kv('Email', `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`)}
      ${kv('Phone', `<a href="tel:${esc(tel)}">${esc(r.phone)}</a>`)}
      ${kv('Discord', esc(r.discord))}
      ${kv('Hack Club Slack', orDash(r.slack_id))}
    </dl></div>

    <div class="d-sec"><h3>Experience</h3><dl>
      ${kv('Coding experience', r.has_experience ? 'Yes' : 'No')}
      ${kv('Languages', orDash(r.languages))}
      ${kv('Self-rating', stars)}
    </dl></div>

    <div class="d-sec"><h3>Other</h3><dl>
      ${kv('Skills', orDash(r.skills))}
      ${kv('Computer at home', r.has_computer === true ? 'Yes' : r.has_computer === false ? 'No' : '<span class="muted">—</span>')}
    </dl></div>

    <div class="danger-zone">
      <p>Deleting removes this application permanently.</p>
      <button type="button" class="btn danger${state.confirmDelete ? ' confirm' : ''}" data-action="delete"${state.busy ? ' disabled' : ''}>
        ${state.confirmDelete ? 'Click again to confirm' : 'Delete'}
      </button>
    </div>`;
}

function openDrawer(id) {
  if (!byId(id)) return;
  lastFocus = document.activeElement;
  state.openId = id;
  state.confirmDelete = false;
  renderDrawer();
  scrim.hidden = false;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  $('#drawerClose').focus();
}

function closeDrawer(silent) {
  state.openId = null;
  state.confirmDelete = false;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  scrim.hidden = true;
  if (!silent && lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

$('#drawerClose').addEventListener('click', () => closeDrawer());
scrim.addEventListener('click', () => closeDrawer());

document.addEventListener('keydown', e => {
  if (!state.openId) return;
  if (e.key === 'Escape') { closeDrawer(); return; }
  if (e.key === 'Tab') {            // keep keyboard focus inside the drawer
    const f = [...drawer.querySelectorAll('button:not([disabled]), a[href]')];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

let confirmTimer;
$('#drawerBody').addEventListener('click', e => {
  const sBtn = e.target.closest('[data-set-status]');
  if (sBtn) return setStatus(state.openId, sBtn.dataset.setStatus);
  if (e.target.closest('[data-action="delete"]')) {
    if (!state.confirmDelete) {
      state.confirmDelete = true;
      renderDrawer();
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { state.confirmDelete = false; if (state.openId) renderDrawer(); }, 4000);
    } else {
      clearTimeout(confirmTimer);
      deleteApplication(state.openId);
    }
  }
});

/* =====================================================
   Changing data
   ===================================================== */
async function setStatus(id, status) {
  const row = byId(id);
  if (!row || row.status === status || state.busy || !STATUSES.includes(status)) return;
  state.busy = true;
  renderDrawer();
  try {
    const { data, error } = await sb.from('applications')
      .update({ status })
      .eq('id', id)
      .select('status, reviewed_by, reviewed_at');
    if (error) return dbError(error, 'Could not update the status.');
    if (!data || !data.length) return toast('Update was not permitted for this account.', 'err');
    Object.assign(row, data[0]);
    toast(`Marked as ${status}.`, 'ok');
  } catch (err) {
    dbError(err, 'Could not update the status.');
  } finally {
    state.busy = false;
    renderAll();
  }
}

async function deleteApplication(id) {
  if (state.busy) return;
  state.busy = true;
  state.confirmDelete = false;
  renderDrawer();
  try {
    const { data, error } = await sb.from('applications').delete().eq('id', id).select('id');
    if (error) return dbError(error, 'Could not delete the application.');
    if (!data || !data.length) return toast('Delete was not permitted for this account.', 'err');
    state.rows = state.rows.filter(r => r.id !== id);
    closeDrawer();
    toast('Application deleted.', 'ok');
  } catch (err) {
    dbError(err, 'Could not delete the application.');
  } finally {
    state.busy = false;
    renderAll();
  }
}

/* =====================================================
   CSV export (respects the current search / filter / sort)
   ===================================================== */
const CSV_COLUMNS = [
  ['Applied At', r => r.created_at],
  ['Full Name', r => r.full_name],
  ['Date of Birth', r => fmtDob(r.dob)],
  ['Class', r => r.class_name],
  ['Gender', r => r.gender],
  ['Email', r => r.email],
  ['Phone', r => r.phone],
  ['Discord', r => r.discord],
  ['Hack Club Slack ID', r => r.slack_id],
  ['Coding Experience', r => (r.has_experience ? 'Yes' : 'No')],
  ['Programming Languages', r => r.languages],
  ['Rating (1-5)', r => r.rating],
  ['Skills', r => r.skills],
  ['Computer At Home', r => (r.has_computer === true ? 'Yes' : r.has_computer === false ? 'No' : '')],
  ['Status', r => r.status],
  ['Reviewed By', r => r.reviewed_by],
  ['Reviewed At', r => r.reviewed_at]
];

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  // Spreadsheet-formula injection guard: applicants type this text, and a cell
  // starting with = + - @ would be executed as a formula when opened in Excel.
  // Plain phone numbers like "+92 300-1234567" contain no letters and are safe.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d\s-]+$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows) {
  const head = CSV_COLUMNS.map(c => csvCell(c[0])).join(',');
  const body = rows.map(r => CSV_COLUMNS.map(c => csvCell(c[1](r))).join(','));
  return [head, ...body].join('\r\n');
}

$('#exportBtn').addEventListener('click', () => {
  const rows = filtered();
  if (!rows.length) return toast('Nothing to export.', 'err');
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });   // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `pces-applications-${day}${state.status !== 'all' ? '-' + state.status : ''}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${rows.length} application${rows.length === 1 ? '' : 's'}.`, 'ok');
});

/* =====================================================
   Start
   ===================================================== */
(async function init() {
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) await enter(data.session);
    else showView('auth');
  } catch (err) {
    console.error(err);
    showView('auth');
  }
})();
