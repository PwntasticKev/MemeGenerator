// dailyRun.js  (Phase 4 — unattended daily pipeline)
//
// One self-contained run, designed to be triggered by launchd/cron once a day:
//   pick topic (Phase 3) -> copy (Phase 2) -> validated images (Phase 1)
//                        -> template -> MP4 -> (optional) YouTube upload
//                        -> record history + log
//
// Usage:
//   node scripts/dailyRun.js                 # full run (uploads if YT configured)
//   node scripts/dailyRun.js --dry-run       # generate only, no upload
//   node scripts/dailyRun.js --topic="Dune"  # force a topic (skips selection)
//
// Exit code 0 on success, 1 on failure (so the scheduler can detect problems).

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { selectDailyTopic, recordPosted, loadHistory } from './topicSelector.js'
import { createVideoForTopic } from './generateVideo.js'
import { uploadToYouTube } from './youtubeUploader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// Load .env by ABSOLUTE path so it works under launchd (where cwd is not the
// project). Submodules read env lazily, so populating it here is sufficient.
dotenv.config({ path: path.join(ROOT, '.env') })

// --- args -----------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const forcedTopic = args.find((a) => a.startsWith('--topic='))?.split('=').slice(1).join('=')

// --- logging --------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10)
const logDir = path.join(ROOT, 'logs')
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, `daily-${today}.log`)
const logStream = fs.createWriteStream(logFile, { flags: 'a' })

function log (msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  logStream.write(line + '\n')
}

// --- helpers --------------------------------------------------------------

function youtubeConfigured () {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN
  )
}

// --- main -----------------------------------------------------------------

async function main () {
  log('===== Daily run starting =====')
  log(`mode: ${DRY_RUN ? 'DRY-RUN (no upload)' : 'LIVE'}`)

  // 1. Topic
  let topic, source
  if (forcedTopic) {
    topic = forcedTopic
    source = 'forced'
    log(`Topic (forced): "${topic}"`)
  } else {
    const picked = await selectDailyTopic()
    topic = picked.topic
    source = picked.source
    log(`Topic selected: "${topic}" (source: ${source}, from ${picked.candidatesConsidered} candidates)`)
  }

  // 2-6. Generate the video (shared core), avoiding the previous run's
  //      layout + overlay so consecutive videos always differ.
  const last = loadHistory().slice(-1)[0] || {}
  const { outDir, videoPath, content, layout, overlayPath } = await createVideoForTopic({
    topic,
    accountNumber: 1,
    avoid: { layout: last.layout, overlayPath: last.overlayPath },
    log
  })

  // 7. Upload
  let upload = { skipped: true }
  if (DRY_RUN) {
    log('Upload skipped (--dry-run).')
  } else if (!youtubeConfigured()) {
    log('Upload skipped (YouTube credentials not configured).')
  } else {
    upload = await uploadToYouTube(videoPath, content.youtube_title, content.youtube_description, content.tags)
    log(upload.success ? `Uploaded: ${upload.videoUrl}` : `Upload FAILED: ${upload.error}`)
  }

  // 8. History + metadata
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify({ topic, source, content, upload }, null, 2)
  )
  recordPosted({
    date: today,
    topic,
    source,
    layout,
    overlayPath,
    videoPath,
    youtubeId: upload?.videoId || null,
    youtubeUrl: upload?.videoUrl || null,
    uploaded: Boolean(upload?.success)
  })

  log('===== Daily run complete =====')
  logStream.end()
}

main().catch((err) => {
  log(`FATAL: ${err.message}`)
  log('===== Daily run FAILED =====')
  logStream.end()
  process.exit(1)
})
