import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

// YouTube API setup
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
})

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
)

export async function uploadToYouTube (videoPath, title, description, tags = [], scheduledTime = null) {
  try {
    console.log('📤 Starting YouTube upload...')
    console.log(`📹 Video: ${videoPath}`)
    console.log(`📝 Title: ${title}`)
    console.log(`📄 Description: ${description}`)

    if (scheduledTime) {
      console.log(`⏰ Scheduled for: ${scheduledTime}`)
    }

    // Set credentials
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN
    })

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

    // Upload the video
    const response = await youtube.videos.insert({
      auth: oauth2Client,
      part: ['snippet', 'status'],
      requestBody,
      media: {
        body: fs.createReadStream(videoPath)
      }
    })

    const videoId = response.data.id
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

    console.log('✅ YouTube upload successful!')
    console.log(`🔗 Video URL: ${videoUrl}`)

    return {
      success: true,
      videoId,
      videoUrl,
      scheduledTime
    }
  } catch (error) {
    console.error('❌ YouTube upload failed:', error.message)
    return {
      success: false,
      error: error.message
    }
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
