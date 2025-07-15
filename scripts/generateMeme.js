import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import puppeteer from 'puppeteer';
import readline from 'readline';
import pkg from 'openai';
const { OpenAIApi, Configuration } = pkg;
import { exec } from 'child_process';
import { uploadAndScheduleYouTubeShort } from './youtubeUploader.js';
import * as cheerio from 'cheerio';
import https from 'https';
import http from 'http';
import canvas from 'canvas';
import { generateTemplate } from '../template.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { JSDOM } from 'jsdom';

// Configuration for OpenAI API
const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here',
});
const openai = new OpenAIApi(configuration);

// Parse command line arguments
const args = process.argv.slice(2);
const fontSize = args.find(arg => arg.startsWith('--font-size='))?.split('=')[1] || process.env.FONT_SIZE || 48;
const textColor = args.find(arg => arg.startsWith('--text-color='))?.split('=')[1] || process.env.TEXT_COLOR || 'white';
const username = args.find(arg => arg.startsWith('--username='))?.split('=')[1] || '@memecreator';
const handle = args.find(arg => arg.startsWith('--handle='))?.split('=')[1] || 'Meme Creator';
const customImageUrl = args.find(arg => arg.startsWith('--image-url='))?.split('=')[1] || null;
const skipReview = args.includes('--skip-review') || args.includes('--no-review');
const allAccountsFlag = args.includes('--all-accounts') || true; // Default to generating for all accounts

// Configurable settings
const VIDEO_DURATION = 6; // seconds
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

const REPLY_NAME = 'MemeReplyGuy';
const REPLY_HANDLE = '@memereplyguy';

// 2. Always use PlotTwistCentralMemes/@plottwistcentral as the reply account
const MEME_ACCOUNT_NAME = 'PlotTwistCentralMemes';
const MEME_ACCOUNT_HANDLE = '@plottwistcentral';
const MEME_PROFILE_PIC = './assets/mainoverlay_1.png';

const MAX_GPT_URLS = 4;
const IMAGE_RETRY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const IMAGE_RETRY_DELAY_MS = 4000; // 4 seconds between retries

// Single template approach - using the main template
export function getTemplate() {
	return generateTemplate;
}

export async function callCustomGpt(topic, accountNumber = 1) {
	try {
		console.log(`🤖 Asking ChatGPT for meme content about: "${topic}"`);
		
		// Create a comprehensive prompt for better search terms and character generation
		const prompt = `Create a HIGHLY CONTROVERSIAL viral meme about "${topic}" that will get people FIRED UP to comment and argue. 

Requirements:
1. Generate a SHOCKING, CONTROVERSIAL fact or hot take about ${topic} (max 100 characters) - something that will make people angry or defensive
2. Create a PROVOCATIVE reply that will trigger arguments and debates (max 80 characters) - NO EMOJIS
3. Provide 3 specific image search terms that will find relevant, high-quality movie/show images
4. Create a realistic username and handle for the meme creator (NOT related to the topic)
5. Generate a CONTROVERSIAL YouTube title and description that will spark debate

Format your response as JSON with these exact fields:
{
  "fact": "Your controversial fact/hot take here",
  "reply": "Your provocative reply here - NO EMOJIS", 
  "youtube_title": "Controversial title that will trigger people",
  "youtube_description": "Provocative description with hashtags that will spark debate",
  "image_search_terms": ["specific search term 1", "specific search term 2", "specific search term 3"],
  "avatar_search_terms": ["character avatar search 1", "character avatar search 2"],
  "image_urls": [],
  "avatar_urls": [],
  "handle": "@realisticusername",
  "name": "Realistic Name",
  "tags": ["controversial", "debate", "hot take"]
}

CONTROVERSIAL CONTENT REQUIREMENTS:
- The fact should be a HOT TAKE that challenges popular opinions or reveals something shocking
- The reply should be PROVOCATIVE and designed to trigger emotional responses
- Focus on topics like: overrated/underrated, worst/best, problematic elements, fan wars, controversial decisions
- Use phrases like: "actually sucks", "overrated", "underrated", "problematic", "worst", "controversial", "debated"
- Make people want to defend or attack the opinion in comments
- Examples: "X is actually overrated", "Y is the worst", "Z is problematic", "A is underrated", "B is controversial"

CRITICAL IMAGE SEARCH REQUIREMENTS:
- ALWAYS include "HD" or "high quality" in ALL search terms
- Focus on finding high-quality movie/show images, scenes, and promotional materials
- Examples: "${topic} HD", "${topic} high quality", "${topic} official still HD", "${topic} key scene HD"
- If the topic is not a movie/show, still use HD-focused search terms like "HD image" or "high quality photo"

IMPORTANT: 
- NO EMOJIS in any text fields (fact, reply, title, description)
- Image search terms MUST prioritize HD and high-quality images
- Username and handle should be realistic and NOT related to the topic (e.g., "@alex_thompson", "Alex Thompson" - not "@wickfan" or "John Wick Fan")
- Handle should be a realistic social media username that someone would actually use
- Name should be a realistic first and last name
- Make content CONTROVERSIAL and DEBATE-WORTHY to maximize engagement`;

		const completion = await openai.createChatCompletion({
			model: 'gpt-4',
			messages: [
				{
					role: 'system',
					content: 'You are a CONTROVERSIAL viral meme creator who specializes in HOT TAKES and DEBATE-STARTING content. Your goal is to create content that makes people angry, defensive, and eager to comment with their opinions. Focus on overrated/underrated takes, problematic elements, fan wars, and controversial opinions. Always respond with valid JSON.'
				},
				{
					role: 'user',
					content: prompt
				}
			],
			temperature: 0.9,
			max_tokens: 500
		});

		const responseText = completion.data.choices[0].message.content.trim();
		console.log('[DEBUG] Raw GPT response:', responseText);
		
		// Try to parse JSON response
		let gptResponse;
		try {
			gptResponse = JSON.parse(responseText);
		} catch (parseError) {
			console.log('[DEBUG] Failed to parse JSON, trying to extract...');
			// Try to extract JSON from the response
			const jsonMatch = responseText.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				gptResponse = JSON.parse(jsonMatch[0]);
			} else {
				throw new Error('Could not parse GPT response as JSON');
			}
		}

		// Ensure all required fields exist
		const {
			fact = `${topic} is actually overrated and you know it!`,
			reply = `Fight me in the comments!`,
			youtube_title = `${topic} Hot Take - Controversial Opinion`,
			youtube_description = `This ${topic} take will trigger everyone! #controversial #hot take #debate`,
			image_search_terms = [`${topic} HD`, `${topic} high quality`, `${topic} official still HD`],
			avatar_search_terms = [`${topic} character avatar`, `${topic} profile picture`],
			image_urls = [],
			avatar_urls = [],
			handle = '@memecreator',
			name = 'Meme Creator',
			tags = ['controversial', 'hot take', 'debate']
		} = gptResponse;

		return {
			fact,
			reply,
			youtube_title,
			youtube_description,
			image_search_terms,
			avatar_search_terms,
			image_urls,
			avatar_urls,
			handle,
			name,
			tags
		};

	} catch (error) {
		console.error('❌ Error calling ChatGPT:', error.message);
		throw error;
	}
}

async function getFactAndWittyReply(topic, accountNumber = 1) {
	try {
		const gptResponse = await callCustomGpt(topic, accountNumber);
		console.log('[DEBUG] Custom GPT response:', gptResponse);
		return gptResponse;
			} catch (error) {
			console.error('❌ Error getting meme data from custom GPT:', error.message);
			return {
				fact: `${topic} is actually overrated and you know it!`,
				reply: `Fight me in the comments!`,
				youtube_title: `${topic} Hot Take - Controversial Opinion`,
				youtube_description: `This ${topic} take will trigger everyone! #controversial #hot take #debate`,
				image_search_terms: [`${topic} HD`, `${topic} high quality`, `${topic} official still HD`],
				avatar_search_terms: [`${topic} character avatar`],
				image_urls: [],
				avatar_urls: [],
				handle: '@memecreator',
				name: 'Meme Creator',
				tags: ['controversial', 'hot take', 'debate']
			};
		}
}

// Helper to wrap text for SVG <text> elements
function wrapSvgText(text, maxWidth, fontSize, x, startY, lineHeight, maxHeightPx) {
	let minFontSize = 22;
	let margin = 32;
	let lines = [];
	let finalFontSize = fontSize;
	let fits = false;
	let attempt = 0;
	while (!fits && finalFontSize >= minFontSize) {
		const ctx = canvas.createCanvas(1,1).getContext('2d');
		ctx.font = `${finalFontSize}px Arial`;
		const words = text.split(' ');
		lines = [];
		let current = '';
		for (let word of words) {
			let test = current ? current + ' ' + word : word;
			let width = ctx.measureText(test).width;
			if (width > maxWidth - margin * 2 && current) {
				lines.push(current);
				current = word;
			} else {
				current = test;
			}
		}
		if (current) lines.push(current);
		const totalHeight = lines.length * lineHeight;
		if (totalHeight <= maxHeightPx && lines.every(line => ctx.measureText(line).width <= maxWidth - margin * 2)) {
			fits = true;
		} else {
			finalFontSize -= 2;
		}
		attempt++;
	}
	// If still doesn't fit, truncate last line with ellipsis
	const ctx = canvas.createCanvas(1,1).getContext('2d');
	ctx.font = `${finalFontSize}px Arial`;
	const maxLines = Math.floor(maxHeightPx / lineHeight);
	if (lines.length > maxLines) {
		lines = lines.slice(0, maxLines);
		let last = lines[maxLines-1];
		while (ctx.measureText(last + '...').width > maxWidth - margin * 2 && last.length > 0) {
			last = last.slice(0, -1);
		}
		lines[maxLines-1] = last + '...';
	}
	return {
		fontSize: finalFontSize,
		lines: lines.map((line, i) => `<tspan x="${x}" y="${startY + i*lineHeight}">${escapeXml(line)}</tspan>`).join('')
	};
}

async function approveImage(imageUrl) {
	return new Promise((resolve) => {
		console.log(`\n🖼️ Image found: ${imageUrl}`);
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		rl.question('Approve this image? (y/n/custom url): ', (answer) => {
			rl.close();
			if (answer.trim().toLowerCase() === 'y') return resolve(imageUrl);
			if (answer.trim().toLowerCase() === 'n') return resolve(null);
			if (answer.trim().toLowerCase().startsWith('http')) return resolve(answer.trim());
			return resolve(null);
		});
	});
}

async function autoApproveImage(imageUrl) {
	console.log(`\n🖼️ Auto-approving image: ${imageUrl}`);
	return imageUrl;
}

// Enhanced: extract entities and generate intelligent search terms from fact/reply content
function extractComparisonEntities(fact, reply, topic) {
	// Look for 'X vs Y', 'like X and Y', 'as X as Y', etc.
	const patterns = [
		/(\w[\w\s'-]+)\s+vs\.?\s+(\w[\w\s'-]+)/i,
		/like ([\w\s'-]+) and ([\w\s'-]+)/i,
		/as ([\w\s'-]+) as ([\w\s'-]+)/i,
		/([\w\s'-]+) or ([\w\s'-]+)/i
	];
	for (const p of patterns) {
		const m = fact.match(p) || reply.match(p);
		if (m && m[1] && m[2]) {
			return [m[1].trim(), m[2].trim()];
		}
	}
	return [topic, topic];
}

// Generate intelligent search terms based on fact and reply content
function generateIntelligentSearchTerms(fact, reply, topic) {
	const terms = [];
	
	// Extract key entities from fact and reply
	const allText = `${fact} ${reply}`.toLowerCase();
	
	// Look for movie/show titles (capitalized words)
	const titleMatches = allText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g);
	if (titleMatches) {
		titleMatches.forEach(title => {
			if (title.length > 2 && !terms.includes(title)) {
				terms.push(`${title} official poster`);
				terms.push(`${title} key scene`);
				terms.push(`${title} movie still`);
			}
		});
	}
	
	// Look for character names (common patterns)
	const characterPatterns = [
		/(?:character|actor|actress|played by|starring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
		/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:character|actor|actress)/gi
	];
	
	characterPatterns.forEach(pattern => {
		const matches = allText.match(pattern);
		if (matches) {
			matches.forEach(match => {
				const name = match.replace(/(character|actor|actress|played by|starring)/gi, '').trim();
				if (name.length > 2 && !terms.includes(name)) {
					terms.push(`${name} character`);
					terms.push(`${name} scene`);
				}
			});
		}
	});
	
	// Look for specific moments or scenes
	const momentPatterns = [
		/(?:scene|moment|ending|twist|reveal|finale)\s+([a-z\s]+)/gi,
		/([a-z\s]+)\s+(?:scene|moment|ending|twist|reveal)/gi
	];
	
	momentPatterns.forEach(pattern => {
		const matches = allText.match(pattern);
		if (matches) {
			matches.forEach(match => {
				const moment = match.replace(/(scene|moment|ending|twist|reveal|finale)/gi, '').trim();
				if (moment.length > 3 && !terms.includes(moment)) {
					terms.push(`${topic} ${moment} scene`);
				}
			});
		}
	});
	
	// Add topic-based terms if we don't have enough - prioritize HD images
	if (terms.length < 2) {
		terms.push(`${topic} HD`);
		terms.push(`${topic} high quality`);
		terms.push(`${topic} official still HD`);
		terms.push(`${topic} key scene HD`);
	}
	
	// Ensure we have at least 2 terms
	while (terms.length < 2) {
		terms.push(topic);
	}
	
	return terms.slice(0, 3); // Return top 3 terms
}

// Remove Google Images scraping and add Bing, Yahoo, DuckDuckGo scraping

// Bing Images scraping
export async function searchBingImagesPuppeteer(query, numImages = 2, topN = 50, debugDir = null) {
    const puppeteer = await import('puppeteer');
    let browser;
    let page;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            browser = await puppeteer.default.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });
            page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Upgrade-Insecure-Requests': '1'
            });
            const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&tsc=ImageBasicHover`;
            await page.goto(searchUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            await page.waitForSelector('img', { timeout: 20000 });
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => { window.scrollBy(0, window.innerHeight); });
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            }
            const imageData = await page.evaluate(() => {
                const images = [];
                const imgElements = document.querySelectorAll('img');
                console.log(`[DEBUG] Found ${imgElements.length} total img elements`);
                
                for (const img of imgElements) {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
                    if (!src) continue;
                    
                    // Much more lenient URL matching - accept any URL that might be an image
                    const isImageUrl = src.match(/\.(jpg|jpeg|png|gif|webp)/i) || 
                                     src.includes('image') || 
                                     src.includes('img') ||
                                     src.startsWith('data:image') ||
                                     src.includes('bing.com/th') ||
                                     src.includes('yahoo.com/th') ||
                                     src.includes('duckduckgo.com/th');
                    
                    if (!isImageUrl) continue;
                    
                    const width = parseInt(img.getAttribute('width') || img.naturalWidth || img.offsetWidth || '0');
                    const height = parseInt(img.getAttribute('height') || img.naturalHeight || img.offsetHeight || '0');
                    
                    // Accept any image with reasonable dimensions
                    if (width > 50 && height > 50) {
                        images.push({ 
                            url: src, 
                            width, 
                            height, 
                            score: width * height,
                            alt: img.getAttribute('alt') || '',
                            className: img.className || ''
                        });
                    }
                }
                
                console.log(`[DEBUG] Found ${images.length} potential image URLs`);
                return images.sort((a, b) => b.score - a.score);
            });
            console.log(`[DEBUG] Bing found ${imageData.length} images for "${query}"`);
            if (imageData.length > 0) {
                console.log(`[DEBUG] Top 3 Bing image URLs:`, imageData.slice(0, 3).map(img => img.url));
            }
            
            if (imageData.length === 0 && debugDir) {
                const fs = require('fs');
                const path = require('path');
                const html = await page.content();
                fs.writeFileSync(path.join(debugDir, `bing_images_debug_${Date.now()}.html`), html);
                await page.screenshot({ path: path.join(debugDir, `bing_images_debug_${Date.now()}.png`) });
            }
            await browser.close();
            return imageData.slice(0, numImages).map(img => img.url);
        } catch (error) {
            lastError = error;
            if (page && debugDir) {
                const fs = require('fs');
                const path = require('path');
                try {
                    const html = await page.content();
                    fs.writeFileSync(path.join(debugDir, `bing_images_debug_${Date.now()}.html`), html);
                    await page.screenshot({ path: path.join(debugDir, `bing_images_debug_${Date.now()}.png`) });
                } catch (e) {}
            }
            if (browser) await browser.close();
            if (attempt === 3) {
                console.error(`[DEBUG] Error in Bing scraping for ${query} (attempt ${attempt}):`, error.message);
            } else {
                console.warn(`[DEBUG] Retry ${attempt} for Bing scraping for ${query} due to error:`, error.message);
            }
        }
    }
    if (lastError) throw lastError;
    return [];
}

// Yahoo Images scraping
async function searchYahooImagesPuppeteer(query, numImages = 2, topN = 50, debugDir = null) {
    const puppeteer = await import('puppeteer');
    let browser;
    let page;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            browser = await puppeteer.default.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });
            page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Upgrade-Insecure-Requests': '1'
            });
            const searchUrl = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`;
            await page.goto(searchUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            await page.waitForSelector('img', { timeout: 20000 });
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => { window.scrollBy(0, window.innerHeight); });
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            }
            const imageData = await page.evaluate(() => {
                const images = [];
                const imgElements = document.querySelectorAll('img');
                console.log(`[DEBUG] Found ${imgElements.length} total img elements`);
                
                for (const img of imgElements) {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
                    if (!src) continue;
                    
                    // Much more lenient URL matching - accept any URL that might be an image
                    const isImageUrl = src.match(/\.(jpg|jpeg|png|gif|webp)/i) || 
                                     src.includes('image') || 
                                     src.includes('img') ||
                                     src.startsWith('data:image') ||
                                     src.includes('bing.com/th') ||
                                     src.includes('yahoo.com/th') ||
                                     src.includes('duckduckgo.com/th');
                    
                    if (!isImageUrl) continue;
                    
                    const width = parseInt(img.getAttribute('width') || img.naturalWidth || img.offsetWidth || '0');
                    const height = parseInt(img.getAttribute('height') || img.naturalHeight || img.offsetHeight || '0');
                    
                    // Accept any image with reasonable dimensions
                    if (width > 50 && height > 50) {
                        images.push({ 
                            url: src, 
                            width, 
                            height, 
                            score: width * height,
                            alt: img.getAttribute('alt') || '',
                            className: img.className || ''
                        });
                    }
                }
                
                console.log(`[DEBUG] Found ${images.length} potential image URLs`);
                return images.sort((a, b) => b.score - a.score);
            });
            console.log(`[DEBUG] Yahoo found ${imageData.length} images for "${query}"`);
            if (imageData.length > 0) {
                console.log(`[DEBUG] Top 3 Yahoo image URLs:`, imageData.slice(0, 3).map(img => img.url));
            }
            
            if (imageData.length === 0 && debugDir) {
                const fs = require('fs');
                const path = require('path');
                const html = await page.content();
                fs.writeFileSync(path.join(debugDir, `yahoo_images_debug_${Date.now()}.html`), html);
                await page.screenshot({ path: path.join(debugDir, `yahoo_images_debug_${Date.now()}.png`) });
            }
            await browser.close();
            return imageData.slice(0, numImages).map(img => img.url);
        } catch (error) {
            lastError = error;
            if (page && debugDir) {
                const fs = require('fs');
                const path = require('path');
                try {
                    const html = await page.content();
                    fs.writeFileSync(path.join(debugDir, `yahoo_images_debug_${Date.now()}.html`), html);
                    await page.screenshot({ path: path.join(debugDir, `yahoo_images_debug_${Date.now()}.png`) });
                } catch (e) {}
            }
            if (browser) await browser.close();
            if (attempt === 3) {
                console.error(`[DEBUG] Error in Yahoo scraping for ${query} (attempt ${attempt}):`, error.message);
            } else {
                console.warn(`[DEBUG] Retry ${attempt} for Yahoo scraping for ${query} due to error:`, error.message);
            }
        }
    }
    if (lastError) throw lastError;
    return [];
}

// DuckDuckGo Images scraping
async function searchDuckDuckGoImagesPuppeteer(query, numImages = 2, topN = 50, debugDir = null) {
    const puppeteer = await import('puppeteer');
    let browser;
    let page;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            browser = await puppeteer.default.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            });
            page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Upgrade-Insecure-Requests': '1'
            });
            const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&iar=images&iax=images&ia=images`;
            await page.goto(searchUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            await page.waitForSelector('img', { timeout: 20000 });
            for (let i = 0; i < 5; i++) {
                await page.evaluate(() => { window.scrollBy(0, window.innerHeight); });
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
            }
            const imageData = await page.evaluate(() => {
                const images = [];
                const imgElements = document.querySelectorAll('img');
                console.log(`[DEBUG] Found ${imgElements.length} total img elements`);
                
                for (const img of imgElements) {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
                    if (!src) continue;
                    
                    // Much more lenient URL matching - accept any URL that might be an image
                    const isImageUrl = src.match(/\.(jpg|jpeg|png|gif|webp)/i) || 
                                     src.includes('image') || 
                                     src.includes('img') ||
                                     src.startsWith('data:image') ||
                                     src.includes('bing.com/th') ||
                                     src.includes('yahoo.com/th') ||
                                     src.includes('duckduckgo.com/th');
                    
                    if (!isImageUrl) continue;
                    
                    const width = parseInt(img.getAttribute('width') || img.naturalWidth || img.offsetWidth || '0');
                    const height = parseInt(img.getAttribute('height') || img.naturalHeight || img.offsetHeight || '0');
                    
                    // Accept any image with reasonable dimensions
                    if (width > 50 && height > 50) {
                        images.push({ 
                            url: src, 
                            width, 
                            height, 
                            score: width * height,
                            alt: img.getAttribute('alt') || '',
                            className: img.className || ''
                        });
                    }
                }
                
                console.log(`[DEBUG] Found ${images.length} potential image URLs`);
                return images.sort((a, b) => b.score - a.score);
            });
            console.log(`[DEBUG] DuckDuckGo found ${imageData.length} images for "${query}"`);
            if (imageData.length > 0) {
                console.log(`[DEBUG] Top 3 DuckDuckGo image URLs:`, imageData.slice(0, 3).map(img => img.url));
            }
            
            if (imageData.length === 0 && debugDir) {
                const fs = require('fs');
                const path = require('path');
                const html = await page.content();
                fs.writeFileSync(path.join(debugDir, `duckduckgo_images_debug_${Date.now()}.html`), html);
                await page.screenshot({ path: path.join(debugDir, `duckduckgo_images_debug_${Date.now()}.png`) });
            }
            await browser.close();
            return imageData.slice(0, numImages).map(img => img.url);
        } catch (error) {
            lastError = error;
            if (page && debugDir) {
                const fs = require('fs');
                const path = require('path');
                try {
                    const html = await page.content();
                    fs.writeFileSync(path.join(debugDir, `duckduckgo_images_debug_${Date.now()}.html`), html);
                    await page.screenshot({ path: path.join(debugDir, `duckduckgo_images_debug_${Date.now()}.png`) });
                } catch (e) {}
            }
            if (browser) await browser.close();
            if (attempt === 3) {
                console.error(`[DEBUG] Error in DuckDuckGo scraping for ${query} (attempt ${attempt}):`, error.message);
            } else {
                console.warn(`[DEBUG] Retry ${attempt} for DuckDuckGo scraping for ${query} due to error:`, error.message);
            }
        }
    }
    if (lastError) throw lastError;
    return [];
}

// Main image scraping logic: try multiple services with better fallbacks
export async function getScrapedImageForTerm(term) {
    console.log(`[DEBUG] Getting image for term: "${term}"`);
    
    // Enhanced fallback services that are more reliable
    const fallbackServices = [
        // Unsplash (most reliable for real images)
        `https://source.unsplash.com/featured/?${encodeURIComponent(term)}`,
        // Picsum (random high-quality images)
        `https://picsum.photos/600/400?random=${Math.floor(Math.random() * 1000)}`,
        // Lorem Picsum with specific size
        `https://picsum.photos/600/400?blur=2&random=${Math.floor(Math.random() * 1000)}`,
        // Another Unsplash variant
        `https://source.unsplash.com/600x400/?${encodeURIComponent(term)}`,
        // Placeholder with gradient (always works)
        `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(term.slice(0, 20))}`,
        // Another placeholder service
        `https://dummyimage.com/600x400/4facfe/ffffff&text=${encodeURIComponent(term.slice(0, 20))}`
    ];
    
    // Try search engines first (but with better error handling)
    const engines = [
        searchBingImagesPuppeteer,
        searchYahooImagesPuppeteer,
        searchDuckDuckGoImagesPuppeteer
    ];
    const shuffledEngines = engines.sort(() => Math.random() - 0.5);
    
    for (const engine of shuffledEngines) {
        try {
            console.log(`[DEBUG] Trying ${engine.name} for term "${term}"`);
            const scraped = await engine(term, 3, 50); // Get more images to try
            console.log(`[DEBUG] ${engine.name} returned ${scraped ? scraped.length : 0} images`);
            
            if (scraped && scraped.length > 0) {
                // Try to validate multiple images
                for (let i = 0; i < Math.min(scraped.length, 5); i++) {
                    const imageUrl = scraped[i];
                    console.log(`[DEBUG] Testing image ${i + 1}: ${imageUrl}`);
                    
                    try {
                        // Use axios instead of fetch for better compatibility
                        const response = await axios.get(imageUrl, { 
                            responseType: 'arraybuffer',
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.9',
                                'Cache-Control': 'no-cache'
                            }
                        });
                        
                        if (response.status === 200 && response.data) {
                            const contentType = response.headers['content-type'];
                            console.log(`[DEBUG] Image response: ${response.status} ${contentType}`);
                            
                            if (contentType && (contentType.startsWith('image/') || contentType.includes('image'))) {
                                if (response.data.byteLength > 1000) { // At least 1KB
                                    console.log(`[DEBUG] Valid image found: ${imageUrl} (${contentType}, ${response.data.byteLength} bytes)`);
                                    return imageUrl;
                                }
                            }
                        }
                    } catch (e) {
                        console.log(`[DEBUG] Image validation failed for ${imageUrl}: ${e.message}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`[DEBUG] ${engine.name} failed for term "${term}":`, e.message);
        }
    }
    
    // If search engines fail, try reliable fallback services
    console.log(`[DEBUG] Search engines failed, trying reliable fallback services...`);
    
    for (const fallbackUrl of fallbackServices) {
        try {
            console.log(`[DEBUG] Trying fallback service: ${fallbackUrl}`);
            const response = await axios.get(fallbackUrl, { 
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });
            
            if (response.status === 200 && response.data && response.data.byteLength > 1000) {
                console.log(`[DEBUG] Fallback image found: ${fallbackUrl} (${response.data.byteLength} bytes)`);
                return fallbackUrl;
            }
        } catch (e) {
            console.log(`[DEBUG] Fallback service failed: ${e.message}`);
        }
    }
    
    // GUARANTEED fallback: Always return a working placeholder URL
    console.log(`[DEBUG] All fallbacks failed, using GUARANTEED placeholder for "${term}"`);
    const guaranteedPlaceholder = createPlaceholderImageUrl(term);
    console.log(`[DEBUG] GUARANTEED image URL: ${guaranteedPlaceholder}`);
    return guaranteedPlaceholder;
}

// Enhanced placeholder creation with better styling
function createPlaceholderImageUrl(query) {
	const encodedQuery = encodeURIComponent(query.slice(0, 20));
	const colors = ['667eea', 'f093fb', '4facfe', 'f093fb', '43e97b', 'fa709a'];
	const color = colors[Math.floor(Math.random() * colors.length)];
	return `https://via.placeholder.com/600x400/${color}/ffffff?text=${encodedQuery}`;
}

// Simple guaranteed image function for testing
async function getGuaranteedImage(term) {
    console.log(`[DEBUG] Getting guaranteed image for: ${term}`);
    
    // Try Unsplash first (most reliable)
    try {
        const unsplashUrl = `https://source.unsplash.com/featured/?${encodeURIComponent(term)}`;
        console.log(`[DEBUG] Trying Unsplash: ${unsplashUrl}`);
        const response = await fetch(unsplashUrl, { 
            method: 'HEAD',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        if (response.ok) {
            console.log(`[DEBUG] Unsplash image found: ${unsplashUrl}`);
            return unsplashUrl;
        }
    } catch (e) {
        console.log(`[DEBUG] Unsplash failed: ${e.message}`);
    }
    
    // Fallback to placeholder
    const placeholderUrl = createPlaceholderImageUrl(term);
    console.log(`[DEBUG] Using placeholder: ${placeholderUrl}`);
    return placeholderUrl;
}

// After downloading, verify with Sharp and signal failure if invalid
export async function downloadImage(url, path) {
	try {
		const res = await axios({ 
			url, 
			responseType: 'arraybuffer',
			timeout: 10000, // 10 second timeout
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
			}
		});
	fs.writeFileSync(path, res.data);
		// Try to open with Sharp to verify
		try {
			await sharp(path).metadata();
			return true;
		} catch (e) {
			console.log(`[DEBUG] Sharp could not read downloaded image: ${url} (${e.message})`);
			return false;
		}
	} catch (error) {
		console.error('❌ Error downloading image:', error.message);
		return false;
	}
}

async function createPlaceholderImage(searchTerm, outputFolder, slotNumber) {
	const width = 400;
	const height = 400;
	
	// Create a gradient background with random colors
	const colors = [
		{ r: 255, g: 99, b: 132 },   // Pink
		{ r: 99, g: 102, b: 241 },   // Indigo
		{ r: 34, g: 197, b: 94 },    // Green
		{ r: 251, g: 146, b: 60 },   // Orange
		{ r: 168, g: 85, b: 247 },   // Purple
		{ r: 59, g: 130, b: 246 },   // Blue
		{ r: 239, g: 68, b: 68 },    // Red
		{ r: 16, g: 185, b: 129 }    // Teal
	];
	
	const color1 = getRandomElement(colors);
	const color2 = getRandomElement(colors);
	
	// Create SVG with gradient background and text
	const svg = `
	<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
		<defs>
			<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" style="stop-color:rgb(${color1.r},${color1.g},${color1.b});stop-opacity:1" />
				<stop offset="100%" style="stop-color:rgb(${color2.r},${color2.g},${color2.b});stop-opacity:1" />
			</linearGradient>
		</defs>
		<rect width="100%" height="100%" fill="url(#grad)"/>
		<circle cx="200" cy="150" r="60" fill="rgba(255,255,255,0.2)"/>
		<text x="50%" y="45%" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="white" font-weight="bold">Image</text>
		<text x="50%" y="60%" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="white" font-weight="bold">Not</text>
		<text x="50%" y="75%" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="white" font-weight="bold">Found</text>
		<text x="50%" y="90%" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.8)">${searchTerm}</text>
	</svg>`;
	
	const placeholderPath = `${outputFolder}/placeholder_${slotNumber}.png`;
	await sharp(Buffer.from(svg))
		.png()
		.toFile(placeholderPath);
	
	console.log(`[DEBUG] Created placeholder image: ${placeholderPath}`);
	return placeholderPath;
}

async function createPlaceholderOverlay() {
	// Create a placeholder branded overlay (you can replace this with your actual image)
	const svgOverlay = `
	<svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
		<defs>
			<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
				<stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
			</linearGradient>
		</defs>
		<rect width="100%" height="100%" fill="url(#grad)"/>
		<text x="50%" y="50%" text-anchor="middle" fill="white" font-size="72" font-family="Arial, sans-serif" opacity="0.3">BRANDED TEMPLATE</text>
		<text x="50%" y="60%" text-anchor="middle" fill="white" font-size="36" font-family="Arial, sans-serif" opacity="0.3">Replace with your overlay</text>
	</svg>`;
	
	await sharp(Buffer.from(svgOverlay))
		.png()
		.toFile('./assets/overlay.png');
}

function getRandomOverlay(accountNumber = 1) {
	const overlayDir = `./account_${accountNumber}`;
	
	// Check if account directory exists
	if (!fs.existsSync(overlayDir)) {
		console.log(`[WARNING] Account directory ${overlayDir} not found, falling back to assets`);
		const fallbackDir = './assets';
		const files = fs.readdirSync(fallbackDir);
		const overlays = files.filter(f => f.startsWith('mainoverlay_') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')));
		if (overlays.length === 0) return './assets/overlay.png';
		// Shuffle overlays for true randomness
		for (let i = overlays.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[overlays[i], overlays[j]] = [overlays[j], overlays[i]];
		}
		const idx = Math.floor(Math.random() * overlays.length);
		return path.join(fallbackDir, overlays[idx]);
	}
	
	const files = fs.readdirSync(overlayDir);
	const overlays = files.filter(f => f.startsWith('mainoverlay_') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')));
	if (overlays.length === 0) {
		console.log(`[WARNING] No overlays found in ${overlayDir}, falling back to assets`);
		return getRandomOverlay(); // Recursive call with default account
	}
	// Shuffle overlays for true randomness
	for (let i = overlays.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[overlays[i], overlays[j]] = [overlays[j], overlays[i]];
	}
	const idx = Math.floor(Math.random() * overlays.length);
	return path.join(overlayDir, overlays[idx]);
}

// 1. Make escapeXml robust for all special characters, including emoji and non-ASCII
function escapeXml(unsafe) {
	if (!unsafe) return '';
	return unsafe.replace(/[<>&'"\n\r]/g, function (c) {
		switch (c) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case '\'': return '&apos;';
			case '"': return '&quot;';
			case '\n': return '<br/>';
			case '\r': return '';
		}
	}).replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control chars
}

function sanitizeFilename(title) {
	// Remove or replace characters that are invalid in filenames
	return title
		.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
		.replace(/\s+/g, '_') // Replace spaces with underscores
		.replace(/[^\w\s\-_]/g, '') // Remove special characters except underscores and hyphens
		.replace(/_+/g, '_') // Replace multiple underscores with single
		.trim()
		.substring(0, 100); // Limit length
}

// 2. Save the generated SVG for the text to output/debug_text.svg for debugging
// 3. Add debug logs to confirm SVG is being generated and used
// 4. Ensure SVG is always valid and not blank if fact/reply is present
async function composeFactReplyCard(templatePath, imageUrl1, imageUrl2, fact, reply, outputPath, debugSvgPath) {
	const cardWidth = 1000;
	const padding = 28;
	const margin = 32;
	const imageHeight = 400;
	const imageX = (OUTPUT_WIDTH - cardWidth) / 2 + padding;
	const imageWidth = cardWidth - 2 * padding;
	const lineWidth = 6;
	const singleImageWidth = Math.floor((imageWidth - lineWidth) / 2);
	const profilePicSize = 80;
	const defaultFactFontSize = 48;
	const defaultReplyFontSize = 40;
	const factLineHeight = 54;
	const replyLineHeight = 46;
	const maxWidth = imageWidth;
	const factTextX = imageX + margin;
	const replyTextX = imageX + margin;
	const maxFactHeight = 420;
	const maxReplyHeight = 260;

	const cardY = OUTPUT_HEIGHT * 0.07;
	const factY = cardY + padding + 60;

	const factWrap = wrapSvgText(fact, maxWidth, defaultFactFontSize, factTextX, factY, factLineHeight, maxFactHeight);
	const factFontSize = factWrap.fontSize;
	const factLines = factWrap.lines.split('<tspan').length - 1;

	const imageY = factY + factLines * factLineHeight + 16;
	const replySectionY = imageY + imageHeight + 32;
	const nameX = imageX + profilePicSize + 32;
	const nameY = replySectionY + 40;
	const handleY = nameY + 36;
	const replyTextY = handleY + 48;

	const replyWrap = wrapSvgText(reply, maxWidth, defaultReplyFontSize, replyTextX, replyTextY, replyLineHeight, maxReplyHeight);
	const replyFontSize = replyWrap.fontSize;
	const replyLines = replyWrap.lines.split('<tspan').length - 1;

	const cardHeight = (factY - cardY) + factLines * factLineHeight + 16 + imageHeight + 32 + 36 + 36 + replyLines * replyLineHeight + 48 + padding;

	const composition = sharp(templatePath).resize(OUTPUT_WIDTH, OUTPUT_HEIGHT);
	const cardBackground = `
	<svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
		<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
			<feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity="0.25"/>
		</filter>
		<rect x="${(OUTPUT_WIDTH - cardWidth) / 2}" y="${cardY}" width="${cardWidth}" height="${cardHeight}"
			fill="white" rx="56" ry="56" filter="url(#shadow)"/>
	</svg>`;

	const leftMaskSvg = `<svg width='${singleImageWidth}' height='${imageHeight}'><rect x='0' y='0' width='${singleImageWidth}' height='${imageHeight}' rx='56' ry='56' style='fill:white'/><rect x='${singleImageWidth/2}' y='0' width='${singleImageWidth/2}' height='${imageHeight}' style='fill:white'/></svg>`;
	
	// Fetch and process left image (URL or local file)
	let leftImage;
	try {
		if (imageUrl1.startsWith('http')) {
			// Fetch from URL
			const leftResponse = await axios.get(imageUrl1, { responseType: 'arraybuffer' });
			leftImage = await sharp(leftResponse.data)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.composite([{ input: Buffer.from(leftMaskSvg), blend: 'dest-in' }])
				.png()
				.toBuffer();
		} else {
			// Use local file
			leftImage = await sharp(imageUrl1)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.composite([{ input: Buffer.from(leftMaskSvg), blend: 'dest-in' }])
				.png()
				.toBuffer();
		}
	} catch (error) {
		console.error(`[DEBUG] Failed to process left image from ${imageUrl1}:`, error.message);
		throw new Error(`Failed to process left image: ${error.message}`);
	}

	const rightMaskSvg = `<svg width='${singleImageWidth}' height='${imageHeight}'><rect x='0' y='0' width='${singleImageWidth}' height='${imageHeight}' rx='56' ry='56' style='fill:white'/><rect x='0' y='0' width='${singleImageWidth/2}' height='${imageHeight}' style='fill:white'/></svg>`;
	
	// Fetch and process right image (URL or local file)
	let rightImage;
	try {
		if (imageUrl2.startsWith('http')) {
			// Fetch from URL
			const rightResponse = await axios.get(imageUrl2, { responseType: 'arraybuffer' });
			rightImage = await sharp(rightResponse.data)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.composite([{ input: Buffer.from(rightMaskSvg), blend: 'dest-in' }])
				.png()
				.toBuffer();
		} else {
			// Use local file
			rightImage = await sharp(imageUrl2)
				.resize(singleImageWidth, imageHeight, { fit: 'cover', position: 'center' })
				.composite([{ input: Buffer.from(rightMaskSvg), blend: 'dest-in' }])
				.png()
				.toBuffer();
		}
	} catch (error) {
		console.error(`[DEBUG] Failed to process right image from ${imageUrl2}:`, error.message);
		throw new Error(`Failed to process right image: ${error.message}`);
	}

	const lineBuffer = await sharp({
		create: {
			width: lineWidth,
			height: imageHeight,
			channels: 4,
			background: { r: 255, g: 255, b: 255, alpha: 1 }
		}
	}).png().toBuffer();

	const profilePic = await sharp(MEME_PROFILE_PIC)
		.resize(profilePicSize, profilePicSize)
		.composite([
			{
				input: Buffer.from(`<svg><circle cx="${profilePicSize/2}" cy="${profilePicSize/2}" r="${profilePicSize/2}" fill="white"/></svg>`),
				blend: 'dest-in'
			}
		])
		.png()
		.toBuffer();

	const factTextSvg = `<text x="${factTextX}" y="${factY}" class="fact" style="font-size:${factFontSize}px">${factWrap.lines}</text>`;
	const replyTextSvg = `<text x="${replyTextX}" y="${replyTextY}" class="reply" style="font-size:${replyFontSize}px">${replyWrap.lines}</text>`;

	const textSvg = `
	<svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}">
		<style>
			.fact {
				fill: #111;
				font-family: 'Arial', 'Helvetica Neue', Arial, sans-serif;
				font-weight: bold;
				font-size: ${factFontSize}px;
			}
			.meme-name {
				fill: #111;
				font-size: 40px;
				font-family: 'Arial', 'Helvetica Neue', Arial, sans-serif;
				font-weight: bold;
			}
			.meme-handle {
				fill: #444;
				font-size: 34px;
				font-family: 'Arial', 'Helvetica Neue', Arial, sans-serif;
				font-weight: normal;
			}
			.reply {
				fill: #111;
				font-family: 'Arial', 'Helvetica Neue', Arial, sans-serif;
				font-weight: normal;
				font-size: ${replyFontSize}px;
			}
		</style>
		${factTextSvg}
		<text x="${nameX}" y="${nameY}" class="meme-name">${MEME_ACCOUNT_NAME}</text>
		<text x="${nameX}" y="${handleY}" class="meme-handle">${MEME_ACCOUNT_HANDLE}</text>
		${replyTextSvg}
	</svg>`;

	// Save SVG for debugging
	try {
		fs.writeFileSync(debugSvgPath, textSvg);
		console.log(`[DEBUG] Saved debug_text.svg for inspection at ${debugSvgPath}`);
	} catch (e) {
		console.log('[DEBUG] Could not save debug_text.svg:', e.message);
	}

	await composition
		.composite([
			{ input: Buffer.from(cardBackground), top: 0, left: 0 },
			{ input: leftImage, top: Math.floor(imageY), left: Math.floor(imageX) },
			{ input: lineBuffer, top: Math.floor(imageY), left: Math.floor(imageX + singleImageWidth) },
			{ input: rightImage, top: Math.floor(imageY), left: Math.floor(imageX + singleImageWidth + lineWidth) },
			{ input: profilePic, top: Math.floor(replySectionY), left: Math.floor(imageX) },
			{ input: Buffer.from(textSvg), top: 0, left: 0 }
		])
		.png()
		.toFile(outputPath);
}

export async function createVideo(imagePath, videoPath) {
	return new Promise((resolve, reject) => {
		exec(`ffmpeg -loop 1 -i ${imagePath} -c:v libx264 -t ${VIDEO_DURATION} -pix_fmt yuv420p -vf "scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}" -y ${videoPath}`, (err) => {
			if (err) {
				console.error('FFmpeg error:', err);
				reject(err);
			} else {
				console.log('✅ Video created successfully!');
				resolve();
			}
		});
	});
}

function showUsage() {
	console.log(`
🎬 Meme Video Generator - Usage

Basic usage:
  node scripts/generateMeme.js

With custom settings:
  node scripts/generateMeme.js --font-size=56 --text-color=white --username="@yourname" --handle="Your Name"

Skip image review (auto-approve):
  node scripts/generateMeme.js --skip-review

Generate for all accounts:
  node scripts/generateMeme.js --all-accounts

Options:
  --font-size=<number>    Font size in pixels (default: 48)
  --text-color=<color>    Text color (default: white)
  --username=<string>     Username to display (default: @memecreator)
  --handle=<string>       Handle/display name (default: Meme Creator)
  --image-url=<url>       Custom image URL (optional)
  --skip-review           Skip image approval process (auto-approve all images)
  --no-review             Alias for --skip-review
  --all-accounts          Generate videos for all 3 accounts with same content

Examples:
  node scripts/generateMeme.js --font-size=60 --text-color=yellow
  node scripts/generateMeme.js --username="@kevinlee" --handle="Kevin Lee"
  node scripts/generateMeme.js --skip-review
  node scripts/generateMeme.js --all-accounts --skip-review
`);
}

async function main(presetTopic = null) {
	console.log('🎬 Starting meme video generation...');
	console.log(`📝 Settings: Font size=${fontSize}px, Color=${textColor}, Username=${username}`);

	const accountNumber = 1;
	const overlayPath = getRandomOverlay(accountNumber);
	console.log(`[DEBUG] Using overlay: ${overlayPath}`);

	// Get user input for topic (or use preset topic)
	let topic;
	if (presetTopic) {
		topic = presetTopic;
		console.log(`📝 Using preset topic: ${topic}`);
	} else if (args.length > 0 && args[0] && !args[0].startsWith('--')) {
		topic = args[0];
		console.log(`📝 Using topic from command line: ${topic}`);
	} else {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		topic = await new Promise(resolve => {
			rl.question('Enter a topic for your meme: ', answer => {
				rl.close();
				resolve(answer.trim());
			});
		});
		if (!topic) {
			console.log('❌ No topic provided. Exiting.');
			return;
		}
		console.log(`📝 Using user-provided topic: ${topic}`);
	}

	const { fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, handle, name, tags } = await getFactAndWittyReply(topic, 1);
	console.log(`\n📝 Fact: ${fact}\n💬 Witty reply: ${reply}\n📺 YouTube Title: ${youtube_title}\n📝 YouTube Description: ${youtube_description}`);

	// Create date-based output folder structure
	const now = new Date();
	const dateFolder = now.toISOString().split('T')[0];
	const timeString = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
	const sanitizedTitle = sanitizeFilename(youtube_title);
	const runFolder = `./output/${dateFolder}/${sanitizedTitle}_${timeString}`;
	if (!fs.existsSync(runFolder)) fs.mkdirSync(runFolder, { recursive: true });
	console.log(`📁 Creating output in: ${runFolder}`);

	// Save the full ChatGPT response as JSON in the output folder
	const gptResponsePath = `${runFolder}/gpt_response.json`;
	fs.writeFileSync(gptResponsePath, JSON.stringify({ fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, handle, name, tags }, null, 2));

	// Always scrape 2 images for template
	let finalImageUrls = [null, null];
	console.log(`[DEBUG] GPT provided ${image_urls ? image_urls.length : 0} image URLs and ${image_search_terms ? image_search_terms.length : 0} search terms`);

	// Always scrape 2 images regardless of GPT URLs
	console.log('[DEBUG] Scraping 2 images for template...');
	const searchTerms = image_search_terms || [`${topic} HD`, `${topic} high quality`, `${topic} official still HD`];
	
	// GUARANTEED image scraping - NEVER fails to return 2 working images
	const scrapeImageWithFallback = async (term, imageIndex) => {
		const maxAttempts = 3;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				console.log(`[DEBUG] Scraping image ${imageIndex} with term: "${term}" (attempt ${attempt})`);
				const imageUrl = await getScrapedImageForTerm(term);
				console.log(`[DEBUG] Successfully scraped image ${imageIndex}: ${imageUrl}`);
				return imageUrl;
					} catch (error) {
			console.log(`[DEBUG] Failed to scrape image ${imageIndex} (attempt ${attempt}): ${error.message}`);
			if (attempt === maxAttempts) {
				// GUARANTEED fallback - this will ALWAYS work
				const guaranteedUrl = createPlaceholderImageUrl(term);
				console.log(`[DEBUG] Using GUARANTEED fallback for image ${imageIndex}: ${guaranteedUrl}`);
				return guaranteedUrl;
			}
			// Try a different search term on next attempt - prioritize HD images
			const fallbackTerms = ['HD', 'high quality', 'official still HD', 'key scene HD', 'movie still HD'];
			term = `${topic} ${fallbackTerms[attempt - 1] || 'HD'}`;
		}
		}
		
		// This should never be reached, but just in case - ABSOLUTE guarantee
		console.log(`[DEBUG] EMERGENCY: Creating absolute fallback for image ${imageIndex}`);
		return createPlaceholderImageUrl(`${topic} image ${imageIndex}`);
	};
	
	// Scrape first image - GUARANTEED to work
	finalImageUrls[0] = await scrapeImageWithFallback(searchTerms[0], 1);
	
	// Scrape second image with different term - GUARANTEED to work
	const secondTerm = searchTerms[1] || searchTerms[0] + ' scene';
	finalImageUrls[1] = await scrapeImageWithFallback(secondTerm, 2);

	// FINAL SAFETY CHECK: Ensure we have exactly 2 working images
	if (!finalImageUrls[0]) {
		console.log('[DEBUG] EMERGENCY: Image 1 is null, creating emergency fallback');
		finalImageUrls[0] = createPlaceholderImageUrl(`${topic} image 1`);
	}
	if (!finalImageUrls[1]) {
		console.log('[DEBUG] EMERGENCY: Image 2 is null, creating emergency fallback');
		finalImageUrls[1] = createPlaceholderImageUrl(`${topic} image 2`);
	}

	console.log('[DEBUG] GUARANTEED Final image URLs:', finalImageUrls);
	console.log('[DEBUG] ✅ SUCCESS: Both images are ready for template generation');

	// Use the single template
	const framePath = `${runFolder}/frame.png`;
	const videoPath = `${runFolder}/video.mp4`;

	console.log('🎨 Generating template with images:', finalImageUrls);
	try {
		await generateTemplate({
			overlayPath: overlayPath,
			image1: finalImageUrls[0],
			image2: finalImageUrls[1],
			fact,
			reply,
			outputPath: framePath,
			avatarPath: overlayPath, // Use overlay as avatar background
			handle: handle || '@memecreator',
			name: name || 'Meme Creator'
		});
		console.log('✅ Template generation completed successfully!');
	} catch (templateError) {
		console.error('❌ Template generation failed:', templateError.message);
		throw templateError;
	}

	console.log('🎥 Creating video...');
	try {
		await createVideo(framePath, videoPath);
		console.log('✅ Video creation completed successfully!');
	} catch (videoError) {
		console.error('❌ Video creation failed:', videoError.message);
		throw videoError;
	}

	console.log('🎉 Meme video generation complete!');
	console.log('📁 Output files:');
	console.log(`   - ${framePath} (composed image)`);
	console.log(`   - ${videoPath} (final video)`);
	console.log('📱 Ready for TikTok and YouTube Shorts!');
	console.log(`📊 Video specs: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}, ${VIDEO_DURATION}s, MP4`);
	console.log('\n📺 YouTube Upload Info:');
	console.log(`   Title: ${youtube_title}`);
	console.log(`   Description: ${youtube_description}`);
}

main();

