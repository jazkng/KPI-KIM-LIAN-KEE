// 老板登录后首页资料载入时间（iOS 性能第二阶段）
// ----------------------------------------------------------------------------
// 条件：iPhone 13 画面、CPU 降速 4 倍、下行 9 / 上行 3 Mbps、RTT 由 LAT 指定（默认 40ms）；
// 登录画面停 5 秒模拟输入 PIN；每个目标量 3 次取中位数。
// 前提与 measure-mobile.cjs 相同（Emulator 构建 + 静态服务器 + npm run emulators，并已有老板 001 / PIN 8888）。
// 执行：LAT=150 NODE_PATH=$(npm root -g) node scripts/perf/measure-boss-home.cjs before=http://127.0.0.1:3101 after=http://127.0.0.1:3102
const { chromium, devices } = require('playwright');
const RUNS = 3;
async function once(browser, base) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] }); const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: Number(process.env.LAT || 40), downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 120))); page.on('dialog', d => d.dismiss());
  const t0 = Date.now();
  await page.goto(`${base}/?portal=boss`); await page.waitForSelector('input[placeholder="OWNER PIN"]', { timeout: 120000 });
  const tLogin = Date.now() - t0;
  await page.waitForTimeout(5000); // 模拟输入 PIN 的时间
  await page.fill('input[placeholder="OWNER PIN"]', '8888');
  const t1 = Date.now();
  const deadline = Date.now() + 180000;
  while (await page.locator('input[placeholder="OWNER PIN"]').count()) { if (Date.now() > deadline) throw new Error('login timeout'); await page.press('input[placeholder="OWNER PIN"]', 'Enter').catch(() => {}); await page.waitForTimeout(300); }
  await page.waitForFunction(() => document.body.innerText.includes('经营重点'), null, { timeout: 120000 });
  const tHome = Date.now() - t1;
  await page.waitForFunction(() => !document.body.innerText.includes('--:--'), null, { timeout: 120000 });
  const tData = Date.now() - t1;
  await ctx.close();
  return { tLogin, tHome, tData, errors: errors.length };
}
(async () => {
  const targets = process.argv.slice(2).map(a => a.split('='));
  const b = await chromium.launch(); const res = {};
  for (let i = 0; i < RUNS; i++) for (const [name, url] of targets) (res[name] ||= []).push(await once(b, url));
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const [name, runs] of Object.entries(res)) {
    console.log(`${name}: 登录画面 ${med(runs.map(r => r.tLogin))}ms | PIN→老板首页框架 ${med(runs.map(r => r.tHome))}ms | PIN→首页资料全部载入 ${med(runs.map(r => r.tData))}ms | 页面错误 ${runs.reduce((s, r) => s + r.errors, 0)}`);
    console.log('   runs:', runs.map(r => `${r.tLogin}/${r.tHome}/${r.tData}`).join('  '));
  }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
