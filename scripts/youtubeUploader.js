import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import 'dotenv/config';
import readline from "readline";

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const TOKEN_PATH = path.join(__dirname, '../youtube_token.json');

function getOAuth2Client(accountConfig) {
  const account = accountConfig?.account || 1;
  
  // Use account-specific environment variables
  const clientId = process.env[`YOUTUBE_CLIENT_ID_${account}`] || process.env.YOUTUBE_CLIENT_ID || accountConfig?.clientId;
  const clientSecret = process.env[`YOUTUBE_CLIENT_SECRET_${account}`] || process.env.YOUTUBE_CLIENT_SECRET || accountConfig?.clientSecret;
  
  if (!clientId || !clientSecret) {
    throw new Error(`[YouTube] Missing clientId or clientSecret for account ${account}. Please set YOUTUBE_CLIENT_ID_${account} and YOUTUBE_CLIENT_SECRET_${account} environment variables.`);
  }
  
  const redirect_uris = ['urn:ietf:wg:oauth:2.0:oob', 'http://localhost'];
  return new google.auth.OAuth2(clientId, clientSecret, redirect_uris[0]);
}

async function authenticate(accountConfig) {
  const oAuth2Client = getOAuth2Client(accountConfig);
  const account = accountConfig?.account || 1;
  
  // Try to use account-specific token file first
  const accountTokenPath = path.join(__dirname, `../youtube_token_${account}.json`);
  if (fs.existsSync(accountTokenPath)) {
    try {
      const token = JSON.parse(fs.readFileSync(accountTokenPath, 'utf8'));
      oAuth2Client.setCredentials(token);
      console.log(`[YouTube] Using existing token from file for account ${account}`);
      return oAuth2Client;
    } catch (error) {
      console.log(`[YouTube] Error reading token file for account ${account}, will use refresh token`);
    }
  }
  
  // Fall back to default token file
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
      console.log('[YouTube] Using existing token from default file');
      return oAuth2Client;
    } catch (error) {
      console.log('[YouTube] Error reading default token file, will use refresh token');
    }
  }
  
  // Fall back to refresh token from environment or account config
  const refreshToken = process.env[`YOUTUBE_REFRESH_TOKEN_${account}`] || process.env.YOUTUBE_REFRESH_TOKEN || accountConfig?.refreshToken;
  if (!refreshToken) {
    throw new Error(`[YouTube] Missing refreshToken for account ${account}. Please set YOUTUBE_REFRESH_TOKEN_${account} environment variable or provide account config.`);
  }
  
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

async function uploadAndScheduleYouTubeShort({ videoPath, title, description, scheduledPublishDate, account = 1 }) {
  if (!fs.existsSync(videoPath)) throw new Error('Video file does not exist: ' + videoPath);
  console.log(`[YouTube] Using account ${account}`);
  const auth = await authenticate({ account });
  const youtube = google.youtube({ version: 'v3', auth });
  const resource = {
    snippet: {
      title,
      description,
      tags: ['shorts', 'viral', 'memes'],
      categoryId: '22', // People & Blogs
    },
    status: {
      privacyStatus: 'private',
      publishAt: scheduledPublishDate ? new Date(scheduledPublishDate).toISOString() : undefined,
      selfDeclaredMadeForKids: false,
    },
  };
  if (!title.toLowerCase().includes('shorts') && !description.toLowerCase().includes('shorts')) {
    resource.snippet.description += '\n#shorts';
  }
  console.log('[YouTube] Uploading video:', videoPath);
  const res = await youtube.videos.insert({
    part: 'snippet,status',
    notifySubscribers: false,
    requestBody: resource,
    media: {
      body: fs.createReadStream(videoPath),
    },
  });
  const videoId = res.data.id;
  console.log(`[YouTube] Video uploaded! Video ID: ${videoId}`);
  if (scheduledPublishDate) {
    console.log(`[YouTube] Scheduled to publish at: ${scheduledPublishDate}`);
  } else {
    console.log('[YouTube] Video is private. Set to public manually or provide a scheduledPublishDate.');
  }
  return videoId;
}

export { uploadAndScheduleYouTubeShort }; 