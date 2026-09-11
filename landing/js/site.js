/* DailyBee website — shared behaviour. Plain JavaScript, no dependencies.
   - fills repository links from config.js
   - detects the visitor's platform for the tutorial's OS tabs
   - honeycomb canvas behind the hero: the grid is drawn once to an offscreen canvas, only the glowing cells are
     redrawn per frame; cells ease towards the pointer and a slow ambient wave drifts across
   - pointer-driven effects (hero card tilt, feature spotlight) are eased every frame instead of jumping
   - reveal-on-scroll, screenshots fading in once loaded, live ticking timer, copy buttons, mobile nav, OS tabs,
     table-of-contents highlighting
   Every animation respects prefers-reduced-motion. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  const site = window.DAILYBEE_SITE || {};
  const repo = (site.repo || '').replace(/\/$/, '');
  const repoSet = repo && !/OWNER/.test(repo);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- Platform ---------- */
  const ua = navigator.userAgent;
  const os = /Windows/i.test(ua) ? 'windows' : /Mac|iPhone|iPad/i.test(ua) ? 'mac' : /Linux|Android|X11/i.test(ua) ? 'linux' : 'windows';
  const osName = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
  document.documentElement.dataset.platform = os;

  /* ---------- Links from config.js ---------- */
  const links = {
    repo: repo,
    releases: repo + '/releases',
    latest: repo + '/releases/latest',
    issues: repo + '/issues',
    readme: repo + '#readme',
    tutorialDoc: repo + '/blob/main/TESTING.md',
    releasing: repo + '/blob/main/RELEASING.md',
    development: repo + '/blob/main/DEVELOPMENT.md',
    cloud: repo + '/tree/main/deploy/cloud',
    licence: repo + '/blob/main/LICENSE',
    contact: site.contact || '',
  };
  $$('[data-link]').forEach((a) => {
    const key = a.dataset.link;
    if (links[key]) a.href = links[key];
    if (key === 'contact') { if (!links.contact) a.hidden = true; return; }
    if (!repoSet) {
      a.title = 'Set the repository address in landing/config.js';
      a.classList.add('needs-config');
    }
  });
  $$('[data-repo-name]').forEach((el) => { el.textContent = repoSet ? repo.replace(/^https?:\/\//, '') : 'repository address not set yet (landing/config.js)'; });
  $$('[data-version]').forEach((el) => { el.textContent = site.version || ''; });
  $$('[data-os-name]').forEach((el) => { el.textContent = osName[os]; });
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
  if (!repoSet) {
    const note = $('#repo-config-note');
    if (note) note.hidden = false;
  }

  /* ---------- Entrance animations hand control back once they finish ---------- */
  // A finished CSS animation with fill-mode forwards would keep overriding the inline transform the tilt sets.
  $$('.enter').forEach((el) => el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true }));

  /* ---------- Screenshots fade in once loaded ---------- */
  $$('.frame img').forEach((img) => {
    const done = () => img.classList.add('loaded');
    if (img.complete && img.naturalWidth) done();
    else { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); }
  });

  /* ---------- Mobile nav ---------- */
  const toggle = $('.nav-toggle');
  const navLinks = $('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    navLinks.addEventListener('click', (e) => { if (e.target.closest('a')) { navLinks.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- Reveal on scroll ---------- */
  // Once an element has finished revealing, the reveal classes come off so its own hover transitions
  // (cards, frames) apply again instead of the slow reveal transition.
  const revealEls = $$('.reveal, .hero-shot .frame');
  const settle = (el) => setTimeout(() => el.classList.remove('reveal', 'from-left', 'from-right'), reduced ? 50 : 1500);
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => { el.classList.add('in'); settle(el); });
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); settle(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Live timer (hero card) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  window.dbFormatClock = (sec) => pad(Math.floor(sec / 3600)) + ':' + pad(Math.floor((sec % 3600) / 60)) + ':' + pad(sec % 60);
  $$('[data-live-timer]').forEach((el) => {
    let s = Number(el.dataset.liveTimer) || 0;
    el.textContent = window.dbFormatClock(s);
    if (reduced) return;
    setInterval(() => { s += 1; el.textContent = window.dbFormatClock(s); }, 1000);
  });

  /* ---------- Pointer tilt (eased every frame) ---------- */
  if (fine && !reduced) {
    $$('[data-tilt]').forEach((card) => {
      const max = Number(card.dataset.tilt) || 4;
      const area = card.parentElement;
      let targetX = 0, targetY = 0, curX = 0, curY = 0, raf = 0;
      const step = () => {
        curX = lerp(curX, targetX, 0.12);
        curY = lerp(curY, targetY, 0.12);
        card.style.transform = `perspective(1200px) rotateX(${curX.toFixed(3)}deg) rotateY(${curY.toFixed(3)}deg)`;
        raf = Math.abs(targetX - curX) > 0.005 || Math.abs(targetY - curY) > 0.005 ? requestAnimationFrame(step) : 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
      area.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        targetY = px * max * 2; targetX = -py * max * 2;
        kick();
      });
      area.addEventListener('pointerleave', () => { targetX = 0; targetY = 0; kick(); });
    });
  }

  /* ---------- Feature cards: honey spotlight eased towards the pointer ---------- */
  if (fine) {
    $$('.feature').forEach((card) => {
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, seeded = false;
      const step = () => {
        cx = lerp(cx, tx, reduced ? 1 : 0.18);
        cy = lerp(cy, ty, reduced ? 1 : 0.18);
        card.style.setProperty('--mx', cx.toFixed(1) + 'px');
        card.style.setProperty('--my', cy.toFixed(1) + 'px');
        raf = Math.abs(tx - cx) > 0.3 || Math.abs(ty - cy) > 0.3 ? requestAnimationFrame(step) : 0;
      };
      card.addEventListener('pointerenter', (e) => {
        const r = card.getBoundingClientRect();
        // start the spotlight where the pointer came in, not from a stale corner
        if (!seeded) { cx = e.clientX - r.left; cy = e.clientY - r.top; seeded = true; }
      });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        tx = e.clientX - r.left; ty = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(step);
      });
    });
  }

  /* ---------- Honeycomb canvas ---------- */
  const canvas = $('#hex-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const grid = document.createElement('canvas');      // the static hex grid, drawn once per size
    const R = 30;                                        // hex radius (flat-top)
    const W = R * 2, H = Math.sqrt(3) * R;
    let width = 0, height = 0, dpr = 1, cells = [];
    let pointer = { x: -9999, y: -9999, active: false };
    let visible = true, t0 = performance.now(), raf = 0;

    function hexPath(c, x, y, r) {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    }
    function build() {
      const host = canvas.parentElement;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth; height = host.clientHeight;
      if (!width || !height) { cells = []; return; }   // hidden or not laid out yet; the resize observer calls again
      canvas.width = grid.width = Math.round(width * dpr);
      canvas.height = grid.height = Math.round(height * dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cells = [];
      const cols = Math.ceil(width / (W * 0.75)) + 2, rows = Math.ceil(height / H) + 2;
      for (let c = -1; c < cols; c++) for (let r = -1; r < rows; r++) {
        const x = c * W * 0.75, y = r * H + (c % 2 ? H / 2 : 0);
        cells.push({ x, y, seed: Math.random() * Math.PI * 2, glow: 0 });
      }
      // the pattern itself, once: same 8% ink as --pattern-hex, inverted on the dark hero
      const g = grid.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, width, height);
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(250,248,243,0.085)';
      for (const cell of cells) { hexPath(g, cell.x, cell.y, R - 1); g.stroke(); }
      draw(performance.now());
    }
    function draw(now) {
      raf = 0;
      if (!grid.width || !grid.height) return;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(grid, 0, 0, width, height);
      // cells that light up: near the pointer, plus a slow ambient wave drifting across the hero
      let moving = false;
      ctx.lineWidth = 1;
      for (const cell of cells) {
        let target = 0;
        if (pointer.active) {
          const d = Math.hypot(cell.x - pointer.x, cell.y - pointer.y);
          target = Math.max(0, 1 - d / 230);
          target *= target;
        }
        if (!reduced) {
          const wave = Math.sin(t * 0.55 + cell.x * 0.004 + cell.seed) * Math.sin(t * 0.3 + cell.y * 0.006);
          target = Math.max(target, wave > 0.9 ? (wave - 0.9) * 2.4 : 0);
        }
        cell.glow = reduced ? target : lerp(cell.glow, target, 0.08);
        if (Math.abs(target - cell.glow) > 0.002) moving = true;
        if (cell.glow > 0.01) {
          hexPath(ctx, cell.x, cell.y, R - 2);
          ctx.fillStyle = `rgba(245,180,0,${(cell.glow * 0.34).toFixed(3)})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(245,180,0,${(cell.glow * 0.6).toFixed(3)})`;
          ctx.stroke();
        }
      }
      if (visible && (!reduced || moving)) raf = requestAnimationFrame(draw);
    }
    const hero = canvas.parentElement;
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top, active: true };
      if (!raf) raf = requestAnimationFrame(draw);
    });
    hero.addEventListener('pointerleave', () => { pointer.active = false; if (!raf) raf = requestAnimationFrame(draw); });
    new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(draw);
    }).observe(canvas);
    let resizeTimer = 0;
    const rebuild = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(build, 120); };
    if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(hero); else window.addEventListener('resize', rebuild);
    build();
  }

  /* ---------- Copy buttons ---------- */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const block = btn.closest('.code, [data-copy-source]');
      const code = block && (block.querySelector('code') || block.querySelector('pre'));
      const text = btn.dataset.copy && btn.dataset.copy !== 'block' ? btn.dataset.copy : (code ? code.innerText : '');
      try { await navigator.clipboard.writeText(text.replace(/\n{3,}/g, '\n\n').trim() + '\n'); btn.classList.add('done'); btn.querySelector('span').textContent = 'Copied'; }
      catch { btn.querySelector('span').textContent = 'Select and copy'; }
      setTimeout(() => { btn.classList.remove('done'); btn.querySelector('span').textContent = 'Copy'; }, 1600);
    });
  });

  /* ---------- OS tabs (tutorial) ---------- */
  const tabs = $$('[data-os-tab]');
  if (tabs.length) {
    let stored = null;
    try { stored = localStorage.getItem('dailybee-os'); } catch { /* private mode */ }
    const setOs = (value, remember) => {
      tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.osTab === value)));
      $$('[data-os]').forEach((el) => el.classList.toggle('on', el.dataset.os.split(' ').includes(value)));
      $$('[data-os-name]').forEach((el) => { el.textContent = osName[value]; });
      if (remember) { try { localStorage.setItem('dailybee-os', value); } catch { /* ignore */ } }
    };
    tabs.forEach((b) => b.addEventListener('click', () => setOs(b.dataset.osTab, true)));
    setOs(stored && osName[stored] ? stored : os, false);
  }

  /* ---------- Table of contents highlighting (tutorial) ---------- */
  const tocLinks = $$('.toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((a) => [a.getAttribute('href').slice(1), a]));
    const sections = Array.from(byId.keys()).map((id) => document.getElementById(id)).filter(Boolean);
    let current = null;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!hit) return;
      if (current) current.classList.remove('active');
      current = byId.get(hit.target.id);
      if (current) current.classList.add('active');
    }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });
    sections.forEach((s) => io.observe(s));
  }
})();
