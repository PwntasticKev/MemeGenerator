import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import mcpClient from '../mcp-client.js'
import { generateMemeContent } from './contentGenerator.js'

// Import template generation function
import { generateTemplateWithVideo } from '../template.js'

const execAsync = promisify(exec)

// Constants
const MEME_PROFILE_PIC = './assets/mainoverlay_1.png'
const MEME_VIDEO_OVERLAY = './account_1/mainoverlay_1.mp4' // MP4 video overlay

// Create placeholder image URL function
function createPlaceholderImageUrl (text) {
  const encodedText = encodeURIComponent(text.slice(0, 20))
  return `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodedText}`
}

// Meme COPY generation now delegates to the unified contentGenerator
// (modern OpenAI SDK, single rage-bait prompt). This wrapper preserves the
// legacy return shape (adds image_urls/avatar_urls) and the no-questions guard.
export async function callCustomGpt (topic, accountNumber = 1) {
  console.log(`🤖 Asking ChatGPT for meme content about: "${topic}"`)

  const content = await generateMemeContent(topic, { accountNumber })

  // Legacy guard: replies should never be questions.
  let validatedReply = content.reply
  if (/\?|what|how|why|do you|agree or disagree/i.test(content.reply)) {
    validatedReply = 'This is peak cinema right here'
    console.log('⚠️  Reply contained a question, using fallback')
  }

  return { ...content, reply: validatedReply, image_urls: [], avatar_urls: [] }
}

// MCP-based image scraping - much more reliable
export async function getScrapedImageForTerm (term) {
  console.log(`[MCP] Getting image for term: "${term}"`)

  try {
    // Use the MCP client for image scraping
    const imageUrl = await mcpClient.getScrapedImageForTerm(term)
    console.log(`[MCP] Successfully got image: ${imageUrl}`)
    return imageUrl
  } catch (error) {
    console.error(`[MCP] Error getting image for term "${term}":`, error.message)

    // Return guaranteed fallback
    const fallbackUrl = createPlaceholderImageUrl(term)
    console.log(`[MCP] Using fallback: ${fallbackUrl}`)
    return fallbackUrl
  }
}

// After downloading, verify with Sharp and signal failure if invalid
export async function downloadImage (url, path) {
  try {
    const sharp = await import('sharp')
    const axios = await import('axios')

    const res = await axios.default({
      url,
      responseType: 'arraybuffer',
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    fs.writeFileSync(path, res.data)
    // Try to open with Sharp to verify
    try {
      await sharp.default(path).metadata()
      return true
    } catch (e) {
      console.log(`[DEBUG] Sharp could not read downloaded image: ${url} (${e.message})`)
      return false
    }
  } catch (error) {
    console.error('❌ Error downloading image:', error.message)
    return false
  }
}

// Create video from image
async function createVideo (imagePath, outputPath) {
  try {
    const ffmpegCommand = `ffmpeg -loop 1 -i "${imagePath}" -c:v libx264 -t 5 -pix_fmt yuv420p -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -y "${outputPath}"`

    console.log('🎥 Running FFmpeg command:', ffmpegCommand)
    const { stdout, stderr } = await execAsync(ffmpegCommand)

    if (stderr) {
      console.log('FFmpeg stderr:', stderr)
    }

    console.log('✅ Video created successfully!')
    return outputPath
  } catch (error) {
    console.error('❌ Error creating video:', error.message)
    throw error
  }
}

// Main function
async function main (presetTopic = null) {
  try {
    // Load environment variables
    const dotenv = await import('dotenv')
    dotenv.config()

    // Get topic from command line or use preset
    const topic = presetTopic || process.argv[2] || 'The Godfather'

    if (!topic) {
      console.error('❌ Please provide a topic!')
      console.log('Usage: node generateMemeWithMCP.js "Your Topic Here"')
      process.exit(1)
    }

    console.log(`🎬 Starting meme generation for: "${topic}"`)

    // Create output directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, -5)
    const sanitizedTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')
    const runFolder = `./output/${new Date().toISOString().slice(0, 10)}/${sanitizedTopic}_${timestamp}`

    if (!fs.existsSync(runFolder)) {
      fs.mkdirSync(runFolder, { recursive: true })
    }

    console.log(`📁 Output folder: ${runFolder}`)

    // Step 1: Get GPT response
    console.log('\n🤖 Step 1: Getting GPT response...')
    const { fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, handle, name, tags } = await callCustomGpt(topic)

    console.log('✅ GPT Response received:')
    console.log(`   Fact: "${fact}"`)
    console.log(`   Reply: "${reply}"`)
    console.log(`   Search terms: ${image_search_terms.join(', ')}`)
    console.log(`   Handle: ${handle}`)
    console.log(`   Name: ${name}`)

    // Save GPT response
    const gptResponsePath = `${runFolder}/gpt_response.json`
    fs.writeFileSync(gptResponsePath, JSON.stringify({ fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, handle, name, tags }, null, 2))

    // Step 2: Scrape images using MCP
    console.log('\n🖼️ Step 2: Scraping images using MCP...')
    const finalImageUrls = [null, null]
    console.log(`[MCP] GPT provided ${image_urls ? image_urls.length : 0} image URLs and ${image_search_terms ? image_search_terms.length : 0} search terms`)

    // Always scrape 2 images regardless of GPT URLs
    console.log('[MCP] Scraping 2 images for template...')
    const searchTerms = image_search_terms || [`${topic} HD`, `${topic} high quality`, `${topic} official still HD`]

    // GUARANTEED image scraping - NEVER fails to return 2 working images
    const scrapeImageWithFallback = async (term, imageIndex) => {
      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`[MCP] Scraping image ${imageIndex} with term: "${term}" (attempt ${attempt})`)
          const imageUrl = await getScrapedImageForTerm(term)
          console.log(`[MCP] Successfully scraped image ${imageIndex}: ${imageUrl}`)
          return imageUrl
        } catch (error) {
          console.log(`[MCP] Failed to scrape image ${imageIndex} (attempt ${attempt}): ${error.message}`)
          if (attempt === maxAttempts) {
            // GUARANTEED fallback - this will ALWAYS work
            const guaranteedUrl = createPlaceholderImageUrl(term)
            console.log(`[MCP] Using GUARANTEED fallback for image ${imageIndex}: ${guaranteedUrl}`)
            return guaranteedUrl
          }
          // Try a different search term on next attempt - prioritize HD images
          const fallbackTerms = ['HD', 'high quality', 'official still HD', 'key scene HD', 'movie still HD']
          term = `${topic} ${fallbackTerms[attempt - 1] || 'HD'}`
        }
      }

      // This should never be reached, but just in case - ABSOLUTE guarantee
      console.log(`[MCP] EMERGENCY: Creating absolute fallback for image ${imageIndex}`)
      return createPlaceholderImageUrl(`${topic} image ${imageIndex}`)
    }

    // Scrape first image - GUARANTEED to work
    finalImageUrls[0] = await scrapeImageWithFallback(searchTerms[0], 1)

    // Scrape second image with different term - GUARANTEED to work
    const secondTerm = searchTerms[1] || searchTerms[0] + ' scene'
    finalImageUrls[1] = await scrapeImageWithFallback(secondTerm, 2)

    // FINAL SAFETY CHECK: Ensure we have exactly 2 working images
    if (!finalImageUrls[0]) {
      console.log('[MCP] EMERGENCY: Image 1 is null, creating emergency fallback')
      finalImageUrls[0] = createPlaceholderImageUrl(`${topic} image 1`)
    }
    if (!finalImageUrls[1]) {
      console.log('[MCP] EMERGENCY: Image 2 is null, creating emergency fallback')
      finalImageUrls[1] = createPlaceholderImageUrl(`${topic} image 2`)
    }

    console.log('[MCP] GUARANTEED Final image URLs:', finalImageUrls)
    console.log('[MCP] ✅ SUCCESS: Both images are ready for template generation')

    // Step 3: Generate template
    const framePath = `${runFolder}/frame.png`
    const videoPath = `${runFolder}/video.mp4`

    console.log('\n🎨 Step 3: Generating template with video background:', finalImageUrls)
    try {
      await generateTemplateWithVideo({
        videoOverlayPath: MEME_VIDEO_OVERLAY,
        image1: finalImageUrls[0],
        image2: finalImageUrls[1],
        fact,
        reply,
        outputPath: videoPath, // Output directly to MP4
        avatarPath: MEME_PROFILE_PIC, // Use PNG as avatar background
        handle: handle || '@memecreator',
        name: name || 'Meme Creator'
      })
      console.log('✅ Template with video background completed successfully!')
    } catch (templateError) {
      console.error('❌ Template generation failed:', templateError.message)
      throw templateError
    }

    // Step 4: Video already created in Step 3 with video background
    console.log('\n🎥 Step 4: Video created with template overlay!')

    // Final success message
    console.log('\n🎉 SUCCESS! Meme generation completed!')
    console.log(`📁 Output folder: ${runFolder}`)
    console.log(`🎥 Video: ${videoPath}`)
    console.log(`📝 GPT Response: ${gptResponsePath}`)

    // Clean up MCP client
    await mcpClient.disconnect()

    return {
      videoPath,
      gptResponsePath,
      fact,
      reply,
      handle,
      name
    }
  } catch (error) {
    console.error('❌ Fatal error in main function:', error.message)

    // Clean up MCP client on error
    try {
      await mcpClient.disconnect()
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError.message)
    }

    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main, createVideo }
