# Daily Auto-Posting (Phases 3 & 4)

Fully unattended: each run picks a fresh trending topic, writes rage-bait copy,
sources real images (never blanks), renders the video, and (optionally) uploads
to YouTube — with no manual input.

## The pipeline

```
selectDailyTopic()      trending feeds + GPT picker + image-resolvability gate
   ↓
generateMemeContent()   gpt-4o-mini rage-bait copy (fact / reply / title / tags)
   ↓
getValidImages()        iTunes + Wikimedia, sharp-validated — throws before shipping a blank
   ↓
generateTemplate()      tweet-card frame (1080×1920)
   ↓
addRandomAudioToVideo() 6s MP4 with random background track
   ↓
uploadToYouTube()       optional; private by default
   ↓
posted-history.json     de-dupe + record
```

### Topic sources (all keyless — no API keys needed)
- **Apple iTunes RSS** — `topmovies`, `toptvepisodes`, `topalbums` (trending, and
  these resolve perfectly through the iTunes image source).
- **Wikipedia top pageviews** — broad trending entities (films, shows, people, events).
- GPT ranks the combined list for rage-bait potential, avoiding the last 30 days of
  posted topics, then each candidate is **image-validated** before selection — so a
  picked topic is always one we can actually illustrate.
- Curated seed list (`SEED_TOPICS`) is the last-resort fallback if every feed fails.

## Try it now

```bash
npm run pick-topic     # just show what today's topic would be
npm run daily:dry      # full generate, NO upload  (recommended first)
npm run daily          # full run; uploads if YouTube creds are set
node scripts/dailyRun.js --topic="Dune" --dry-run   # force a topic
```

Outputs land in `output/<date>/<topic>_<stamp>/` (frame.png, video.mp4, meta.json).
Logs go to `logs/daily-<date>.log`. History is `data/posted-history.json`.

## Going live on YouTube

Uploading uses **OAuth** and needs exactly three real values in `.env`:
`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.
(`YOUTUBE_API_KEY` / `YOUTUBE_REDIRECT_URI` are NOT required for the OAuth upload.)

One-time setup:

1. **Create an OAuth client** — Google Cloud Console → enable *YouTube Data API v3*
   → Credentials → *Create OAuth client ID* → type **Desktop app**. Copy the
   Client ID (`...apps.googleusercontent.com`) and Secret (`GOCSPX-...`) into `.env`.
2. **Get a refresh token** — run the helper; it opens Google consent and prints the line to paste:
   ```bash
   node scripts/getYouTubeRefreshToken.js
   ```
3. **Verify (read-only, publishes nothing):**
   ```bash
   node scripts/verifyYouTubeAuth.js     # prints your channel name if creds are valid
   ```

- Videos upload **private** by default (safe). When you're confident, set
  `YOUTUBE_PRIVACY=public` in `.env` to auto-publish.

## Option A — let YouTube schedule (recommended, no Mac-uptime needed)

Generate a batch now and upload each with a future `publishAt`; **YouTube
auto-publishes one per day on its own**. Your Mac doesn't need to be on at post
time, and you don't need launchd/Full Disk Access at all.

Default slots are **8am / noon / 6pm / 10pm local**, each with a few minutes of
random jitter so posts aren't robotically on the hour. Overnight is skipped.

```bash
npm run schedule-batch:dry                        # preview the schedule, no upload
npm run schedule-batch                            # 6 videos into the good daily slots
node scripts/scheduleBatch.js --count=12          # more (mind the quota — see below)
node scripts/scheduleBatch.js --slots=08:00,18:00 # just 2/day (morning + evening)
node scripts/scheduleBatch.js --start=2026-06-15  # first publish day
```

Run it whenever the queue runs low. Each video uploads as *private* with a
scheduled publish time; YouTube flips it public automatically. Requires valid
YouTube creds (below). This sidesteps the macOS Full Disk Access dance entirely
since you run it yourself in the terminal.

> **Quota:** YouTube allows ~10,000 API units/day and each upload costs ~1,600,
> so **~6 uploads/day** on the default quota. Keep batches ≤6 or request a free
> quota increase. Also set your OAuth app to **"In production"** or the refresh
> token expires after 7 days.

## Option B — generate + post daily on your Mac (macOS launchd)

`com.memegenerator.daily.plist` runs `scripts/dailyRun.js` via Node every day at
10:00 local (edit `Hour`/`Minute` to taste).

```bash
cp com.memegenerator.daily.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.memegenerator.daily.plist
launchctl start com.memegenerator.daily          # test now
tail -f logs/daily-$(date -u +%F).log            # logs are UTC-dated
```

To stop/disable: `launchctl unload ~/Library/LaunchAgents/com.memegenerator.daily.plist`

### ⚠ Full Disk Access (required — one-time)

The project lives in `~/Documents`, a macOS-protected folder. Background launchd
jobs are blocked from it unless you grant **Full Disk Access** to the Node binary:

1. System Settings → Privacy & Security → **Full Disk Access** → **`+`**
2. ⌘⇧G → paste `/Users/kevinlee/.nvm/versions/node/v22.12.0/bin/node` → Open
3. Ensure its toggle is **ON**

Without this you'll see `Operation not permitted` in `logs/launchd.err.log`.
(If you upgrade Node, the path changes — re-add the new binary. Or move the project
out of `~/Documents` to avoid the protection entirely.)

> The Mac must be awake at the scheduled time; launchd runs the job on next wake
> if it was asleep.

## Layout & motion (Phase 5)

Each run randomly picks one of four structurally-different layouts so the feed
isn't one repeated format:
- `classic` — tweet card, two images side by side
- `single-hero` — one large image
- `stacked` — two images stacked vertically
- `versus` — two images with a "VS" badge (this-or-that rage bait)

A subtle **Ken Burns zoom** is applied to the frame by default (motion lifts
short-form retention vs a static image).

- Force a layout: `LAYOUT=versus npm run daily:dry`
- Disable motion: `MOTION=off npm run daily`
- Preview all layouts: `node scripts/testLayouts.js "Your Topic"` → `test_output/layouts/`

## Audio library (random, non-copyright)

Every video gets a random track (random 6s section) from the `audio/` folder.
The randomizer scales to any number of files — just add more.

Bulk-download monetization-safe **CC0** music from Freesound:

```bash
# one-time: free key at https://freesound.org/apiv2/apply/ -> add FREESOUND_API_KEY to .env
npm run fetch-audio                 # ~40 CC0 tracks across varied genres
node scripts/fetchAudio.js --count=80
node scripts/fetchAudio.js --query="synthwave"
```

CC0 = no attribution required, safe for monetized YouTube. (You can also drop
files from Pixabay Music / YouTube Audio Library straight into `audio/`.)

**Auto top-up (free, weekly):** `com.memegenerator.audio.plist` runs `fetch-audio`
every Sunday 09:00 so the library keeps growing on its own. Freesound only serves
free MP3 previews — this never costs anything.

```bash
cp com.memegenerator.audio.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.memegenerator.audio.plist
```

## Tuning

- **Model:** `OPENAI_MODEL` (default `gpt-4o-mini`; `gpt-4.1-nano` is cheaper).
- **Layout:** `LAYOUT` (`classic`|`single-hero`|`stacked`|`versus`; default random).
- **Motion:** `MOTION` (`on` default | `off`).
- **Upload privacy:** `YOUTUBE_PRIVACY` (`private` | `public`).
- **Schedule time:** `Hour`/`Minute` in the plist.
- **Topic avoidance window:** `recentTopics(history, 30)` in `topicSelector.js`.
