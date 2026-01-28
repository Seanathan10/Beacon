import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const showLogs =
  process.env.TEST_LOGS === '1' ||
  process.env.TEST_LOGS === 'true' ||
  process.env.TEST_LOGS === 'yes';

const nodeArgs = ['--experimental-vm-modules'];

// Hide Node's ExperimentalWarning spam unless explicitly debugging.
if (!showLogs) {
  nodeArgs.push('--no-warnings');
}

const jestPkgJson = require.resolve('jest/package.json');
const jestBin = path.join(path.dirname(jestPkgJson), 'bin', 'jest.js');
const jestArgs = process.argv.slice(2);

const child = spawnSync(process.execPath, [...nodeArgs, jestBin, ...jestArgs], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '' },
});

process.exit(child.status ?? 1);
