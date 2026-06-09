// testImageProvider.js
//
// CLI harness to prove the "no blanks" guarantee for a single topic.
//
//   node scripts/testImageProvider.js "Oppenheimer"
//
// Emits a single-line JSON result on the LAST line of stdout so it can be
// machine-parsed by the test workflow:
//   {"topic":"...","ok":true,"count":2,"images":[{w,h,format,source}], "error":null}
//
// Exit code 0 on success (>=2 valid images), 1 on failure.

import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import { getValidImages } from './imageProvider.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function sourceOf (url) {
  if (url.includes('image.tmdb.org')) return 'tmdb'
  if (url.includes('mzstatic.com') || url.includes('itunes.apple')) return 'itunes'
  if (url.includes('googleusercontent') || url.includes('gstatic')) return 'google'
  if (url.includes('wikipedia') || url.includes('wikimedia')) return 'wikipedia'
  return 'other'
}

async function main () {
  const topic = process.argv.slice(2).join(' ').trim() || 'Oppenheimer'
  const searchTerms = [
    `${topic}`,
    `${topic} movie poster`,
    `${topic} HD still`,
    `${topic} high quality`
  ]
  const outputDir = path.join(__dirname, '..', 'test_output', 'image_provider', topic.replace(/[^a-z0-9]+/gi, '_'))

  const result = { topic, ok: false, count: 0, images: [], error: null }
  try {
    const images = await getValidImages({ searchTerms, count: 2, outputDir })
    result.ok = images.length >= 2
    result.count = images.length
    result.images = images.map((i) => ({
      w: i.meta.width,
      h: i.meta.height,
      format: i.meta.format,
      source: sourceOf(i.url)
    }))
  } catch (err) {
    result.error = err.message
  }

  // Human-readable preamble, then a single machine-parsable JSON line.
  console.log(`\n[${topic}] ok=${result.ok} count=${result.count}${result.error ? ' error=' + result.error : ''}`)
  console.log('RESULT_JSON ' + JSON.stringify(result))
  process.exit(result.ok ? 0 : 1)
}

main()
