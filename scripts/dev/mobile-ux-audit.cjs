// 手机操作体验检查：老板 / 主管 / 员工首页在 iPhone SE 尺寸（375×667）下的
//   1) 横向溢出  2) 小于 36px 的点击区  3) 小于 11px 的文字
// 只连本机 Emulator（demo-klk-erp），会建立三位虚构员工（001 / 010 / 020）。
// 截图存到第一个参数指定的目录（默认系统暂存目录），不要存进 repo。
// 前提：npm run emulators；PORT=3000 npm run dev:emulator
// 执行：NODE_PATH=$(npm root -g) node scripts/dev/mobile-ux-audit.cjs [截图目录]
const path = require('path');
const OUT = process.argv[2] || require('os').tmpdir();
const { chromium } = require('playwright');
const FS = 'http://127.0.0.1:8080/v1/projects/demo-klk-erp/databases/(default)/documents';
const put = (id, f) => fetch(`${FS}/employees/${id}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { stringValue: v }])) }) });
const base = 'http://localhost:3000';
const audit = async (p, label, shot) => {
  const r = await p.evaluate(() => {
    const vw = window.innerWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const wide = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.right > vw + 1 && cs.position !== 'fixed' && !e.closest('[class*="overflow-x-auto"],[class*="overflow-auto"],[class*="overflow-hidden"]'); }).slice(0, 5).map(e => `${e.tagName}.${String(e.className).slice(0, 60)} r=${Math.round(e.getBoundingClientRect().right)}`);
    const small = [...document.querySelectorAll('button, a, [role=button], input, select')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 36 || b.width < 36) && getComputedStyle(e).visibility !== 'hidden'; }).map(e => `${(e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.tagName).trim().slice(0, 18)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
    const tiny = [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).map(e => `${e.innerText.trim().slice(0, 14)}(${getComputedStyle(e).fontSize})`);
    return { overflow, wide, small, tiny };
  });
  console.log(`\n== ${label}: overflowX=${r.overflow}px`);
  if (r.wide.length) console.log('  wide:', r.wide.join(' | '));
  console.log(`  small targets (${r.small.length}):`, r.small.slice(0, 25).join(' | '));
  console.log(`  tiny text (${r.tiny.length}):`, r.tiny.slice(0, 15).join(' | '));
  await p.screenshot({ path: path.join(OUT, shot), fullPage: true });
};
(async () => {
  await put('001', { id: '001', pin: '8888', name: 'BEN', role: 'Owner (老板)', status: 'CONFIRMED', orgLevel: 'OWNER' });
  await put('010', { id: '010', pin: '135790', name: 'ALI', role: 'Kitchen Crew', status: 'CONFIRMED', orgLevel: 'CREW', department: 'KITCHEN' });
  await put('020', { id: '020', pin: '246800', name: 'MEI', role: 'Kitchen Head', status: 'CONFIRMED', orgLevel: 'DEPARTMENT_HEAD', department: 'KITCHEN' });
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.on('dialog', d => d.dismiss()); return [ctx, p]; };
  const gotIt = async p => { for (const n of [/Got it/]) { const g = p.getByRole('button', { name: n }); if (await g.count()) await g.first().click().catch(() => {}); } const t = p.getByText('我明白了，开启 ERP 系统 (Got it)').first(); if (await t.count()) await t.click().catch(() => {}); await p.waitForTimeout(800); };
  { const [ctx, p] = await mk();
    await p.goto(base + '/?portal=boss'); await p.waitForSelector('input[placeholder="OWNER PIN"]'); await p.waitForTimeout(2500);
    await audit(p, 'boss login', 'ux-boss-login.png');
    await p.fill('input[placeholder="OWNER PIN"]', '8888'); await p.press('input[placeholder="OWNER PIN"]', 'Enter');
    await p.waitForFunction(() => document.body.innerText.includes('经营重点'), null, { timeout: 60000 }); await p.waitForTimeout(5000); await gotIt(p);
    await audit(p, 'boss home', 'ux-boss-home.png');
    await p.getByRole('button', { name: /全部功能/ }).first().click(); await p.waitForTimeout(4000);
    await audit(p, 'boss all functions', 'ux-boss-all.png');
    await ctx.close(); }
  for (const [label, id, pin] of [['staff home', '010', '135790'], ['manager home', '020', '246800']]) {
    const [ctx, p] = await mk();
    await p.goto(base + '/'); await p.waitForFunction(() => document.body.innerText.includes('STAFF ID') || document.body.innerText.includes('员工编号'), null, { timeout: 60000 }); await p.waitForTimeout(2000);
    if (label === 'staff home') await audit(p, 'staff login', 'ux-staff-login.png');
    const idInput = p.locator('input[autocomplete="username"]'); await idInput.fill(id); await idInput.press('Enter'); await p.waitForTimeout(1200);
    for (const d of pin) { await p.getByRole('button', { name: d, exact: true }).first().click(); await p.waitForTimeout(80); }
    await p.getByRole('button', { name: '登入 · Login', exact: true }).click(); await p.waitForTimeout(8000); await gotIt(p);
    await audit(p, label, `ux-${id}.png`);
    await ctx.close(); }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
