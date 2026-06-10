// getYouTubeRefreshToken.js — one-time helper to obtain a YouTube refresh token.
//
// Prereqs in .env (from Google Cloud Console -> OAuth client, type "Desktop app"):
//   YOUTUBE_CLIENT_ID=...apps.googleusercontent.com
//   YOUTUBE_CLIENT_SECRET=GOCSPX-...
//
// Run:   node scripts/getYouTubeRefreshToken.js
// It opens a browser, you log in + approve, and it prints YOUTUBE_REFRESH_TOKEN
// to paste back into .env. Uploads nothing.

import 'dotenv/config'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { URL, fileURLToPath } from 'url'
import { google } from 'googleapis'
import open from 'open'

const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')

// Write/replace YOUTUBE_REFRESH_TOKEN in .env so the secret never leaves the file.
function saveRefreshToken (token) {
  let env = ''
  try { env = fs.readFileSync(ENV_PATH, 'utf8') } catch {}
  const line = `YOUTUBE_REFRESH_TOKEN=${token}`
  if (/^YOUTUBE_REFRESH_TOKEN=.*$/m.test(env)) {
    env = env.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, line)
  } else {
    env += (env.endsWith('\n') ? '' : '\n') + line + '\n'
  }
  fs.writeFileSync(ENV_PATH, env)
}

const PORT = 4280
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']

async function main () {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET } = process.env
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET ||
      /your-|here/i.test(YOUTUBE_CLIENT_ID) || /your-|here/i.test(YOUTUBE_CLIENT_SECRET)) {
    console.log('❌ Set real YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first.')
    console.log('   (Google Cloud Console -> APIs & Services -> Credentials -> OAuth client, type "Desktop app".)')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, REDIRECT_URI)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force a refresh_token even if previously granted
    scope: SCOPES
  })

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url.startsWith('/oauth2callback')) {
        res.writeHead(404); res.end('Not found'); return
      }
      const code = new URL(req.url, REDIRECT_URI).searchParams.get('code')
      if (!code) { res.writeHead(400); res.end('No code'); return }

      const { tokens } = await oauth2Client.getToken(code)
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>✅ Done. You can close this tab and return to the terminal.</h2>')

      console.log('\n========================================')
      if (tokens.refresh_token) {
        saveRefreshToken(tokens.refresh_token)
        console.log('✅ Refresh token saved to .env (YOUTUBE_REFRESH_TOKEN).')
      } else {
        console.log('⚠️  No refresh_token returned. Revoke prior access at')
        console.log('   https://myaccount.google.com/permissions and run this again.')
      }
      console.log('========================================\n')
      server.close()
      process.exit(0)
    } catch (err) {
      res.writeHead(500); res.end('Error: ' + err.message)
      console.log('❌ Token exchange failed:', err.message)
      server.close()
      process.exit(1)
    }
  })

  server.listen(PORT, async () => {
    console.log(`🔐 Opening browser for Google consent...`)
    console.log(`   If it doesn't open, visit:\n   ${authUrl}\n`)
    try { await open(authUrl) } catch { /* user can paste manually */ }
  })
}

main()
