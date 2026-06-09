# YouTube Upload Setup (one-time, ~10 min)

Uploading uses **OAuth** (not a plain API key). You need three values in `.env`:
`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.

## Step 1 — Create the OAuth client (you must do this; needs your Google login)

1. Go to **https://console.cloud.google.com** and create a project (or pick one).
2. **APIs & Services → Library** → search **"YouTube Data API v3"** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - Fill App name + your email where required → Save through the steps
   - **Scopes:** you can skip adding scopes here (the script requests them)
   - **Test users:** add your own Google account (the channel's account)
   - **Publishing status:** click **"Publish app" → "In production"**
     (lets you skip the 7-day refresh-token expiry; you'll click past an
     "unverified app" warning once — fine for personal use)
4. **APIs & Services → Credentials → + Create credentials → OAuth client ID**:
   - Application type: **Desktop app** → Create
   - Copy the **Client ID** (`...apps.googleusercontent.com`) and
     **Client secret** (`GOCSPX-...`)

## Step 2 — Put them in .env

Add to `/Users/kevinlee/Documents/code/MemeGenerator/.env`:

```
YOUTUBE_CLIENT_ID=...apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-...
```

## Step 3 — Get the refresh token (run the helper)

```bash
node scripts/getYouTubeRefreshToken.js
```

A browser opens → **log in with the channel's Google account → Approve**.
The terminal prints a line like `YOUTUBE_REFRESH_TOKEN=1//...` — add it to `.env`.

## Step 4 — Verify (read-only, publishes nothing)

```bash
node scripts/verifyYouTubeAuth.js
```

It prints your channel name if everything works. Then you're live:

```bash
npm run schedule-batch        # generates 6 videos + schedules them on YouTube
```

## Good to know

- **Quota:** ~10,000 units/day, ~1,600 per upload → **~6 uploads/day**. Keep
  batches ≤6, or request a free quota increase in the Cloud Console.
- **Privacy:** videos upload *private* and auto-publish at their scheduled time.
  Set `YOUTUBE_PRIVACY=public` only if you want immediate (non-scheduled) posts public.
- **Token expiry:** if you left the app in "Testing", the refresh token dies after
  7 days — set it to **"In production"** (Step 1.3) to avoid that.
