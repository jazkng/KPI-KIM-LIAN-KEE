// 首屏 JS 体积回归检查（CI 执行）
// ----------------------------------------------------------------------------
// 注意：没有 Firebase 配置时，构建会把整个 App 当成「执行不到」而删掉，体积会假性变小。
// 所以这里用「假的非 demo 配置」构建到暂存目录再量测（不会连线到任何项目）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAIN_BUDGET_KB = 350;          // 首屏主程序上限（目前约 197 KB；拆分前约 4,043 KB）
const INITIAL_BUDGET_KB = 1300;  // 首屏全部 JS（入口 + 静态预载的 vendor chunk）上限（目前约 1,154 KB）
const MUST_BE_SEPARATE = [           // 这些大型模块必须是独立的按需载入档
  'FinancialReport', 'HRSystem', 'AccountsPayableModule', 'SettlementModule',
  'BossDashboard', 'StaffDashboard', 'ManagementPortal',
];

const existingIndex = process.argv.indexOf('--dir');
if (existingIndex >= 0 && !process.argv[existingIndex + 1]) throw new Error('--dir 必须指定构建目录');
const outDir = existingIndex >= 0 ? resolve(process.argv[existingIndex + 1]) : mkdtempSync(join(tmpdir(), 'klk-budget-'));
if (existingIndex < 0) execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    VITE_USE_FIREBASE_EMULATOR: '',
    VITE_FIREBASE_API_KEY: 'budget-check',
    VITE_FIREBASE_PROJECT_ID: 'klk-budget-check',
    VITE_FIREBASE_AUTH_DOMAIN: 'klk-budget-check.firebaseapp.com',
    VITE_FIREBASE_APP_ID: '1:1:web:1',
  },
});

const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const entry = html.match(/<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/)?.[1];
if (!entry) throw new Error('找不到入口 JS');
const files = readdirSync(join(outDir, 'assets'));
if (!files.some(f => f.startsWith('vendor-firebase-') && f.endsWith('.js'))) throw new Error('构建缺少 Firebase 模块，不能用被裁剪的页面通过体积检查');
const mainKb = statSync(join(outDir, 'assets', entry)).size / 1024;

// 首屏会下载的全部 JS：入口 + HTML 里 modulepreload 的静态依赖（vendor-react、vendor-firebase…）
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g)].map(m => m[1]);
const initialFiles = [...new Set([entry, ...preloads])];
const initialKb = initialFiles.reduce((sum, f) => sum + statSync(join(outDir, 'assets', f)).size / 1024, 0);

let failed = false;
console.log(`首屏主程序 ${entry}: ${mainKb.toFixed(0)} KB（上限 ${MAIN_BUDGET_KB} KB）`);
console.log(`首屏全部 JS ${initialFiles.length} 个档案: ${initialKb.toFixed(0)} KB（上限 ${INITIAL_BUDGET_KB} KB）`);
for (const f of initialFiles) console.log(`  - ${f}: ${(statSync(join(outDir, 'assets', f)).size / 1024).toFixed(0)} KB`);
if (initialKb > INITIAL_BUDGET_KB) {
  console.error(`❌ 首屏全部 JS 超过上限。请检查是否新增了静态导入的大型套件（应改为按需载入）。`);
  failed = true;
}
if (mainKb > MAIN_BUDGET_KB) {
  console.error(`❌ 首屏主程序超过上限。请确认新增的大型模块是否经由 components/lazyModules.tsx 按需载入。`);
  failed = true;
}
for (const name of MUST_BE_SEPARATE) {
  if (!files.some(f => f.startsWith(`${name}-`) && f.endsWith('.js'))) {
    console.error(`❌ ${name} 没有被拆成独立的按需载入档`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`✅ 通过：${MUST_BE_SEPARATE.length} 个大型模块均为按需载入`);
