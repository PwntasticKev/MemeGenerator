import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import pkg from 'openai'
import mcpClient from '../mcp-client.js'

// Import template generation function
import { generateTemplateWithVideo } from '../template.js'

const { OpenAIApi, Configuration } = pkg
const execAsync = promisify(exec)

// Configuration for OpenAI API - will be set up after dotenv is loaded
let configuration
let openai

// Constants
const MEME_PROFILE_PIC = './assets/mainoverlay_1.png'
const MEME_VIDEO_OVERLAY = './account_1/mainoverlay_1.mp4' // MP4 video overlay

// Create placeholder image URL function
function createPlaceholderImageUrl (text) {
  const encodedText = encodeURIComponent(text.slice(0, 20))
  return `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodedText}`
}

// Enhanced GPT function with better prompt
export async function callCustomGpt (topic, accountNumber = 1) {
  try {
    console.log(`🤖 Asking ChatGPT for meme content about: "${topic}"`)

    // Create a comprehensive prompt for better search terms and character generation
    const prompt = `Create a WITTY and CONTROVERSIAL viral meme about "${topic}" that will spark heated discussions and get people to share their perspectives. 

Requirements:
1. Generate a WITTY, CONTROVERSIAL fact or observation about ${topic} (max 100 characters) - something that's clever, surprising, and will make people debate
2. Create a WITTY COMMENT or RAGE BAIT statement (max 80 characters) - NO EMOJIS, NO QUESTIONS, NO QUESTION MARKS - make a bold statement that will trigger reactions
3. Provide 3 specific image search terms that will find relevant, high-quality movie/show images
4. Create a creative username and handle for the meme creator (NOT related to the topic)
5. Generate an ENGAGING YouTube title and description that will spark discussion

Format your response as JSON with these exact fields:
{
  "fact": "Your witty, controversial fact/observation here",
  "reply": "Your engaging reply here - NO EMOJIS", 
  "youtube_title": "Engaging title that will spark discussion",
  "youtube_description": "Thought-provoking description with hashtags that will encourage debate",
  "image_search_terms": ["specific search term 1", "specific search term 2", "specific search term 3"],
  "avatar_search_terms": ["character avatar search 1", "character avatar search 2"],
  "image_urls": [],
  "avatar_urls": [],
  "handle": "@creativeusername",
  "name": "Creative Name",
  "tags": ["discussion", "debate", "insight"]
}

CONTENT REQUIREMENTS:
- The fact should be WITTY, CLEVER, and CONTROVERSIAL - make bold statements that people will want to debate
- The reply should be a WITTY COMMENT or RAGE BAIT - make bold statements that trigger reactions, NOT questions
- Focus on: hot takes, unpopular opinions, clever observations, controversial interpretations, surprising connections
- Use phrases like: "is actually", "was really", "the truth about", "nobody talks about", "the real reason", "secretly", "actually just", "is overrated", "is underrated", "is just", "was never", "has always been"
- Make people want to argue and share their own hot takes
- Examples: "X is actually just Y", "The truth about Z nobody talks about", "A was really just B all along", "C secretly represents D", "The real reason E happened", "F is overrated", "G is underrated", "H was never that good", "I has always been problematic"
- ALWAYS make BOLD STATEMENTS - never ask questions in the reply
- NEVER use question marks or phrases like "What do you think?", "Agree or disagree?", "Do you think...?", "Change my mind", "Prove me wrong"
- Reply examples: "This is peak cinema", "Facts don't care about feelings", "The truth hurts", "This aged poorly", "Iconic behavior", "This is why we can't have nice things", "Hard pill to swallow", "The audacity is unmatched", "This is why we can't have nice things", "The truth nobody wants to hear", "This is the reality check we all need", "The facts are undeniable", "This is the cold hard truth"

CRITICAL IMAGE SEARCH REQUIREMENTS:
- ALWAYS include "HD" or "high quality" in ALL search terms
- Focus on finding high-quality movie/show images, scenes, and promotional materials
- PRIORITIZE OFFICIAL CONTENT: Include terms like "official poster", "promotional image", "movie poster", "official still", "character portrait"
- BE VERY SPECIFIC: Use exact character names, movie titles, and specific scenes
- Examples: "Iron Man official poster HD", "Black Panther movie poster high quality", "Spider-Man official still HD", "Batman character portrait HD", "Captain America promotional image high quality"
- Avoid generic terms like "image" or "picture" - be specific about movie/show content
- Include the movie/show name in search terms for better relevance
- Focus on images that will work well in a square/portrait format for social media
- Use specific character names when possible (e.g., "Tony Stark" instead of just "Iron Man")
- Include action words like "portrait", "close-up", "headshot", "character study"
- PRIORITIZE OFFICIAL MOVIE CONTENT over fan art or generic images

USERNAME REQUIREMENTS:
- Create creative, memorable usernames that are NOT related to the topic
- Use handles like: @meme_lord, @cinema_sage, @film_whisperer, @movie_mind, @cinema_insights, @film_philosopher, @movie_mastermind, @cinema_critic, @film_theorist, @movie_analyst
- Names should be creative but not too realistic - avoid common names like "John" or "Sarah"
- Examples: MemeLord, CinemaSage, FilmWhisperer, MovieMind, CinemaInsights, FilmPhilosopher, MovieMastermind, CinemaCritic, FilmTheorist, MovieAnalyst

YOUTUBE REQUIREMENTS:
- Titles should be engaging and thought-provoking, not clickbait
- Focus on discussion and analysis, not controversy for controversy's sake
- Use phrases like: "Hidden Meaning", "Deeper Analysis", "What You Missed", "Character Study", "Symbolism Explained", "Plot Analysis"
- Descriptions should encourage thoughtful discussion and debate`

    const completion = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a WITTY and CONTROVERSIAL viral meme creator who specializes in CLEVER content that sparks heated discussions. Your goal is to create content that makes people debate, argue, and share their hot takes. Focus on bold statements, unpopular opinions, clever observations, and controversial interpretations. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 500
    })

    const responseText = completion.data.choices[0].message.content.trim()
    console.log('📝 Raw GPT response:', responseText)

    let gptResponse
    try {
      gptResponse = JSON.parse(responseText)
    } catch (parseError) {
      console.log('[DEBUG] Failed to parse JSON, trying to extract...')
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        gptResponse = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse GPT response as JSON')
      }
    }

    // Ensure all required fields exist
    const {
      fact = `${topic} has a deeper meaning you probably missed`,
      reply = 'This is peak cinema right here',
      youtube_title = `${topic} Hidden Meaning Revealed`,
      youtube_description = `The real meaning behind ${topic} will surprise you! #discussion #insight #analysis`,
      image_search_terms = [`${topic} HD`, `${topic} high quality`, `${topic} official still HD`],
      avatar_search_terms = [`${topic} character avatar`, `${topic} profile picture`],
      image_urls = [],
      avatar_urls = [],
      handle = '@meme_lord',
      name = 'MemeLord',
      tags = ['discussion', 'insight', 'analysis']
    } = gptResponse

    // Validate that reply is not a question
    let validatedReply = reply
    if (reply.includes('?') || reply.toLowerCase().includes('what') || reply.toLowerCase().includes('how') || reply.toLowerCase().includes('why') || reply.toLowerCase().includes('do you') || reply.toLowerCase().includes('agree or disagree')) {
      validatedReply = 'This is peak cinema right here'
      console.log('⚠️  Reply contained a question, using fallback')
    }

    return {
      fact,
      reply: validatedReply,
      youtube_title,
      youtube_description,
      image_search_terms,
      avatar_search_terms,
      image_urls,
      avatar_urls,
      handle,
      name,
      tags
    }
  } catch (error) {
    console.error('❌ Error calling ChatGPT:', error.message)
    throw error
  }
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

    // Initialize OpenAI configuration after dotenv is loaded
    configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
    })
    openai = new OpenAIApi(configuration)

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
