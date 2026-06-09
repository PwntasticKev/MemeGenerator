// overlayPool.js — the pool of character+background overlays for frames.
//
// Each overlay PNG is a baked character+background combo, so picking a different
// overlay changes BOTH the character and the background. We pool every overlay
// across assets/, oldoverlays/ and account_3/ for maximum variety, and support
// "don't repeat the last one" so consecutive videos always differ.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// Directories scanned for `mainoverlay_*.png` overlays.
const OVERLAY_DIRS = ['assets', 'oldoverlays', 'account_3']

export function buildOverlayPool () {
  const pool = []
  for (const dir of OVERLAY_DIRS) {
    const abs = path.join(ROOT, dir)
    let files = []
    try {
      files = fs.readdirSync(abs)
    } catch {
      continue
    }
    for (const f of files) {
      if (/^mainoverlay_\d+\.png$/i.test(f)) {
        pool.push(path.join(abs, f))
      }
    }
  }
  return pool
}

// Pick a random overlay, avoiding `avoidPath` (the previously-used one) so the
// same character+background never appears twice in a row.
export function pickOverlayDistinct (avoidPath = null) {
  const pool = buildOverlayPool()
  if (pool.length === 0) return path.join(ROOT, 'assets', 'mainoverlay_1.png')
  const candidates = pool.length > 1 && avoidPath
    ? pool.filter((p) => p !== avoidPath)
    : pool
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// Mood tags produced by the overlay-mood-tagging workflow, keyed by path
// RELATIVE to project root (portable across machines).
const MOODS_FILE = path.join(ROOT, 'assets', 'overlay-moods.json')

function loadMoodMap () {
  try {
    return JSON.parse(fs.readFileSync(MOODS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function relKey (absPath) {
  return path.relative(ROOT, absPath)
}

// Pick an overlay whose mood tags include `mood`, avoiding `avoidPath`, with
// random selection for variety. Falls back to ANY random overlay (per user
// choice) when no tagged match exists or the mood map isn't built yet.
export function pickOverlayForMood (mood, avoidPath = null) {
  const pool = buildOverlayPool()
  if (pool.length === 0) return path.join(ROOT, 'assets', 'mainoverlay_1.png')

  const moodMap = loadMoodMap()
  const wanted = String(mood || '').toLowerCase()

  let matches = pool.filter((p) => {
    const tags = moodMap[relKey(p)]?.moods || []
    return tags.map((t) => String(t).toLowerCase()).includes(wanted)
  })

  if (avoidPath && matches.length > 1) matches = matches.filter((p) => p !== avoidPath)
  if (matches.length > 0) {
    return matches[Math.floor(Math.random() * matches.length)]
  }

  // No mood match (or untagged) -> any random overlay.
  return pickOverlayDistinct(avoidPath)
}
