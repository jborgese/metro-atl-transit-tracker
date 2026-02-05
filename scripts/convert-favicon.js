import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const inputPath = process.argv[2];
const outputDir = join(__dirname, '..', 'static');

async function convertFavicon() {
  if (!inputPath) {
    console.error('Please provide input image path as argument');
    process.exit(1);
  }

  console.log(`Converting ${inputPath} to favicon formats...`);

  // Read the input image
  const inputBuffer = await readFile(inputPath);

  // Create PNG versions at different sizes for ICO
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(inputBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  // Create favicon.ico from the PNG buffers
  const icoBuffer = await pngToIco(pngBuffers);
  await writeFile(join(outputDir, 'favicon.ico'), icoBuffer);
  console.log('Created favicon.ico');

  // Create a 512x512 PNG for the SVG embed
  const pngForSvg = await sharp(inputBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const base64Png = pngForSvg.toString('base64');

  // Create SVG with embedded image
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <image width="512" height="512" xlink:href="data:image/png;base64,${base64Png}"/>
</svg>`;

  await writeFile(join(outputDir, 'favicon.svg'), svgContent);
  console.log('Created favicon.svg');

  console.log('Done!');
}

convertFavicon().catch(console.error);
