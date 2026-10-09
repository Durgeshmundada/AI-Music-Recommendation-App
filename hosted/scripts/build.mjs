import fs from 'node:fs/promises';
import path from 'node:path';
import { build as viteBuild } from 'vite';
import { build } from 'esbuild';

await viteBuild({ root: path.resolve('client'), define: { 'import.meta.env.VITE_HOSTED_SITES': 'true' }, build: { outDir: path.resolve('client/dist') } });
const assets = {};
async function collect(directory, prefix = '') {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}/${entry.name}`;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(filename, name);
    else {
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[path.extname(name)];
      if (!mime) throw new Error(`Unsupported asset ${name}`);
      assets[name] = { body: await fs.readFile(filename, 'utf8'), mime };
    }
  }
}
await collect('client/dist');
await fs.mkdir('.sites-runtime', { recursive: true });
await fs.writeFile('.sites-runtime/assets.json', JSON.stringify(assets));
await fs.mkdir('dist/server', { recursive: true });
await build({ entryPoints: ['worker/index.js'], outfile: 'dist/server/index.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none',
  alias: { 'file-type': path.resolve('worker/audio-file-type.js') } });
await fs.mkdir('dist/.openai', { recursive: true });
await fs.copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
const output = await import(`${path.resolve('dist/server/index.js').replaceAll('\\', '/').replace(/^([A-Za-z]):/, 'file:///$1:')}?t=${Date.now()}`);
if (typeof output.default?.fetch !== 'function') throw new Error('Missing Worker fetch entrypoint.');
console.log('Built full music app, cloud API, and self-contained browser assets.');
