// getTikTokRefreshToken.js — one-time helper to obtain a TikTok refresh token.
//
// Prereqs in .env (from developers.tiktok.com -> your app -> credentials):
//   TIKTOK_CLIENT_KEY=...
//   TIKTOK_CLIENT_SECRET=...
//   TIKTOK_REDIRECT_URI=http://localhost:4281/callback   (optional; this is the default)
//
// In your TikTok app you MUST register the SAME redirect URI (Login Kit ->
// Redirect URI) and enable the Login Kit + Content Posting API products with
// scopes user.info.basic and video.upload (add video.publish after audit).
//
// Run:   node scripts/getTikTokRefreshToken.js
// It opens a browser, you log in + approve, and it writes TIKTOK_REFRESH_TOKEN
// (and TIKTOK_OPEN_ID) into .env. Uploads nothing.

import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { URL, fileURLToPath } from 'url'
import axios from 'axios'
import open from 'open'

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/'

// Inbox/draft posting only needs video.upload; add video.publish once the app
// is audited for direct publishing. Override with TIKTOK_SCOPES if needed.
const SCOPES = process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload'
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:4281/callback'
const PORT = Number(new URL(REDIRECT_URI).port || 4281)

function saveEnvVar (key, value) {
  let env = ''
  try { env = fs.readFileSync(ENV_PATH, 'utf8') } catch { /* new */ }
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  env = re.test(env) ? env.replace(re, line) : env + (env.endsWith('\n') ? '' : '\n') + line + '\n'
  fs.writeFileSync(ENV_PATH, env)
}

async function main () {
  const { TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET } = process.env
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET ||
      /your-|-here/i.test(TIKTOK_CLIENT_KEY) || /your-|-here/i.test(TIKTOK_CLIENT_SECRET)) {
    console.log('❌ Set real TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env first.')
    console.log('   (developers.tiktok.com -> Manage apps -> your app -> credentials.)')
    process.exit(1)
  }

  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = `${AUTH_URL}?${new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state
  })}`

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url.startsWith('/callback')) { res.writeHead(404); res.end('Not found'); return }
      const params = new URL(req.url, REDIRECT_URI).searchParams
      if (params.get('state') !== state) { res.writeHead(400); res.end('State mismatch'); return }
      const code = params.get('code')
      if (!code) {
        const err = params.get('error_description') || params.get('error') || 'no code'
        res.writeHead(400); res.end('Auth error: ' + err)
        console.log('❌ Authorization failed:', err)
        server.close(); process.exit(1)
      }

      const body = new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
      const { data } = await axios.post(TOKEN_URL, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      })

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>✅ Done. You can close this tab and return to the terminal.</h2>')

      console.log('\n========================================')
      if (data.refresh_token) {
        saveEnvVar('TIKTOK_REFRESH_TOKEN', data.refresh_token)
        if (data.open_id) saveEnvVar('TIKTOK_OPEN_ID', data.open_id)
        console.log('✅ TikTok refresh token saved to .env (TIKTOK_REFRESH_TOKEN).')
        console.log(`   scopes: ${data.scope || SCOPES}`)
      } else {
        console.log('⚠️  No refresh_token returned:', JSON.stringify(data))
      }
      console.log('========================================\n')
      server.close(); process.exit(0)
    } catch (err) {
      const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message
      res.writeHead(500); res.end('Error: ' + msg)
      console.log('❌ Token exchange failed:', msg)
      server.close(); process.exit(1)
    }
  })

  server.listen(PORT, async () => {
    console.log('🔐 Opening browser for TikTok consent...')
    console.log(`   Redirect URI (must be registered in your TikTok app): ${REDIRECT_URI}`)
    console.log(`   If the browser doesn't open, visit:\n   ${authUrl}\n`)
    try { await open(authUrl) } catch { /* paste manually */ }
  })
}

main()
