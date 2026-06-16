// layouts.js  (Phase 5 — template/layout variety)
//
// Multiple structurally-different frame layouts so the channel isn't one repeated
// format. Each renderer composes onto the overlay background and writes a
// 1080x1920 PNG. They share the established visual language (white rounded card,
// bold dark fact, rounded images, avatar + handle, reply).
//
//   import { renderFrame, LAYOUTS, pickLayout } from './layouts.js'
//   await renderFrame({ layout: 'single-hero', overlayPath, images, fact, reply,
//                       handle, name, outputPath })
//
// `images` is an array of LOCAL file paths (from getValidImages). The classic
// layout delegates to the proven template.js renderer.

import fs from 'fs'
import canvas from 'canvas'
import { generateTemplate } from '../template.js'

const WIDTH = 1080
const HEIGHT = 1920
const CARD_X = 90
const CARD_W = 900
const CARD_Y = 120
const PAD = 60

export const LAYOUTS = ['classic', 'single-hero', 'stacked', 'versus']

// Deterministic-enough variety without Math.random in callers: callers pass an
// index/seed if they want control; default random pick here.
export function pickLayout () {
  return LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)]
}

// --- shared canvas helpers ------------------------------------------------

function wrapText (ctx, text, maxWidth, fontSize, weight = '') {
  ctx.font = `${weight} ${fontSize}px Arial`.trim()
  const words = String(text).split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

function roundRectPath (ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawCard (ctx, x, y, w, h) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 24
  ctx.fillStyle = 'white'
  roundRectPath(ctx, x, y, w, h, 48)
  ctx.fill()
  ctx.restore()
}

// Cover-fit an image into a rounded rect (like CSS object-fit: cover).
async function drawImageCover (ctx, imgPath, x, y, w, h, r = 24) {
  try {
    const img = await canvas.loadImage(imgPath)
    const scale = Math.max(w / img.width, h / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = x + (w - dw) / 2
    const dy = y + (h - dh) / 2
    ctx.save()
    roundRectPath(ctx, x, y, w, h, r)
    ctx.clip()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
  } catch {
    // Pre-validated images make this rare; draw a neutral panel if it happens.
    ctx.save()
    roundRectPath(ctx, x, y, w, h, r)
    ctx.fillStyle = '#d9d9e3'
    ctx.fill()
    ctx.restore()
  }
}

function initialsOf (name) {
  return String(name)
    .replace(/[^a-zA-Z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '@'
}

const AVATAR_COLORS = ['#667eea', '#764ba2', '#f5576c', '#4facfe', '#11998e', '#e1306c']

// Photo avatar when available (cover-fit inside the circle), otherwise the
// colored-initials fallback — the card should always show SOMETHING human.
function drawAvatar (ctx, name, cx, cy, size, avatarImg = null) {
  const r = size / 2
  if (avatarImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    const scale = Math.max(size / avatarImg.width, size / avatarImg.height)
    const dw = avatarImg.width * scale
    const dh = avatarImg.height * scale
    ctx.drawImage(avatarImg, cx - dw / 2, cy - dh / 2, dw, dh)
    ctx.restore()
    return
  }
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fillStyle = AVATAR_COLORS[initialsOf(name).charCodeAt(0) % AVATAR_COLORS.length]
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.font = `bold ${Math.round(size * 0.4)}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initialsOf(name), cx, cy + 2)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
}

// Generic 'verified'-style check: a plain disc + white check. Deliberately NOT
// X's (or Meta's) distinctive scalloped badge — it reads as a credible account
// mark without copying any platform's trademarked icon.
function drawVerifiedBadge (ctx, cx, cy, r) {
  ctx.save()
  ctx.fillStyle = '#3d9be0'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(2, r * 0.24)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.40, cy + r * 0.02)
  ctx.lineTo(cx - r * 0.08, cy + r * 0.34)
  ctx.lineTo(cx + r * 0.44, cy - r * 0.30)
  ctx.stroke()
  ctx.restore()
}

// Three-dot "more" menu — the universal post-overflow control. Generic social
// UI with NO platform trademark (replaces the X logo that previously sat here),
// so the card still reads as a real screenshot without copying X's brand.
function drawMenuDots (ctx, cx, cy, size) {
  ctx.save()
  ctx.fillStyle = '#9aa0a6'
  const dotR = size * 0.10
  const gap = size * 0.34
  for (const dx of [-gap, 0, gap]) {
    ctx.beginPath()
    ctx.arc(cx + dx, cy, dotR, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// Avatar (circle) + name (bold) + verified-style check + handle (gray), with a
// three-dot menu at the far right, so the card reads as a credible social-post
// screenshot — without copying any platform's trademarked badge/logo. Returns Y
// below the block.
function drawIdentity (ctx, name, handle, x, y, avatarImg = null) {
  const size = 80
  drawAvatar(ctx, name, x + size / 2, y + size / 2, size, avatarImg)
  const textX = x + size + 24
  ctx.fillStyle = '#222'
  ctx.font = 'bold 32px Arial'
  ctx.textBaseline = 'top'
  ctx.fillText(name, textX, y + 8)
  const nameW = ctx.measureText(name).width
  drawVerifiedBadge(ctx, textX + nameW + 22, y + 24, 15)
  ctx.fillStyle = '#888'
  ctx.font = '26px Arial'
  ctx.fillText(handle, textX, y + 46)
  drawMenuDots(ctx, CARD_X + CARD_W - PAD - 17, y + 28, 30)
  return y + size
}

function drawFact (ctx, fact, x, y, maxWidth, fontSize = 50) {
  const lines = wrapText(ctx, fact, maxWidth, fontSize, 'bold')
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `bold ${fontSize}px Arial`
  ctx.textBaseline = 'top'
  let yy = y
  const lh = Math.round(fontSize * 1.15)
  for (const line of lines) {
    ctx.fillText(line, x, yy)
    yy += lh
  }
  return yy
}

function drawReply (ctx, reply, x, y, maxWidth) {
  const lines = wrapText(ctx, reply, maxWidth, 38)
  ctx.fillStyle = '#333'
  ctx.font = '38px Arial'
  ctx.textBaseline = 'top'
  let yy = y
  for (const line of lines) {
    ctx.fillText(line, x, yy)
    yy += 46
  }
  return yy
}

async function baseCanvas (overlayPath) {
  const cnv = canvas.createCanvas(WIDTH, HEIGHT)
  const ctx = cnv.getContext('2d')
  const overlay = await canvas.loadImage(overlayPath)
  // Cover-fit (object-fit: cover) so mixed-aspect overlays (square vs 2:3) fill
  // the 9:16 frame WITHOUT distorting the character.
  const scale = Math.max(WIDTH / overlay.width, HEIGHT / overlay.height)
  const dw = overlay.width * scale
  const dh = overlay.height * scale
  ctx.drawImage(overlay, (WIDTH - dw) / 2, (HEIGHT - dh) / 2, dw, dh)
  return { cnv, ctx }
}

function writePng (cnv, outputPath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputPath)
    const stream = cnv.createPNGStream()
    stream.pipe(out)
    out.on('finish', () => resolve(outputPath))
    out.on('error', reject)
  })
}

// --- layout: single-hero --------------------------------------------------

async function renderSingleHero ({ overlayPath, images, fact, reply, handle, name, outputPath, avatarImg }) {
  const { cnv, ctx } = await baseCanvas(overlayPath)
  const innerW = CARD_W - PAD * 2

  // Measure to size the card.
  const factBottom = (() => {
    const lines = wrapText(ctx, fact, innerW, 50, 'bold')
    return CARD_Y + PAD + lines.length * 58
  })()
  const heroH = 540
  const idH = 80
  const replyLines = wrapText(ctx, reply, innerW, 38)
  const cardH = (factBottom - CARD_Y) + 30 + heroH + 36 + idH + 24 + replyLines.length * 46 + PAD

  drawCard(ctx, CARD_X, CARD_Y, CARD_W, cardH)
  let y = drawFact(ctx, fact, CARD_X + PAD, CARD_Y + PAD, innerW)
  y += 30
  await drawImageCover(ctx, images[0], CARD_X + PAD, y, innerW, heroH, 28)
  y += heroH + 36
  const idBottom = drawIdentity(ctx, name, handle, CARD_X + PAD, y, avatarImg)
  y = idBottom + 24
  drawReply(ctx, reply, CARD_X + PAD, y, innerW)

  return writePng(cnv, outputPath)
}

// --- layout: stacked (two images vertical) --------------------------------

async function renderStacked ({ overlayPath, images, fact, reply, handle, name, outputPath, avatarImg }) {
  const { cnv, ctx } = await baseCanvas(overlayPath)
  const innerW = CARD_W - PAD * 2
  const imgH = 280
  const gap = 16

  const factLines = wrapText(ctx, fact, innerW, 48, 'bold')
  const factBottom = CARD_Y + PAD + factLines.length * 56
  const idH = 80
  const replyLines = wrapText(ctx, reply, innerW, 38)
  const cardH = (factBottom - CARD_Y) + 28 + imgH * 2 + gap + 32 + idH + 24 + replyLines.length * 46 + PAD

  drawCard(ctx, CARD_X, CARD_Y, CARD_W, cardH)
  let y = drawFact(ctx, fact, CARD_X + PAD, CARD_Y + PAD, innerW, 48)
  y += 28
  await drawImageCover(ctx, images[0], CARD_X + PAD, y, innerW, imgH, 24)
  y += imgH + gap
  await drawImageCover(ctx, images[1] || images[0], CARD_X + PAD, y, innerW, imgH, 24)
  y += imgH + 32
  const idBottom = drawIdentity(ctx, name, handle, CARD_X + PAD, y, avatarImg)
  y = idBottom + 24
  drawReply(ctx, reply, CARD_X + PAD, y, innerW)

  return writePng(cnv, outputPath)
}

// --- layout: versus (this-or-that, big headline) --------------------------

async function renderVersus ({ overlayPath, images, fact, reply, handle, name, outputPath, avatarImg }) {
  const { cnv, ctx } = await baseCanvas(overlayPath)
  const innerW = CARD_W - PAD * 2

  // Centered headline.
  const factLines = wrapText(ctx, fact, innerW, 52, 'bold')
  const factH = factLines.length * 60
  const imgSize = 400
  const imgGap = 24
  const idH = 80
  const replyLines = wrapText(ctx, reply, innerW, 38)
  const cardH = PAD + factH + 34 + imgSize + 34 + idH + 24 + replyLines.length * 46 + PAD

  drawCard(ctx, CARD_X, CARD_Y, CARD_W, cardH)

  // Headline centered.
  ctx.fillStyle = '#1a1a1a'
  ctx.font = 'bold 52px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  let y = CARD_Y + PAD
  for (const line of factLines) {
    ctx.fillText(line, WIDTH / 2, y)
    y += 60
  }
  ctx.textAlign = 'left'
  y += 34

  // Two images side by side.
  const totalImgW = imgSize * 2 + imgGap
  const leftX = (WIDTH - totalImgW) / 2
  const rightX = leftX + imgSize + imgGap
  await drawImageCover(ctx, images[0], leftX, y, imgSize, imgSize, 28)
  await drawImageCover(ctx, images[1] || images[0], rightX, y, imgSize, imgSize, 28)

  // VS badge in the middle.
  const badgeCx = WIDTH / 2
  const badgeCy = y + imgSize / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(badgeCx, badgeCy, 58, 0, Math.PI * 2)
  ctx.fillStyle = '#1a1a1a'
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.font = 'bold 40px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', badgeCx, badgeCy + 2)
  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  y += imgSize + 34
  const idBottom = drawIdentity(ctx, name, handle, CARD_X + PAD, y, avatarImg)
  y = idBottom + 24
  drawReply(ctx, reply, CARD_X + PAD, y, innerW)

  return writePng(cnv, outputPath)
}

// --- dispatcher -----------------------------------------------------------

/**
 * Render a frame using the chosen layout.
 * @param {Object} opts
 * @param {string} opts.layout  one of LAYOUTS (default 'classic')
 * @param {string} opts.overlayPath
 * @param {string[]} opts.images  local image file paths (>=1; >=2 for some layouts)
 * @param {string} opts.fact
 * @param {string} opts.reply
 * @param {string} opts.handle
 * @param {string} opts.name
 * @param {string} [opts.avatarPath]  local image of the commenter's face (else initials)
 * @param {string} opts.outputPath
 * @returns {Promise<string>} outputPath
 */
export async function renderFrame (opts) {
  const layout = opts.layout || 'classic'
  if (!opts.images || opts.images.length < 1) {
    throw new Error('renderFrame: at least one image is required')
  }

  // Load the avatar once here; a broken/missing file degrades to initials.
  let avatarImg = null
  if (opts.avatarPath) {
    try {
      avatarImg = await canvas.loadImage(opts.avatarPath)
    } catch {
      avatarImg = null
    }
  }
  const layoutOpts = { ...opts, avatarImg }

  switch (layout) {
    case 'single-hero':
      return renderSingleHero(layoutOpts)
    case 'stacked':
      return renderStacked(layoutOpts)
    case 'versus':
      return renderVersus(layoutOpts)
    case 'classic':
    default:
      // Proven two-image tweet-card.
      await generateTemplate({
        overlayPath: opts.overlayPath,
        image1: opts.images[0],
        image2: opts.images[1] || opts.images[0],
        fact: opts.fact,
        reply: opts.reply,
        outputPath: opts.outputPath,
        handle: opts.handle,
        name: opts.name,
        avatarPath: opts.avatarPath || null
      })
      return opts.outputPath
  }
}
