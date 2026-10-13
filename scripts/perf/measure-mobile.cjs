// 手机条件下的首屏与登录速度量测（可重复执行）
// ----------------------------------------------------------------------------
// 条件：iPhone 13 画面、CPU 降速 4 倍、4G（9/3 Mbps、RTT 40ms）、每个目标量 3 次取中位数。
// 前提：
//   1. 以 Emulator 模式构建：VITE_USE_FIREBASE_EMULATOR=true npx vite build --outDir <目录>
//   2. 启动 Emulator：npm run emulators
//   3. 用任一静态服务器送出构建目录（未知路径回退 index.html）
// 执行（需要 Playwright 与 Chromium）：
//   NODE_PATH=$(npm root -g) node scripts/perf/measure-mobile.cjs before=http://127.0.0.1:3101 after=http://127.0.0.1:3102
// 只会写入 Emulator（demo-klk-erp），不会连线到正式项目。
const { chromium, devices } = require('playwright');
const FS = 'http://127.0.0.1:8080/v1/projects/demo-klk-erp/databases/(default)/documents';
const RUNS = 3;
async function seed() {
  const fields = { id: { stringValue: '001' }, pin: { stringValue: '8888' }, name: { stringValue: 'BEN' }, role: { stringValue: 'Owner (老板)' },
    status: { stringValue: 'CONFIRMED' }, orgLevel: { stringValue: 'OWNER' }, systemRole: { stringValue: 'STANDARD_USER' }, rank: { stringValue: 'TOP' } };
  const r = await fetch(`${FS}/employees/001`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('seed failed ' + r.status);
}
async function measure(browser, base) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  // 模拟一般 4G：下行 9 Mbps、上行 3 Mbps、RTT 40ms；CPU 降速 4 倍模拟手机
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const urls = new Map(); let jsBytes = 0; const errors = [];
  cdp.on('Network.responseReceived', e => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', e => { const u = urls.get(e.requestId) || ''; if (/\.js(\?|$)/.test(u)) jsBytes += e.encodedDataLength; });
  page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
  const t0 = Date.now();
  await page.goto(`${base}/?portal=boss`);
  await page.waitForSelector('input[placeholder="OWNER PIN"]', { timeout: 120000 });
  const tLogin = Date.now() - t0, jsAtLogin = jsBytes;
  await page.fill('input[placeholder="OWNER PIN"]', '8888');
  // 员工资料可能还在载入：每 2 秒再按一次 Enter，直到进入老板首页
  const deadline = Date.now() + 180000;
  while (await page.locator('input[placeholder="OWNER PIN"]').count()) {
    if (Date.now() > deadline) throw new Error('login timeout');
    await page.press('input[placeholder="OWNER PIN"]', 'Enter').catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.waitForFunction(() => document.body.innerText.includes('经营重点') && !document.body.innerText.includes('载入中'), null, { timeout: 180000 });
  const tDash = Date.now() - t0;
  const text = (await page.innerText('body')).replace(/\s+/g, ' ').slice(0, 80);
  await ctx.close();
  return { tLogin, jsAtLogin, tDash, jsTotal: jsBytes, errors, text };
}
(async () => {
  await seed();
  const browser = await chromium.launch();
  const targets = process.argv.slice(2).map(a => a.split('=')); // 用法：label=http://host:port ...
  for (const [name, base] of targets) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(await measure(browser, base));
    const med = k => rs.map(r => r[k]).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
    console.log(`${name} | login screen ${(med('tLogin') / 1000).toFixed(1)}s, JS ${(med('jsAtLogin') / 1024).toFixed(0)} KB | open→dashboard ${(med('tDash') / 1000).toFixed(1)}s, total JS ${(med('jsTotal') / 1024).toFixed(0)} KB | errors: ${rs.flatMap(r => r.errors).length} | runs: ${rs.map(r => (r.tLogin / 1000).toFixed(1)).join('/')}s`);
    console.log(`   dashboard text: ${rs[0].text}`);
    if (rs[0].errors.length) console.log('   first errors:', rs[0].errors.slice(0, 3));
  }
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });

