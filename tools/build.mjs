// Bundles the game into one self-contained HTML file.
//   npm install && npm run build
// Writes dist/obsidian-spire.html (open it straight from disk) and
// dist/obsidian-spire.fragment.html (the same page without the outer
// html/head/body tags, for hosts that supply their own document skeleton).
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = {
  three: path.join(root, 'vendor/three.module.min.js'),
  'three/addons/controls/OrbitControls.js': path.join(root, 'vendor/OrbitControls.js'),
};

const result = await build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  plugins: [{
    name: 'vendor-three',
    setup(b) {
      b.onResolve({ filter: /^three(\/.*)?$/ }, (args) => ({ path: vendor[args.path] }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(path.join(root, 'css/style.css'), 'utf8');
let html = await readFile(path.join(root, 'index.html'), 'utf8');

html = html
  .replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script type="module">\n${js}\n</script>`);

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/obsidian-spire.html'), html);

// Fragment: drop doctype and the html/head/body wrappers, keep everything inside.
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset="utf-8">\n?/, '')
  .replace(/<meta name="viewport"[^>]*>\n?/, '');
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
const bodyClass = (html.match(/<body class="([^"]*)"/) || [])[1];
const fragment = `${head.trim()}\n${bodyClass ? `<script>document.body.classList.add(${JSON.stringify(bodyClass)});</script>\n` : ''}${body.trim()}\n`;
await writeFile(path.join(root, 'dist/obsidian-spire.fragment.html'), fragment);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/obsidian-spire.html ${kb(html)}, fragment ${kb(fragment)}`);
