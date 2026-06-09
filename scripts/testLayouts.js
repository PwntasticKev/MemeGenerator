// testLayouts.js — render every layout from one set of images for visual review.
//   node scripts/testLayouts.js "Oppenheimer"
import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { getValidImages } from './imageProvider.js'
import { renderFrame, LAYOUTS } from './layouts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

async function main () {
  const topic = process.argv.slice(2).join(' ').trim() || 'Oppenheimer'
  const outDir = path.join(ROOT, 'test_output', 'layouts')
  const images = await getValidImages({
    searchTerms: [topic, `${topic} movie`, `${topic} poster`],
    count: 2,
    outputDir: path.join(outDir, 'images')
  })
  const overlay = path.join(ROOT, 'assets', 'mainoverlay_1.png')
  const fact = `${topic} is wildly overrated and the fanbase refuses to admit it`
  const reply = 'Finally someone with the courage to say the obvious'

  for (const layout of LAYOUTS) {
    const outputPath = path.join(outDir, `${layout}.png`)
    await renderFrame({
      layout,
      overlayPath: overlay,
      images: images.map((i) => i.path),
      fact,
      reply,
      handle: '@spicytakes',
      name: 'Spicy Takes',
      outputPath
    })
    console.log(`✅ ${layout} -> ${outputPath}`)
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
