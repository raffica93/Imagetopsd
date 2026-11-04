// Synthetic Google responses verify orchestration, not recognition quality.
import { chromium, webkit } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { initializeCanvas } from 'ag-psd';
import { checkDynamicParts } from './dynamic-parts.mjs';
const url = process.env.TEST_BASE_URL || 'http://127.0.0.1:4175';
const artifacts = process.env.TEST_ARTIFACTS || '/tmp/fresco-semantic-test';
await mkdir(artifacts, { recursive: true });
let server;
if (!process.env.TEST_BASE_URL) {
  server = spawn(
    process.execPath,
    ['--import', 'tsx', 'server.ts', '--port', '4175'],
    { stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production' } },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw Error('Test server unavailable');
  }
}
initializeCanvas(
  () => {
    throw Error('Read raw PSD pixels');
  },
  (width, height) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  }),
);
const engine = process.env.TEST_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(
  engine === chromium
    ? {
        executablePath:
          process.env.CHROMIUM_PATH ||
          (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
        args: ['--no-sandbox'],
      }
    : {},
);
try {
  await checkDynamicParts({ browser, url, artifacts });
  console.log(
    'ALL AUTOMATIC ANALYSIS CHECKS PASSED (' +
      (process.env.TEST_BROWSER || 'chromium') +
      ')',
  );
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}
