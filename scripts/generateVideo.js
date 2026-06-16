// generateVideo.js — the reusable "make one meme video for a topic" core.
//
// Shared by dailyRun.js (one per day, publish now) and scheduleBatch.js
// (N at once, each with a future YouTube publishAt). Returns everything the
// caller needs to upload + record history.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateMemeContent } from './contentGenerator.js'
import { getValidImages } from './imageProvider.js'
import { getAvatarPath } from './avatarProvider.js'
import { renderFrame, LAYOUTS } from './layouts.js'
import { pickOverlayForMood } from './overlayPool.js'
import { addRandomAudioToVideo, addRandomAudioToVideoWithMotion } from './audioManager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function pickLayoutDistinct (avoidLayout) {
  const candidates = avoidLayout ? LAYOUTS.filter((l) => l !== avoidLayout) : LAYOUTS
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/**
 * Generate one complete video (frame + mp4) for a topic.
 *
 * @param {Object} opts
 * @param {string}  opts.topic
 * @param {number}  [opts.accountNumber=1]
 * @param {Object}  [opts.avoid]        { layout, overlayPath } from the previous video, to prevent repeats
 * @param {Function}[opts.log]          logger(msg)
 * @returns {Promise<{outDir, framePath, videoPath, content, layout, overlayPath, images}>}
 */
export async function createVideoForTopic (opts) {
  const { topic, accountNumber = 1, avoid = {}, log = () => {} } = opts
  if (!topic) throw new Error('createVideoForTopic: topic is required')

  const today = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
  const slug = topic.replace(/[^a-z0-9]+/gi, '_')
  const outDir = path.join(ROOT, 'output', today, `${slug}_${stamp}`)
  fs.mkdirSync(outDir, { recursive: true })

  // Copy
  const content = await generateMemeContent(topic, { accountNumber })
  log(`Fact:  ${content.fact}`)
  log(`Reply: ${content.reply}`)

  // Images (throws if none valid — never ships a blank)
  const images = await getValidImages({
    searchTerms: [topic, ...content.image_search_terms],
    count: 2,
    outputDir: path.join(outDir, 'images')
  })
  log(`Images: ${images.map((i) => `${i.meta.width}x${i.meta.height}`).join(', ')}`)

  // Layout + overlay. The overlay is MOOD-MATCHED to the movie (horror movie ->
  // creepy overlay, kids movie -> bright one), avoiding the previous video's pick.
  const layout = process.env.LAYOUT || pickLayoutDistinct(avoid.layout)
  const overlayPath = pickOverlayForMood(content.mood, avoid.overlayPath)

  // Commenter avatar: a real-looking human face so the fake comment reads as a
  // real person (falls back to drawn initials if no face is available).
  const avatarPath = await getAvatarPath()
  log(avatarPath ? `Avatar: ${path.basename(avatarPath)}` : 'Avatar: initials fallback (no face available)')

  const framePath = path.join(outDir, 'frame.png')
  await renderFrame({
    layout,
    overlayPath,
    images: images.map((i) => i.path),
    fact: content.fact,
    reply: content.reply,
    outputPath: framePath,
    handle: content.handle,
    name: content.name,
    avatarPath
  })
  log(`Template rendered (mood: ${content.mood}, layout: ${layout}, overlay: ${path.basename(path.dirname(overlayPath))}/${path.basename(overlayPath)}).`)

  // Video (Ken Burns motion by default; MOTION=off for static).
  // Duration default 7s — the balance point: long enough to read the punchy
  // fact+reply once, short enough to start looping (loops/replays are a strong
  // Shorts signal — the channel's best clips looped ~1.9x). Tune via VIDEO_DURATION.
  const duration = Math.max(3, parseInt(process.env.VIDEO_DURATION || '7', 10))
  const motion = process.env.MOTION !== 'off'
  // Self-describing local filename (topic + date) so output/ and copied files
  // are browsable. NOTE: the filename is NOT sent to YouTube on upload — this is
  // purely local convenience, it does not affect how YouTube sees the video.
  const videoPath = path.join(outDir, `${slug}_${today}.mp4`)
  if (motion) {
    await addRandomAudioToVideoWithMotion(framePath, videoPath, duration)
  } else {
    await addRandomAudioToVideo(framePath, videoPath, duration)
  }
  log(`Video: ${videoPath} (${duration}s, motion: ${motion ? 'on' : 'off'})`)

  return { outDir, framePath, videoPath, content, layout, overlayPath, images }
}
