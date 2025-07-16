import fs from 'fs'
import axios from 'axios'
import canvas from 'canvas'

// Helper to wrap text for Canvas
function wrapCanvasText (ctx, text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px Arial`
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current ? current + ' ' + word : word
    const width = ctx.measureText(test).width
    if (width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// Helper to draw rounded rectangle
function drawRoundedRect (ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export async function generateTemplate ({ overlayPath, image1, image2, fact, reply, outputPath, avatarPath = './assets/mainoverlay_1.png', handle = '@memecreator', name = 'Meme Creator' }) {
  const WIDTH = 1080
  const HEIGHT = 1920
  const CARD_WIDTH = 1000
  const CARD_X = (WIDTH - CARD_WIDTH) / 2
  const CARD_Y = 120

  // Layout positions - FIXED: Proper dynamic positioning with wider images
  const FACT_Y = CARD_Y + 60
  const IMAGE_WIDTH = 460 // Increased from 400 to 460 for wider images
  const IMAGE_HEIGHT = 300
  const GAP_BETWEEN_IMAGES = 20 // Small gap between images
  const LEFT_IMAGE_X = CARD_X + 60
  const RIGHT_IMAGE_X = LEFT_IMAGE_X + IMAGE_WIDTH + GAP_BETWEEN_IMAGES

  const AVATAR_SIZE = 80
  const AVATAR_X = CARD_X + 60
  const NAME_X = AVATAR_X + AVATAR_SIZE + 24

  // Create base canvas
  const cnv = canvas.createCanvas(WIDTH, HEIGHT)
  const ctx = cnv.getContext('2d')

  // Draw overlay background
  const overlayImg = await canvas.loadImage(overlayPath)
  ctx.drawImage(overlayImg, 0, 0, WIDTH, HEIGHT)

  // Calculate content height to make card dynamic
  ctx.font = 'bold 48px Arial'
  const factLines = wrapCanvasText(ctx, fact, CARD_WIDTH - 120, 48)
  const factHeight = factLines.length * 56

  ctx.font = '40px Arial'
  const replyLines = wrapCanvasText(ctx, reply, CARD_WIDTH - 120, 40)
  const replyHeight = replyLines.length * 48

  // FIXED: Calculate dynamic positions based on fact height
  const IMAGE_Y = FACT_Y + factHeight + 40 // Position images after fact text with proper spacing
  const AVATAR_Y = IMAGE_Y + IMAGE_HEIGHT + 40 // Position avatar after images
  const NAME_Y = AVATAR_Y + 20 // Position name properly
  const HANDLE_Y = NAME_Y + 40 // Position handle with proper spacing
  const REPLY_Y = AVATAR_Y + AVATAR_SIZE + 30 // Position reply after avatar section

  // Calculate total content height with proper spacing
  const contentHeight = 60 + factHeight + 40 + IMAGE_HEIGHT + 40 + AVATAR_SIZE + 30 + replyHeight + 40
  const CARD_HEIGHT = contentHeight

  // Draw card with dynamic height
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 24
  ctx.fillStyle = 'white'
  drawRoundedRect(ctx, CARD_X, CARD_Y, CARD_WIDTH, CARD_HEIGHT, 56)
  ctx.fill()
  ctx.restore()

  // Draw fact text first (at the top)
  ctx.fillStyle = '#222'
  ctx.font = 'bold 48px Arial'
  ctx.textBaseline = 'top'
  let factY = FACT_Y
  for (const line of factLines) {
    ctx.fillText(line, CARD_X + 60, factY)
    factY += 56
  }

  // Helper function to create fallback image
  const createFallbackImage = (x, y, width, height, text, isLeft = true) => {
    // Create gradient background
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe']
    const color1 = colors[Math.floor(Math.random() * colors.length)]
    const color2 = colors[Math.floor(Math.random() * colors.length)]
    gradient.addColorStop(0, color1)
    gradient.addColorStop(1, color2)

    // Draw rounded rectangle with gradient
    ctx.save()
    ctx.fillStyle = gradient
    if (isLeft) {
      // Left image: ONLY round left corners (top-left and bottom-left)
      ctx.beginPath()
      ctx.moveTo(x + 20, y) // Start with rounded top-left
      ctx.lineTo(x + width, y) // Straight line to right edge (no top-right radius)
      ctx.lineTo(x + width, y + height) // Straight line down right edge (no bottom-right radius)
      ctx.lineTo(x + 20, y + height) // Line to rounded bottom-left
      ctx.quadraticCurveTo(x, y + height, x, y + height - 20) // Bottom-left curve
      ctx.lineTo(x, y + 20) // Line up left edge
      ctx.quadraticCurveTo(x, y, x + 20, y) // Top-left curve
    } else {
      // Right image: ONLY round right corners (top-right and bottom-right)
      ctx.beginPath()
      ctx.moveTo(x, y) // Start at left edge (no top-left radius)
      ctx.lineTo(x + width - 20, y) // Line to rounded top-right
      ctx.quadraticCurveTo(x + width, y, x + width, y + 20) // Top-right curve
      ctx.lineTo(x + width, y + height - 20) // Line down right edge
      ctx.quadraticCurveTo(x + width, y + height, x + width - 20, y + height) // Bottom-right curve
      ctx.lineTo(x, y + height) // Straight line to left edge (no bottom-left radius)
      ctx.lineTo(x, y) // Straight line up left edge (no top-left radius)
    }
    ctx.closePath()
    ctx.fill()

    // Add text
    ctx.fillStyle = 'white'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Image', x + width / 2, y + height / 2 - 15)
    ctx.fillText('Not Found', x + width / 2, y + height / 2 + 15)
    ctx.restore()
  }

  // Draw images with correct rounded corners and fallbacks - GUARANTEED to always show 2 images
  if (image1 && image1.trim()) {
    try {
      let imgBuf
      if (image1.startsWith('http')) {
        const resp = await axios.get(image1, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
        imgBuf = resp.data

        // Convert WebP to PNG if needed for better canvas compatibility
        try {
          const sharp = await import('sharp')
          imgBuf = await sharp.default(imgBuf).png().toBuffer()
        } catch (sharpError) {
          console.log('Sharp conversion failed, using original image:', sharpError.message)
        }
      } else {
        imgBuf = fs.readFileSync(image1)
      }
      const img = await canvas.loadImage(imgBuf)

      // Draw left image with rounded corners (ONLY top-left and bottom-left corners rounded)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(LEFT_IMAGE_X + 20, IMAGE_Y) // Start with rounded top-left
      ctx.lineTo(LEFT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y) // Straight line to right edge (no top-right radius)
      ctx.lineTo(LEFT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT) // Straight line down right edge (no bottom-right radius)
      ctx.lineTo(LEFT_IMAGE_X + 20, IMAGE_Y + IMAGE_HEIGHT) // Line to rounded bottom-left
      ctx.quadraticCurveTo(LEFT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT, LEFT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT - 20) // Bottom-left curve
      ctx.lineTo(LEFT_IMAGE_X, IMAGE_Y + 20) // Line up left edge
      ctx.quadraticCurveTo(LEFT_IMAGE_X, IMAGE_Y, LEFT_IMAGE_X + 20, IMAGE_Y) // Top-left curve
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT)
      ctx.restore()
      console.log('✅ Left image loaded successfully')
    } catch (e) {
      console.log('Left image failed, using fallback:', e.message)
      createFallbackImage(LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 1', true)
    }
  } else {
    console.log('Left image URL is empty, using fallback')
    createFallbackImage(LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 1', true)
  }

  if (image2 && image2.trim()) {
    try {
      let imgBuf
      if (image2.startsWith('http')) {
        const resp = await axios.get(image2, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
        imgBuf = resp.data

        // Convert WebP to PNG if needed for better canvas compatibility
        try {
          const sharp = await import('sharp')
          imgBuf = await sharp.default(imgBuf).png().toBuffer()
        } catch (sharpError) {
          console.log('Sharp conversion failed, using original image:', sharpError.message)
        }
      } else {
        imgBuf = fs.readFileSync(image2)
      }
      const img = await canvas.loadImage(imgBuf)

      // Draw right image with rounded corners (ONLY top-right and bottom-right corners rounded)
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(RIGHT_IMAGE_X, IMAGE_Y) // Start at left edge (no top-left radius)
      ctx.lineTo(RIGHT_IMAGE_X + IMAGE_WIDTH - 20, IMAGE_Y) // Line to rounded top-right
      ctx.quadraticCurveTo(RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y, RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + 20) // Top-right curve
      ctx.lineTo(RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT - 20) // Line down right edge
      ctx.quadraticCurveTo(RIGHT_IMAGE_X + IMAGE_WIDTH, IMAGE_Y + IMAGE_HEIGHT, RIGHT_IMAGE_X + IMAGE_WIDTH - 20, IMAGE_Y + IMAGE_HEIGHT) // Bottom-right curve
      ctx.lineTo(RIGHT_IMAGE_X, IMAGE_Y + IMAGE_HEIGHT) // Straight line to left edge (no bottom-left radius)
      ctx.lineTo(RIGHT_IMAGE_X, IMAGE_Y) // Straight line up left edge (no top-left radius)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT)
      ctx.restore()
      console.log('✅ Right image loaded successfully')
    } catch (e) {
      console.log('Right image failed, using fallback:', e.message)
      createFallbackImage(RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 2', false)
    }
  } else {
    console.log('Right image URL is empty, using fallback')
    createFallbackImage(RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT, 'Image 2', false)
  }

  // Draw avatar
  try {
    let avatarBuf
    if (avatarPath && avatarPath.startsWith('http')) {
      const resp = await axios.get(avatarPath, { responseType: 'arraybuffer' })
      avatarBuf = resp.data
    } else {
      avatarBuf = fs.readFileSync(avatarPath)
    }
    const avatarImg = await canvas.loadImage(avatarBuf)
    ctx.save()
    ctx.beginPath()
    ctx.arc(AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, 2 * Math.PI)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(avatarImg, AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE)
    ctx.restore()
  } catch (e) {
    // fallback: blank circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, 2 * Math.PI)
    ctx.closePath()
    ctx.clip()
    ctx.fillStyle = '#eee'
    ctx.fill()
    ctx.restore()
  }

  // Draw name and handle (FIXED: Proper spacing and alignment)
  ctx.fillStyle = '#222'
  ctx.font = 'bold 32px Arial'
  ctx.textBaseline = 'top'
  ctx.fillText(name, NAME_X, NAME_Y)
  ctx.fillStyle = '#888'
  ctx.font = '28px Arial'
  ctx.fillText(handle, NAME_X, HANDLE_Y)

  // Draw reply text (FIXED: Proper positioning after avatar section)
  ctx.fillStyle = '#444'
  ctx.font = '40px Arial'
  ctx.textBaseline = 'top'
  let replyY = REPLY_Y
  for (const line of replyLines) {
    ctx.fillText(line, CARD_X + 60, replyY)
    replyY += 48
  }

  // Save output
  const out = fs.createWriteStream(outputPath)
  const stream = cnv.createPNGStream()
  stream.pipe(out)
  await new Promise(resolve => out.on('finish', resolve))
  console.log('✅ Template generation completed successfully!')
}
