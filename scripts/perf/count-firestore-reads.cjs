// 统计各首页的 Firestore 读取（Listen 通道的 addTarget），找出重复读取与没有 limit 的整集合读取
// ----------------------------------------------------------------------------
// 只连本机 Emulator（demo-klk-erp），会建立两位虚构员工（001 老板 / 010 厨房员工）。
// 前提：npm run emulators；再以 Emulator 模式启动画面（npm run dev:emulator，或 Emulator 构建 + 静态服务器）
// 执行：NODE_PATH=$(npm root -g) node scripts/perf/count-firestore-reads.cjs http://localhost:3000
const { chromium } = require('playwright');
const FS = 'http://127.0.0.1:8080/v1/projects/demo-klk-erp/databases/(default)/documents';
const put = (id, f) => fetch(`${FS}/employees/${id}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { stringValue: v }])) }) });
const base = process.argv[2] || 'http://localhost:3000';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('只允许量测本机（Emulator）');
function track(p) {
  const targets = []; let t0 = Date.now();
  p.on('request', r => {
    if (!/Firestore\/Listen\/channel/.test(r.url()) || r.method() !== 'POST') return;
    let body = r.postData() || ''; try { body = decodeURIComponent(body.replace(/\+/g, ' ')); } catch {}
    for (const part of body.split('"addTarget"').slice(1)) {
      const doc = part.match(/"documents":\s*\{\s*"documents":\s*\[\s*"[^"]*\/documents\/([^"]+)"/);
      const col = part.match(/"collectionId":\s*"([^"]+)"/);
      const lim = /"limit"/.test(part.split('"targetId"')[0]);
      const where = /"where"/.test(part.split('"targetId"')[0]);
      targets.push({ ms: Date.now() - t0, what: doc ? `doc ${doc[1]}` : `query ${col?.[1]}${where ? ' +where' : ''}${lim ? ' +limit' : ' (NO LIMIT)'}` });
    }
  });
  return { targets, reset: () => { targets.length = 0; t0 = Date.now(); } };
}
const report = (label, targets) => {
  const counts = {}; targets.forEach(t => counts[t.what] = (counts[t.what] || 0) + 1);
  console.log(`\n== ${label}: ${targets.length} targets`);
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
};
(async () => {
  await put('001', { id: '001', pin: '8888', name: 'BEN', role: 'Owner (老板)', status: 'CONFIRMED', orgLevel: 'OWNER' });
  await put('010', { id: '010', pin: '135790', name: 'ALI', role: 'Kitchen Crew', status: 'CONFIRMED', orgLevel: 'CREW', department: 'KITCHEN' });
  const b = await chromium.launch();
  // boss
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const tr = track(p);
    p.on('dialog', d => d.dismiss());
    await p.goto(`${base}/?portal=boss`); await p.waitForSelector('input[placeholder="OWNER PIN"]'); await p.waitForTimeout(4000);
    report('boss: open → login screen (+4s)', tr.targets); tr.reset();
    await p.fill('input[placeholder="OWNER PIN"]', '8888'); await p.press('input[placeholder="OWNER PIN"]', 'Enter');
    await p.waitForFunction(() => document.body.innerText.includes('经营重点'), null, { timeout: 60000 });
    await p.waitForTimeout(8000);
    report('boss: PIN → home (+8s)', tr.targets); tr.reset();
    const got = p.getByRole('button', { name: /Got it/ }); if (await got.count()) await got.first().click();
    await p.getByRole('button', { name: /全部功能/ }).first().click().catch(() => {}); await p.waitForTimeout(5000);
    report('boss: → 全部功能 (+5s)', tr.targets); tr.reset();
    await p.close();
  }
  // staff
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); const tr = track(p);
    p.on('dialog', d => d.dismiss());
    await p.goto(base + '/'); await p.waitForFunction(() => document.body.innerText.includes('STAFF ID') || document.body.innerText.includes('员工编号'), null, { timeout: 60000 });
    await p.waitForTimeout(3000); report('staff: open → login (+3s)', tr.targets); tr.reset();
    const idInput = p.locator('input[autocomplete="username"]'); await idInput.fill('010'); await idInput.press('Enter'); await p.waitForTimeout(1500);
    for (const d of '135790') { await p.getByRole('button', { name: d, exact: true }).first().click(); await p.waitForTimeout(100); }
    await p.getByRole('button', { name: '登入 · Login', exact: true }).click();
    await p.waitForTimeout(10000);
    report('staff: login → home (+10s)', tr.targets);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
