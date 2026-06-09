// sampleVideo.js
//
// End-to-end sample run that exercises the RELAUNCH pipeline:
//   topic -> rage-bait copy (GPT, with safe fallback)
//         -> validated images (new imageProvider, no blanks)
//         -> canvas template (existing template.js)
//         -> MP4 with random audio (existing audioManager)
//
//   node scripts/sampleVideo.js "Dune Part Two"
//
// Purpose: eyeball real output quality before wiring the new image provider into
// the big generateMeme.js orchestrator.

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getValidImages } from './imageProvider.js'
import { generateMemeContent } from './contentGenerator.js'
import { generateTemplate } from '../template.js'
import { addRandomAudioToVideo } from './audioManager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// --- main -----------------------------------------------------------------

function pickOverlay () {
  const dir = path.join(ROOT, 'assets')
  const overlays = fs.readdirSync(dir).filter((f) => /^mainoverlay_\d+\.png$/.test(f))
  const choice = overlays[Math.floor(Math.random() * overlays.length)] || 'mainoverlay_1.png'
  return path.join(dir, choice)
}

async function main () {
  const topic = process.argv.slice(2).join(' ').trim() || 'Dune Part Two'
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const date = new Date().toISOString().slice(0, 10)
  const slug = topic.replace(/[^a-z0-9]+/gi, '_')
  const outDir = path.join(ROOT, 'output', date, `sample_${slug}_${stamp}`)
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`\n🎬 Sample run for: "${topic}"`)
  console.log(`📁 ${outDir}\n`)

  // 1. Images (new validated provider — throws rather than ship blanks)
  console.log('🖼️  Fetching validated images...')
  const images = await getValidImages({
    searchTerms: [topic, `${topic} movie`, `${topic} poster`, `${topic} official`],
    count: 2,
    outputDir: path.join(outDir, 'images')
  })
  console.log(`   ✅ ${images.map((i) => `${i.meta.width}x${i.meta.height}`).join(', ')}`)

  // 2. Copy (unified content generator, modern SDK)
  console.log('✍️  Generating rage-bait copy...')
  const copy = await generateMemeContent(topic, { accountNumber: 1 })
  console.log(`   fact:  ${copy.fact}`)
  console.log(`   reply: ${copy.reply}`)

  // 3. Template -> frame.png
  console.log('🧩 Rendering template...')
  const framePath = path.join(outDir, 'frame.png')
  await generateTemplate({
    overlayPath: pickOverlay(),
    image1: images[0].path,
    image2: images[1].path,
    fact: copy.fact,
    reply: copy.reply,
    outputPath: framePath,
    handle: copy.handle,
    name: copy.name
  })

  // 4. Video
  console.log('🎞️  Encoding video (with random audio)...')
  const videoPath = path.join(outDir, 'video.mp4')
  await addRandomAudioToVideo(framePath, videoPath, 6)

  // 5. Persist metadata
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify({ topic, copy, images: images.map((i) => ({ ...i.meta, url: i.url })) }, null, 2)
  )

  console.log(`\n✅ Done.`)
  console.log(`   frame: ${framePath}`)
  console.log(`   video: ${videoPath}`)
}

main().catch((err) => {
  console.error(`\n❌ Sample failed: ${err.message}`)
  process.exit(1)
})
