/* A small library for the demo's regression tests: one person's phone, tapped and read as a person would. */
const path = require('path');
let PW;
try { PW = require('playwright'); } catch (e) { PW = require('/opt/npm-tools/node_modules/playwright'); }

const DEVICES = {
  desktop: {engine: 'chromium', ctx: {viewport: {width: 1400, height: 1000}}},
  pixel7: {engine: 'chromium', ctx: () => PW.devices['Pixel 7']},
  /* WebKit when it is installed, else Chromium with the iPhone's viewport and user agent */
  iphone14: {engine: 'webkit', fallback: 'chromium', ctx: () => PW.devices['iPhone 14']}
};

async function launch(dev) {
  const d = DEVICES[dev];
  let engine = d.engine, browser;
  try { browser = await PW[engine].launch(); }
  catch (e) { if (!d.fallback) throw e; engine = d.fallback; browser = await PW[engine].launch(); }
  const ctxOpt = typeof d.ctx === 'function' ? d.ctx() : d.ctx;
  /* a device's descriptor names its default browser; Chromium takes it too, but not isMobile on Firefox */
  const {defaultBrowserType, ...opt} = ctxOpt;
  const context = await browser.newContext(opt);
  return {browser, context, engine};
}

class Phone {
  constructor(page, i, log) { this.page = page; this.i = i || 0; this.log = log; }
  get el() { return this.page.locator('.phone').nth(this.i); }
  async pause(ms) { await this.page.waitForTimeout(ms === undefined ? 450 : ms); }
  async text() { return (await this.el.innerText()).replace(/\s*\n\s*/g, ' | '); }
  /* a tap, after the demo's guard against double taps */
  async tap(label, scope) {
    await this.pause();
    const b = this.el.locator((scope ? scope + ' ' : '') + 'button', {hasText: label}).first();
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await this.pause(500);
  }
  async tapSel(sel) { await this.pause(); const b = this.el.locator(sel).first(); await b.scrollIntoViewIfNeeded(); await b.click(); await this.pause(500); }
  async fill(sel, v) { await this.el.locator(sel).first().fill(v); }
  async has(s, ms) {
    const until = Date.now() + (ms || 4000);
    for (;;) { const t = await this.text(); if (typeof s === 'string' ? t.includes(s) : s.test(t)) return t; if (Date.now() > until) throw new Error('expected “' + s + '” on the phone, saw: ' + t.slice(0, 600)); await this.page.waitForTimeout(250); }
  }
  async lacks(s) { const t = await this.text(); if (t.includes(s)) throw new Error('did not expect “' + s + '”, saw: ' + t.slice(0, 600)); }
  /* the phone as the person sees it */
  async shot(file) { await this.el.scrollIntoViewIfNeeded(); await this.el.screenshot({path: file}); }
}

async function open(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.phone');
  await page.waitForTimeout(1200);
  return {page, errors};
}

module.exports = {PW, DEVICES, launch, Phone, open};
