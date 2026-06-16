import fs from 'fs'
import axios from 'axios'
import canvas from 'canvas'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

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

// X "verified" badge: scalloped blue disc + white check. Pure canvas, no asset.
// (Duplicated from layouts.js rather than imported to avoid a circular import.)
function drawVerifiedBadge (ctx, cx, cy, r) {
  ctx.save()
  ctx.fillStyle = '#1d9bf0'
  ctx.beginPath()
  const lobes = 8
  for (let i = 0; i < lobes * 2; i++) {
    const ang = (Math.PI / lobes) * i - Math.PI / 2
    const rad = i % 2 === 0 ? r : r * 0.84
    const px = cx + Math.cos(ang) * rad
    const py = cy + Math.sin(ang) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(2, r * 0.22)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.40, cy + r * 0.02)
  ctx.lineTo(cx - r * 0.08, cy + r * 0.34)
  ctx.lineTo(cx + r * 0.44, cy - r * 0.30)
  ctx.stroke()
  ctx.restore()
}

// X (formerly Twitter) logo — two bold crossing strokes. Pure canvas, no asset.
// Heavy weight so it reads as the brand mark, not a "close" button.
function drawXLogo (ctx, cx, cy, size) {
  ctx.save()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = size * 0.26
  ctx.lineCap = 'square'
  const h = size / 2
  ctx.beginPath()
  ctx.moveTo(cx - h, cy - h)
  ctx.lineTo(cx + h, cy + h)
  ctx.moveTo(cx + h, cy - h)
  ctx.lineTo(cx - h, cy + h)
  ctx.stroke()
  ctx.restore()
}

// avatarPath should be a local photo of the commenter's face (avatarProvider);
// when absent we draw a colored-initials circle — NEVER an overlay graphic,
// which used to be the default and looked like a glitch.
export async function generateTemplate ({ overlayPath, image1, image2, fact, reply, outputPath, avatarPath = null, handle = '@memecreator', name = 'Meme Creator' }) {
  const WIDTH = 1080
  const HEIGHT = 1920
  const CARD_WIDTH = 900 // Further reduced for more right-side breathing room
  const CARD_X = (WIDTH - CARD_WIDTH) / 2
  const CARD_Y = 120

  // Layout positions - FIXED: Proper dynamic positioning with wider images and better padding
  const FACT_Y = CARD_Y + 60
  const IMAGE_WIDTH = 400 // Further reduced to fit better with new padding
  const IMAGE_HEIGHT = 330 // Increased height by 15px (from 315 to 330)
  const GAP_BETWEEN_IMAGES = 20 // Small gap between images
  const LEFT_IMAGE_X = CARD_X + 60
  const RIGHT_IMAGE_X = LEFT_IMAGE_X + IMAGE_WIDTH + GAP_BETWEEN_IMAGES

  const AVATAR_SIZE = 80
  const AVATAR_X = CARD_X + 60
  const NAME_X = AVATAR_X + AVATAR_SIZE + 24

  // Create base canvas
  const cnv = canvas.createCanvas(WIDTH, HEIGHT)
  const ctx = cnv.getContext('2d')

  // Draw overlay background — cover-fit so mixed-aspect overlays (square vs 2:3)
  // fill the 9:16 frame WITHOUT distorting the character.
  const overlayImg = await canvas.loadImage(overlayPath)
  {
    const oScale = Math.max(WIDTH / overlayImg.width, HEIGHT / overlayImg.height)
    const oW = overlayImg.width * oScale
    const oH = overlayImg.height * oScale
    ctx.drawImage(overlayImg, (WIDTH - oW) / 2, (HEIGHT - oH) / 2, oW, oH)
  }

  // Calculate content height to make card dynamic
  ctx.font = 'bold 48px Arial'
  const factLines = wrapCanvasText(ctx, fact, CARD_WIDTH - 120, 48) // 60px padding on each side
  const factHeight = factLines.length * 56

  ctx.font = '40px Arial'
  const replyLines = wrapCanvasText(ctx, reply, CARD_WIDTH - 120, 40) // 60px padding on each side
  const replyHeight = replyLines.length * 48

  // FIXED: Calculate dynamic positions based on fact height
  const IMAGE_Y = FACT_Y + factHeight + 40 // Position images after fact text with proper spacing
  const AVATAR_Y = IMAGE_Y + IMAGE_HEIGHT + 40 // Position avatar after images
  const NAME_Y = AVATAR_Y - 5 // Position name 5px higher to align with avatar top (moved down by 5px)
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

    // Add text with better error handling
    try {
      ctx.fillStyle = 'white'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Image', x + width / 2, y + height / 2 - 15)
      ctx.fillText('Not Found', x + width / 2, y + height / 2 + 15)
    } catch (textError) {
      console.log('Text rendering failed in fallback image:', textError.message)
    }
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

        // Enhanced image conversion for better canvas compatibility
        try {
          const sharp = await import('sharp')
          // Convert to PNG and ensure proper format
          imgBuf = await sharp.default(imgBuf)
            .png()
            .resize(400, 300, { fit: 'cover', position: 'center' })
            .toBuffer()
          console.log('✅ Image 1 converted to PNG successfully')
        } catch (sharpError) {
          console.log('Sharp conversion failed for image 1, trying alternative approach:', sharpError.message)
          // Try alternative conversion
          try {
            const sharp = await import('sharp')
            imgBuf = await sharp.default(imgBuf)
              .jpeg()
              .resize(400, 300, { fit: 'cover', position: 'center' })
              .toBuffer()
            console.log('✅ Image 1 converted to JPEG successfully')
          } catch (jpegError) {
            console.log('All conversions failed for image 1, using original:', jpegError.message)
          }
        }
      } else {
        imgBuf = fs.readFileSync(image1)
      }

      // Validate image buffer before loading
      if (!imgBuf || imgBuf.length === 0) {
        throw new Error('Empty image buffer')
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

        // Enhanced image conversion for better canvas compatibility
        try {
          const sharp = await import('sharp')
          // Convert to PNG and ensure proper format
          imgBuf = await sharp.default(imgBuf)
            .png()
            .resize(400, 300, { fit: 'cover', position: 'center' })
            .toBuffer()
          console.log('✅ Image 2 converted to PNG successfully')
        } catch (sharpError) {
          console.log('Sharp conversion failed for image 2, trying alternative approach:', sharpError.message)
          // Try alternative conversion
          try {
            const sharp = await import('sharp')
            imgBuf = await sharp.default(imgBuf)
              .jpeg()
              .resize(400, 300, { fit: 'cover', position: 'center' })
              .toBuffer()
            console.log('✅ Image 2 converted to JPEG successfully')
          } catch (jpegError) {
            console.log('All conversions failed for image 2, using original:', jpegError.message)
          }
        }
      } else {
        imgBuf = fs.readFileSync(image2)
      }

      // Validate image buffer before loading
      if (!imgBuf || imgBuf.length === 0) {
        throw new Error('Empty image buffer')
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

  // Draw avatar: photo when provided, colored-initials circle otherwise. The
  // card must always look like a real person commented — never a blank or a
  // stretched graphic.
  const drawInitialsAvatar = () => {
    const initials = String(name)
      .replace(/[^a-zA-Z ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '@'
    const colors = ['#667eea', '#764ba2', '#f5576c', '#4facfe', '#11998e', '#e1306c']
    ctx.save()
    ctx.beginPath()
    ctx.arc(AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, 2 * Math.PI)
    ctx.closePath()
    ctx.clip()
    ctx.fillStyle = colors[initials.charCodeAt(0) % colors.length]
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.font = `bold ${Math.round(AVATAR_SIZE * 0.4)}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2 + 2)
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }

  try {
    if (!avatarPath) throw new Error('no avatar provided')
    let avatarBuf
    if (avatarPath.startsWith('http')) {
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
    // Cover-fit so non-square photos aren't distorted.
    const s = Math.max(AVATAR_SIZE / avatarImg.width, AVATAR_SIZE / avatarImg.height)
    const dw = avatarImg.width * s
    const dh = avatarImg.height * s
    ctx.drawImage(avatarImg, AVATAR_X + (AVATAR_SIZE - dw) / 2, AVATAR_Y + (AVATAR_SIZE - dh) / 2, dw, dh)
    ctx.restore()
  } catch (e) {
    drawInitialsAvatar()
  }

  // Draw name + verified badge, handle, and the X logo at the row's far right
  // (where X shows the post menu) so the card reads as a real screenshot from X.
  ctx.fillStyle = '#222'
  ctx.font = 'bold 32px Arial'
  ctx.textBaseline = 'top'
  ctx.fillText(name, NAME_X, NAME_Y)
  const nameWidth = ctx.measureText(name).width
  drawVerifiedBadge(ctx, NAME_X + nameWidth + 22, NAME_Y + 16, 15)
  ctx.fillStyle = '#888'
  ctx.font = '28px Arial'
  ctx.fillText(handle, NAME_X, HANDLE_Y)
  drawXLogo(ctx, CARD_X + CARD_WIDTH - 60 - 17, AVATAR_Y + 28, 34)

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

// New function to generate template with MP4 video background
export async function generateTemplateWithVideo ({ videoOverlayPath, image1, image2, fact, reply, outputPath, avatarPath = null, handle = '@memecreator', name = 'Meme Creator' }) {
  const WIDTH = 1080
  const HEIGHT = 1920
  const CARD_WIDTH = 1000 // Increased width to be closer to edges
  const CARD_X = (WIDTH - CARD_WIDTH) / 2
  const CARD_Y = 120

  // Layout positions - FIXED: Proper dynamic positioning with wider images and better padding
  const FACT_Y = CARD_Y + 60
  const IMAGE_WIDTH = 450 // Increased width for bigger images
  const IMAGE_HEIGHT = 395 // Increased height by 15 more pixels (380 + 15)
  const GAP_BETWEEN_IMAGES = 20 // Small gap between images
  const LEFT_IMAGE_X = CARD_X + 40 // Reduced left padding by 20px total
  const RIGHT_IMAGE_X = LEFT_IMAGE_X + IMAGE_WIDTH + GAP_BETWEEN_IMAGES

  const AVATAR_SIZE = 80
  const AVATAR_X = CARD_X + 40 // Reduced left padding by 20px total
  const NAME_X = AVATAR_X + AVATAR_SIZE + 24

  // Create base canvas
  const cnv = canvas.createCanvas(WIDTH, HEIGHT)
  const ctx = cnv.getContext('2d')

  // Calculate content height to make card dynamic
  ctx.font = 'bold 48px Arial'
  const factLines = wrapCanvasText(ctx, fact, CARD_WIDTH - 120, 48) // 60px padding on each side
  const factHeight = factLines.length * 56

  ctx.font = '40px Arial'
  const replyLines = wrapCanvasText(ctx, reply, CARD_WIDTH - 120, 40) // 60px padding on each side
  const replyHeight = replyLines.length * 48

  // FIXED: Calculate dynamic positions based on fact height
  const IMAGE_Y = FACT_Y + factHeight + 40 // Position images after fact text with proper spacing
  const AVATAR_Y = IMAGE_Y + IMAGE_HEIGHT + 40 // Position avatar after images
  const NAME_Y = AVATAR_Y - 5 // Position name 5px higher to align with avatar top (moved down by 5px)
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

  // Helper function to draw image with proper aspect ratio (like CSS object-fit: contain)
  const drawImageWithAspectRatio = (img, x, y, width, height) => {
    const imgAspect = img.width / img.height
    const targetAspect = width / height

    let drawWidth, drawHeight, drawX, drawY

    if (imgAspect > targetAspect) {
      // Image is wider than target - fit to height, center horizontally
      drawHeight = height
      drawWidth = height * imgAspect
      drawX = x - (drawWidth - width) / 2
      drawY = y
    } else {
      // Image is taller than target - fit to width, center vertically
      drawWidth = width
      drawHeight = width / imgAspect
      drawX = x
      drawY = y - (drawHeight - height) / 2
    }

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
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

      // Use aspect ratio preservation instead of stretching
      drawImageWithAspectRatio(img, LEFT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT)

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

      // Use aspect ratio preservation instead of stretching
      drawImageWithAspectRatio(img, RIGHT_IMAGE_X, IMAGE_Y, IMAGE_WIDTH, IMAGE_HEIGHT)

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

  // Draw avatar: photo when provided, colored-initials circle otherwise. The
  // card must always look like a real person commented — never a blank or a
  // stretched graphic.
  const drawInitialsAvatar = () => {
    const initials = String(name)
      .replace(/[^a-zA-Z ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '@'
    const colors = ['#667eea', '#764ba2', '#f5576c', '#4facfe', '#11998e', '#e1306c']
    ctx.save()
    ctx.beginPath()
    ctx.arc(AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, 2 * Math.PI)
    ctx.closePath()
    ctx.clip()
    ctx.fillStyle = colors[initials.charCodeAt(0) % colors.length]
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.font = `bold ${Math.round(AVATAR_SIZE * 0.4)}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, AVATAR_X + AVATAR_SIZE / 2, AVATAR_Y + AVATAR_SIZE / 2 + 2)
    ctx.restore()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }

  try {
    if (!avatarPath) throw new Error('no avatar provided')
    let avatarBuf
    if (avatarPath.startsWith('http')) {
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
    // Cover-fit so non-square photos aren't distorted.
    const s = Math.max(AVATAR_SIZE / avatarImg.width, AVATAR_SIZE / avatarImg.height)
    const dw = avatarImg.width * s
    const dh = avatarImg.height * s
    ctx.drawImage(avatarImg, AVATAR_X + (AVATAR_SIZE - dw) / 2, AVATAR_Y + (AVATAR_SIZE - dh) / 2, dw, dh)
    ctx.restore()
  } catch (e) {
    drawInitialsAvatar()
  }

  // Draw name + verified badge, handle, and the X logo at the row's far right
  // (where X shows the post menu) so the card reads as a real screenshot from X.
  ctx.fillStyle = '#222'
  ctx.font = 'bold 32px Arial'
  ctx.textBaseline = 'top'
  ctx.fillText(name, NAME_X, NAME_Y)
  const nameWidth = ctx.measureText(name).width
  drawVerifiedBadge(ctx, NAME_X + nameWidth + 22, NAME_Y + 16, 15)
  ctx.fillStyle = '#888'
  ctx.font = '28px Arial'
  ctx.fillText(handle, NAME_X, HANDLE_Y)
  drawXLogo(ctx, CARD_X + CARD_WIDTH - 60 - 17, AVATAR_Y + 28, 34)

  // Draw reply text (FIXED: Proper positioning after avatar section)
  ctx.fillStyle = '#444'
  ctx.font = '40px Arial'
  ctx.textBaseline = 'top'
  let replyY = REPLY_Y
  for (const line of replyLines) {
    ctx.fillText(line, CARD_X + 60, replyY)
    replyY += 48
  }

  // Save template as PNG first
  const templatePngPath = outputPath.replace('.mp4', '_template.png')
  const out = fs.createWriteStream(templatePngPath)
  const stream = cnv.createPNGStream()
  stream.pipe(out)
  await new Promise(resolve => out.on('finish', resolve))
  console.log('✅ Template PNG generated successfully!')

  // Now composite the template over the MP4 video background with proper portrait scaling
  const ffmpegCommand = `ffmpeg -i "${videoOverlayPath}" -i "${templatePngPath}" -filter_complex "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2[bg];[bg][1:v]overlay=0:0:format=auto" -c:a copy -y "${outputPath}"`

  console.log('🎥 Running FFmpeg command to composite template over video:', ffmpegCommand)
  const { stderr } = await execAsync(ffmpegCommand)

  if (stderr) {
    console.log('FFmpeg stderr:', stderr)
  }

  // Clean up temporary PNG file
  try {
    fs.unlinkSync(templatePngPath)
    console.log('✅ Temporary PNG file cleaned up')
  } catch (cleanupError) {
    console.log('Warning: Could not clean up temporary PNG file:', cleanupError.message)
  }

  console.log('✅ Template with video background generated successfully!')
}
