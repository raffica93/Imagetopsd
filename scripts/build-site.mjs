/** Build one self-contained Worker, including the existing Vite frontend. */
import { build } from 'esbuild';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.cwd(),
  output = path.join(root, 'build/site');
const manifest = JSON.parse(
  await readFile(path.join(root, '.openai/hosting.json'), 'utf8'),
);
if (!manifest.project_id || manifest.static)
  throw Error(
    'A Worker hosting manifest with the existing project_id is required; remove static before building.',
  );
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const assets = {};
async function collect(directory, relative = '') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, item.name),
      file = path.join(directory, item.name);
    if (item.isDirectory()) {
      await collect(file, name);
      continue;
    }
    const ext = path.extname(name),
      type = types[ext];
    if (!type) throw Error('Unexpected frontend asset: ' + name);
    const bytes = await readFile(file),
      binary = ['.png', '.ico', '.woff', '.woff2'].includes(ext);
    assets['/' + name] = {
      content: bytes.toString(binary ? 'base64' : 'utf8'),
      type,
      binary,
      etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"',
    };
  }
}
await collect(path.join(root, 'dist'));
if (!assets['/index.html']) throw Error('Build the Vite frontend first.');
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'server'), { recursive: true });
await mkdir(path.join(output, '.openai'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'hosting/worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['browser'],
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
  outfile: path.join(output, 'server/index.js'),
  plugins: [
    {
      name: 'fresco-assets',
      setup(builder) {
        builder.onResolve({ filter: /^virtual:fresco-assets$/ }, () => ({
          path: 'fresco-assets',
          namespace: 'embedded',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'embedded' }, () => ({
          contents: 'export default ' + JSON.stringify(assets),
          loader: 'js',
        }));
      },
    },
  ],
});
await writeFile(
  path.join(output, '.openai/hosting.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    output,
    assets: Object.keys(assets).length,
    runtime: 'worker',
  }),
);
