# Meme Video Generator 🎥

A fully automated pipeline that takes a **topic prompt** (e.g., "Give me a fact about The Godfather") and generates a 5-second, vertical video designed for platforms like **TikTok** and **YouTube Shorts**.

The video includes:
- A meme-worthy caption from ChatGPT
- A thematically relevant image from the web
- A static branded background
- A transparent overlay logo
- A ready-to-post vertical MP4 video

---

## 🧠 Core Workflow

### 1. **Prompt Input**
You provide a simple input like:
> "Give me a fact about The Godfather"

This kicks off the entire video generation flow.

---

### 2. **ChatGPT Quote Generation**
Your prompt is sent to the OpenAI ChatGPT API:
- GPT returns a **caption**, fun fact, or punchline
- Example:
  > "I'm gonna make him an offer he can't refuse."

---

### 3. **Image Search & Layered Composition**
We fetch a relevant image using Google or Bing search.  
**This image is NOT the background.**

Instead:
- 🧱 **Background:** A fixed, reusable 1080x1920 branded template
- 🖼 **Image layer:** The fetched image is resized and placed on top, like a sticker or framed photo
- 📝 **Caption text:** Added as an overlay (top, center, or bottom)
- 🪞 **Overlay watermark:** Transparent logo (e.g., bottom-right)

> All layers are composed into a single 1080x1920 PNG.

---

### 4. **Video Rendering**
The final image is turned into a **5-second video** using FFmpeg:
- 🔺 Format: MP4
- 🧱 Resolution: `1080x1920`
- 🔄 Aspect Ratio: `9:16` (vertical)
- ⏱ Duration: 6 seconds
- 🔇 No audio (optional for future)

---

### 5. **Auto Upload (Planned)**
Once the video is ready, it will be uploaded to:
- **TikTok**
- **YouTube Shorts**

Using either:
- `n8n` workflows with platform APIs
- Or headless automation via Puppeteer

---

## 🧱 Layer Architecture

```
[ 1080 x 1920 canvas ]

┌────────────────────────────┐
│                            │
│   Static Branded Template  │  ← background
│                            │
│   ┌────────────────────┐   │
│   │  Downloaded Image   │  │ ← themed image
│   └────────────────────┘   │
│                            │
│        Caption Text        │ ← GPT quote
│                            │
│       [overlay.png]        │ ← branding / logo
└────────────────────────────┘
```

---

## 📁 Project Structure

```
meme_video_generator/
├── assets/
│   ├── overlay.png            # Transparent logo watermark
│   ├── template_background.png # Main 1080x1920 branded frame
├── output/
│   ├── frame.png              # Final composed image
│   └── video.mp4              # Final exported video
├── scripts/
│   └── generateMeme.js        # Main execution logic
│   └── CURSOR_RULES.md        # Rules and project workflow documentation
├── .env                       # API keys for OpenAI & Google
└── README.md                  # Project documentation
```

---

## ⚙️ Tech Stack

- **Node.js**: main runtime
- **ChatGPT API**: for quote generation
- **Google Custom Search API**: to pull image
- **Sharp**: for image composition
- **FFmpeg**: for video rendering
- **n8n** (optional): for uploading

---

## 📝 Requirements

1. Node.js 18+
2. FFmpeg installed globally
3. `.env` configured:

```env
OPENAI_API_KEY=your-openai-key
GOOGLE_API_KEY=your-google-api-key
CX_ID=your-google-search-cx-id
```

---

## 🚀 Example Run

```bash
node scripts/generateMeme.js
```

This will:
1. Ask GPT for a meme about "The Godfather"
2. Pull a matching image
3. Compose a vertical image with your branding
4. Export a 5s MP4 meme video

---

## ✅ Rules & Design Guidelines

- Final output must be **1080x1920**, vertical, and under 10s
- Overlay watermark is always visible
- GPT response should be a **short caption or punchline**
- Font: clear and bold, large enough for mobile
- Video must be silent unless background audio is added
- All components must be merged into a single PNG before FFmpeg runs

---

## 🔮 Future Enhancements

- [ ] Add royalty-free music options
- [ ] Upload via TikTok/YouTube API
- [ ] Batch-mode generation (`topics.json`)
- [ ] Caption styling control (color, font, shadow)
- [ ] Dynamic frame templates per category

---

## 🧪 Sample Prompts

- "Give me a fun fact about Michael Scott"
- "Make a meme about Mondays"
- "Give me a quote from Yoda"

---

Made for creators who want to generate short-form content at scale using AI ✨
