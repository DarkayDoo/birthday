// Verification for the birthday page (section 11 of the brief).
//
//   cd ..  &&  python3 -m http.server 8000        # serve the PARENT folder
//   node birthday/tools/verify.mjs                # defaults to http://localhost:8000/birthday/
//   node birthday/tools/verify.mjs https://darkaydoo.github.io/birthday/
//
// Uses WebKit for the iPhone profiles when it is installed, otherwise Chromium
// with the same viewport / DPR / touch / user agent (it says which it used).
// Screenshots go to tools/screens/ (gitignored).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8000/birthday/';
const HOST = new URL(BASE).host;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screens');
mkdirSync(OUT, { recursive: true });

const failures = [];
const notes = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? '  ok ' : '  FAIL'} ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let webkitOK = true;
try { const b = await webkit.launch(); await b.close(); } catch { webkitOK = false; }
if (!webkitOK) notes.push('WebKit is not installed here: iPhone profiles ran in Chromium with iPhone viewport/DPR/touch/UA.');

function deviceCtx(name) {
  const { defaultBrowserType, ...d } = devices[name];
  return d;
}

const profiles = [
  { id: 'iphone13', engine: webkitOK ? webkit : chromium, ctx: deviceCtx('iPhone 13') },
  // Playwright's 'iPhone SE' is the 1st-gen 320x568; the brief's SE is 375x667 (2nd/3rd gen).
  { id: 'iphoneSE', engine: webkitOK ? webkit : chromium, ctx: { ...deviceCtx('iPhone SE'), viewport: { width: 375, height: 667 }, screen: { width: 375, height: 667 }, deviceScaleFactor: 2 } },
  { id: 'iphoneSE1', engine: webkitOK ? webkit : chromium, ctx: deviceCtx('iPhone SE') },
  { id: 'desktop1440', engine: chromium, ctx: { viewport: { width: 1440, height: 900 } }, keyboard: true },
  { id: 'w1000', engine: chromium, ctx: { viewport: { width: 1000, height: 800 } } },
];

function watch(page, label, { allowPhoto404 = false } = {}) {
  const log = { failed: [], errors: [], external: [], bytes: 0, photoBytes: 0 };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['data:', 'blob:'].includes(u.protocol) && u.host !== HOST) log.external.push(r.url());
  });
  page.on('response', async (r) => {
    const isPhoto = /\/photos\//.test(r.url());
    if (r.status() >= 400 && !(allowPhoto404 && isPhoto)) log.failed.push(`${r.status()} ${r.url()}`);
    try {
      const len = (await r.body()).length;
      if (isPhoto) log.photoBytes += len; else log.bytes += len;
    } catch {}
  });
  return log;
}

async function openSequence(page, id, { useKeyboard = false } = {}) {
  await page.waitForFunction(() => getComputedStyle(document.getElementById('cardDrop')).opacity === '1', null, { timeout: 4000 });
  await sleep(1500); // arrival + hint
  await page.screenshot({ path: `${OUT}/${id}-1-sealed.png` });

  const g = await page.evaluate(() => {
    const seal = document.getElementById('seal').getBoundingClientRect();
    const flap = document.querySelector('.flap').getBoundingClientRect();
    const card = document.getElementById('card').getBoundingClientRect();
    return { seal: { w: seal.width, h: seal.height, cy: seal.top + seal.height / 2 }, flapY: flap.top,
             card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right },
             vw: innerWidth, vh: innerHeight };
  });
  check(g.seal.w >= 44 && g.seal.h >= 44, `${id}: seal tap target ${g.seal.w.toFixed(0)}x${g.seal.h.toFixed(0)} >= 44`);
  check(Math.abs(g.seal.cy - g.flapY) < 6, `${id}: seal straddles flap edge (seal centre ${g.seal.cy.toFixed(1)}, flap ${g.flapY.toFixed(1)})`);
  check(g.card.top >= 0 && g.card.left >= 0 && g.card.right <= g.vw && g.card.bottom <= g.vh, `${id}: sealed card fully in viewport`);

  // scroll lock
  await page.mouse.move(g.vw / 2, g.vh * 0.85);
  await page.mouse.wheel(0, 600);
  await page.keyboard.press('PageDown').catch(() => {});
  await sleep(250);
  check(await page.evaluate(() => scrollY) === 0, `${id}: scroll locked before opening`);

  await page.evaluate(() => {
    const seal = document.getElementById('seal'), html = document.documentElement;
    const mark = () => { if (!window.__t0) window.__t0 = performance.now(); };
    seal.addEventListener('click', mark, true);
    new MutationObserver(() => { if (!html.classList.contains('locked') && !window.__t1) window.__t1 = performance.now(); })
      .observe(html, { attributes: true, attributeFilter: ['class'] });
  });
  const t0 = Date.now();
  if (useKeyboard) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
    check(focused === 'seal', `${id}: Tab focuses the seal (got ${focused})`);
    await page.screenshot({ path: `${OUT}/${id}-1b-focus.png` });
    await page.keyboard.press('Enter');
  } else {
    await page.click('#seal');
  }
  await sleep(400);  await page.screenshot({ path: `${OUT}/${id}-2a-t400.png` });
  await sleep(600);  await page.screenshot({ path: `${OUT}/${id}-2b-t1000.png` });
  await sleep(500);  await page.screenshot({ path: `${OUT}/${id}-2c-t1500.png` });
  const canvasMid = await page.evaluate(() => !!document.querySelector('canvas'));
  await page.waitForFunction(() => !document.documentElement.classList.contains('locked'), null, { timeout: 4000 });
  const tOpen = await page.evaluate(() => Math.round(window.__t1 - window.__t0));
  check(tOpen <= 2200, `${id}: sequence finished in ${tOpen} ms after the press (≤ 2.2 s)`);
  await sleep(Math.max(0, 2400 - (Date.now() - t0)));
  await page.screenshot({ path: `${OUT}/${id}-3-opened.png` });
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'sheetWrap', `${id}: focus moved to the letter`);
  check(await page.evaluate(() => document.getElementById('live').textContent) === 'Letter opened.', `${id}: live region announces`);
  return { canvasMid, t0 };
}

async function readThrough(page, id) {
  await page.mouse.wheel(0, 300);
  await sleep(300);
  check(await page.evaluate(() => scrollY) > 0, `${id}: page scrolls after opening`);
  const targets = await page.evaluate(() => [...document.querySelectorAll('.page, .polaroid')].map((n) => n.className.match(/(page|photo)-\d/)[0]));
  for (const t of targets) {
    await page.evaluate((c) => document.querySelector('.' + c).scrollIntoView({ block: 'center' }), t);
    await sleep(800);
    await page.screenshot({ path: `${OUT}/${id}-4-${t}.png` });
  }
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await sleep(800);
  await page.screenshot({ path: `${OUT}/${id}-5-bottom.png` });
  const r = await page.evaluate(() => ({
    revealed: [...document.querySelectorAll('.reveal')].every((n) => n.classList.contains('in-view') || !document.documentElement.classList.contains('motion')),
    order: [...document.querySelectorAll('#flow > *')].map((n) => n.className.replace(' reveal', '').replace(' in-view', '')),
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  check(r.revealed, `${id}: every page and photo revealed`);
  check(!r.hscroll, `${id}: no horizontal scroll`);
  return r;
}

async function fontsCheck(page, id) {
  const f = await page.evaluate(() => {
    const bad = [];
    for (const n of document.querySelectorAll('body *')) {
      if (!n.childNodes.length || ![...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const ff = getComputedStyle(n).fontFamily;
      if (!ff.startsWith('"Libre Baskerville"')) bad.push(n.tagName + ':' + ff);
    }
    return { ok: document.fonts.check('16px "Libre Baskerville"'), italic: document.fonts.check('italic 16px "Libre Baskerville"'), bad };
  });
  check(f.ok && f.italic, `${id}: document.fonts.check Libre Baskerville (normal ${f.ok}, italic ${f.italic})`);
  check(f.bad.length === 0, `${id}: all HTML text uses Libre Baskerville ${f.bad.join(', ')}`);
}

function report(log, id) {
  check(log.failed.length === 0, `${id}: no failed requests ${log.failed.join(' | ')}`);
  check(log.errors.length === 0, `${id}: no console errors ${log.errors.join(' | ')}`);
  check(log.external.length === 0, `${id}: no requests leave ${HOST} ${log.external.join(' | ')}`);
  check(log.bytes < 400 * 1024, `${id}: first-load bytes excl. photos ${(log.bytes / 1024).toFixed(0)} KB < 400 KB (uncompressed)`);
}

// ---------- main profiles ----------
for (const p of profiles) {
  console.log(`\n# ${p.id} (${p.engine.name()})`);
  const browser = await p.engine.launch();
  const ctx = await browser.newContext(p.ctx);
  const page = await ctx.newPage();
  const log = watch(page, p.id);
  await page.goto(BASE, { waitUntil: 'load' });
  await fontsCheck(page, p.id);
  const { canvasMid } = await openSequence(page, p.id, { useKeyboard: !!p.keyboard });
  check(canvasMid, `${p.id}: confetti canvas present during burst`);
  await sleep(1400);
  check(await page.evaluate(() => !document.querySelector('canvas')), `${p.id}: confetti canvas removed by ~3.8 s`);
  const r = await readThrough(page, p.id);
  if (p.id === 'iphone13') console.log('    order:', r.order.join(' → '));
  if (p.id === 'desktop1440') {
    const lay = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const pairs = [['.page-1', '.photo-1', 'right'], ['.page-2', '.photo-2', 'left'], ['.page-3', '.photo-3', 'right']];
      return { col: document.querySelector('.page-1').offsetWidth, pairs: pairs.map(([a, b, side]) => {
        const pa = box(a), ph = box(b);
        return { side, ok: side === 'right' ? ph.left > pa.right : ph.right < pa.left, dy: ph.top - pa.top };
      }) };
    });
    check(Math.abs(lay.col - 640) < 2, `desktop1440: page column 640 px (${lay.col.toFixed(0)})`);
    lay.pairs.forEach((x, i) => check(x.ok && x.dy > 50 && x.dy < 110, `desktop1440: photo ${i + 1} in ${x.side} margin, ${x.dy.toFixed(0)} px below page top (≈80)`));
  }
  report(log, p.id);
  await browser.close();
}

// ---------- width sweep: no overlap / horizontal scroll 320–1920 ----------
console.log('\n# width sweep');
{
  const browser = await chromium.launch();
  for (const w of [320, 360, 414, 600, 899, 900, 1099, 1100, 1180, 1280, 1920]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.click('#seal');
    await page.waitForFunction(() => !document.documentElement.classList.contains('locked'));
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const items = [...document.querySelectorAll('.sheet-wrap, .page, .polaroid')].map((n) => n.getBoundingClientRect());
      let overlap = 0;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 0 && oy > 0) overlap = Math.max(overlap, Math.min(ox, oy));
      }
      const outside = items.filter((b) => b.left < 0 || b.right > de.clientWidth).length;
      return { hs: de.scrollWidth > de.clientWidth, overlap, outside };
    });
    // Tape and rotation may overlap the previous page edge by up to 12 px (brief 6.3).
    check(!r.hs && r.outside === 0 && r.overlap <= 14, `${w}px: no horizontal scroll, nothing off-screen, max overlap ${r.overlap.toFixed(1)} px`);
    if (w === 1100 || w === 320) await page.screenshot({ path: `${OUT}/sweep-${w}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
}

// ---------- reduced motion, Czech name, missing photos ----------
console.log('\n# reduced motion + Czech diacritics + missing photos');
{
  const browser = await (webkitOK ? webkit : chromium).launch();
  const ctx = await browser.newContext({ ...deviceCtx('iPhone 13'), reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const log = watch(page, 'reduced', { allowPhoto404: true });
  await page.addInitScript(() => {
    window.__canvas = 0;
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeName === 'CANVAS') window.__canvas++; })))
      .observe(document, { childList: true, subtree: true });
  });
  await page.route('**/index.html', async (route) => route.continue());
  await page.route(/\/birthday\/$/, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('name: "[Name]"', 'name: "Kateřina Dvořáková"');
    await route.fulfill({ response: res, body });
  });
  await page.route(/\/photos\//, (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(500);
  await page.screenshot({ path: `${OUT}/reduced-1-sealed-czech.png` });
  const anims = await page.evaluate(() => document.getAnimations().length);
  check(anims === 0, `reduced: no running animations while sealed (${anims})`);
  await page.click('#seal');
  await sleep(450);
  await page.screenshot({ path: `${OUT}/reduced-2-opened.png` });
  const r = await page.evaluate(async () => {
    const ext = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /latin-ext/.test(n));
    const hidden = [...document.querySelectorAll('.page, .polaroid')].filter((n) => getComputedStyle(n).opacity !== '1').length;
    return { canvas: window.__canvas, locked: document.documentElement.classList.contains('locked'), ext, hidden,
             czech: document.fonts.check('italic 21px "Libre Baskerville"', 'řč'),
             name: document.querySelector('.salute').textContent };
  });
  check(r.canvas === 0, 'reduced: confetti canvas never created');
  check(!r.locked, 'reduced: unlocked straight away');
  check(r.hidden === 0, 'reduced: everything below visible at once');
  check(r.ext.length > 0 && r.czech, `reduced: Czech name "${r.name}" uses Libre Baskerville latin-ext (${r.ext.map((u) => u.split('/').pop()).join(', ')})`);
  for (const n of [1, 2, 3]) {
    await page.evaluate((n) => document.querySelector('.photo-' + n).scrollIntoView({ block: 'center' }), n);
    await sleep(400);
  }
  await page.screenshot({ path: `${OUT}/reduced-3-placeholder.png` });
  const ph = await page.evaluate(() => [...document.querySelectorAll('.polaroid .ph')].map((n) => n.textContent));
  check(ph.join(',') === 'Photo 1,Photo 2,Photo 3', `placeholders shown for missing photos (${ph.join(', ')})`);
  check(log.errors.filter((e) => !/404|Failed to load resource/.test(e)).length === 0, `reduced: no console errors besides the simulated photo 404s`);
  await browser.close();
}

console.log('\n' + notes.join('\n'));
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
