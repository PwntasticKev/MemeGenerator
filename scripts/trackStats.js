// trackStats.js — daily performance snapshot for posted videos.
//
// Pulls live view/like/comment counts for every uploaded video, appends a
// timestamped snapshot to data/stats-history.json, and prints a report that
// shows the DELTA since the last snapshot (so you can see which videos are
// still gaining and which stalled). This is the "monitor it" tool: run it
// daily and you build a real time-series instead of guessing.
//
//   node scripts/trackStats.js            # snapshot + report
//   node scripts/trackStats.js --no-write # report only, don't append
//
// Absolute .env path so it works under launchd (foreign cwd).

import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { google } from 'googleapis'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })

const HISTORY_PATH = path.join(ROOT, 'data', 'posted-history.json')
const STATS_PATH = path.join(ROOT, 'data', 'stats-history.json')
const NO_WRITE = process.argv.includes('--no-write')
const DEAD_THRESHOLD = 350 // views; below this after a day = dead on arrival

function loadJson (p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}

function buildYouTube () {
  const o = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET
  )
  o.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN })
  return google.youtube({ version: 'v3', auth: o })
}

// YouTube Data API caps videos.list at 50 ids per call.
async function fetchStats (yt, ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const res = await yt.videos.list({ part: ['snippet', 'statistics', 'status'], id: batch })
    out.push(...(res.data.items || []))
  }
  return out
}

function ageHours (v, nowMs) {
  const sched = v.status.publishAt ? new Date(v.status.publishAt).getTime() : 0
  const pub = sched > nowMs ? sched : new Date(v.snippet.publishedAt).getTime()
  return (nowMs - pub) / 3.6e6
}

async function main () {
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const history = loadJson(HISTORY_PATH, [])
  const meta = Object.fromEntries(
    history.filter((e) => e.uploaded && e.youtubeId).map((e) => [e.youtubeId, e])
  )
  const ids = Object.keys(meta)
  if (ids.length === 0) {
    console.log('No uploaded videos to track yet.')
    return
  }

  const yt = buildYouTube()
  const items = await fetchStats(yt, ids)

  const snapshots = loadJson(STATS_PATH, [])
  const prev = snapshots.length ? snapshots[snapshots.length - 1] : null
  const prevViews = prev ? Object.fromEntries(prev.videos.map((v) => [v.id, v.views])) : {}

  const videos = items.map((v) => {
    const live = v.status.privacyStatus === 'public' && new Date(v.snippet.publishedAt).getTime() <= nowMs
    return {
      id: v.id,
      topic: meta[v.id]?.topic || v.snippet.title,
      ageH: +ageHours(v, nowMs).toFixed(1),
      views: +(v.statistics.viewCount || 0),
      likes: +(v.statistics.likeCount || 0),
      comments: +(v.statistics.commentCount || 0),
      live
    }
  })

  // --- report ---
  const liveOld = videos.filter((v) => v.live && v.ageH > 24)
  const sorted = [...videos].sort((a, b) => b.views - a.views)
  const sortedViews = liveOld.map((v) => v.views).sort((a, b) => a - b)
  const median = sortedViews.length ? sortedViews[Math.floor(sortedViews.length / 2)] : 0

  console.log(`\n=== Stats snapshot ${nowIso} ===`)
  if (prev) console.log(`(Δ = change since ${prev.takenAt})\n`)
  console.log(
    'topic'.padEnd(28) + 'ageH'.padStart(7) + 'views'.padStart(8) +
    'Δviews'.padStart(8) + 'likes'.padStart(7) + 'cmts'.padStart(6)
  )
  for (const v of sorted) {
    const d = prevViews[v.id] != null ? v.views - prevViews[v.id] : null
    console.log(
      String(v.topic).slice(0, 27).padEnd(28) +
      String(v.ageH).padStart(7) +
      String(v.views).padStart(8) +
      String(d == null ? '—' : `+${d}`).padStart(8) +
      String(v.likes).padStart(7) +
      String(v.comments).padStart(6)
    )
  }

  const totViews = videos.reduce((s, v) => s + v.views, 0)
  const totLikes = videos.reduce((s, v) => s + v.likes, 0)
  const totComments = videos.reduce((s, v) => s + v.comments, 0)
  const dead = liveOld.filter((v) => v.views < DEAD_THRESHOLD)
  console.log(
    `\nmedian views (live, >24h, n=${liveOld.length}): ${median}` +
    `   |   totals: ${totViews} views, ${totLikes} likes, ${totComments} comments`
  )
  console.log(
    `engagement: ${totViews ? ((totLikes / totViews) * 100).toFixed(2) : 0}% like rate, ` +
    `${totViews ? ((totComments / totViews) * 100).toFixed(3) : 0}% comment rate`
  )
  if (dead.length) {
    console.log(`dead on arrival (<${DEAD_THRESHOLD}v, >24h): ${dead.map((v) => `${v.topic} (${v.views})`).join(', ')}`)
  }

  // --- persist snapshot ---
  if (!NO_WRITE) {
    const next = [...snapshots, { takenAt: nowIso, videos }]
    fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true })
    fs.writeFileSync(STATS_PATH, JSON.stringify(next, null, 2))
    console.log(`\nSnapshot ${snapshots.length + 1} saved to data/stats-history.json`)
  }
}

main().catch((err) => {
  console.error(`trackStats failed: ${err.message}`)
  process.exit(1)
})
