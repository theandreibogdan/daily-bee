/* DailyBee website — the interactive demo.
   A small model of what the app does during a task: a timer, a stream of "what is in front" samples
   (VS Code, a pull request, MDN, Slack, YouTube…) sorted into categories, a check-in when the samples drift,
   a wrap-up when you stop, and a report drafted from the entries. Everything here is sample data
   generated in the browser; it reads nothing on the visitor's machine. Demo time runs 60× faster:
   one real second is one demo minute, so a day fits in a coffee break. */
(function () {
  'use strict';
  const root = document.getElementById('demo-app');
  if (!root) return;
  const $ = (sel) => root.querySelector(sel);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = window.dbFormatClock || ((s) => String(s));

  const TASKS = [
    { id: 't1', name: 'Timer sync across devices', project: 'api-gateway', color: 'var(--blue-500)', key: 'DB-1042', size: 'Large', done: 'Cross-device timer state via Web Locks + server reconcile' },
    { id: 't2', name: 'Review: rate limiter PR', project: 'api-gateway', color: 'var(--blue-500)', key: 'DB-1038', size: 'Small', done: 'PR #412 approved or changes requested' },
    { id: 't3', name: 'Daily report template polish', project: 'dailybee-web', color: 'var(--green-500)', key: 'DB-1051', size: 'Medium', done: 'Template renders the new week summary' },
  ];
  // What the tracker would see: app, title, category. Weighted so a "day" looks like a real one.
  const SAMPLES = [
    { w: 34, app: 'VS Code', title: 'timer-sync.ts — api-gateway', cat: 'work', icon: 'code' },
    { w: 10, app: 'Google Chrome', title: 'github.com · PR #412 rate limiter · dailybee/api', cat: 'work', icon: 'globe' },
    { w: 9, app: 'Windows Terminal', title: 'pnpm test --watch', cat: 'work', icon: 'terminal' },
    { w: 7, app: 'Google Chrome', title: 'developer.mozilla.org · Web Locks API', cat: 'research', icon: 'globe' },
    { w: 4, app: 'Google Chrome', title: 'stackoverflow.com · Coordinating tabs with Web Locks', cat: 'research', icon: 'globe' },
    { w: 6, app: 'Slack', title: '#eng-daily, DM Jack', cat: 'communication', icon: 'message' },
    { w: 4, app: 'Google Chrome', title: 'frontendmasters.com · Rust for TypeScript developers', cat: 'learning', icon: 'globe' },
    { w: 6, app: 'Google Chrome', title: 'youtube.com · Rust for TS devs — talk', cat: 'distraction', icon: 'globe' },
  ];
  const CATS = ['work', 'research', 'learning', 'communication', 'distraction'];
  const CAT_LABEL = { work: 'Work', research: 'Research', learning: 'Learning', communication: 'Communication', distraction: 'Distraction' };
  const ICONS = {
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6M12 19h8"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  };

  // state
  const state = {
    running: false, taskId: TASKS[0].id, seconds: 0, startedAt: null,
    mix: { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 },
    drift: 0, checkinOpen: false, answers: [], sample: null,
    entries: [
      { task: TASKS[1], minutes: 45, outcome: 'Done', at: '09:05', mix: { work: 41, research: 0, learning: 0, communication: 4, distraction: 0 } },
      { task: TASKS[2], minutes: 65, outcome: 'Done', at: '10:40', mix: { work: 52, research: 9, learning: 0, communication: 4, distraction: 0 } },
    ],
    log: [],
    tick: null, sampleTimer: null, dayMinutes: 11 * 60 + 25,
  };
  const els = {
    select: $('#demo-task'), title: $('#demo-title'), project: $('#demo-project'), key: $('#demo-key'), size: $('#demo-size'), doneMeans: $('#demo-done'),
    badge: $('#demo-badge'), timer: $('#demo-timer'), toggle: $('#demo-toggle'), now: $('#demo-now'), mix: $('#demo-mix'), legend: $('#demo-legend'),
    tracked: $('#demo-tracked'), focus: $('#demo-focus'), checkins: $('#demo-checkins'), entries: $('#demo-entries'), entriesCount: $('#demo-entries-count'),
    log: $('#demo-log'), wrap: $('#demo-wrapup'), report: $('#demo-report'), reportBtn: $('#demo-report-btn'), copyBtn: $('#demo-copy'), reset: $('#demo-reset'),
    checkin: document.getElementById('demo-checkin'),
  };

  const task = () => TASKS.find((t) => t.id === state.taskId);
  const short = (m) => (m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm');
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const now = () => hhmm(state.dayMinutes);

  function pickSample() {
    const total = SAMPLES.reduce((a, s) => a + s.w, 0);
    let r = Math.random() * total;
    for (const s of SAMPLES) { r -= s.w; if (r <= 0) return s; }
    return SAMPLES[0];
  }
  function log(text, kind) {
    state.log.unshift({ ts: now(), text, kind });
    state.log = state.log.slice(0, 30);
    renderLog();
  }

  /* ---------- rendering ---------- */
  function renderTask() {
    const t = task();
    els.title.textContent = t.name;
    els.project.innerHTML = '<i style="background:' + t.color + '"></i>' + t.project;
    els.key.textContent = t.key;
    els.size.textContent = t.size;
    els.doneMeans.textContent = t.done;
    els.select.value = t.id;
    els.select.disabled = state.running;
  }
  function renderStatus() {
    els.badge.className = 'badge ' + (state.running ? 'badge-honey' : '');
    els.badge.innerHTML = state.running ? '<span class="dot dot-pulse"></span>Tracking' : '<span class="dot"></span>Idle';
    els.timer.textContent = clock(state.seconds * 60);
    els.timer.classList.toggle('idle', !state.running);
    els.toggle.innerHTML = state.running
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>Stop'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 14 9-14 9z"/></svg>Start timer';
    els.toggle.classList.toggle('btn-glow', state.running);
    els.toggle.setAttribute('aria-pressed', String(state.running));
  }
  function renderNow() {
    const s = state.sample;
    if (!state.running || !s) {
      els.now.innerHTML = ICONS.code + '<span class="grow">' + (state.running ? 'Watching apps and browser tabs…' : 'Start the timer to see what the tracker would record.') + '</span>';
      return;
    }
    els.now.innerHTML = ICONS[s.icon] + '<span class="grow">Now in <span class="app">' + s.app + '</span> · ' + s.title + '</span><span class="cat-badge cat-' + s.cat + '"><i></i>' + CAT_LABEL[s.cat] + '</span>';
    // restart the swap animation so each new sample eases in
    els.now.classList.remove('swap');
    void els.now.offsetWidth;
    els.now.classList.add('swap');
  }
  function renderMix() {
    const total = CATS.reduce((a, c) => a + state.mix[c], 0);
    els.mix.innerHTML = CATS.map((c) => '<span class="cat-' + c + '" data-cat="' + c + '"></span>').join('');
    // widths are set after paint so the transition plays
    requestAnimationFrame(() => {
      CATS.forEach((c) => { const el = els.mix.querySelector('[data-cat=' + c + ']'); if (el) el.style.width = total ? (state.mix[c] / total * 100).toFixed(1) + '%' : '0%'; });
    });
    els.legend.innerHTML = CATS.map((c) => '<span class="cat-badge cat-' + c + '"><i></i>' + CAT_LABEL[c] + (total ? ' · ' + Math.round(state.mix[c] / total * 100) + '%' : '') + '</span>').join('');
    const focus = total ? Math.round((state.mix.work + state.mix.research + state.mix.learning) / total * 100) : 0;
    els.focus.textContent = total ? focus + '%' : '–';
    const trackedTotal = state.entries.reduce((a, e) => a + e.minutes, 0) + state.seconds;
    els.tracked.textContent = short(trackedTotal);
    els.checkins.textContent = String(state.answers.length);
  }
  function renderEntries() {
    els.entriesCount.textContent = state.entries.length + ' today';
    els.entries.innerHTML = state.entries.slice().reverse().map((e) => {
      const tone = e.outcome === 'Done' ? 'badge-success' : e.outcome === 'Blocked' ? 'badge-danger' : 'badge-honey';
      return '<div class="demo-entry"><span class="t">' + e.task.name + '<small>' + e.task.key + ' · ' + e.at + (e.edited ? ' · <span class="badge badge-sm">Edited</span>' : '') + '</small></span><span class="badge ' + tone + ' badge-sm">' + e.outcome + '</span><span class="d">' + short(e.minutes) + '</span></div>';
    }).join('');
  }
  function renderLog() {
    if (!state.log.length) { els.log.innerHTML = '<li class="empty">Nothing yet. Start the timer.</li>'; return; }
    els.log.innerHTML = state.log.map((l) => '<li><span class="ts">' + l.ts + '</span><span>' + l.text + '</span></li>').join('');
  }
  function renderAll() { renderTask(); renderStatus(); renderNow(); renderMix(); renderEntries(); renderLog(); }

  /* ---------- the loop ---------- */
  function start() {
    state.running = true; state.seconds = 0; state.startedAt = now();
    state.mix = { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 };
    state.drift = 0; state.sample = pickSample();
    els.wrap.hidden = true; els.report.hidden = true;
    log('Started “' + task().name + '”', 'start');
    renderAll();
    state.tick = setInterval(tick, 1000);
    state.sampleTimer = setInterval(nextSample, 2600 + Math.random() * 1200);
  }
  function tick() {
    state.seconds += 1; state.dayMinutes += 1;
    const cat = state.sample ? state.sample.cat : 'work';
    state.mix[cat] += 1;
    if (cat === 'distraction') state.drift += 1; else state.drift = 0;
    if (state.drift === 9 && !state.checkinOpen) openCheckin();
    if (state.seconds === 30 && !state.checkinOpen && !state.answers.some((a) => a.kind === 'pulse')) openPulse();
    els.timer.textContent = clock(state.seconds * 60);
    renderMix();
  }
  function nextSample() {
    if (!state.running) return;
    const prev = state.sample;
    let s = pickSample();
    if (prev && s === prev && Math.random() < 0.5) s = pickSample();
    state.sample = s;
    renderNow();
    clearInterval(state.sampleTimer);
    state.sampleTimer = setInterval(nextSample, 2600 + Math.random() * 1600);
  }
  function stop(outcome) {
    clearInterval(state.tick); clearInterval(state.sampleTimer);
    state.running = false;
    const minutes = Math.max(1, state.seconds);
    state.entries.push({ task: task(), minutes, outcome, at: state.startedAt, mix: { ...state.mix } });
    log('Stopped “' + task().name + '” after ' + short(minutes) + ' · ' + outcome, 'stop');
    state.seconds = 0; state.sample = null; state.drift = 0;
    closeCheckin();
    els.wrap.hidden = true;
    renderAll();
  }

  /* ---------- check-ins ---------- */
  function openCheckin() {
    state.checkinOpen = true;
    els.checkin.querySelector('.ico').className = 'ico';
    els.checkin.querySelector('.ico').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20"/></svg>';
    els.checkin.querySelector('.h4').textContent = 'Drifting?';
    els.checkin.querySelector('p').textContent = 'You have been on youtube.com for 9 minutes. Still on “' + task().name + '”?';
    els.checkin.querySelector('.chips').innerHTML = '<button class="chip primary" data-answer="Back to it">Back to it</button><button class="chip" data-answer="Taking a break">Taking a break</button><button class="chip" data-answer="This is work">This is work</button>';
    els.checkin.querySelector('.foot').textContent = now() + ' · answers go into your daily report';
    els.checkin.dataset.kind = 'drift';
    els.checkin.classList.add('show');
  }
  function openPulse() {
    state.checkinOpen = true;
    const ico = els.checkin.querySelector('.ico');
    ico.className = 'ico pulse';
    ico.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';
    els.checkin.querySelector('.h4').textContent = 'Halfway pulse';
    els.checkin.querySelector('p').textContent = 'Half an hour on “' + task().name + '”. How is it going?';
    els.checkin.querySelector('.chips').innerHTML = '<button class="chip primary" data-answer="On track">On track</button><button class="chip" data-answer="Slower than planned">Slower than planned</button><button class="chip" data-answer="Blocked">Blocked</button>';
    els.checkin.querySelector('.foot').textContent = now() + ' · answers go into your daily report';
    els.checkin.dataset.kind = 'pulse';
    els.checkin.classList.add('show');
  }
  function closeCheckin() { state.checkinOpen = false; els.checkin.classList.remove('show'); }
  els.checkin.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-answer]');
    if (chip) {
      const kind = els.checkin.dataset.kind;
      state.answers.push({ kind, answer: chip.dataset.answer, at: now() });
      log((kind === 'drift' ? 'Drift on youtube.com → “' : 'Halfway pulse → “') + chip.dataset.answer + '”', 'checkin');
      if (kind === 'drift' && chip.dataset.answer === 'This is work') { state.mix.work += state.mix.distraction; state.mix.distraction = 0; }
      state.drift = 0;
      closeCheckin(); renderMix();
    }
    if (e.target.closest('.x')) { state.drift = 0; closeCheckin(); }
  });

  /* ---------- controls ---------- */
  els.toggle.addEventListener('click', () => {
    if (!state.running) { start(); return; }
    // the wrap-up: how did it go?
    els.wrap.hidden = false;
    els.wrap.querySelector('.mix-line').textContent = 'Tracked ' + short(Math.max(1, state.seconds)) + ' · ' + (els.focus.textContent === '–' ? '' : els.focus.textContent + ' focus');
  });
  els.wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-outcome]');
    if (b) stop(b.dataset.outcome);
    if (e.target.closest('[data-keep]')) els.wrap.hidden = true;
  });
  els.select.addEventListener('change', () => { state.taskId = els.select.value; renderTask(); });
  els.reportBtn.addEventListener('click', () => {
    const total = state.entries.reduce((a, e) => a + e.minutes, 0);
    const mix = { work: 0, research: 0, learning: 0, communication: 0, distraction: 0 };
    state.entries.forEach((e) => CATS.forEach((c) => { mix[c] += e.mix[c] || 0; }));
    const mt = CATS.reduce((a, c) => a + mix[c], 0) || 1;
    const focus = Math.round((mix.work + mix.research + mix.learning) / mt * 100);
    const lines = [
      '# Daily report · ' + new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      '',
      '**Tracked** ' + short(total) + ' · **Focus** ' + focus + '% · **Check-ins** ' + state.answers.length,
      '',
      '## Done',
      ...state.entries.filter((e) => e.outcome === 'Done').map((e) => '- ' + e.task.name + ' (' + e.task.key + ') — ' + short(e.minutes)),
      ...(state.entries.some((e) => e.outcome !== 'Done') ? ['', '## In progress', ...state.entries.filter((e) => e.outcome !== 'Done').map((e) => '- ' + e.task.name + ' — ' + short(e.minutes) + ' · ' + e.outcome.toLowerCase())] : []),
      '',
      '## Time mix',
      ...CATS.filter((c) => mix[c]).map((c) => '- ' + CAT_LABEL[c] + ': ' + Math.round(mix[c] / mt * 100) + '%'),
      ...(state.answers.length ? ['', '## Check-ins', ...state.answers.map((a) => '- ' + a.at + ' ' + (a.kind === 'drift' ? 'drift on youtube.com' : 'halfway pulse') + ' → ' + a.answer)] : []),
      '',
      '_Sample data from the DailyBee website demo._',
    ];
    els.report.hidden = false;
    els.report.querySelector('pre').textContent = lines.join('\n');
    log('Report drafted from ' + state.entries.length + ' entries', 'report');
    els.report.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  });
  els.copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(els.report.querySelector('pre').textContent); els.copyBtn.querySelector('span').textContent = 'Copied'; }
    catch { els.copyBtn.querySelector('span').textContent = 'Select and copy'; }
    setTimeout(() => { els.copyBtn.querySelector('span').textContent = 'Copy markdown'; }, 1600);
  });
  els.reset.addEventListener('click', () => {
    clearInterval(state.tick); clearInterval(state.sampleTimer);
    state.running = false; state.seconds = 0; state.sample = null; state.drift = 0; state.answers = []; state.log = [];
    state.entries = state.entries.slice(0, 2); state.dayMinutes = 11 * 60 + 25;
    closeCheckin(); els.wrap.hidden = true; els.report.hidden = true;
    renderAll();
  });
  renderAll();
})();
