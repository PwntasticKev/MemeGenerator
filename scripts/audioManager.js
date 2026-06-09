import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Audio configuration — absolute so it works regardless of the process cwd
// (e.g. when launched headless by launchd, where cwd is not the project).
const AUDIO_FOLDER = path.join(__dirname, '..', 'audio')
const SUPPORTED_FORMATS = ['.mp3', '.wav', '.m4a', '.aac', '.flac']
const DEFAULT_AUDIO_DURATION = 6 // seconds

/**
 * Get a random audio file from the audio folder
 */
export function getRandomAudioFile () {
  try {
    if (!fs.existsSync(AUDIO_FOLDER)) {
      console.log('⚠️  Audio folder not found, creating it...')
      fs.mkdirSync(AUDIO_FOLDER, { recursive: true })
      return null
    }

    const files = fs.readdirSync(AUDIO_FOLDER)
    const audioFiles = files.filter(file =>
      SUPPORTED_FORMATS.some(format =>
        file.toLowerCase().endsWith(format)
      )
    )

    if (audioFiles.length === 0) {
      console.log('⚠️  No audio files found in assets/audio folder')
      console.log(`📁 Supported formats: ${SUPPORTED_FORMATS.join(', ')}`)
      return null
    }

    const randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)]
    const fullPath = path.join(AUDIO_FOLDER, randomFile)

    console.log(`🎵 Selected random audio: ${randomFile}`)
    return fullPath
  } catch (error) {
    console.error('❌ Error getting random audio file:', error)
    return null
  }
}

/**
 * Get audio duration using FFmpeg
 */
export async function getAudioDuration (audioPath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`
    )
    return parseFloat(stdout.trim())
  } catch (error) {
    console.error('❌ Error getting audio duration:', error)
    return null
  }
}

/**
 * Extract a random section from an audio file
 */
export async function extractRandomAudioSection (audioPath, outputPath, duration = DEFAULT_AUDIO_DURATION) {
  try {
    const totalDuration = await getAudioDuration(audioPath)

    if (!totalDuration) {
      console.error('❌ Could not get audio duration')
      return null
    }

    // Calculate random start time
    const maxStartTime = Math.max(0, totalDuration - duration)
    const randomStartTime = Math.random() * maxStartTime

    console.log(`🎵 Audio duration: ${totalDuration.toFixed(2)}s`)
    console.log(`🎵 Extracting section from ${randomStartTime.toFixed(2)}s to ${(randomStartTime + duration).toFixed(2)}s`)

    // Extract random section using FFmpeg
    const command = `ffmpeg -i "${audioPath}" -ss ${randomStartTime} -t ${duration} -c copy -y "${outputPath}"`

    await execAsync(command)
    console.log(`✅ Random audio section extracted: ${path.basename(outputPath)}`)

    return outputPath
  } catch (error) {
    console.error('❌ Error extracting random audio section:', error)
    return null
  }
}

/**
 * Create video with audio overlay
 */
export async function createVideoWithAudio (imagePath, audioPath, outputPath, duration = DEFAULT_AUDIO_DURATION) {
  try {
    console.log('🎬 Creating video with audio overlay...')

    const command = `ffmpeg -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest -t ${duration} -pix_fmt yuv420p -vf "scale=1080:1920" -y "${outputPath}"`

    await execAsync(command)
    console.log('✅ Video with audio created successfully!')

    return outputPath
  } catch (error) {
    console.error('❌ Error creating video with audio:', error)
    throw error
  }
}

/**
 * Create video with video overlay and audio
 */
export async function createVideoWithOverlay (imagePath, overlayPath, outputPath, duration = DEFAULT_AUDIO_DURATION) {
  try {
    console.log('🎬 Creating video with video background and image overlay...')

    // Get random audio file
    const audioFile = getRandomAudioFile()
    let audioInput = ''
    let audioFilter = ''

    if (audioFile) {
      // Create temporary audio section
      const tempAudioPath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.mp3`)
      const audioSection = await extractRandomAudioSection(audioFile, tempAudioPath, duration)

      if (audioSection) {
        audioInput = `-i "${audioSection}"`
        audioFilter = '-c:a aac'

        // Clean up temporary file after command
        setTimeout(() => {
          try {
            fs.unlinkSync(tempAudioPath)
          } catch (cleanupError) {
            console.log('⚠️  Could not clean up temporary audio file')
          }
        }, 1000)
      }
    }

    // Create video with video background and image overlay
    // The video (overlayPath) is now the background, and the image (imagePath) is overlaid on top
    const command = `ffmpeg -i "${overlayPath}" -loop 1 -i "${imagePath}" ${audioInput} -filter_complex "[0:v][1:v]overlay=0:0,scale=1080:1920[v]" -map "[v]" ${audioFilter} -c:v libx264 -pix_fmt yuv420p -t ${duration} -y "${outputPath}"`

    await execAsync(command)
    console.log('✅ Video with video background and image overlay created successfully!')

    return outputPath
  } catch (error) {
    console.error('❌ Error creating video with overlay:', error)
    throw error
  }
}

/**
 * Main function to add random audio to video
 */
export async function addRandomAudioToVideo (imagePath, outputPath, duration = DEFAULT_AUDIO_DURATION) {
  try {
    // Get random audio file
    const audioFile = getRandomAudioFile()

    if (!audioFile) {
      console.log('⚠️  No audio available, creating silent video')
      // Fall back to silent video
      const command = `ffmpeg -loop 1 -i "${imagePath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "scale=1080:1920" -y "${outputPath}"`
      await execAsync(command)
      return outputPath
    }

    // Create temporary audio section
    const tempAudioPath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.mp3`)

    // Extract random section
    const audioSection = await extractRandomAudioSection(audioFile, tempAudioPath, duration)

    if (!audioSection) {
      console.log('⚠️  Could not extract audio section, creating silent video')
      // Fall back to silent video
      const command = `ffmpeg -loop 1 -i "${imagePath}" -c:v libx264 -t ${duration} -pix_fmt yuv420p -vf "scale=1080:1920" -y "${outputPath}"`
      await execAsync(command)
      return outputPath
    }

    // Create video with audio
    await createVideoWithAudio(imagePath, audioSection, outputPath, duration)

    // Clean up temporary file
    try {
      fs.unlinkSync(tempAudioPath)
    } catch (cleanupError) {
      console.log('⚠️  Could not clean up temporary audio file')
    }

    return outputPath
  } catch (error) {
    console.error('❌ Error adding random audio to video:', error)
    throw error
  }
}

/**
 * Build the ffmpeg video filter for a subtle Ken Burns push-in (zoom).
 * Upscales first to avoid zoompan jitter, then slowly zooms to ~1.10x.
 * Motion meaningfully improves short-form retention vs a static frame.
 */
function kenBurnsFilter (duration, fps = 30) {
  const frames = Math.round(duration * fps)
  return (
    `scale=2160:3840,` +
    `zoompan=z='min(zoom+0.0006,1.10)':d=${frames}:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps},` +
    `setsar=1`
  )
}

/**
 * Like addRandomAudioToVideo, but applies a Ken Burns zoom to the still frame.
 */
export async function addRandomAudioToVideoWithMotion (imagePath, outputPath, duration = DEFAULT_AUDIO_DURATION) {
  const vf = kenBurnsFilter(duration)
  try {
    const audioFile = getRandomAudioFile()
    let tempAudioPath = null
    let audioSection = null

    if (audioFile) {
      tempAudioPath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.mp3`)
      audioSection = await extractRandomAudioSection(audioFile, tempAudioPath, duration)
    }

    if (audioSection) {
      const command =
        `ffmpeg -loop 1 -i "${imagePath}" -i "${audioSection}" ` +
        `-c:v libx264 -c:a aac -shortest -t ${duration} -pix_fmt yuv420p ` +
        `-vf "${vf}" -y "${outputPath}"`
      console.log('🎬 Creating Ken Burns video with audio...')
      await execAsync(command)
      try { fs.unlinkSync(tempAudioPath) } catch {}
    } else {
      console.log('⚠️  No audio available, creating silent Ken Burns video')
      const command =
        `ffmpeg -loop 1 -i "${imagePath}" -c:v libx264 -t ${duration} ` +
        `-pix_fmt yuv420p -vf "${vf}" -y "${outputPath}"`
      await execAsync(command)
    }
    console.log('✅ Motion video created successfully!')
    return outputPath
  } catch (error) {
    console.error('❌ Error creating motion video, falling back to static:', error.message)
    return addRandomAudioToVideo(imagePath, outputPath, duration)
  }
}

/**
 * List available audio files
 */
export function listAudioFiles () {
  try {
    if (!fs.existsSync(AUDIO_FOLDER)) {
      console.log('📁 Audio folder does not exist')
      return []
    }

    const files = fs.readdirSync(AUDIO_FOLDER)
    const audioFiles = files.filter(file =>
      SUPPORTED_FORMATS.some(format =>
        file.toLowerCase().endsWith(format)
      )
    )

    console.log(`📁 Found ${audioFiles.length} audio files:`)
    audioFiles.forEach(file => {
      console.log(`  - ${file}`)
    })

    return audioFiles
  } catch (error) {
    console.error('❌ Error listing audio files:', error)
    return []
  }
}
