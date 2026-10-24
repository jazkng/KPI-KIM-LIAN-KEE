import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const env = {
  ...process.env,
  VITE_USE_FIREBASE_EMULATOR: '',
  VITE_FIREBASE_API_KEY: 'budget-check',
  VITE_FIREBASE_PROJECT_ID: 'klk-budget-check',
  VITE_FIREBASE_AUTH_DOMAIN: 'klk-budget-check.firebaseapp.com',
  VITE_FIREBASE_APP_ID: '1:1:web:1',
};
const run = args => execFileSync(process.execPath, args, { stdio: 'inherit', env });
run([resolve('node_modules/vite/bin/vite.js'), 'build']);
await build({ entryPoints: ['server.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', sourcemap: true, outfile: 'dist/server.cjs' });
run(['scripts/perf/check-bundle-budget.mjs', '--dir', 'dist']);
