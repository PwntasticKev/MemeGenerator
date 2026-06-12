// avatarProvider.js — realistic human-face avatars for the fake commenter.
//
// The comment card must look like a REAL PERSON posted it. Faces come from
// thispersondoesnotexist.com (StyleGAN faces of people who don't exist — no
// real person's likeness, keyless) with i.pravatar.cc as fallback. Every
// downloaded face is validated and cached in assets/avatars/, so once a few
// are cached the pipeline keeps working with no network at all.
//
// All paths are absolute (launchd runs with a foreign cwd).

import fs from 'fs'
import path from 'path'
import axios from 'axios'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { validateImageBuffer } from './imageProvider.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const AVATAR_DIR = path.join(ROOT, 'assets', 'avatars')

const FACE_SOURCES = [
  () => 'https://thispersondoesnotexist.com/',
  () => `https://i.pravatar.cc/600?img=${1 + Math.floor(Math.random() * 70)}`
]

async function fetchFreshFace () {
  for (const makeUrl of FACE_SOURCES) {
    try {
      const { data } = await axios.get(makeUrl(), {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
      })
      const buffer = Buffer.from(data)
      const check = await validateImageBuffer(buffer, { minWidth: 256, minHeight: 256 })
      if (check.valid) return buffer
    } catch {
      // try the next source
    }
  }
  return null
}

function cachedFaces () {
  try {
    return fs
      .readdirSync(AVATAR_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => path.join(AVATAR_DIR, f))
  } catch {
    return []
  }
}

/**
 * Return the absolute path of a human-face avatar image, or null if neither
 * the network nor the local cache can provide one (callers then fall back to
 * the drawn-initials avatar).
 *
 * Fresh faces are preferred so commenters vary video-to-video; every fresh
 * face is added to the cache for offline reuse.
 */
export async function getAvatarPath () {
  fs.mkdirSync(AVATAR_DIR, { recursive: true })

  const fresh = await fetchFreshFace()
  if (fresh) {
    // Unique name + atomic rename: count-based names collide when files are
    // pruned or two pipeline runs overlap, and a torn half-written .jpg would
    // make a concurrent reader's loadImage throw.
    const file = path.join(
      AVATAR_DIR,
      `face_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`
    )
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, fresh)
    fs.renameSync(tmp, file)
    return file
  }

  const cached = cachedFaces()
  if (cached.length > 0) {
    return cached[Math.floor(Math.random() * cached.length)]
  }
  return null
}
