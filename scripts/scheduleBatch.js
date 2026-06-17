// scheduleBatch.js — generate N videos now and let YOUTUBE auto-publish them
// on a drip schedule via per-video publishAt timestamps.
//
// This decouples generation from posting: run it occasionally (e.g. weekly),
// and YouTube publishes one per day on its own — your Mac need not be on.
//
// Videos are scheduled into engagement-friendly daily WINDOWS (default morning
// 7-9am, midday 11am-1pm, evening 5-7pm, night 9-11pm). A fresh RANDOM time is
// chosen within each window every day, so the schedule varies day-to-day (more
// organic, and reveals which times perform best). Overnight is skipped; full
// days roll to the next day.
//
// Usage:
//   node scripts/scheduleBatch.js                          # 6 videos into good daily windows
//   node scripts/scheduleBatch.js --count=12               # more
//   node scripts/scheduleBatch.js --windows=07:00-09:00,17:00-19:00  # custom windows (local)
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
import { uploadToTikTok, tiktokConfigured } from './tiktokUploader.js'

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
// Engagement-friendly daily WINDOWS (local HH:MM-HH:MM): morning, midday, evening,
// night. Each day a fresh random time is picked within each window — so the
// schedule varies day-to-day (more organic + reveals which times perform best).
const WINDOWS = argVal('windows', '07:00-09:00,11:00-13:00,17:00-19:00,21:00-23:00')
  .split(',').map((w) => w.trim()).filter(Boolean)
  .map((w) => {
    const [a, b] = w.split('-')
    const toMin = (hm) => { const [h, m] = hm.split(':').map((n) => parseInt(n, 10)); return h * 60 + m }
    return { start: toMin(a), end: toMin(b) }
  })
const START = argVal('start', null) // YYYY-MM-DD local; default = today (future times only)

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

// Build `count` future publish datetimes by picking a fresh RANDOM time within
// each day's good windows, rolling to the next day when a day is full. Past
// times are skipped. Times vary day-to-day so the footprint isn't robotic.
function buildPublishTimes (count, windows, startDateStr) {
  const times = []
  const day = startDateStr ? new Date(`${startDateStr}T00:00:00`) : new Date()
  day.setHours(0, 0, 0, 0)
  let guard = 0
  while (times.length < count && guard < 400) {
    for (const win of windows) {
      if (times.length >= count) break
      // Random minute-of-day within [start, end].
      const mins = win.start + Math.floor(Math.random() * (win.end - win.start + 1))
      const t = new Date(day)
      t.setHours(0, mins, 0, 0) // Date normalizes minute overflow into hours
      if (t.getTime() > Date.now()) times.push(t)
    }
    day.setDate(day.getDate() + 1)
    guard++
  }
  return times.sort((a, b) => a - b)
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

  const publishTimes = buildPublishTimes(COUNT, WINDOWS, START)
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  log(`Windows/day: ${WINDOWS.map((w) => `${fmt(w.start)}-${fmt(w.end)}`).join(', ')} local (random time per day). Scheduling ${publishTimes.length} videos:`)
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

    // Cross-post to TikTok if configured. Non-fatal: a TikTok failure must never
    // break the YouTube flow. Inbox mode drops the video into TikTok drafts.
    let tiktok = { skipped: true }
    if (!DRY_RUN && tiktokConfigured()) {
      try {
        const caption = [made.content.youtube_title, (made.content.tags || []).map((t) => `#${t}`).join(' ')]
          .filter(Boolean).join(' ')
        tiktok = await uploadToTikTok(made.videoPath, { caption })
        log(tiktok.success
          ? `TikTok: uploaded (${tiktok.mode}, publish_id ${tiktok.publishId})`
          : `TikTok FAILED: ${tiktok.error}`)
      } catch (err) {
        tiktok = { success: false, error: err.message }
        log(`TikTok error: ${err.message}`)
      }
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
      uploaded: Boolean(upload?.success),
      tiktokPublishId: tiktok?.publishId || null,
      tiktokUploaded: Boolean(tiktok?.success)
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
