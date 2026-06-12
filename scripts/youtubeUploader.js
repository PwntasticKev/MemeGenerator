import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { google } from 'googleapis'
import dotenv from 'dotenv'

// Load .env by absolute path: under launchd the cwd is NOT the project, and this
// module is imported (and would otherwise read env) before the entrypoint's own
// dotenv.config() runs.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })

// Built lazily (not at import time) so credentials are read after every chance
// to load .env, and missing ones fail loudly instead of as opaque OAuth errors.
function createOAuthClient () {
  const missing = ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']
    .filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`YouTube upload misconfigured: missing env var(s) ${missing.join(', ')}`)
  }
  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  )
  client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN })
  return client
}

const youtube = google.youtube({ version: 'v3' })

export async function uploadToYouTube (videoPath, title, description, tags = [], scheduledTime = null) {
  try {
    console.log('📤 Starting YouTube upload...')
    console.log(`📹 Video: ${videoPath}`)
    console.log(`📝 Title: ${title}`)
    console.log(`📄 Description: ${description}`)

    if (scheduledTime) {
      console.log(`⏰ Scheduled for: ${scheduledTime}`)
    }

    const oauth2Client = createOAuthClient()

    // Prepare upload parameters
    const requestBody = {
      snippet: {
        title,
        description,
        tags,
        categoryId: '22', // People & Blogs
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      status: {
        // Default private for safety; set YOUTUBE_PRIVACY=public to auto-publish now.
        privacyStatus: process.env.YOUTUBE_PRIVACY || 'private',
        selfDeclaredMadeForKids: false
      }
    }

    // Scheduled publishing: YouTube REQUIRES privacyStatus=private alongside
    // publishAt, then auto-publishes (makes public) at that time.
    if (scheduledTime) {
      requestBody.status.privacyStatus = 'private'
      requestBody.status.publishAt = new Date(scheduledTime).toISOString()
    }

    // Upload the video, retrying transient failures (a fresh access token and a
    // new read stream each attempt). invalid_request is NOT retried: it means
    // bad/missing OAuth config and fails identically every time.
    const maxAttempts = 3
    let lastErr
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await youtube.videos.insert({
          auth: oauth2Client,
          part: ['snippet', 'status'],
          requestBody,
          media: { body: fs.createReadStream(videoPath) }
        })
        const videoId = response.data.id
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
        console.log('✅ YouTube upload successful!')
        console.log(`🔗 Video URL: ${videoUrl}`)
        return { success: true, videoId, videoUrl, scheduledTime }
      } catch (err) {
        lastErr = err
        const transient = /rateLimit|backendError|internal|timeout|ECONNRESET|503|500/i.test(err.message || '')
        console.error(`❌ Upload attempt ${attempt}/${maxAttempts} failed: ${err.message}`)
        if (attempt < maxAttempts && transient) {
          await new Promise((r) => setTimeout(r, 2000 * attempt))
          // Force a fresh access token for the next attempt (setCredentials with
          // the same refresh token would be a no-op).
          try { await oauth2Client.getAccessToken() } catch { /* next insert reports it */ }
          continue
        }
        break
      }
    }
    return { success: false, error: lastErr ? lastErr.message : 'unknown upload error' }
  } catch (error) {
    console.error('❌ YouTube upload failed:', error.message)
    return { success: false, error: error.message }
  }
}

export async function scheduleVideo (videoPath, title, description, tags = [], scheduledTime) {
  console.log('📅 Scheduling video for YouTube...')
  return await uploadToYouTube(videoPath, title, description, tags, scheduledTime)
}

// Helper function to create scheduled time (e.g., 24 hours from now)
export function createScheduledTime (hoursFromNow = 24) {
  const scheduledTime = new Date()
  scheduledTime.setHours(scheduledTime.getHours() + hoursFromNow)
  return scheduledTime.toISOString()
}

// Test function
export async function testYouTubeUpload () {
  console.log('🧪 Testing YouTube upload functionality...')

  // Check if required environment variables are set
  const requiredVars = [
    'YOUTUBE_API_KEY',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REDIRECT_URI',
    'YOUTUBE_REFRESH_TOKEN'
  ]

  const missingVars = requiredVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    console.log('❌ Missing YouTube API environment variables:')
    missingVars.forEach(varName => console.log(`   - ${varName}`))
    console.log('\n📝 Please add these to your .env file')
    return false
  }

  console.log('✅ All YouTube API environment variables are set')
  return true
}

// Main function for testing
async function main () {
  const testResult = await testYouTubeUpload()
  if (testResult) {
    console.log('🎉 YouTube uploader is ready to use!')
  } else {
    console.log('⚠️  Please configure YouTube API credentials first')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
