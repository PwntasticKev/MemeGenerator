import fs from 'fs'
import path from 'path'
import readline from 'readline'
import mcpClient from '../mcp-client.js'
import { generateTemplate } from '../template.js'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function question (prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve)
  })
}

async function replaceImage (outputFolder) {
  try {
    // Read the GPT response to get search terms
    const gptResponsePath = path.join(outputFolder, 'gpt_response.json')
    if (!fs.existsSync(gptResponsePath)) {
      console.log('❌ No gpt_response.json found in output folder')
      return
    }

    const gptResponse = JSON.parse(fs.readFileSync(gptResponsePath, 'utf8'))
    const searchTerms = gptResponse.image_search_terms || []

    if (searchTerms.length === 0) {
      console.log('❌ No search terms found in gpt_response.json')
      return
    }

    console.log('\n🖼️  Available search terms:')
    searchTerms.forEach((term, index) => {
      console.log(`  ${index + 1}. ${term}`)
    })

    // Ask which image to replace
    const imageChoice = await question('\nWhich image to replace? (left/right): ').then(input => input.toLowerCase().trim())

    if (imageChoice !== 'left' && imageChoice !== 'right') {
      console.log('❌ Please enter "left" or "right"')
      return
    }

    // Ask which search term to use
    const termChoice = await question(`Which search term to use for ${imageChoice} image? (1-${searchTerms.length}): `)
    const termIndex = parseInt(termChoice) - 1

    if (isNaN(termIndex) || termIndex < 0 || termIndex >= searchTerms.length) {
      console.log('❌ Invalid search term choice')
      return
    }

    const selectedTerm = searchTerms[termIndex]
    console.log(`\n🔍 Searching for new ${imageChoice} image with term: "${selectedTerm}"`)

    // Get new image
    const newImageUrl = await mcpClient.getScrapedImageForTerm(selectedTerm)

    if (!newImageUrl) {
      console.log('❌ Failed to get new image')
      return
    }

    console.log(`✅ New image found: ${newImageUrl}`)

    // Read current image URLs from gpt_response.json
    const currentImageUrls = gptResponse.image_urls || []

    // Update the appropriate image URL
    if (imageChoice === 'left') {
      currentImageUrls[0] = newImageUrl
    } else {
      currentImageUrls[1] = newImageUrl
    }

    // Update gpt_response.json
    gptResponse.image_urls = currentImageUrls
    fs.writeFileSync(gptResponsePath, JSON.stringify(gptResponse, null, 2))

    // Regenerate template with new image
    console.log('\n🎨 Regenerating template with new image...')

    const framePath = path.join(outputFolder, 'frame.png')
    const overlayPath = './assets/mainoverlay_1.png' // Default overlay

    await generateTemplate({
      overlayPath,
      image1: currentImageUrls[0] || '',
      image2: currentImageUrls[1] || '',
      fact: gptResponse.fact,
      reply: gptResponse.reply,
      outputPath: framePath,
      avatarPath: './assets/mainoverlay_1.png',
      handle: gptResponse.handle || '@memecreator',
      name: gptResponse.name || 'Meme Creator'
    })

    console.log('✅ Template regenerated successfully!')
    console.log(`📁 Updated frame: ${framePath}`)

    // Ask if user wants to regenerate video
    const regenerateVideo = await question('\nRegenerate video with new image? (y/n): ').then(input => input.toLowerCase().trim())

    if (regenerateVideo === 'y' || regenerateVideo === 'yes') {
      console.log('\n🎥 Regenerating video...')

      const { execSync } = await import('child_process')
      const videoPath = path.join(outputFolder, 'video.mp4')

      try {
        execSync(`ffmpeg -loop 1 -i "${framePath}" -c:v libx264 -t 5 -pix_fmt yuv420p -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -y "${videoPath}"`, { stdio: 'inherit' })
        console.log('✅ Video regenerated successfully!')
        console.log(`📁 Updated video: ${videoPath}`)
      } catch (error) {
        console.log('❌ Failed to regenerate video:', error.message)
      }
    }
  } catch (error) {
    console.error('❌ Error replacing image:', error.message)
  } finally {
    rl.close()
  }
}

// Get output folder from command line argument
const outputFolder = process.argv[2]

if (!outputFolder) {
  console.log('Usage: node scripts/replaceImage.js <output_folder>')
  console.log('Example: node scripts/replaceImage.js ./output/2025-07-19/Wonder_Woman_2025-07-19T00521')
  process.exit(1)
}

if (!fs.existsSync(outputFolder)) {
  console.log('❌ Output folder does not exist:', outputFolder)
  process.exit(1)
}

console.log('🖼️  Interactive Image Replacement')
console.log(`📁 Output folder: ${outputFolder}`)

replaceImage(outputFolder)
