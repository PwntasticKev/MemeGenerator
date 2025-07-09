# Meme Video Generator 🎥

A fully automated pipeline that creates TikTok and YouTube Shorts-ready videos with a Twitter-style card layout. Just enter a topic, and it generates a 5-second vertical video with AI-generated witty content and relevant imagery.

## ✨ Features

- **Interactive Input**: Type any topic and get a custom meme video
- **Twitter-Style Layout**: Card-based design with username, handle, and quote
- **AI-Powered**: ChatGPT generates witty facts and clever responses
- **Free Image Search**: Finds relevant images without API keys using multiple sources
- **Configurable**: Adjustable font size, colors, and branding via command line
- **Mobile Optimized**: Perfect 1080x1920 aspect ratio for short-form content

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up API Keys

Copy `env.example` to `.env` and add your API keys:

```bash
cp env.example .env
```

**Required:**
```env
OPENAI_API_KEY=your-openai-api-key-here
```

**Optional (for enhanced image search):**
```env
GOOGLE_API_KEY=your-google-api-key-here
CX_ID=your-google-search-cx-id-here
```

### 3. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

### 4. Run the Generator

**Basic usage (works with just OpenAI API):**
```bash
npm start
```

**With custom image URL:**
```bash
node scripts/generateMeme.js --image-url="https://example.com/my-image.jpg"
```

**With custom settings:**
```bash
node scripts/generateMeme.js --font-size=56 --text-color=white --username="@yourname" --handle="Your Name"
```

## 🎨 How It Works

1. **Input**: Enter any topic (e.g., "The Godfather", "Mondays", "Yoda")
2. **AI Content**: ChatGPT generates witty facts and clever responses
3. **Image Search**: Automatically finds relevant images using:
   - Google API (if configured - best results)
   - DuckDuckGo web search (free, no API key)
   - Unsplash (free stock photos)
   - Pixabay (free stock photos)
   - Custom image URL (via `--image-url` flag)
   - Placeholder image (fallback)
4. **Composition**: Creates a Twitter-style card layout
5. **Video**: Converts to 5-second MP4 for social media

## 📁 Project Structure

```
meme_video_generator/
├── assets/
│   ├── overlay.png            # Your branded template (auto-created placeholder)
│   └── fetched_image.jpg      # Downloaded web image
├── output/
│   ├── frame.png              # Final composed image
│   └── video.mp4              # Final video for social media
├── scripts/
│   ├── generateMeme.js        # Main automation script
│   └── CURSOR_RULES.md        # Development documentation
├── package.json               # Dependencies
├── env.example               # Environment template
└── README.md                 # This file
```

## ⚙️ Configuration

### Command Line Options

```bash
node scripts/generateMeme.js [options]

Options:
  --font-size=<number>    Font size in pixels (default: 48)
  --text-color=<color>    Text color (default: white)
  --username=<string>     Username to display (default: @memecreator)
  --handle=<string>       Handle/display name (default: Meme Creator)
  --image-url=<url>       Custom image URL (optional)
  --help, -h              Show usage information
```

### Environment Variables

**Required:**
- `OPENAI_API_KEY`: Your OpenAI API key

**Optional:**
- `GOOGLE_API_KEY`: Google Custom Search API key (enhanced image search)
- `CX_ID`: Google Custom Search Engine ID
- `FONT_SIZE`: Text size in pixels (default: 48)
- `TEXT_COLOR`: Text color (default: white)

### Customizing Your Brand

Replace `./assets/overlay.png` with your own branded template:
- Size: 1080x1920 pixels
- Format: PNG (transparent background supported)
- This will be used as the base layer for every video

## 🎯 Example Usage

### Basic Run (Free image search)
```bash
$ npm start
🎬 Starting meme video generation...
📝 Settings: Font size=48px, Color=white, Username=@memecreator
Enter your topic: The Godfather
🤖 Asking ChatGPT for a witty response about: "The Godfather"
💬 ChatGPT responded: "The Godfather: Because family business is always personal!"
🔍 Searching for free images...
🔍 Trying DuckDuckGo image search...
✅ Found image: https://example.com/godfather-poster.jpg
⬇️ Downloading image...
🎨 Composing Twitter-style card...
🎥 Creating video...
✅ Video created successfully!
🎉 Meme video generation complete!
```

### With Custom Image
```bash
$ node scripts/generateMeme.js --image-url="https://example.com/godfather-poster.jpg" --username="@kevinlee"
🎬 Starting meme video generation...
📝 Settings: Font size=48px, Color=white, Username=@kevinlee
Enter your topic: The Godfather
🖼️ Using custom image URL: https://example.com/godfather-poster.jpg
...
```

## 🔧 API Setup

### OpenAI API (Required)
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an account and get your API key
3. Add to `.env` as `OPENAI_API_KEY`

**What ChatGPT does:**
- Generates witty facts and clever responses
- Creates engaging content perfect for social media
- Keeps responses under 100 characters
- Makes content shareable and viral-worthy

### Google Custom Search API (Optional - Enhanced Results)
**For better image search results (finds specific content like movie posters):**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project and enable Custom Search API
3. Create credentials (API key)
4. Go to [programmablesearchengine.google.com](https://programmablesearchengine.google.com)
5. Create a search engine and get your CX ID
6. Add both to `.env`

**Free Alternative:**
The system works perfectly without Google API using:
- DuckDuckGo web search (finds specific content)
- Unsplash (free stock photos)
- Pixabay (free stock photos)
- Custom image URLs

## 🎨 Layout Details

The final video uses a Twitter-style card layout:

```
┌────────────────────────────┐
│                            │
│   Your Branded Template    │  ← Base layer
│                            │
│   ┌────────────────────┐   │
│   │   White Card with   │  │ ← Image container (cropped)
│   │   Rounded Corners   │  │
│   │   [Fetched Image]   │  │
│   └────────────────────┘   │
│                            │
│      @username            │ ← Username
│      Handle Name          │ ← Display name
│      [GPT Quote Text]     │ ← Quote (always visible)
│                            │
└────────────────────────────┘
```

**Layout Specifications:**
- **Card Position**: 12% from top (slightly above center)
- **Card Size**: 85% width × 35% height
- **Image**: Cropped and contained within card
- **Text**: Username (larger), Handle (smaller), Quote (main size)
- **Text Shadow**: Added for better readability

## 🚀 Future Enhancements

- [ ] Batch processing with topic lists
- [ ] Background music options
- [ ] Multiple card styles
- [ ] Auto-upload to social platforms
- [ ] Text animation effects
- [ ] Custom font selection
- [ ] Card position customization

## 📱 Output Specifications

- **Resolution**: 1080x1920 (9:16 aspect ratio)
- **Duration**: 6 seconds
- **Format**: MP4 (H.264)
- **Optimized**: For TikTok, YouTube Shorts, Instagram Reels

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

---

Made for creators who want to generate engaging short-form content at scale using AI ✨