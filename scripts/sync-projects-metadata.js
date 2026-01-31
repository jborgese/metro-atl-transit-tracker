import fs from 'fs/promises';
import path from 'path';

const src = path.join(process.cwd(), 'src', 'data', 'geo', 'projects-metadata.json');
const destDir = path.join(process.cwd(), 'static', 'data', 'geo');
const dest = path.join(destDir, 'projects-metadata.json');

async function main() {
  try {
    const data = await fs.readFile(src, 'utf8');
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(dest, data, 'utf8');
    console.log('synced', src, '->', dest);
  } catch (e) {
    console.error('sync-projects-metadata failed:', e);
    process.exitCode = 1;
  }
}

main();
