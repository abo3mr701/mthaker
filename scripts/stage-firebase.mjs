import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
if (!process.argv[2]) throw new Error('Pass the Firebase Hosting public directory.');
const destination = resolve(process.argv[2]);
if (destination === resolve(source)) throw new Error('Use a separate Hosting staging directory.');

async function digestTree(hash, folder) {
  const entries = (await readdir(join(source, folder), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await digestTree(hash, path);
    else {
      const contents = await readFile(join(source, path));
      hash.update(path.split(/[/\\]/).join('/') + '\0' + contents.length + '\0').update(contents);
    }
  }
}

const hash = createHash('sha256');
for (const folder of ['css', 'js']) await digestTree(hash, folder);
const release = 'releases/' + hash.digest('hex').slice(0, 20);
await mkdir(join(destination, release), { recursive: true });
for (const folder of ['css', 'js']) {
  await cp(join(source, folder), join(destination, release, folder), { recursive: true });
}
for (const asset of ['assets', 'licenses', 'VOCABULARY-SOURCES.md']) {
  await cp(join(source, asset), join(destination, asset), { recursive: true });
}
const html = await readFile(join(source, 'index.html'), 'utf8');
const page = html.replace('href="css/main.css"', `href="${release}/css/main.css"`)
  .replace('src="js/app.js"', `src="${release}/js/app.js"`);
if (!page.includes(`${release}/js/app.js`) || !page.includes(`${release}/css/main.css`)) {
  throw new Error('Could not version both app entry points.');
}
await writeFile(join(destination, 'index.html'), page);
console.log(release);
