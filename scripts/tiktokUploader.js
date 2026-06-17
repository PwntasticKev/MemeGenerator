// tiktokUploader.js — push a finished video to TikTok via the official
// Content Posting API.
//
// Two modes (set TIKTOK_POST_MODE):
//   - 'inbox'  (DEFAULT): uploads the video to the account's TikTok drafts. The
//              user opens the app and taps to finish posting. Works WITHOUT
//              TikTok auditing the app — the realistic starting point.
//   - 'direct': publishes directly. Requires the app to pass TikTok's audit;
//              until audited TikTok forces privacy to SELF_ONLY (private).
//
// TikTok access tokens live ~24h, so each run refreshes a fresh one from the
// long-lived refresh token. TikTok ROTATES the refresh token on refresh, so the
// new value is written back to .env (TIKTOK_REFRESH_TOKEN).
//
// Env (see .env placeholders + scripts/getTikTokRefreshToken.js):
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN
//   TIKTOK_POST_MODE=inbox|direct (default inbox)
//   TIKTOK_PRIVACY=SELF_ONLY|MUTUAL_FOLLOW_FRIENDS|PUBLIC_TO_EVERYONE (direct only)

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = path.join(ROOT, '.env')
dotenv.config({ path: ENV_PATH })

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const INBOX_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/'
const DIRECT_INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/'

const isPlaceholder = (v) => !v || /^your-|-here$/i.test(v)

export function tiktokConfigured () {
  return !['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN']
    .some((k) => isPlaceholder(process.env[k]))
}

// Write/replace a single KEY=value line in .env (TikTok rotates the refresh
// token, so the latest one must be persisted or the next run can't authenticate).
function saveEnvVar (key, value) {
  let env = ''
  try { env = fs.readFileSync(ENV_PATH, 'utf8') } catch { /* new file */ }
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  env = re.test(env) ? env.replace(re, line) : env + (env.endsWith('\n') ? '' : '\n') + line + '\n'
  fs.writeFileSync(ENV_PATH, env)
  process.env[key] = value
}

// Exchange the refresh token for a fresh access token; persist the rotated
// refresh token. Returns the access token (string) or throws.
async function getAccessToken () {
  if (!tiktokConfigured()) {
    throw new Error('TikTok not configured: set TIKTOK_CLIENT_KEY/SECRET/REFRESH_TOKEN in .env')
  }
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: process.env.TIKTOK_REFRESH_TOKEN
  })
  const { data } = await axios.post(TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  })
  if (data.error || !data.access_token) {
    throw new Error(`token refresh failed: ${data.error_description || data.error || 'no access_token'}`)
  }
  // TikTok returns a new refresh token on each refresh — persist it.
  if (data.refresh_token && data.refresh_token !== process.env.TIKTOK_REFRESH_TOKEN) {
    saveEnvVar('TIKTOK_REFRESH_TOKEN', data.refresh_token)
  }
  return data.access_token
}

// PUT the whole video as a single chunk (our clips are a few MB — well under
// TikTok's 64MB single-chunk ceiling).
async function putVideo (uploadUrl, buffer) {
  const size = buffer.length
  await axios.put(uploadUrl, buffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(size),
      'Content-Range': `bytes 0-${size - 1}/${size}`
    },
    maxBodyLength: Infinity,
    timeout: 120000
  })
}

/**
 * Upload `videoPath` to TikTok.
 * @param {string} videoPath
 * @param {Object} [opts]
 * @param {string} [opts.caption]  caption/title (direct mode only; inbox captions are added in-app)
 * @param {string} [opts.mode]     'inbox' | 'direct' (default from TIKTOK_POST_MODE or 'inbox')
 * @returns {Promise<{success:boolean, publishId?:string, mode:string, error?:string}>}
 */
export async function uploadToTikTok (videoPath, opts = {}) {
  const mode = opts.mode || process.env.TIKTOK_POST_MODE || 'inbox'
  try {
    const accessToken = await getAccessToken()
    const buffer = fs.readFileSync(videoPath)
    const size = buffer.length

    const sourceInfo = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 }
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' }

    let initUrl, initBody
    if (mode === 'direct') {
      initUrl = DIRECT_INIT_URL
      initBody = {
        post_info: {
          title: (opts.caption || '').slice(0, 2200),
          // Unaudited apps MUST use SELF_ONLY; once audited, set PUBLIC_TO_EVERYONE.
          privacy_level: process.env.TIKTOK_PRIVACY || 'SELF_ONLY',
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false
        },
        source_info: sourceInfo
      }
    } else {
      initUrl = INBOX_INIT_URL
      initBody = { source_info: sourceInfo }
    }

    const { data: init } = await axios.post(initUrl, initBody, { headers, timeout: 30000 })
    if (init.error && init.error.code && init.error.code !== 'ok') {
      return { success: false, mode, error: `init: ${init.error.code} ${init.error.message || ''}`.trim() }
    }
    const publishId = init.data?.publish_id
    const uploadUrl = init.data?.upload_url
    if (!uploadUrl) return { success: false, mode, error: 'init returned no upload_url' }

    await putVideo(uploadUrl, buffer)
    return { success: true, publishId, mode }
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message || err.response?.data?.error_description
    return { success: false, mode, error: apiMsg || err.message }
  }
}

// CLI: node scripts/tiktokUploader.js <videoPath> [caption]
async function main () {
  const [videoPath, ...capParts] = process.argv.slice(2)
  if (!videoPath) {
    console.log('Usage: node scripts/tiktokUploader.js <videoPath> [caption]')
    process.exit(1)
  }
  if (!tiktokConfigured()) {
    console.log('❌ TikTok not configured. Set TIKTOK_CLIENT_KEY/SECRET/REFRESH_TOKEN in .env')
    console.log('   (run scripts/getTikTokRefreshToken.js after creating your TikTok app)')
    process.exit(1)
  }
  console.log(`📲 Uploading to TikTok (${process.env.TIKTOK_POST_MODE || 'inbox'} mode)...`)
  const res = await uploadToTikTok(videoPath, { caption: capParts.join(' ') })
  if (res.success) {
    console.log(`✅ TikTok upload ok (publish_id: ${res.publishId}).`)
    console.log(res.mode === 'inbox' ? '   Open the TikTok app → Inbox/Drafts to finish posting.' : '   Published (check the app).')
  } else {
    console.log(`❌ TikTok upload failed: ${res.error}`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
