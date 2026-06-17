// verifyTikTokAuth.js — read-only check that TikTok credentials work.
//
//   node scripts/verifyTikTokAuth.js
//
// Refreshes an access token and calls user.info to confirm the connection.
// Posts nothing.

import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import dotenv from 'dotenv'
import { tiktokConfigured } from './tiktokUploader.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name'

async function main () {
  if (!tiktokConfigured()) {
    console.log('❌ TikTok not configured. Set TIKTOK_CLIENT_KEY/SECRET/REFRESH_TOKEN in .env,')
    console.log('   then run: node scripts/getTikTokRefreshToken.js')
    process.exit(1)
  }
  try {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: process.env.TIKTOK_REFRESH_TOKEN
    })
    const { data: tok } = await axios.post(TOKEN_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000
    })
    if (!tok.access_token) {
      console.log('❌ TikTok token refresh failed:', tok.error_description || tok.error || 'unknown')
      console.log('   The refresh token may be expired/revoked — re-run getTikTokRefreshToken.js')
      process.exit(1)
    }
    console.log('✅ Access token refreshed OK')
    console.log(`   scopes: ${tok.scope || '(unknown)'}`)

    try {
      const { data: info } = await axios.get(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tok.access_token}` }, timeout: 15000
      })
      const u = info.data?.user
      if (u) console.log(`✅ Connected to TikTok: ${u.display_name || u.open_id}`)
    } catch {
      console.log('ℹ️  Token works; user.info not granted (only needs video.upload to post).')
    }
    console.log('✅ TikTok credentials are valid. Ready to upload.')
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message
    console.log('❌ TikTok auth check failed:', msg)
    process.exit(1)
  }
}

main()
