// scheduleBatch.js — generate N videos now and let YOUTUBE auto-publish them
// on a drip schedule via per-video publishAt timestamps.
//
// This decouples generation from posting: run it occasionally (e.g. weekly),
// and YouTube publishes one per day on its own — your Mac need not be on.
//
// Videos are scheduled into engagement-friendly daily SLOTS (default 8am, noon,
// 6pm, 10pm local), each with a few minutes of random jitter so posts aren't
// robotically on the hour. Overnight is skipped; full days roll to the next day.
//
// Usage:
//   node scripts/scheduleBatch.js                          # 6 videos into good daily slots
//   node scripts/scheduleBatch.js --count=12               # more
//   node scripts/scheduleBatch.js --slots=08:00,12:00,18:00,22:00  # custom times (local)
//   node scripts/scheduleBatch.js --jitter=20              # up to 20 min past the slot
//   node scripts/scheduleBatch.js --start=2026-06-15       # first publish day
//   node scripts/scheduleBatch.js --dry-run                # generate + show schedule, no upload
//
// Requires valid YouTube OAuth creds in .env (unless --dry-run).

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { selectDailyTopic, recordPosted, loadHistory } from './topicSelector.js'
import { createVideoForTopic } from './generateVideo.js'
import { uploadToYouTube } from './youtubeUploader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env') })

// --- args -----------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const argVal = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : def
}
const COUNT = Math.max(1, parseInt(argVal('count', '6'), 10))
// Engagement-friendly daily slots (local HH:MM): morning, lunch, evening, night.
const SLOTS = argVal('slots', '08:00,12:00,18:00,22:00')
  .split(',').map((s) => s.trim()).filter(Boolean)
const START = argVal('start', null) // YYYY-MM-DD local; default = today (future slots only)
// Add a few minutes of random jitter so posts aren't robotically on the hour.
const JITTER_MAX = parseInt(argVal('jitter', '14'), 10) // max minutes past the slot

// --- logging --------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10)
const logDir = path.join(ROOT, 'logs')
fs.mkdirSync(logDir, { recursive: true })
const logStream = fs.createWriteStream(path.join(logDir, `schedule-batch-${today}.log`), { flags: 'a' })
function log (msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  logStream.write(line + '\n')
}

// --- schedule math --------------------------------------------------------

function youtubeConfigured () {
  return Boolean(
    process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN
  )
}

// Build `count` future publish datetimes by filling each day's good SLOTS in
// order, rolling to the next day when a day is full. Past slots are skipped.
function buildPublishTimes (count, slots, startDateStr) {
  const times = []
  const day = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date()
  day.setHours(0, 0, 0, 0)
  let guard = 0
  while (times.length < count && guard < 400) {
    for (const slot of slots) {
      if (times.length >= count) break
      const [hh, mm] = slot.split(':').map((n) => parseInt(n, 10))
      // Jitter: 2..JITTER_MAX minutes past the slot, so it's never exactly on the hour.
      const jitter = JITTER_MAX > 2 ? 2 + Math.floor(Math.random() * (JITTER_MAX - 1)) : 0
      const t = new Date(day)
      t.setHours(hh, mm + jitter, 0, 0)
      if (t.getTime() > Date.now()) times.push(t)
    }
    day.setDate(day.getDate() + 1)
    guard++
  }
  return times
}

// --- main -----------------------------------------------------------------

async function main () {
  log(`===== Batch schedule starting: ${COUNT} videos =====`)
  log(`mode: ${DRY_RUN ? 'DRY-RUN (no upload)' : 'LIVE'}`)
  if (!DRY_RUN && !youtubeConfigured()) {
    log('❌ YouTube credentials not configured in .env — aborting. Use --dry-run to generate without uploading.')
    logStream.end()
    process.exit(1)
  }

  const publishTimes = buildPublishTimes(COUNT, SLOTS, START)
  log(`Slots/day: ${SLOTS.join(', ')} local. Scheduling ${publishTimes.length} videos:`)
  publishTimes.forEach((t, i) => log(`  ${i + 1}. ${t.toLocaleString()}`))

  let avoid = (() => {
    const last = loadHistory().slice(-1)[0] || {}
    return { layout: last.layout, overlayPath: last.overlayPath }
  })()

  const results = []
  for (let i = 0; i < publishTimes.length; i++) {
    const publishAt = publishTimes[i]
    log(`\n--- [${i + 1}/${publishTimes.length}] publishAt ${publishAt.toLocaleString()} (${publishAt.toISOString()}) ---`)

    let topic, source
    try {
      const picked = await selectDailyTopic()
      topic = picked.topic
      source = picked.source
      log(`Topic: "${topic}" (${source})`)
    } catch (err) {
      log(`⚠️  topic selection failed: ${err.message} — skipping slot`)
      continue
    }

    let made
    try {
      made = await createVideoForTopic({ topic, accountNumber: 1, avoid, log })
      avoid = { layout: made.layout, overlayPath: made.overlayPath }
    } catch (err) {
      log(`⚠️  generation failed for "${topic}": ${err.message} — skipping slot`)
      continue
    }

    let upload = { skipped: true }
    if (DRY_RUN) {
      log('Upload skipped (--dry-run).')
    } else {
      upload = await uploadToYouTube(
        made.videoPath,
        made.content.youtube_title,
        made.content.youtube_description,
        made.content.tags,
        publishAt.toISOString() // <-- YouTube schedules the publish
      )
      log(upload.success
        ? `Scheduled on YouTube: ${upload.videoUrl} (publishes ${publishAt.toLocaleString()})`
        : `Upload FAILED: ${upload.error}`)
    }

    recordPosted({
      date: today,
      topic,
      source,
      layout: made.layout,
      overlayPath: made.overlayPath,
      videoPath: made.videoPath,
      scheduledPublishAt: publishAt.toISOString(),
      youtubeId: upload?.videoId || null,
      youtubeUrl: upload?.videoUrl || null,
      uploaded: Boolean(upload?.success)
    })
    results.push({ topic, publishAt: publishAt.toISOString(), uploaded: Boolean(upload?.success) })

    // Brief pause between items so the rapid batch doesn't trip image-source
    // rate limits (iTunes/Wikimedia throttle bursts).
    if (i < publishTimes.length - 1) await new Promise((r) => setTimeout(r, 2500))
  }

  log(`\n===== Batch complete: ${results.length}/${COUNT} videos =====`)
  results.forEach((r) => log(`  • ${r.publishAt} — ${r.topic}${r.uploaded ? ' ✓' : DRY_RUN ? ' (dry)' : ' ✗'}`))
  logStream.end()
}

main().catch((err) => {
  log(`FATAL: ${err.message}`)
  logStream.end()
  process.exit(1)
})
