# 🎵 Audio Setup Guide

Your meme generator now supports **random background music**! Here's how to set it up:

## Quick Setup

1. **Add audio files** to the `assets/audio/` folder
2. **Run your meme generator** - it will automatically add random music
3. **Each video** gets a different random song and random 6-second section

## Supported Audio Formats

- `.mp3` (recommended)
- `.wav`
- `.m4a`
- `.aac`
- `.flac`

## How It Works

1. **Random Selection**: For each video, the system randomly picks one audio file from your collection
2. **Random Section**: It extracts a random 6-second clip from the selected song
3. **Video Creation**: The audio is combined with your meme image to create the final video
4. **Fallback**: If no audio files are found, videos are created silently (no errors)

## Getting Audio Files

### Free Music Sources
- **YouTube Audio Library**: Free royalty-free music
- **Free Music Archive**: Creative Commons licensed music
- **Incompetech**: Kevin MacLeod's royalty-free music
- **Bensound**: Free music for creators

### Recommended Approach
1. Download 5-10 royalty-free tracks
2. Place them in `assets/audio/`
3. Each video will have variety and won't repeat too often

## Testing the Audio System

```bash
# Test the audio setup
npm run test-audio

# Generate a meme with audio
npm start
```

## Example Workflow

```bash
# 1. Add some audio files
cp ~/Downloads/my-music/*.mp3 assets/audio/

# 2. Test the audio system
npm run test-audio

# 3. Generate a meme with background music
npm start
```

## Audio Configuration

The system uses these default settings:
- **Duration**: 6 seconds (matches video length)
- **Format**: AAC audio codec (compatible with social media)
- **Quality**: High quality audio preservation

## Troubleshooting

### No Audio in Videos
- Check that files are in `assets/audio/` folder
- Verify file formats are supported
- Run `npm run test-audio` to debug

### Audio Quality Issues
- Use high-quality source files (320kbps MP3 or better)
- Avoid heavily compressed audio
- Ensure files are not corrupted

### FFmpeg Errors
- Make sure FFmpeg is installed: `brew install ffmpeg`
- Check file permissions on audio files
- Verify audio files are not DRM-protected

## Advanced Usage

### Custom Audio Duration
You can modify the audio duration in `scripts/audioManager.js`:
```javascript
const DEFAULT_AUDIO_DURATION = 6 // Change this value
```

### Audio Volume Control
To adjust audio volume, modify the FFmpeg command in `createVideoWithAudio()`:
```javascript
// Add volume control: -af "volume=0.5" for 50% volume
const command = `ffmpeg -loop 1 -i "${imagePath}" -i "${audioPath}" -af "volume=0.5" -c:v libx264 -c:a aac -shortest -t ${duration} -pix_fmt yuv420p -vf "scale=1080:1920" -y "${outputPath}"`
```

## Legal Considerations

- **Use royalty-free music** to avoid copyright issues
- **Check licensing terms** before using any audio
- **Credit artists** if required by the license
- **Avoid commercial music** unless you have proper licensing

---

🎵 **Happy meme making with music!** 🎵 