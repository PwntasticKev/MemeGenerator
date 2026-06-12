// recoverFailedUploads.js — one-shot recovery for batch runs whose videos
// generated fine but whose YouTube uploads failed (uploaded: false in
// data/posted-history.json). Regenerates title/description/tags for each
// topic, uploads the EXISTING video.mp4 with its original publishAt (rolled
// forward into the next window if the slot already passed), and rewrites the
// matching history entries with the resulting YouTube ids.
//
// Only entries from ONE date are recovered (default: today) — history also
// contains old uploaded:false rows from dry-run/testing days that must never
// be mass-uploaded.
//
// Usage:
//   node scripts/recoverFailedUploads.js                    # recover today's failures
//   node scripts/recoverFailedUploads.js --date=2026-06-11  # a specific day's
//   node scripts/recoverFailedUploads.js --dry-run          # show what would happen

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadHistory } from './topicSelector.js'
import { generateMemeContent } from './contentGenerator.js'
import { uploadToYouTube } from './youtubeUploader.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })

const DRY_RUN = process.argv.includes('--dry-run')
const dateArg = process.argv.find((a) => a.startsWith('--date='))
const TARGET_DATE = dateArg ? dateArg.split('=')[1] : new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
  console.error(`Invalid --date "${TARGET_DATE}" — expected YYYY-MM-DD.`)
  process.exit(1)
}
const HISTORY_PATH = path.join(ROOT, 'data', 'posted-history.json')

// If the original publishAt already passed, slide it forward in 30-minute
// steps until it's at least 20 minutes in the future (YouTube requires a
// future publishAt).
function ensureFuture (iso) {
  let t = new Date(iso)
  if (isNaN(t.getTime())) t = new Date() // missing/malformed publishAt → start from now
  const floor = Date.now() + 20 * 60 * 1000
  while (t.getTime() < floor) t.setMinutes(t.getMinutes() + 30)
  return t
}

async function main () {
  const history = loadHistory()
  const failed = history.filter((e) => e.uploaded === false && e.videoPath && e.date === TARGET_DATE)
  if (failed.length === 0) {
    console.log(`Nothing to recover — no uploaded:false entries for ${TARGET_DATE}.`)
    return
  }
  console.log(`Recovering ${failed.length} failed upload(s) from ${TARGET_DATE}.`)

  const updated = [...history]
  for (const entry of failed) {
    const idx = history.indexOf(entry)
    console.log(`\n--- Recovering "${entry.topic}" (${entry.date}) ---`)

    if (!fs.existsSync(entry.videoPath)) {
      console.log(`  ✗ video missing on disk, skipping: ${entry.videoPath}`)
      continue
    }

    const publishAt = ensureFuture(entry.scheduledPublishAt || new Date().toISOString())
    console.log(`  publishAt: ${publishAt.toLocaleString()} (${publishAt.toISOString()})`)

    if (DRY_RUN) {
      console.log('  (dry-run, no upload)')
      continue
    }

    const content = await generateMemeContent(entry.topic)
    console.log(`  title: ${content.youtube_title}`)

    const upload = await uploadToYouTube(
      entry.videoPath,
      content.youtube_title,
      content.youtube_description,
      content.tags,
      publishAt.toISOString()
    )
    if (!upload.success) {
      console.log(`  ✗ upload failed again: ${upload.error}`)
      continue
    }

    console.log(`  ✓ scheduled: ${upload.videoUrl}`)
    updated[idx] = {
      ...entry,
      scheduledPublishAt: publishAt.toISOString(),
      youtubeId: upload.videoId,
      youtubeUrl: upload.videoUrl,
      uploaded: true
    }
    // Persist immediately after EACH success: if a later entry crashes the run,
    // this one must not be re-found as uploaded:false and double-uploaded.
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(updated, null, 2))
  }

  if (!DRY_RUN) console.log('\nHistory updated.')
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`)
  process.exit(1)
})
