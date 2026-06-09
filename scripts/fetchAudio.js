// fetchAudio.js — bulk-download CC0 (monetization-safe, no-attribution) music
// from Freesound into the audio/ folder, where getRandomAudioFile() randomizes
// through everything automatically.
//
// Setup: get a free API key at https://freesound.org/apiv2/apply/ and add to .env:
//   FREESOUND_API_KEY=...
//
// Usage:
//   node scripts/fetchAudio.js                 # ~40 tracks across varied genres
//   node scripts/fetchAudio.js --count=80      # more
//   node scripts/fetchAudio.js --query="lofi"  # one specific vibe
//
// Notes:
// - Filters strictly to license:"Creative Commons 0" (CC0) — safe for monetized
//   YouTube with no attribution required.
// - Downloads the high-quality MP3 preview (no OAuth2 needed, just the API token).
// - Idempotent: skips tracks already downloaded (by Freesound id).

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUDIO_DIR = path.join(__dirname, '..', 'audio')
const API = 'https://freesound.org/apiv2/search/text/'

// Varied search terms so the library spans moods/genres.
const DEFAULT_QUERIES = [
  'background music', 'lofi', 'electronic', 'cinematic', 'ambient',
  'hip hop beat', 'upbeat', 'chill', 'corporate', 'epic', 'funk', 'synthwave'
]

const args = process.argv.slice(2)
const argVal = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : def
}
const TARGET = parseInt(argVal('count', '40'), 10)
const SINGLE_QUERY = argVal('query', null)

const sanitize = (s) => s.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)

function alreadyHave (id) {
  try {
    return fs.readdirSync(AUDIO_DIR).some((f) => f.startsWith(`freesound_${id}_`))
  } catch {
    return false
  }
}

async function searchCC0 (query, key, pageSize = 30) {
  const params = {
    query,
    filter: 'license:"Creative Commons 0" duration:[20 TO 300]',
    fields: 'id,name,license,duration,previews',
    sort: 'rating_desc',
    page_size: pageSize,
    token: key
  }
  const { data } = await axios.get(API, { params, timeout: 15000 })
  return data?.results || []
}

async function downloadPreview (url, dest) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })
  const buf = Buffer.from(res.data)
  if (buf.length < 20 * 1024) throw new Error(`too small (${buf.length} bytes)`)
  fs.writeFileSync(dest, buf)
  return buf.length
}

// Accept common spellings so the env var name isn't a footgun.
function resolveKey () {
  const candidates = [
    'FREESOUND_API_KEY', 'FREE_SOUND_API_KEY',
    'FREESOUND_TOKEN', 'FREE_SOUND_TOKEN', 'FREESOUND_KEY', 'FREE_SOUND_KEY'
  ]
  for (const name of candidates) {
    const v = process.env[name]
    if (v && !/your-|here/i.test(v)) return v
  }
  return null
}

async function main () {
  const key = resolveKey()
  if (!key) {
    console.log('❌ Freesound API key not found in .env.')
    console.log('   Add this line to /Users/kevinlee/Documents/code/MemeGenerator/.env :')
    console.log('     FREESOUND_API_KEY=your_key_here   (FREE_SOUND_API_KEY also works)')
    console.log('   Get a free key at https://freesound.org/apiv2/apply/')
    process.exit(1)
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  const queries = SINGLE_QUERY ? [SINGLE_QUERY] : DEFAULT_QUERIES

  let downloaded = 0
  let skipped = 0
  console.log(`🎵 Fetching up to ${TARGET} CC0 tracks into ${AUDIO_DIR}\n`)

  for (const query of queries) {
    if (downloaded >= TARGET) break
    let results = []
    try {
      results = await searchCC0(query, key)
    } catch (err) {
      console.log(`  ⚠️  search "${query}" failed: ${err.response?.status || err.message}`)
      continue
    }

    for (const r of results) {
      if (downloaded >= TARGET) break
      const previewUrl = r.previews?.['preview-hq-mp3'] || r.previews?.['preview-lq-mp3']
      if (!previewUrl) continue
      if (alreadyHave(r.id)) { skipped++; continue }

      const dest = path.join(AUDIO_DIR, `freesound_${r.id}_${sanitize(r.name)}.mp3`)
      try {
        const bytes = await downloadPreview(previewUrl, dest)
        downloaded++
        console.log(`  ✅ [${query}] ${r.name.slice(0, 40)} (${Math.round(r.duration)}s, ${Math.round(bytes / 1024)}KB)`)
      } catch (err) {
        console.log(`  ⚠️  download failed for "${r.name.slice(0, 30)}": ${err.message}`)
      }
    }
  }

  const total = fs.readdirSync(AUDIO_DIR).filter((f) => /\.(mp3|wav|m4a|aac|flac)$/i.test(f)).length
  console.log(`\n✅ Done. Downloaded ${downloaded} new (skipped ${skipped} existing).`)
  console.log(`   audio/ now has ${total} tracks total — the pipeline randomizes through all of them.`)
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(1) })
