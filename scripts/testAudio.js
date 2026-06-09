import { listAudioFiles, getRandomAudioFile } from './audioManager.js'
import fs from 'fs'
import path from 'path'

console.log('🎵 Audio Manager Test')
console.log('=====================\n')

// List current audio files
console.log('📁 Current audio files:')
listAudioFiles()

// Test random audio selection
console.log('\n🎲 Testing random audio selection:')
const randomAudio = getRandomAudioFile()
if (randomAudio) {
  console.log(`✅ Found audio file: ${path.basename(randomAudio)}`)
} else {
  console.log('⚠️  No audio files found')
}

// Instructions for adding audio files
console.log('\n📋 Instructions for adding audio files:')
console.log('1. Place your audio files in the assets/audio folder')
console.log('2. Supported formats: .mp3, .wav, .m4a, .aac, .flac')
console.log('3. The system will randomly select one file per video')
console.log('4. A random 6-second section will be extracted from the selected song')
console.log('5. If no audio files are found, videos will be created silently')

// Create example audio file structure
const audioFolder = './assets/audio'
if (!fs.existsSync(audioFolder)) {
  fs.mkdirSync(audioFolder, { recursive: true })
  console.log('\n📁 Created assets/audio folder')
}

console.log('\n🎯 Next steps:')
console.log('- Add some audio files to assets/audio/')
console.log('- Run your meme generator: npm start')
console.log('- Each video will now have random background music!')
