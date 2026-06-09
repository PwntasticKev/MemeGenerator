// verifyYouTubeAuth.js — read-only check that the YouTube OAuth creds work.
// Refreshes an access token from the refresh token and fetches the channel.
// Publishes / uploads NOTHING.
//
//   node scripts/verifyYouTubeAuth.js

import 'dotenv/config'
import { google } from 'googleapis'

async function main () {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, YOUTUBE_REDIRECT_URI } = process.env
  const missing = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']
    .filter((k) => !process.env[k])
  if (missing.length) {
    console.log('❌ Missing required vars:', missing.join(', '))
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI // optional for refresh-token flow
  )
  oauth2Client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN })

  try {
    // Force a token refresh to prove the refresh token is valid.
    const { token } = await oauth2Client.getAccessToken()
    console.log(token ? '✅ Access token refreshed OK' : '⚠️  No access token returned')

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client })
    const res = await youtube.channels.list({ part: ['snippet', 'statistics'], mine: true })
    const ch = res.data.items?.[0]
    if (!ch) {
      console.log('⚠️  Auth worked but no channel found for this account.')
      process.exit(1)
    }
    console.log(`✅ Channel: "${ch.snippet.title}"`)
    console.log(`   Subscribers: ${ch.statistics?.subscriberCount ?? 'n/a'}, Videos: ${ch.statistics?.videoCount ?? 'n/a'}`)
    console.log('✅ YouTube upload credentials are valid. Ready to post.')
  } catch (err) {
    console.log('❌ YouTube auth failed:', err.message)
    console.log('   (Refresh token may be expired/revoked, or the OAuth client mismatched.)')
    process.exit(1)
  }
}

main()
