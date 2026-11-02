/* =====================================================
   CONFIG — how responses reach your inbox
   -----------------------------------------------------
   Option A (recommended): Web3Forms
     1. Go to https://web3forms.com and enter the email that should
        receive responses. The access key is emailed to you at once.
     2. Paste it below. No activation step, and your email address
        is NOT exposed in the page source.

   Option B (fallback): FormSubmit.co
     Leave WEB3FORMS_ACCESS_KEY empty and set RECIPIENT_EMAIL.
     Needs a one-time activation email, and the page must be served
     over http(s), not opened as a file:// page.
   ===================================================== */
const CONFIG = {
  WEB3FORMS_ACCESS_KEY: '7003d792-0841-4100-94ca-991c947cbb15',
  RECIPIENT_EMAIL: 'official.pces@gmail.com',
  EMAIL_SUBJECT: 'New PCES Membership Application'
};

/* =====================================================
   Helpers
   ===================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function fieldEl(name) { return $(`[data-field="${name}"]`); }

function showError(name, message) {
  const f = fieldEl(name);
  if (!f) return;
  f.classList.remove('valid');
  f.classList.add('invalid');
  $('.error', f).textContent = message;
}

function showValid(name) {
  const f = fieldEl(name);
  if (!f) return;
  f.classList.remove('invalid');
  f.classList.add('valid');
  $('.error', f).textContent = '';
}

function clearState(name) {
  const f = fieldEl(name);
  if (!f) return;
  f.classList.remove('invalid', 'valid');
  const err = $('.error', f);
  if (err) err.textContent = '';
}

/* =====================================================
   Custom select (Gender, Coding experience)
   ===================================================== */
function initSelect(root, onChange) {
  const control = $('.select-control', root);
  const valueEl = $('.select-value', root);
  const clearBtn = $('.select-clear', root);
  const options = $$('.select-menu li', root);
  const clearable = root.dataset.clearable === 'true';
  let value = '';
  let activeIndex = -1;

  function render() {
    root.classList.toggle('has-value', !!value);
    valueEl.textContent = value || valueEl.dataset.placeholder || '';
    valueEl.classList.toggle('placeholder', !value);
    options.forEach(o => o.classList.toggle('selected', o.dataset.value === value));
  }

  function set(v, silent) {
    value = v;
    render();
    if (!silent && onChange) onChange(value);
  }

  function open() {
    root.classList.add('open');
    control.setAttribute('aria-expanded', 'true');
    activeIndex = options.findIndex(o => o.dataset.value === value);
    highlight();
  }

  function close() {
    root.classList.remove('open');
    control.setAttribute('aria-expanded', 'false');
  }

  function highlight() {
    options.forEach((o, i) => o.classList.toggle('active', i === activeIndex));
  }

  control.addEventListener('click', e => {
    if (e.target.closest('.select-clear')) return;
    root.classList.contains('open') ? close() : open();
  });

  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (clearable) set('');
    close();
  });

  options.forEach(o => {
    o.addEventListener('click', () => {
      set(o.dataset.value);
      close();
      control.focus();
    });
  });

  control.addEventListener('keydown', e => {
    const isOpen = root.classList.contains('open');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) return open();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + options.length) % options.length;
      highlight();
    } else if (e.key === 'Enter' && isOpen && activeIndex >= 0) {
      e.preventDefault();
      set(options[activeIndex].dataset.value);
      close();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  document.addEventListener('click', e => {
    if (!root.contains(e.target)) close();
  });

  if (root.dataset.default) set(root.dataset.default, true);
  render();

  return { get value() { return value; }, set };
}

/* =====================================================
   Date of birth (mask + native calendar picker)
   ===================================================== */
const dobInput = $('#dob');
const dobPicker = $('#dobPicker');

dobInput.addEventListener('input', () => {
  const digits = dobInput.value.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  dobInput.value = out;
});

$('#dobBtn').addEventListener('click', () => {
  if (typeof dobPicker.showPicker === 'function') {
    try { dobPicker.showPicker(); return; } catch (_) { /* fall through */ }
  }
  dobPicker.focus();
  dobPicker.click();
});

dobPicker.addEventListener('change', () => {
  if (!dobPicker.value) return;
  const [y, m, d] = dobPicker.value.split('-');
  dobInput.value = `${d}/${m}/${y}`;
  onFieldChanged('dob', true);
});

function parseDob(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/* =====================================================
   Phone number with searchable country selector
   ===================================================== */
const COUNTRIES = [
  ['Pakistan', 'pk', '+92'], ['India', 'in', '+91'], ['Afghanistan', 'af', '+93'],
  ['Bangladesh', 'bd', '+880'], ['United Arab Emirates', 'ae', '+971'],
  ['Saudi Arabia', 'sa', '+966'], ['Qatar', 'qa', '+974'], ['Kuwait', 'kw', '+965'],
  ['Oman', 'om', '+968'], ['Bahrain', 'bh', '+973'], ['United Kingdom', 'gb', '+44'],
  ['United States', 'us', '+1'], ['Canada', 'ca', '+1'], ['Australia', 'au', '+61'],
  ['Germany', 'de', '+49'], ['France', 'fr', '+33'], ['Italy', 'it', '+39'],
  ['Spain', 'es', '+34'], ['Netherlands', 'nl', '+31'], ['Sweden', 'se', '+46'],
  ['Turkey', 'tr', '+90'], ['China', 'cn', '+86'], ['Japan', 'jp', '+81'],
  ['South Korea', 'kr', '+82'], ['Malaysia', 'my', '+60'], ['Singapore', 'sg', '+65'],
  ['Indonesia', 'id', '+62'], ['Egypt', 'eg', '+20'], ['Nigeria', 'ng', '+234'],
  ['South Africa', 'za', '+27']
];

const phoneState = { code: '+92', iso: 'pk' };
const phonePop = $('#phonePop');
const phoneMenu = $('#phoneMenu');
const phoneBtn = $('#phoneCodeBtn');
const phoneSearch = $('#phoneSearch');
let phoneActive = 0;

function pickCountry(name, iso, dial) {
  phoneState.code = dial;
  phoneState.iso = iso;
  $('#phoneFlag').src = `https://flagcdn.com/w40/${iso}.png`;
  $('#phoneDial').textContent = dial;
  closePhoneMenu();
  $('#phone').focus();
}

function renderCountries() {
  const q = phoneSearch.value.trim().toLowerCase().replace(/^\+/, '');
  const list = COUNTRIES.filter(([name, iso, dial]) =>
    !q || name.toLowerCase().includes(q) || dial.replace('+', '').startsWith(q) || iso === q);
  phoneMenu.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'No matching country';
    phoneMenu.appendChild(li);
    return;
  }
  phoneActive = Math.min(phoneActive, list.length - 1);
  list.forEach(([name, iso, dial], i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.index = i;
    if (iso === phoneState.iso && dial === phoneState.code) li.classList.add('selected');
    if (i === phoneActive) li.classList.add('active');
    li.innerHTML = `<img src="https://flagcdn.com/w40/${iso}.png" alt="" width="24" height="16"><span>${name}</span><span class="c-dial">${dial}</span>`;
    li.addEventListener('click', () => pickCountry(name, iso, dial));
    li._data = [name, iso, dial];
    phoneMenu.appendChild(li);
  });
}

function openPhoneMenu() {
  phoneSearch.value = '';
  phoneActive = 0;
  renderCountries();
  phonePop.classList.add('open');
  phoneBtn.setAttribute('aria-expanded', 'true');
  setTimeout(() => phoneSearch.focus(), 0);
}

function closePhoneMenu() {
  phonePop.classList.remove('open');
  phoneBtn.setAttribute('aria-expanded', 'false');
}

phoneBtn.addEventListener('click', () => {
  phonePop.classList.contains('open') ? closePhoneMenu() : openPhoneMenu();
});

phoneSearch.addEventListener('input', () => { phoneActive = 0; renderCountries(); });

phoneSearch.addEventListener('keydown', e => {
  const items = $$('li:not(.none)', phoneMenu);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    phoneActive = (phoneActive + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === phoneActive));
    items[phoneActive].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (items[phoneActive]) pickCountry(...items[phoneActive]._data);
  } else if (e.key === 'Escape') {
    closePhoneMenu();
    phoneBtn.focus();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.phone')) closePhoneMenu();
});

$('#phone').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/[^\d\s-]/g, '');
});

/* =====================================================
   Star rating
   ===================================================== */
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9L12 2.5z';
const RATING_LABELS = ['', 'Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'];
const starsEl = $('#stars');
const ratingText = $('#ratingText');
let rating = 0;

for (let i = 1; i <= 5; i++) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'star';
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''} - ${RATING_LABELS[i]}`);
  btn.setAttribute('aria-checked', 'false');
  btn.dataset.value = i;
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${STAR_PATH}"/></svg>`;
  starsEl.appendChild(btn);
}
const starBtns = $$('.star', starsEl);

function paintStars(hoverValue) {
  starBtns.forEach((s, idx) => {
    const n = idx + 1;
    s.classList.toggle('on', !hoverValue && n <= rating);
    s.classList.toggle('hover', !!hoverValue && n <= hoverValue);
    s.setAttribute('aria-checked', String(n === rating));
  });
  ratingText.textContent = RATING_LABELS[hoverValue || rating] || '';
}

function setRating(n) {
  rating = n;
  paintStars();
  const s = starBtns[n - 1];
  s.classList.remove('pop');
  void s.offsetWidth;
  s.classList.add('pop');
  onFieldChanged('rating', true);
}

starBtns.forEach(s => {
  s.addEventListener('mouseenter', () => paintStars(+s.dataset.value));
  s.addEventListener('click', () => setRating(+s.dataset.value));
  s.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setRating(Math.min(5, (rating || 0) + 1));
      starBtns[rating - 1].focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setRating(Math.max(1, (rating || 2) - 1));
      starBtns[rating - 1].focus();
    }
  });
});
starsEl.addEventListener('mouseleave', () => paintStars());

/* =====================================================
   Selects
   ===================================================== */
const genderSelect = initSelect($('#gender'), () => onFieldChanged('gender', true));
const experienceSelect = initSelect($('#experience'), val => {
  toggleExperienceExtra(val);
  onFieldChanged('experience', true);
});

/* =====================================================
   Conditional section: only visible when experience = Yes
   ===================================================== */
const extra = $('#experienceExtra');

function toggleExperienceExtra(val) {
  const show = val === 'Yes';
  if (show && extra.hidden) {
    extra.hidden = false;
    $$('.field', extra).forEach(f => {
      f.classList.remove('reveal');
      void f.offsetWidth; // restart animation
      f.classList.add('reveal');
    });
  } else if (!show && !extra.hidden) {
    extra.hidden = true;
    $('#languages').value = '';
    rating = 0;
    paintStars();
    clearState('languages');
    clearState('rating');
  }
}
toggleExperienceExtra(experienceSelect.value);

/* =====================================================
   Validation rules (return an error message, or '' if OK)
   ===================================================== */
const val = id => $('#' + id).value.trim();

const rules = {
  fullName() {
    const v = val('fullName');
    if (!v) return 'Please enter your full name.';
    if (v.length < 2) return 'Name is too short.';
    return '';
  },
  dob() {
    const v = val('dob');
    if (!v) return 'Please enter your date of birth.';
    const d = parseDob(v);
    if (!d) return 'Use a real date in the format DD/MM/YYYY.';
    if (d > new Date()) return 'Date of birth cannot be in the future.';
    if (d.getFullYear() < 1950) return 'Please enter a valid date of birth.';
    return '';
  },
  class() { return val('class') ? '' : 'Please enter your class.'; },
  gender() { return genderSelect.value ? '' : 'Please select your gender.'; },
  email() {
    const v = val('email');
    if (!v) return 'Please enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address.';
    return '';
  },
  phone() {
    const digits = $('#phone').value.replace(/\D/g, '');
    if (!digits) return 'Please enter your phone number.';
    if (digits.length < 6 || digits.length > 14) return 'Please enter a valid phone number.';
    return '';
  },
  discord() { return val('discord') ? '' : 'Please enter your Discord username.'; },
  experience() { return experienceSelect.value ? '' : 'Please select an option.'; },
  languages() { return val('languages') ? '' : 'Please list the languages you know.'; },
  rating() { return rating ? '' : 'Please rate your coding experience.'; },
  confirm() { return $('#confirm').checked ? '' : 'You must confirm this to continue.'; },
  conduct() { return $('#conduct').checked ? '' : 'You must agree to continue.'; }
};

function requiredFields() {
  const list = ['fullName', 'dob', 'class', 'gender', 'email', 'phone', 'discord', 'experience'];
  if (experienceSelect.value === 'Yes') list.push('languages', 'rating');
  list.push('confirm', 'conduct');
  return list;
}

/** Validate one field and update its visual state. Returns true if valid. */
function checkField(name) {
  const msg = rules[name]();
  msg ? showError(name, msg) : showValid(name);
  return !msg;
}

/** Called whenever a field's value changes. */
function onFieldChanged(name, validateNow) {
  const f = fieldEl(name);
  // Re-validate live once a field has been touched; otherwise wait for blur.
  if (validateNow || (f && f.classList.contains('invalid'))) checkField(name);
  updateProgress();
}

/* =====================================================
   Progress bar
   ===================================================== */
const progressEl = $('#progress');
const barFill = $('#barFill');
const bar = $('#bar');
const progressText = $('#progressText');

function updateProgress() {
  const list = requiredFields();
  const done = list.filter(n => !rules[n]()).length;
  const pct = Math.round((done / list.length) * 100);
  barFill.style.width = pct + '%';
  bar.setAttribute('aria-valuenow', String(pct));
  progressEl.classList.toggle('done', done === list.length);
  progressText.textContent = done === list.length
    ? 'All required fields completed. Ready to submit.'
    : `${done} of ${list.length} required fields completed`;
}

/* =====================================================
   Field wiring
   ===================================================== */
[
  ['fullName', 'fullName'], ['dob', 'dob'], ['class', 'class'], ['email', 'email'],
  ['phone', 'phone'], ['discord', 'discord'], ['languages', 'languages']
].forEach(([id, field]) => {
  const input = $('#' + id);
  input.addEventListener('input', () => onFieldChanged(field, false));
  input.addEventListener('blur', () => {
    // Only flag a field on blur if the user actually typed something,
    // so tabbing through the form doesn't light up everything red.
    if (input.value.trim()) checkField(field);
    updateProgress();
  });
});
$('#confirm').addEventListener('change', () => onFieldChanged('confirm', true));
$('#conduct').addEventListener('change', () => onFieldChanged('conduct', true));

/* =====================================================
   Sending the email
   ===================================================== */
async function sendEmail(fields, replyTo) {
  // ---- Option A: Web3Forms ----
  if (CONFIG.WEB3FORMS_ACCESS_KEY) {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        access_key: CONFIG.WEB3FORMS_ACCESS_KEY,
        subject: CONFIG.EMAIL_SUBJECT,
        from_name: 'PCES Membership Form',
        replyto: replyTo,
        botcheck: false,
        ...fields
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Server responded with status ${res.status}.`);
    }
    return;
  }

  // ---- Option B: FormSubmit.co ----
  if (CONFIG.RECIPIENT_EMAIL) {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(CONFIG.RECIPIENT_EMAIL)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        ...fields,
        _subject: CONFIG.EMAIL_SUBJECT,
        _template: 'table',
        _captcha: 'false',
        _replyto: replyTo
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.success) === 'false') {
      throw new Error(data.message || `Server responded with status ${res.status}.`);
    }
    if (/activat/i.test(data.message || '')) {
      toast('Check your inbox (and spam) for the FormSubmit activation email.');
    }
    return;
  }

  const err = new Error('NOT_CONFIGURED');
  err.code = 'NOT_CONFIGURED';
  throw err;
}

/* =====================================================
   Submit
   ===================================================== */
const form = $('#regForm');
const submitBtn = $('#submitBtn');
const submitLabel = $('.submit-label', submitBtn);
const formError = $('#formError');

function showFormError(msg) {
  formError.textContent = msg;
  formError.classList.remove('show');
  void formError.offsetWidth;
  formError.classList.add('show');
}

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle('loading', on);
  submitLabel.textContent = on ? 'Submitting…' : 'Submit';
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  formError.classList.remove('show');

  // Validate every visible required field and show all errors at once.
  const list = requiredFields();
  const failed = list.filter(n => !checkField(n));
  updateProgress();

  if (failed.length) {
    toast(failed.length === 1
      ? 'Please fix the highlighted field.'
      : `Please fix the ${failed.length} highlighted fields.`);
    const first = fieldEl(failed[0]);
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const target = $('input:not([type="hidden"]), button', first);
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 350);
    return;
  }

  // Honeypot: bots tick this hidden box, people never see it.
  if ($('#botcheck').checked) return;

  const hasExp = experienceSelect.value === 'Yes';
  const fields = {
    'Full Name': val('fullName'),
    'Date of Birth': val('dob'),
    'Class': val('class'),
    'Gender': genderSelect.value,
    'Email Address': val('email'),
    'Phone Number': `${phoneState.code} ${val('phone')}`,
    'Discord Username': val('discord'),
    'Hack Club Slack ID': val('slack') || 'N/A',
    'Coding Experience': experienceSelect.value,
    'Programming Languages': hasExp ? val('languages') : 'N/A',
    'Coding Experience Rating (1-5)': hasExp ? `${rating} (${RATING_LABELS[rating]})` : 'N/A',
    'Skills That Could Help The Club': val('skills') || 'N/A',
    'Confirmed Information Accurate': 'Yes',
    'Agreed To Code Of Conduct': 'Yes'
  };

  setLoading(true);

  try {
    await sendEmail(fields, val('email'));

    $('#thanksName').textContent = val('fullName').split(/\s+/)[0];
    $('#thanksEmail').textContent = val('email');
    form.classList.add('leaving');
    setTimeout(() => {
      form.hidden = true;
      form.classList.remove('leaving');
      progressEl.classList.add('hide');
      $('#thanks').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  } catch (err) {
    console.error('Submission failed:', err);
    if (err.code === 'NOT_CONFIGURED') {
      showFormError('Email delivery is not set up yet. Open script.js and set WEB3FORMS_ACCESS_KEY (recommended) or RECIPIENT_EMAIL in the CONFIG block.');
    } else {
      let msg = `Submission failed: ${err.message}`;
      if (location.protocol === 'file:' && !CONFIG.WEB3FORMS_ACCESS_KEY) {
        msg += ' You are opening this page as a local file; FormSubmit may refuse requests from file:// pages. Serve the page over http (for example with VS Code Live Server) or switch to Web3Forms.';
      }
      showFormError(msg);
    }
    setLoading(false);
  }
});

/* =====================================================
   "Submit another response"
   ===================================================== */
$('#againBtn').addEventListener('click', () => {
  form.reset();
  genderSelect.set('', true);
  experienceSelect.set('Yes', true);
  toggleExperienceExtra('Yes');
  rating = 0;
  paintStars();
  phoneState.code = '+92';
  phoneState.iso = 'pk';
  $('#phoneFlag').src = 'https://flagcdn.com/w40/pk.png';
  $('#phoneDial').textContent = '+92';
  $$('.field').forEach(f => {
    f.classList.remove('invalid', 'valid');
    const err = $('.error', f);
    if (err) err.textContent = '';
  });
  formError.classList.remove('show');
  setLoading(false);
  $('#thanks').hidden = true;
  form.hidden = false;
  progressEl.classList.remove('hide');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* =====================================================
   Init
   ===================================================== */
updateProgress();
