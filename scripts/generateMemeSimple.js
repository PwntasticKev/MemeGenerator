import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import dotenv from 'dotenv'

// Import template generation function
import { generateTemplateWithVideo } from '../template.js'
import { generateMemeContent } from './contentGenerator.js'

// Load environment variables
dotenv.config()

const execAsync = promisify(exec)

// Constants
const MEME_PROFILE_PIC = './assets/mainoverlay_1.png'
const MEME_VIDEO_OVERLAY = './account_1/mainoverlay_1.mp4'

// Meme COPY generation delegates to the unified contentGenerator (modern OpenAI
// SDK, single rage-bait prompt). Preserves the legacy return shape.
export async function callCustomGpt (topic, accountNumber = 1) {
  console.log(`🤖 Asking ChatGPT for meme content about: "${topic}"`)

  const content = await generateMemeContent(topic, { accountNumber })

  console.log('✅ GPT Response received:')
  console.log(`   Fact: "${content.fact}"`)
  console.log(`   Reply: "${content.reply}"`)
  console.log(`   Search terms: ${content.image_search_terms.join(', ')}`)
  console.log(`   Handle: ${content.handle}`)

  return { ...content, image_urls: [], avatar_urls: [] }
}

// Simple image scraping using direct Puppeteer (no MCP)
export async function getScrapedImageForTerm (term) {
  console.log(`🖼️ Getting image for term: "${term}"`)

  try {
    // Import Puppeteer functions directly
    const { searchBingImagesPuppeteer, searchYahooImagesPuppeteer, searchDuckDuckGoImagesPuppeteer } = await import('./generateMeme.js')

    const engines = [
      searchBingImagesPuppeteer,
      searchYahooImagesPuppeteer,
      searchDuckDuckGoImagesPuppeteer
    ]

    // Enhanced search variations for better quality
    const searchVariations = [
      term + ' official movie poster HD',
      term + ' promotional poster high quality',
      term + ' character portrait HD',
      term + ' official still HD',
      term + ' movie scene high quality',
      term + ' character close-up HD',
      term + ' official artwork high quality',
      term + ' movie poster HD',
      term + ' promotional image high quality',
      term + ' character HD',
      term + ' character portrait high quality',
      term,
      term.replace('HD', 'high quality'),
      term.replace('high quality', 'HD'),
      term + ' movie',
      term + ' character',
      term.replace(/\s+/g, ' ') + ' official'
    ]

    for (const searchTerm of searchVariations) {
      console.log(`🖼️ Trying search variation: "${searchTerm}"`)

      for (const engine of engines) {
        try {
          console.log(`🖼️ Trying ${engine.name} for term "${searchTerm}"`)
          const scraped = await engine(searchTerm, 10, 100)
          console.log(`🖼️ ${engine.name} returned ${scraped ? scraped.length : 0} images`)

          if (scraped && scraped.length > 0) {
            // Try to validate multiple images
            for (let i = 0; i < Math.min(scraped.length, 15); i++) {
              const imageUrl = scraped[i]
              console.log(`🖼️ Testing image ${i + 1}: ${imageUrl}`)

              try {
                const axios = await import('axios')
                const response = await axios.default.get(imageUrl, {
                  responseType: 'arraybuffer',
                  timeout: 8000,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache'
                  }
                })

                if (response.status === 200 && response.data) {
                  const contentType = response.headers['content-type']
                  const contentLength = response.data.byteLength
                  console.log(`🖼️ Image response: ${response.status} ${contentType} (${contentLength} bytes)`)

                  if (contentLength > 5000 && contentType.startsWith('image/')) {
                    console.log(`✅ Premium quality image found: ${imageUrl} (${contentType}, ${contentLength} bytes)`)
                    return imageUrl
                  } else if (contentLength > 1000 && contentType.startsWith('image/')) {
                    console.log(`✅ Valid image found: ${imageUrl} (${contentType}, ${contentLength} bytes)`)
                    return imageUrl
                  }
                }
              } catch (imgError) {
                console.log(`❌ Image validation failed: ${imgError.message}`)
              }
            }
          }
        } catch (engineError) {
          console.log(`❌ ${engine.name} failed: ${engineError.message}`)
        }
      }
    }

    // Fallback to placeholder
    console.log(`❌ No valid images found for "${term}", using placeholder`)
    return `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(term.slice(0, 20))}`
  } catch (error) {
    console.error(`❌ Error scraping images for "${term}":`, error.message)
    return `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(term.slice(0, 20))}`
  }
}

// Download image function
export async function downloadImage (url, outputPath) {
  try {
    const axios = await import('axios')
    const response = await axios.default.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (response.status === 200 && response.data) {
      fs.writeFileSync(outputPath, response.data)
      console.log(`✅ Image downloaded: ${outputPath}`)
      return true
    }
  } catch (error) {
    console.error(`❌ Error downloading image: ${error.message}`)
  }
  return false
}

// Main function
async function main (presetTopic = null) {
  try {
    // Check if this is a test run (no API calls)
    const isTest = process.argv.includes('--test') || process.argv.includes('-t')

    // Get topic from command line or preset
    const topic = presetTopic || process.argv[2]
    if (!topic) {
      console.error('❌ Please provide a topic as a command line argument')
      console.log('Usage: node scripts/generateMemeSimple.js "Your Topic Here" [--test]')
      process.exit(1)
    }

    console.log(`🎬 Starting meme generation for: "${topic}"${isTest ? ' (TEST MODE - No API calls)' : ''}`)

    // Create output directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, -5)
    const sanitizedTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')
    const outputDir = `./output/${new Date().toISOString().slice(0, 10)}/${sanitizedTopic}_${timestamp}`
    fs.mkdirSync(outputDir, { recursive: true })
    console.log(`📁 Output folder: ${outputDir}`)

    // Step 1: Get GPT response (ONLY ONE API CALL - unless in test mode)
    console.log('\n🤖 Step 1: Getting GPT response...')
    let gptResponse

    if (isTest) {
      // Use mock response for testing
      gptResponse = {
        fact: 'This is a test fact about ' + topic,
        reply: 'This is a test reply about ' + topic,
        youtube_title: 'Test Title: ' + topic,
        youtube_description: 'Test description for ' + topic,
        image_search_terms: [topic + ' HD', topic + ' high quality', topic + ' official poster'],
        avatar_search_terms: [topic + ' character', topic + ' portrait'],
        image_urls: [],
        avatar_urls: [],
        handle: '@testuser',
        name: 'Test User',
        tags: ['test', 'demo']
      }
      console.log('🧪 Using test response (no API call)')
    } else {
      gptResponse = await callCustomGpt(topic)
    }

    // Save GPT response to file
    const gptResponsePath = path.join(outputDir, 'gpt_response.json')
    fs.writeFileSync(gptResponsePath, JSON.stringify(gptResponse, null, 2))
    console.log(`💾 GPT response saved to: ${gptResponsePath}`)

    // Step 2: Scrape images
    console.log('\n🖼️ Step 2: Scraping images...')
    console.log(`[DEBUG] GPT provided ${gptResponse.image_urls.length} image URLs and ${gptResponse.image_search_terms.length} search terms`)
    console.log('[DEBUG] Scraping 2 images for template...')

    const imageUrls = []
    for (let i = 0; i < 2; i++) {
      const searchTerm = gptResponse.image_search_terms[i] || gptResponse.image_search_terms[0]
      console.log(`[DEBUG] Scraping image ${i + 1} with term: "${searchTerm}" (attempt 1)`)

      const imageUrl = await getScrapedImageForTerm(searchTerm)
      if (imageUrl) {
        console.log(`[DEBUG] Successfully scraped image ${i + 1}: ${imageUrl}`)
        imageUrls.push(imageUrl)
      } else {
        console.log(`[DEBUG] Failed to scrape image ${i + 1}, using placeholder`)
        imageUrls.push(`https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(searchTerm.slice(0, 20))}`)
      }
    }

    console.log('[DEBUG] GUARANTEED Final image URLs:', imageUrls)
    console.log('[DEBUG] ✅ SUCCESS: Both images are ready for template generation')

    // Step 3: Generate template
    console.log('\n🎨 Step 3: Generating template...')
    console.log('🎨 Generating template with images:', imageUrls)

    const outputPath = path.join(outputDir, 'video.mp4')
    await generateTemplateWithVideo({
      videoOverlayPath: MEME_VIDEO_OVERLAY,
      image1: imageUrls[0],
      image2: imageUrls[1],
      fact: gptResponse.fact,
      reply: gptResponse.reply,
      outputPath,
      avatarPath: MEME_PROFILE_PIC,
      handle: gptResponse.handle,
      name: gptResponse.name
    })

    console.log('\n✅ Meme generation completed successfully!')
    console.log(`📁 Output: ${outputPath}`)
    console.log(`📝 Fact: "${gptResponse.fact}"`)
    console.log(`💬 Reply: "${gptResponse.reply}"`)
    console.log(`👤 Handle: ${gptResponse.handle}`)
    console.log(`📺 Title: ${gptResponse.youtube_title}`)
  } catch (error) {
    console.error('❌ Error in main function:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { main }
