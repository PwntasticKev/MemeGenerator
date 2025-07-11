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
import { template1 } from '../templates/template1.js';
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
const templateArg = args.find(arg => arg.startsWith('--template='))?.split('=')[1] || null;
const allTemplatesFlag = args.includes('--all-templates');
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

// Template selection logic
const templates = [template1];
function getTemplateByIndex(idx) {
	if (idx >= 1 && idx <= templates.length) return templates[idx - 1];
	return null;
}
export function getRandomTemplate() {
	const idx = Math.floor(Math.random() * templates.length);
	return templates[idx];
}

async function getFactAndWittyReply(topic, accountNumber = 1) {
	try {
		// Assume callCustomGpt is implemented elsewhere to hit your custom GPT endpoint
		const gptResponse = await callCustomGpt(topic, accountNumber);
		console.log('[DEBUG] Custom GPT response:', gptResponse);
		// Destructure all expected fields
		const {
			fact = '',
			reply = '',
			youtube_title = '',
			youtube_description = '',
			image_search_terms = [],
			avatar_search_terms = [],
			image_urls = [],
			avatar_urls = [],
			handle = '@character',
			name = 'Character Name',
			tags = []
		} = gptResponse || {};
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
		console.error('❌ Error getting meme data from custom GPT:', error.message);
		return {
			fact: `Did you know? ${topic} is more interesting than you think!`,
			reply: `Bro, that's wild!`,
			youtube_title: `${topic} Facts`,
			youtube_description: `Interesting facts about ${topic}! #shorts #viral #facts`,
			image_search_terms: [],
			avatar_search_terms: [],
			image_urls: [],
			avatar_urls: [],
			handle: '@character',
			name: 'Character Name',
			tags: []
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
	
	// Add topic-based terms if we don't have enough
	if (terms.length < 2) {
		terms.push(`${topic} official poster`);
		terms.push(`${topic} key scene`);
		terms.push(`${topic} movie still`);
		terms.push(`${topic} HD`);
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
    const engines = [
        searchBingImagesPuppeteer,
        searchYahooImagesPuppeteer,
        searchDuckDuckGoImagesPuppeteer
    ];
    const shuffledEngines = engines.sort(() => Math.random() - 0.5);
    
    // Try search engines first
    for (const engine of shuffledEngines) {
        try {
            console.log(`[DEBUG] Trying ${engine.name} for term "${term}"`);
            const scraped = await engine(term, 1, 50);
            console.log(`[DEBUG] ${engine.name} returned ${scraped ? scraped.length : 0} images`);
            
            if (scraped && scraped.length > 0) {
                // Try to validate the first few images
                for (let i = 0; i < Math.min(scraped.length, 10); i++) {
                    const imageUrl = scraped[i];
                    console.log(`[DEBUG] Testing image ${i + 1}: ${imageUrl}`);
                    
                    try {
                        // Try to download a small portion to validate
                        const response = await fetch(imageUrl, { 
                            method: 'GET',
                            timeout: 15000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.9',
                                'Cache-Control': 'no-cache'
                            }
                        });
                        
                        if (response.ok) {
                            const contentType = response.headers.get('content-type');
                            console.log(`[DEBUG] Image response: ${response.status} ${contentType}`);
                            
                            if (contentType && (contentType.startsWith('image/') || contentType.includes('image'))) {
                                // Try to read a small buffer to verify it's actually an image
                                const buffer = await response.arrayBuffer();
                                if (buffer.byteLength > 1000) { // At least 1KB
                                    console.log(`[DEBUG] Valid image found: ${imageUrl} (${contentType}, ${buffer.byteLength} bytes)`);
                                    return imageUrl;
                                }
                            }
                        }
                    } catch (e) {
                        console.log(`[DEBUG] Image validation failed for ${imageUrl}: ${e.message}`);
                    }
                }
            } else {
                console.log(`[DEBUG] ${engine.name} found no images for "${term}"`);
            }
        } catch (e) {
            console.warn(`[DEBUG] ${engine.name} failed for term "${term}":`, e.message);
        }
    }
    
    // If all search engines fail, try multiple fallback services
    console.log(`[DEBUG] All search engines failed for "${term}", trying fallback services...`);
    
    const fallbackServices = [
        // Unsplash (most reliable)
        `https://source.unsplash.com/featured/?${encodeURIComponent(term)}`,
        // Picsum (random images)
        `https://picsum.photos/600/400?random=${Math.floor(Math.random() * 1000)}`,
        // Placeholder with gradient
        `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(term.slice(0, 20))}`,
        // Another placeholder service
        `https://dummyimage.com/600x400/4facfe/ffffff&text=${encodeURIComponent(term.slice(0, 20))}`
    ];
    
    for (const fallbackUrl of fallbackServices) {
        try {
            console.log(`[DEBUG] Trying fallback service: ${fallbackUrl}`);
            const response = await fetch(fallbackUrl, { 
                method: 'HEAD',
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });
            if (response.ok) {
                console.log(`[DEBUG] Fallback image found: ${fallbackUrl}`);
                return fallbackUrl;
            }
        } catch (e) {
            console.log(`[DEBUG] Fallback service failed: ${e.message}`);
        }
    }
    
    // Last resort: create a simple placeholder
    console.log(`[DEBUG] All fallbacks failed, creating placeholder for "${term}"`);
    return createPlaceholderImageUrl(term);
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

async function main(presetTopic = null, presetScheduledTime = null, presetAccount = null, isBatchMode = false) {
	try {
		// Check for help flag
		if (args.includes('--help') || args.includes('-h')) {
			showUsage();
			return;
		}
		
		console.log('🎬 Starting meme video generation...');
		console.log(`📝 Settings: Font size=${fontSize}px, Color=${textColor}, Username=${username}`);

		// Initialize account number and overlay path early
		let accountNumber = presetAccount || 1;
		const overlayPath = getRandomOverlay(accountNumber);
		console.log(`[DEBUG] Using overlay: ${overlayPath}`);

		// Account selection logic (only in interactive mode)
		if (!isBatchMode && !skipReview) {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			const accountPrompt = `\nSelect YouTube account (1 or 2, default: 1): `;
			const accountAnswer = await new Promise(resolve => {
				rl.question(accountPrompt, answer => {
					rl.close();
					const parsed = parseInt(answer.trim());
					if (!isNaN(parsed) && (parsed === 1 || parsed === 2)) {
						resolve(parsed);
					} else {
						resolve(1); // Default to account 1
					}
				});
			});
			accountNumber = accountAnswer;
		}
		
		console.log(`[YouTube] Using account ${accountNumber}`);

		// Template selection - prefer SVG templates
		let selectedTemplate;
		let svgTemplates = getAllSvgTemplates();
		if (templateArg) {
			selectedTemplate = `svg${templateArg}`;
		} else if (svgTemplates.length > 0) {
			// Use random SVG template if available
			const randomSvgTemplate = svgTemplates[Math.floor(Math.random() * svgTemplates.length)];
			const templateNum = randomSvgTemplate.match(/template(\d+)\.svg/i)[1];
			selectedTemplate = `svg${templateNum}`;
		} else {
			// Fallback to old template system
			selectedTemplate = getRandomTemplate();
		}
		console.log(`[Template] Using template: ${selectedTemplate}`);

		// Get user input for topic (or use preset topic)
		let topic;
		if (presetTopic) {
			topic = presetTopic;
			console.log(`📝 Using preset topic: ${topic}`);
		} else {
			// Use default topic for testing instead of prompting
			topic = 'hot rod';
			console.log(`📝 Using default topic for testing: ${topic}`);
		}

		// Check if we should generate for all accounts
		if (allAccountsFlag) {
			// Scheduling logic for all accounts
			let scheduledPublishDate;
			if (isBatchMode && presetScheduledTime) {
				scheduledPublishDate = presetScheduledTime;
				console.log(`[Batch] Using precomputed scheduled time: ${scheduledPublishDate}`);
			} else if (isBatchMode || skipReview) {
				// Auto-schedule in batch mode or when skipping review
				const hours = 2; // default 2 hours
				const publishDate = new Date(Date.now() + hours * 60 * 60 * 1000);
				scheduledPublishDate = publishDate.toISOString();
				console.log(`[Auto] Scheduling for ${hours} hours from now: ${scheduledPublishDate}`);
			} else {
				// Auto-schedule for testing
				const hours = 2; // default 2 hours
				const publishDate = new Date(Date.now() + hours * 60 * 60 * 1000);
				scheduledPublishDate = publishDate.toISOString();
				console.log(`[Auto] Scheduling for ${hours} hours from now: ${scheduledPublishDate}`);
			}

			// Generate for all accounts
			return await generateForAllAccounts(topic, scheduledPublishDate, isBatchMode);
		}

		// Get fact, witty reply, YouTube title and description
		const { fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, handle, name, tags } = await getFactAndWittyReply(topic, accountNumber);
		console.log(`\n📝 Fact: ${fact}\n💬 Witty reply: ${reply}\n📺 YouTube Title: ${youtube_title}\n📝 YouTube Description: ${youtube_description}`);

		// Create date-based output folder structure
		const now = new Date();
		const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD format
		const timeString = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14); // YYYYMMDDHHMMSS format
		const sanitizedTitle = sanitizeFilename(youtube_title);
		const runFolder = `./output/${dateFolder}/${sanitizedTitle}_${timeString}`;
		if (!fs.existsSync(runFolder)) fs.mkdirSync(runFolder, { recursive: true });
		console.log(`📁 Creating output in: ${runFolder}`);

		// Save the full ChatGPT response as JSON in the output folder
		const gptResponsePath = `${runFolder}/gpt_response.json`;
		fs.writeFileSync(gptResponsePath, JSON.stringify({ fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, tags }, null, 2));

		// Use the image URLs provided by GPT - they're already perfect and relevant!
		let finalImageUrls = [null, null];
		console.log(`[DEBUG] GPT provided ${image_urls ? image_urls.length : 0} image URLs and ${image_search_terms ? image_search_terms.length : 0} search terms`);
		
		// Use the first two image URLs from GPT response
		if (image_urls && image_urls.length >= 2) {
			finalImageUrls = [image_urls[0], image_urls[1]];
			console.log('[DEBUG] Using GPT-provided image URLs:', finalImageUrls);
		} else if (image_urls && image_urls.length === 1) {
			finalImageUrls = [image_urls[0], null];
			console.log('[DEBUG] Using 1 GPT-provided image URL:', finalImageUrls[0]);
		} else {
			console.log('[DEBUG] No GPT image URLs available, using placeholders');
			finalImageUrls = [null, null]; // null means use placeholder
		}

		const framePath = `${runFolder}/${sanitizedTitle}_frame.png`;
		const videoPath = `${runFolder}/${sanitizedTitle}_video.mp4`;
		const debugSvgPath = `${runFolder}/debug_text.svg`;

		// Template selection was already done earlier, just use it

		// Account number was already initialized earlier
		// Scheduling logic
		let scheduledPublishDate;
		if (isBatchMode && presetScheduledTime) {
			scheduledPublishDate = presetScheduledTime;
			console.log(`[Batch] Using precomputed scheduled time: ${scheduledPublishDate}`);
		} else if (isBatchMode || skipReview) {
			// Auto-schedule in batch mode or when skipping review
			const hours = 2; // default 2 hours
			const publishDate = new Date(Date.now() + hours * 60 * 60 * 1000);
			scheduledPublishDate = publishDate.toISOString();
			console.log(`[Auto] Scheduling for ${hours} hours from now: ${scheduledPublishDate}`);
		} else {
			// Interactive prompt as before
			const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
			const schedulePrompt = `\nEnter hours from now to schedule (1, 2, 3, etc.) or press Enter for 2 hours: `;
			scheduledPublishDate = await new Promise(resolve => {
				rl2.question(schedulePrompt, answer => {
					rl2.close();
					let hours = 2; // default
					if (answer && answer.trim()) {
						const parsed = parseFloat(answer.trim());
						if (!isNaN(parsed) && parsed > 0) {
							hours = parsed;
						}
					}
					const publishDate = new Date(Date.now() + hours * 60 * 60 * 1000);
					resolve(publishDate.toISOString());
				});
			});
			console.log(`\n[YouTube] Will schedule post for: ${scheduledPublishDate}`);
		}

		// Account selection logic (only in interactive mode)
		if (!isBatchMode && !skipReview) {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			const accountPrompt = `\nSelect YouTube account (1 or 2, default: 1): `;
			const accountAnswer = await new Promise(resolve => {
				rl.question(accountPrompt, answer => {
					rl.close();
					const parsed = parseInt(answer.trim());
					if (!isNaN(parsed) && (parsed === 1 || parsed === 2)) {
						resolve(parsed);
					} else {
						resolve(1); // Default to account 1
					}
				});
			});
			accountNumber = accountAnswer;
		}
		
		console.log(`[YouTube] Using account ${accountNumber}`);
		
		// Use AI-generated character-related handle and name
		const characterName = name || 'Character Name';
		const characterHandle = handle || '@character';

		console.log('🎨 Generating template with images:', finalImageUrls);
		try {
			if (typeof selectedTemplate === 'string' && selectedTemplate.startsWith('svg')) {
				const templateNum = selectedTemplate.replace('svg', '');
				await renderSvgTemplate({
					templateNum,
					images: [
						{ url: finalImageUrls[0] },
						{ url: finalImageUrls[1] }
					],
					avatar: avatar_urls && avatar_urls[0],
					fact,
					reply,
					handle: characterHandle,
					name: characterName,
					outputPath: framePath,
					overlayPath: overlayPath
				});
				console.log('✅ SVG template generation completed successfully!');
			} else {
				await selectedTemplate({
					overlayPath: overlayPath,
					image1: finalImageUrls[0],
					image2: finalImageUrls[1],
					fact,
					reply,
					outputPath: framePath,
					debugSvgPath,
					avatarPath: overlayPath, // Use overlay as avatar background
					handle: characterHandle,
					name: characterName
				});
				console.log('✅ Template generation completed successfully!');
			}
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
		console.log(`   - ${debugSvgPath} (debug SVG)`);
		console.log('📱 Ready for TikTok and YouTube Shorts!');
		console.log(`📊 Video specs: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}, ${VIDEO_DURATION}s, MP4`);
		console.log('\n📺 YouTube Upload Info:');
		console.log(`   Title: ${youtube_title}`);
		console.log(`   Description: ${youtube_description}`);

		// Try YouTube upload if credentials are available
		try {
			await uploadAndScheduleYouTubeShort({
				videoPath: videoPath,
				title: youtube_title,
				description: youtube_description,
				scheduledPublishDate,
				account: accountNumber
			});
		} catch (uploadError) {
			console.log('\n⚠️  YouTube upload skipped:', uploadError.message);
			console.log('💡 To enable YouTube upload, set these environment variables:');
			console.log(`   YOUTUBE_CLIENT_ID_${accountNumber} and YOUTUBE_CLIENT_SECRET_${accountNumber}`);
			console.log(`   YOUTUBE_REFRESH_TOKEN_${accountNumber}`);
			console.log('📁 Video saved locally for manual upload');
		}
		
		// Ask if user wants to regenerate with same topic (skip in batch mode)
		if (isBatchMode || skipReview) {
			console.log('\n✅ Done! Thanks for using the meme generator!');
		} else {
			const rl3 = readline.createInterface({ input: process.stdin, output: process.stdout });
			const regeneratePrompt = `\nGenerate another meme with "${topic}"? (y/n): `;
			const shouldRegenerate = await new Promise(resolve => {
				rl3.question(regeneratePrompt, answer => {
					rl3.close();
					resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
				});
			});
			
			if (shouldRegenerate) {
				console.log(`\n🔄 Regenerating meme for "${topic}"...`);
				// Recursively call main() with the same topic
				await main(topic, scheduledPublishDate, accountNumber, isBatchMode);
			} else {
				console.log('\n✅ Done! Thanks for using the meme generator!');
			}
		}

		if (allTemplatesFlag) {
			const svgTemplates = getAllSvgTemplates();
			// Use a single output folder for all templates in this run
			const now = new Date();
			const dateFolder = now.toISOString().split('T')[0];
			const timeString = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
			const sanitizedTitle = sanitizeFilename(youtube_title);
			const runFolder = `./output/${dateFolder}/${sanitizedTitle}_${timeString}`;
			if (!fs.existsSync(runFolder)) fs.mkdirSync(runFolder, { recursive: true });
			
			// Download images once and cache them to avoid rate limiting
			console.log('[All Templates] Downloading images once for all templates...');
			const cachedImages = [];
			for (let i = 0; i < finalImageUrls.length; i++) {
				try {
					const imageUrl = finalImageUrls[i];
					const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
					cachedImages.push({
						url: imageUrl,
						buffer: Buffer.from(response.data)
					});
					console.log(`[All Templates] Cached image ${i+1}: ${imageUrl}`);
				} catch (error) {
					console.error(`[All Templates] Failed to cache image ${i+1}:`, error.message);
					// Use placeholder if download fails
					cachedImages.push({ url: imageUrl, buffer: null });
				}
			}
			
			// Download avatar once if available
			let cachedAvatar = null;
			if (avatar_urls && avatar_urls[0]) {
				try {
					const response = await axios.get(avatar_urls[0], { responseType: 'arraybuffer' });
					cachedAvatar = Buffer.from(response.data);
					console.log(`[All Templates] Cached avatar: ${avatar_urls[0]}`);
				} catch (error) {
					console.error(`[All Templates] Failed to cache avatar:`, error.message);
				}
			}
			
			for (const svgFile of svgTemplates) {
				try {
					const templateNum = svgFile.match(/template(\d+)\.svg/i)[1];
					console.log(`[All Templates] Processing template ${templateNum}...`);
					
					const framePath = `${runFolder}/${sanitizedTitle}_template${templateNum}_frame.png`;
					await renderSvgTemplate({
						templateNum,
						images: cachedImages,
						avatar: cachedAvatar,
						fact,
						reply,
						handle: characterHandle,
						name: characterName,
						outputPath: framePath,
						overlayPath: overlayPath
					});
					console.log(`✅ SVG template #${templateNum} image generated successfully!`);
					
					// Generate video for this template
					const videoPath = `${runFolder}/${sanitizedTitle}_template${templateNum}_video.mp4`;
					await createVideo(framePath, videoPath);
					console.log(`✅ SVG template #${templateNum} video generated successfully!`);
				} catch (error) {
					console.error(`❌ Failed to process ${svgFile}:`, error.message);
					// Continue with next template instead of stopping
				}
			}
			console.log('🎉 All SVG templates processed!');
			return;
		}
	} catch (error) {
		console.error('❌ Error:', error.message);
		if (error.response) {
			console.error('API Error details:', error.response.data);
		}
		console.log('\n💡 Try running with --help for usage information');
	}
}

// Extract topic from command line arguments (first non-flag argument)
const topicArg = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));
const isBatchMode = args.includes('--batch') || args.includes('--batch-mode');

// Export main function for testing
export { main };

// Only run main function if this script is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
	// Run the main function with topic if provided
	main(topicArg, null, null, isBatchMode || skipReview);
}

// Loosen image quality check
async function isImageHighQuality(url) {
	try {
		if (!url || !url.startsWith('http')) {
			console.log(`[DEBUG] Skipping non-http image: ${url}`);
			return false;
		}
		const mod = url.startsWith('https') ? https : http;
		const timeout = 8000;
		const req = mod.request(url, {
			method: 'HEAD',
			timeout: timeout,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
			}
		}, (res) => {
			const contentType = res.headers['content-type'] || '';
			if (!contentType.startsWith('image/')) {
				console.log(`[DEBUG] Rejecting (bad content-type: ${contentType}): ${url}`);
				return false;
			}
			// Accept any image type, skip size checks
			return true;
		});
		req.on('error', () => false);
		req.setTimeout(timeout, () => {
			req.destroy();
			return false;
		});
		req.end();
		// Try to download and open with Sharp
		const res = await axios({ url, responseType: 'arraybuffer', timeout: 10000 });
		await sharp(res.data).metadata();
		return true;
	} catch (error) {
		console.log(`[DEBUG] Image failed quality check or could not be opened: ${url} (${error.message})`);
		return false;
	}
}

// Use PlotTwistCentralMemes custom GPT to generate meme content
export async function callCustomGpt(topic, accountNumber = 1) {
	try {
		console.log('[DEBUG] Using PlotTwistCentralMemes GPT for topic:', topic);
		
		// Use your PlotTwistCentralMemes custom GPT
		// Custom GPT ID: g-686842445ff48191bc501953dc890a28-meme-gen
		
		// Try using the direct API call to your custom GPT
		// Custom GPTs can be accessed via the beta API
		
		// Custom context based on account number
		let accountContext = "";
		if (accountNumber === 2) {
			accountContext = `

ACCOUNT 2 CONTEXT - GIRL POSTING STYLE:
You are posting as a girl who loves pop culture, movies, TV shows, and sharing interesting facts. Your tone should be:
- Friendly and relatable, like a girl chatting with friends
- Excited about discovering cool facts and sharing them
- Uses casual, conversational language with girl-specific expressions
- ALWAYS use girl-style language in replies: "omg", "literally", "so good", "love this", "obsessed", "no way", "that's crazy", "i can't even", "best thing ever"
- Shares facts with genuine enthusiasm and wonder
- Replies should sound like a girl's natural reaction to learning something cool
- Keep titles simple and human-like, not clickbait
- Focus on the joy of discovering interesting details about things you love

CRITICAL: For account 2, your reply MUST include girl-style language like "omg", "literally", "so good", "love this", "obsessed", "no way", "that's crazy", "i can't even", "best thing ever", "literally the best", "so obsessed with this", "omg i love this", "literally can't even", "so good omg"

Example girl posting style:
- Fact: "The 'pizza time' line in Spider-Man 2 was completely improvised by Tobey Maguire!"
- Reply: "omg no way! that's literally my favorite line ever"
- Title: "Spider-Man 2 fact"
- Description: "Did you know this? #spiderman #moviefacts #shorts"

`;
		} else {
			accountContext = `

ACCOUNT 1 CONTEXT - NORMAL POSTING STYLE:
You are posting as a regular person who enjoys sharing interesting facts and pop culture moments. Your tone should be:
- Casual and conversational
- Genuinely interested in the topic
- Natural reactions to surprising facts
- Simple, human-like titles without clickbait
- Focus on sharing cool discoveries
- NO girl-style language (no "omg", "literally", "obsessed", etc.)

Example normal posting style:
- Fact: "The 'pizza time' line in Spider-Man 2 was completely improvised by Tobey Maguire!"
- Reply: "That's actually pretty cool"
- Title: "Spider-Man 2 fact"
- Description: "Interesting movie detail #spiderman #facts #shorts"

`;
		}
		
		const response = await openai.createChatCompletion({
			model: "gpt-4o",
			messages: [
				{
					role: "system",
					content: `You are PlotTwistCentralMemes, the ultimate meme fact generator that delivers jaw-dropping, thought-provoking pop-culture twists with sarcastic wit and emotional punch. Your facts must make people stop, think, argue, or feel something — not just scroll by.

The topic is the core of the meme. Every field must revolve around it. Use it to anchor the fact, reply, image search terms, and YouTube metadata.

You always return one single JSON object — no explanations, no intros, no markdown, no commentary. The JSON must follow this exact structure:

{
"fact": "A realistic, surprising, or plot-twist–style pop-culture detail. Must be clever and spark deep thought. Max 180 characters.",
"reply": "A sarcastic, emotionally intelligent, or witty human reaction to the fact. No hashtags, no tags, no @s. Max 120 characters.",
"youtube_title": "A simple, human-like YouTube Shorts title (max 25 characters). Keep it natural and conversational, not clickbait. Examples: 'Spider-Man fact', 'Movie detail', 'Did you know', 'Fun fact about X'. Avoid clickbait phrases like 'You won't believe', 'Wait till the end', 'Don't click this', etc.",
"youtube_description": "A compelling YouTube description (max 200 characters) that includes 2–5 relevant hashtags (#shorts, #viral, #mindblown, #facts, etc). Must be directly about the topic and encourage engagement.",
"image_search_terms": ["Specific search term 1", "Specific search term 2", "Specific search term 3", "Specific search term 4"],
"avatar_search_terms": ["Avatar search term 1", "Avatar search term 2"],
"image_urls": ["Valid JPEG or PNG URL 1", "Valid JPEG or PNG URL 2", "Valid JPEG or PNG URL 3", "Valid JPEG or PNG URL 4"],
"avatar_urls": ["Valid avatar URL 1", "Valid avatar URL 2"],
"handle": "A character-related username starting with @ (e.g., @peterparker, @tonystark, @lukeskywalker, @jon_snow). Should be related to the topic/movie/show. Max 20 characters.",
"name": "A character-related display name (e.g., 'Peter Parker', 'Tony Stark', 'Luke Skywalker', 'Jon Snow'). Should be related to the topic/movie/show. Max 25 characters.",
"tags": ["keyword1", "keyword2", "keyword3"]
}

${accountContext}

CONTROVERSIAL IMAGE SEARCH STRATEGY:

Your primary goal is to find HIGHLY CONTROVERSIAL, DEBATE-SPARKING images that will make people stop scrolling and engage. Think of images that:

1. **Controversial Moments**: Look for the most debated, argued-about scenes, characters, or moments related to the topic
2. **Fan Wars**: Find images that trigger fan debates (e.g., "best version", "worst adaptation", "overrated/underrated")
3. **Plot Twists**: Focus on shocking reveals, unexpected endings, or controversial character decisions
4. **Behind-the-Scenes Drama**: Real-life controversies, casting decisions, director changes, studio interference
5. **Cultural Impact**: Moments that divided audiences, sparked outrage, or became internet memes
6. **Character Controversies**: The most hated/loved characters, problematic scenes, or character assassinations

Image Search Terms Rules:

For image_search_terms, create 4 specific search terms that will find the MOST CONTROVERSIAL images:

1. **ALWAYS include controversial keywords**: "controversial", "debated", "hated", "problematic", "worst", "best", "overrated", "underrated", "shocking", "outrage", "backlash", "fan war", "meme", "viral moment"
2. **Examples**: "Spider-Man 3 most hated scene", "Game of Thrones controversial ending", "The Office Michael Scott problematic", "Star Wars prequels worst moment", "Breaking Bad Walter White villain debate"
3. **Be specific about controversy**: Don't use generic terms - target the exact moment that caused outrage
4. **Focus on debate triggers**: Look for images that will make people argue in the comments
5. **Include exact controversy**: Use the specific controversy name when possible

Avatar Search Terms Rules:

For avatar_search_terms, create 2 search terms specifically for finding controversial avatar/profile picture style images:

1. Include controversial terms like "controversial character", "hated character", "problematic", "debated", "meme face", "viral moment"
2. Examples: "Jar Jar Binks controversial character", "Daenerys Targaryen problematic", "Michael Scott meme face", "Anakin Skywalker hated character"
3. Focus on characters that sparked outrage or became internet memes
4. Prefer characters that divided fan opinions or became controversial

Image URL rules:

You must return exactly 4 working image URLs in the image_urls array and 2 avatar URLs in avatar_urls array

Each must be a direct link to a .jpg or .png file

Both must visibly display a full image when pasted directly into a browser

URLs must not redirect, download, error, or render a webpage instead of an image

Avoid the following domains unless explicitly verified visually:
m.media-amazon.com, upload.wikimedia.org, static.wikia.nocookie.net, starwars-visualguide.com, hdqwalls.com, deviantart.com, pinterest.com, phonearena.com, fandom.com

Do NOT return links to:
webpages, news articles, blog posts, product pages, or any site requiring cookies, JS rendering, or login

Validation process:

Perform an HTTP HEAD request — must return 200 OK and Content-Type of image/jpeg or image/png

Paste the URL into a browser. If the image doesn't load clearly — discard it

Try up to 5 candidates. If you can't get 2 valid URLs, return this exact object:

{
"error": "unable_to_find_valid_images"
}

Tags:

Return 3–5 total tags

All lowercase

No leading #, punctuation, or spaces

Must include a mix of broad, niche, and post-specific keywords

No duplicates

Output rules:

Always return either:

One complete 9-field JSON object, or

The exact error JSON above

Never return markdown, explanations, partials, or extra commentary. JSON only.
`
				},
				{
					role: "user",
					content: `Generate a plot twist meme about: ${topic}

IMPORTANT: Focus on finding the MOST CONTROVERSIAL, DEBATE-SPARKING aspects of this topic. Look for:
- The most hated/loved moments
- Fan war triggers
- Problematic scenes or characters
- Shocking plot twists that divided audiences
- Behind-the-scenes drama
- Viral moments that sparked outrage

Make the image search terms target these controversial elements specifically.`
				}
			],
			temperature: 0.8,
			max_tokens: 1000
		});

		const content = response.data.choices[0].message.content;
		
		// Log the raw GPT response for debugging
		console.log('[DEBUG] Raw PlotTwistCentralMemes response:', content);
		console.log('[DEBUG] Response model used:', response.data.model);
		console.log('[DEBUG] Response usage:', response.data.usage);
		
		// Try to parse as JSON - the new GPT should return clean JSON
		try {
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				
				// Validate the new structure
				const requiredFields = ['fact', 'reply', 'youtube_title', 'youtube_description', 'image_search_terms', 'avatar_search_terms', 'image_urls', 'avatar_urls', 'handle', 'name', 'tags'];
				const missingFields = requiredFields.filter(field => !parsed[field]);
				
				if (missingFields.length > 0) {
					console.log(`[DEBUG] Missing required fields: ${missingFields.join(', ')}`);
					throw new Error('Invalid response structure');
				}
				
				// Validate array lengths
				if (!Array.isArray(parsed.image_search_terms) || parsed.image_search_terms.length < 2) {
					console.log('[DEBUG] image_search_terms must be at least 2 items');
					throw new Error('Invalid image_search_terms length');
				}
				
				if (!Array.isArray(parsed.avatar_search_terms) || parsed.avatar_search_terms.length < 1) {
					console.log('[DEBUG] avatar_search_terms must be at least 1 item');
					throw new Error('Invalid avatar_search_terms length');
				}
				
				if (!Array.isArray(parsed.image_urls) || parsed.image_urls.length < 2) {
					console.log('[DEBUG] image_urls must be at least 2 items');
					throw new Error('Invalid image_urls length');
				}
				
				if (!Array.isArray(parsed.avatar_urls) || parsed.avatar_urls.length < 1) {
					console.log('[DEBUG] avatar_urls must be at least 1 item');
					throw new Error('Invalid avatar_urls length');
				}
				
				if (!Array.isArray(parsed.tags) || parsed.tags.length < 3 || parsed.tags.length > 5) {
					console.log('[DEBUG] tags must be 3-5 items');
					throw new Error('Invalid tags length');
				}
				
				console.log('[DEBUG] PlotTwistCentralMemes response validated:', parsed);
				return parsed;
			}
		} catch (e) {
			console.log('[DEBUG] Could not parse PlotTwistCentralMemes JSON:', e.message);
		}

		// Fallback response matching new structure - dynamically based on topic
		const fallbackContent = {
			"Spider-Man": {
				fact: "The 'pizza time' line in Spider-Man 2 was completely improvised by Tobey Maguire — it wasn't in the script at all.",
				reply: accountNumber === 2 ? "omg no way! that's literally my favorite line ever" : "That's actually pretty cool",
				youtube_title: "Spider-Man 2 fact",
				youtube_description: "Did you know this? #spiderman #moviefacts #shorts",
				image_search_terms: [
					"Spider-Man 2 movie poster",
					"Spider-Man 2 pizza scene",
					"Tobey Maguire Spider-Man character",
					"Spider-Man 2 official still"
				],
				avatar_search_terms: [
					"Spider-Man avatar",
					"Tobey Maguire headshot"
				],
				image_urls: [
					"https://www.movieinsider.com/images/p/1/spider-man-2-2004-1.jpg",
					"https://www.movieinsider.com/images/p/1/spider-man-2-2004-2.jpg",
					"https://www.movieinsider.com/images/p/1/spider-man-2-2004-3.jpg",
					"https://www.movieinsider.com/images/p/1/spider-man-2-2004-4.jpg"
				],
				avatar_urls: [
					"https://example.com/spiderman-avatar.jpg",
					"https://example.com/tobey-headshot.jpg"
				],
				tags: ["spiderman", "tobeymaguire", "pizzatime", "unscripted", "moviefacts"]
			},
			"default": {
				fact: `Did you know? ${topic} has a surprising detail that's really interesting!`,
				reply: accountNumber === 2 ? "omg that's so cool! love learning new things" : "That's actually pretty interesting",
				youtube_title: `${topic} fact`,
				youtube_description: `Interesting fact about ${topic}! #shorts #facts #viral`,
				image_search_terms: [
					`${topic} movie poster`,
					`${topic} official scene`,
					`${topic} character still`,
					`${topic} film screenshot`
				],
				avatar_search_terms: [
					`${topic} avatar`,
					`${topic} character face`
				],
				image_urls: [
					"https://example.com/placeholder1.jpg",
					"https://example.com/placeholder2.jpg",
					"https://example.com/placeholder3.jpg",
					"https://example.com/placeholder4.jpg"
				],
				avatar_urls: [
					"https://example.com/avatar1.jpg",
					"https://example.com/avatar2.jpg"
				],
				tags: [topic.toLowerCase().replace(/\s+/g, ''), "facts", "viral", "interesting"]
			}
		};
		
		const result = fallbackContent[topic] || fallbackContent["default"];

		console.log('[DEBUG] PlotTwistCentralMemes fallback response:', result);
		return result;
	} catch (error) {
		console.error('[PlotTwistCentralMemes] Error:', error.message);
		throw error;
	}
}

function parseStartDate(input) {
	const now = new Date();
	if (input.toLowerCase() === 'tomorrow') {
		const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
		return d;
	}
	if (/^\d{1,2}-\d{1,2}$/.test(input)) {
		// MM-DD or M-D
		const [month, day] = input.split('-').map(Number);
		return new Date(now.getFullYear(), month - 1, day, 9, 0, 0);
	}
	if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(input)) {
		// YYYY-MM-DD
		return new Date(input + 'T09:00:00');
	}
	if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}/.test(input)) {
		// YYYY-MM-DDTHH:mm
		return new Date(input);
	}
	// fallback: try Date constructor
	return new Date(input);
}

async function scheduleMultiplePosts(startDateInput, numPosts, spacingHours, topic, account) {
	const startDate = parseStartDate(startDateInput);
	if (isNaN(startDate.getTime())) {
		console.error('[Batch] Invalid start date:', startDateInput);
		return;
	}
	console.log(`[Batch] Scheduling ${numPosts} posts starting at ${startDate.toISOString()} every ${spacingHours} hours for topic "${topic}" (account ${account})`);
	for (let i = 0; i < numPosts; i++) {
		const scheduledDate = new Date(startDate.getTime() + i * spacingHours * 60 * 60 * 1000);
		console.log(`[Batch] Post ${i+1}: Scheduled for ${scheduledDate.toISOString()}`);
		await main(topic, scheduledDate.toISOString(), account, true); // pass scheduled time
	}
	console.log('[Batch] All scheduled posts complete.');
}

// CLI flag --batch-schedule=startDate,numPosts,spacingHours,topic[,account]
const batchArg = args.find(arg => arg.startsWith('--batch-schedule='));
if (batchArg) {
	const params = batchArg.split('=')[1].split(',');
	if (params.length < 4) {
		console.error('[Batch] Usage: --batch-schedule=startDate,numPosts,spacingHours,topic[,account]');
		process.exit(1);
	}
	const [startDateInput, numPostsStr, spacingHoursStr, ...rest] = params;
	let account = 1;
	let topicParts = rest;
	if (rest.length > 1 && !isNaN(Number(rest[rest.length - 1]))) {
		account = Number(rest[rest.length - 1]);
		topicParts = rest.slice(0, -1);
	}
	const topic = topicParts.join(' ');
	scheduleMultiplePosts(startDateInput, Number(numPostsStr), Number(spacingHoursStr), topic, account).then(() => process.exit(0));
}

// Helper to get random element from array
function getRandomElement(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to generate a random handle and name
function generateRandomHandleAndName() {
	const firstNames = [
		'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Blake', 'Cameron',
		'Drew', 'Emery', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jamie', 'Kendall', 'Logan', 'Mason',
		'Noah', 'Oakley', 'Parker', 'Quinn', 'River', 'Sage', 'Tatum', 'Unity', 'Vale', 'Winter'
	];
	
	const lastNames = [
		'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
		'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
		'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
	];
	
	const suffixes = [
		'x', 'z', 'q', 'v', 'w', 'y', 'official', 'real', 'tv', 'vibes', 'mood', 'energy', 'vault', 'zone'
	];
	
	const numbers = [
		'', '123', '456', '789', '2024', '2025', '99', '88', '77', '66', '55', '44', '33', '22', '11'
	];
	
	const name = `${getRandomElement(firstNames)} ${getRandomElement(lastNames)}`;
	const suffix = getRandomElement(suffixes);
	const number = getRandomElement(numbers);
	
	// Create realistic handle patterns
	const handlePatterns = [
		`@${name.toLowerCase().replace(/\s+/g, '')}${number}`,
		`@${name.toLowerCase().replace(/\s+/g, '.')}${number}`,
		`@${name.toLowerCase().replace(/\s+/g, '_')}${number}`,
		`@${name.split(' ')[0].toLowerCase()}${name.split(' ')[1].toLowerCase()}${number}`,
		`@${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}${number}`,
		`@${name.split(' ')[0].toLowerCase()}_${name.split(' ')[1].toLowerCase()}${number}`,
		`@${name.split(' ')[0].toLowerCase()}${suffix}${number}`,
		`@${name.split(' ')[1].toLowerCase()}${suffix}${number}`,
		`@${name.toLowerCase().replace(/\s+/g, '')}${suffix}${number}`
	];
	
	const handle = getRandomElement(handlePatterns);
	return { name, handle };
}

// Helper: create placeholder image buffer
async function createPlaceholderImageBuffer(width, height, text) {
	const svg = `
		<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
			<rect width="100%" height="100%" fill="#f0f0f0"/>
			<rect x="2" y="2" width="${width-4}" height="${height-4}" fill="#e0e0e0" stroke="#ccc" stroke-width="2"/>
			<text x="${width/2}" y="${height/2}" font-family="Arial, sans-serif" font-size="16" fill="#666" text-anchor="middle" dominant-baseline="middle">${text}</text>
		</svg>
	`;
	return Buffer.from(svg);
}

// Helper: get all SVG templates
function getAllSvgTemplates() {
	const files = fs.readdirSync('./templates');
	return files.filter(f => f.match(/^template\d+\.svg$/i));
}

// Helper: load and render a meme using a specific SVG template
async function renderSvgTemplate({ templateNum, images, avatar, fact, reply, handle, name, outputPath, overlayPath }) {
	try {
		console.log(`[SVG Template] Processing template${templateNum}.svg`);
		const svgFile = `./templates/template${templateNum}.svg`;
		
		if (!fs.existsSync(svgFile)) {
			throw new Error(`SVG template file not found: ${svgFile}`);
		}
		
		const svgContent = fs.readFileSync(svgFile, 'utf8');
		const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
		const doc = dom.window.document;

		// Handle image placeholders in two ways:
		// 1. Replace <image> elements with placeholder hrefs like {image1_here}
		const imageElements = Array.from(doc.querySelectorAll('image'));
		let imgIdx = 0;
		for (const imageElement of imageElements) {
			const href = imageElement.getAttribute('href');
			if (href && (href.includes('{image1_here}') || href.includes('{image2_here}'))) {
				const x = parseInt(imageElement.getAttribute('x') || '0');
				const y = parseInt(imageElement.getAttribute('y') || '0');
				const width = parseInt(imageElement.getAttribute('width'));
				const height = parseInt(imageElement.getAttribute('height'));
				
				if (width && height) {
					// Remove the image element, we'll composite the real image later
					imageElement.parentNode.removeChild(imageElement);
					
					// Assign image data
					if (!images[imgIdx]) {
						images[imgIdx] = { url: null, x, y, width, height };
					} else {
						images[imgIdx] = { ...images[imgIdx], x, y, width, height };
					}
					imgIdx++;
				}
			}
		}

		// 2. Replace <rect> elements with fill="#CACACA" (legacy support)
		const rects = Array.from(doc.querySelectorAll('rect'));
		for (const rect of rects) {
			const fill = rect.getAttribute('fill');
			if (fill && (fill === '#CACACA' || fill === '#D1CBCB')) {
				const x = parseInt(rect.getAttribute('x') || '0');
				const y = parseInt(rect.getAttribute('y') || '0');
				const width = parseInt(rect.getAttribute('width'));
				const height = parseInt(rect.getAttribute('height'));
				if (width && height) {
					// Remove the rect, we'll composite the image later
					rect.parentNode.removeChild(rect);
					// Create placeholder image if no image provided
					if (!images[imgIdx]) {
						images[imgIdx] = { url: null, x, y, width, height };
					} else {
						images[imgIdx] = { ...images[imgIdx], x, y, width, height };
					}
					imgIdx++;
				}
			}
		}
		
		// Handle background overlay replacement - replace #878787 with account-specific overlay
		const backgroundRects = Array.from(doc.querySelectorAll('rect'));
		let backgroundOverlay = null;
		for (const rect of backgroundRects) {
			const fill = rect.getAttribute('fill');
			if (fill && fill === '#878787') {
				const width = parseInt(rect.getAttribute('width') || '1080');
				const height = parseInt(rect.getAttribute('height') || '1920');
				const x = parseInt(rect.getAttribute('x') || '0');
				const y = parseInt(rect.getAttribute('y') || '0');
				
				// Remove the background rect, we'll composite the overlay later
				rect.parentNode.removeChild(rect);
				
				// Store background overlay info
				if (overlayPath) {
					backgroundOverlay = { url: overlayPath, x, y, width, height };
				}
			}
		}

		// Handle avatar circle placeholder - use overlay as avatar too
		const circles = Array.from(doc.querySelectorAll('circle'));
		let avatarOverlay = null;
		for (const circle of circles) {
			const fill = circle.getAttribute('fill');
			if (fill && fill === '#D1CBCB') {
				const cx = parseInt(circle.getAttribute('cx') || '0');
				const cy = parseInt(circle.getAttribute('cy') || '0');
				const r = parseInt(circle.getAttribute('r') || '54');
				
				// Remove the circle, we'll composite the avatar later
				circle.parentNode.removeChild(circle);
				
				// Use overlay as avatar (same as background)
				if (overlayPath) {
					avatarOverlay = { url: overlayPath, x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
				}
			}
		}

		// Replace standardized text placeholders
		const textElements = Array.from(doc.querySelectorAll('text, tspan'));
		for (const textElement of textElements) {
			let textContent = textElement.textContent;
			let wasChanged = false;
			
			// Replace standardized placeholders
			if (textContent.includes('{fact_here}')) {
				textContent = textContent.replace(/\{fact_here\}/g, fact);
				wasChanged = true;
			}
			if (textContent.includes('{reply_here}')) {
				textContent = textContent.replace(/\{reply_here\}/g, reply);
				wasChanged = true;
			}
			if (textContent.includes('{username_here}')) {
				textContent = textContent.replace(/\{username_here\}/g, name);
				wasChanged = true;
			}
			if (textContent.includes('{handle_here}')) {
				textContent = textContent.replace(/\{handle_here\}/g, handle);
				wasChanged = true;
			}
			
			// Also support legacy placeholders for backward compatibility
			if (textContent.includes('{fact here}') || textContent.includes('{FACT_HERE}')) {
				textContent = textContent.replace(/\{fact here\}/gi, fact);
				wasChanged = true;
			}
			if (textContent.includes('{reply here}') || textContent.includes('{REPLY_HERE}')) {
				textContent = textContent.replace(/\{reply here\}/gi, reply);
				wasChanged = true;
			}
			if (textContent.includes('{username_here}') || textContent.includes('{USERNAME_HERE}')) {
				textContent = textContent.replace(/\{username_here\}/gi, name);
				wasChanged = true;
			}
			if (textContent.includes('{handle_here}') || textContent.includes('{HANDLE_HERE}')) {
				textContent = textContent.replace(/\{handle_here\}/gi, handle);
				wasChanged = true;
			}
			
			// Legacy placeholder format
			if (textContent.includes('FACT_PLACEHOLDER')) {
				textContent = textContent.replace('FACT_PLACEHOLDER', fact);
				wasChanged = true;
			}
			if (textContent.includes('REPLY_PLACEHOLDER')) {
				textContent = textContent.replace('REPLY_PLACEHOLDER', reply);
				wasChanged = true;
			}
			if (textContent.includes('HANDLE_PLACEHOLDER')) {
				textContent = textContent.replace('HANDLE_PLACEHOLDER', handle);
				wasChanged = true;
			}
			if (textContent.includes('NAME_PLACEHOLDER')) {
				textContent = textContent.replace('NAME_PLACEHOLDER', name);
				wasChanged = true;
			}
			
			// Update the text content if it was changed
			if (wasChanged) {
				textElement.textContent = textContent;
			}
		}

		// Handle text wrapping for long content
		for (const textElement of textElements) {
			const textContent = textElement.textContent;
			if (textContent.length > 120) { // Only wrap very long text
				const x = parseInt(textElement.getAttribute('x') || '0');
				const y = parseInt(textElement.getAttribute('y') || '0');
				const fontSize = parseInt(textElement.getAttribute('font-size') || '24');
				const fontFamily = textElement.getAttribute('font-family') || 'Arial, sans-serif';
				const fontWeight = textElement.getAttribute('font-weight') || 'normal';
				const fill = textElement.getAttribute('fill') || 'black';
				const textAnchor = textElement.getAttribute('text-anchor') || 'start';
				
				// Remove the original text element
				textElement.remove();
				
				// Create wrapped text with proper centering
				const maxWidth = 750; // Adjust based on your layout to fit in white boxes
				const lineHeight = fontSize * 1.2;
				const words = textContent.split(' ');
				let currentLine = '';
				let currentY = y;
				const lines = [];
				
				for (const word of words) {
					const testLine = currentLine + (currentLine ? ' ' : '') + word;
					if (testLine.length * (fontSize * 0.55) > maxWidth && currentLine) {
						lines.push(currentLine);
						currentLine = word;
					} else {
						currentLine = testLine;
					}
				}
				
				// Add the last line
				if (currentLine) {
					lines.push(currentLine);
				}
				
				// Limit to 3 lines max to fit in white areas
				if (lines.length > 3) {
					lines.splice(3);
					lines[2] = lines[2] + '...';
				}
				
				// Add all lines with proper spacing
				for (let i = 0; i < lines.length; i++) {
					const lineElement = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
					lineElement.setAttribute('x', x);
					lineElement.setAttribute('y', currentY);
					lineElement.setAttribute('font-family', fontFamily);
					lineElement.setAttribute('font-size', fontSize);
					lineElement.setAttribute('font-weight', fontWeight);
					lineElement.setAttribute('fill', fill);
					lineElement.setAttribute('text-anchor', textAnchor);
					lineElement.setAttribute('dominant-baseline', 'hanging');
					lineElement.textContent = lines[i];
					doc.documentElement.appendChild(lineElement);
					
					currentY += lineHeight;
				}
			}
		}

		// Save the modified SVG to a temp file
		const tempSvg = outputPath.replace(/\.png$/, '.svg');
		fs.writeFileSync(tempSvg, doc.documentElement.outerHTML);

		// Render SVG to PNG
		let sharpPipeline = sharp(tempSvg).resize(1080, 1920);

		// Composite images into the PNG
		const composites = [];
		
		// First, add background overlay if present
		if (backgroundOverlay) {
			let bgBuf;
			try {
				bgBuf = await fs.promises.readFile(backgroundOverlay.url);
				bgBuf = await sharp(bgBuf).resize(backgroundOverlay.width, backgroundOverlay.height).toBuffer();
				composites.push({ input: bgBuf, top: backgroundOverlay.y, left: backgroundOverlay.x });
				console.log(`[SVG Template] Added background overlay: ${backgroundOverlay.url}`);
			} catch (error) {
				console.log(`[SVG Template] Failed to load background overlay ${backgroundOverlay.url}: ${error.message}`);
			}
		}
		
		// Add regular images
		for (const img of images) {
			if (img && img.x !== undefined && img.width && img.height) {
				let imgBuf;
				if (img.buffer) {
					// Use cached buffer
					imgBuf = img.buffer;
				} else if (img.url && img.url.startsWith('http')) {
					// Download if not cached with better error handling
					try {
						const resp = await axios.get(img.url, { 
							responseType: 'arraybuffer',
							timeout: 15000,
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
							}
						});
						imgBuf = Buffer.from(resp.data);
					} catch (downloadError) {
						console.log(`[SVG Template] Failed to download image ${img.url}: ${downloadError.message}`);
						// Create placeholder image instead
						imgBuf = await createPlaceholderImageBuffer(img.width, img.height, 'Image Placeholder');
					}
				} else if (img.url) {
					// Local file
					try {
						imgBuf = await fs.promises.readFile(img.url);
					} catch (error) {
						console.log(`[SVG Template] Failed to read local image ${img.url}: ${error.message}`);
						// Create placeholder image instead
						imgBuf = await createPlaceholderImageBuffer(img.width, img.height, 'Image Placeholder');
					}
				} else {
					// No image provided, create placeholder
					imgBuf = await createPlaceholderImageBuffer(img.width, img.height, 'Image Placeholder');
				}
				
				// Ensure width and height are valid numbers
				const width = parseInt(img.width);
				const height = parseInt(img.height);
				if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
					console.log(`[SVG Template] Invalid dimensions for image: ${img.url}, skipping`);
					continue;
				}
				
				imgBuf = await sharp(imgBuf).resize(width, height).toBuffer();
				composites.push({ input: imgBuf, top: img.y, left: img.x });
			}
		}
		// Add avatar overlay (circular, using the same overlay as background)
		if (avatarOverlay) {
			let avatarBuf;
			try {
				avatarBuf = await fs.promises.readFile(avatarOverlay.url);
				
				// Make the avatar circular
				const size = Math.min(avatarOverlay.width, avatarOverlay.height);
				avatarBuf = await sharp(avatarBuf)
					.resize(size, size)
					.composite([
						{
							input: Buffer.from(`<svg width='${size}' height='${size}'><circle cx='${size/2}' cy='${size/2}' r='${size/2}' fill='white'/></svg>`),
							blend: 'dest-in'
						}
					])
					.png()
					.toBuffer();
				composites.push({ input: avatarBuf, top: avatarOverlay.y, left: avatarOverlay.x });
				console.log(`[SVG Template] Added avatar overlay: ${avatarOverlay.url}`);
			} catch (error) {
				console.log(`[SVG Template] Failed to load avatar overlay ${avatarOverlay.url}: ${error.message}`);
			}
		}

		// Create the final composition with proper layering
		// Strategy: Start with background overlay, then add SVG content, then other images
		
		let baseComposition;
		const allComposites = [];
		
		// Step 1: Start with background overlay as base if it exists
		if (backgroundOverlay) {
			try {
				const bgBuffer = await fs.promises.readFile(backgroundOverlay.url);
				baseComposition = sharp(bgBuffer).resize(1080, 1920);
				console.log(`[SVG Template] Using background overlay as base: ${backgroundOverlay.url}`);
			} catch (error) {
				console.log(`[SVG Template] Failed to load background overlay, using SVG as base: ${error.message}`);
				baseComposition = sharp(tempSvg).resize(1080, 1920);
			}
		} else {
			// No background overlay, use SVG as base
			baseComposition = sharp(tempSvg).resize(1080, 1920);
		}
		
		// Step 2: Add SVG content (white containers and text) on top of background
		if (backgroundOverlay) {
			const svgBuffer = await sharp(tempSvg).resize(1080, 1920).png().toBuffer();
			allComposites.push({ input: svgBuffer, top: 0, left: 0, blend: 'over' });
		}
		
		// Step 3: Add regular images (excluding background overlay which we already used)
		for (const composite of composites) {
			// Skip the background overlay since we already used it as base
			if (backgroundOverlay && composite.input && composite.top === 0 && composite.left === 0) {
				continue;
			}
			allComposites.push(composite);
		}
		
		// Step 4: Apply all composites
		if (allComposites.length > 0) {
			await baseComposition
				.composite(allComposites)
				.png()
				.toFile(outputPath);
		} else {
			// No composites, just render the base
			await baseComposition
				.png()
				.toFile(outputPath);
		}
		
		console.log(`[SVG Template] Successfully rendered template${templateNum} to ${outputPath}`);
	} catch (error) {
		console.error(`[SVG Template] Error processing template${templateNum}:`, error.message);
		throw error;
	}
}

// Generate videos for all accounts with the same content
async function generateForAllAccounts(topic, scheduledPublishDate, isBatchMode = false) {
	console.log('🎬 Generating videos for all accounts...');
	
	// Get content once for all accounts
	const { fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, handle, name, tags } = await getFactAndWittyReply(topic, 1);
	console.log(`\n📝 Fact: ${fact}\n💬 Witty reply: ${reply}\n📺 YouTube Title: ${youtube_title}\n📝 YouTube Description: ${youtube_description}`);

	// Create date-based output folder structure
	const now = new Date();
	const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD format
	const timeString = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14); // YYYYMMDDHHMMSS format
	const sanitizedTitle = sanitizeFilename(youtube_title);
	const baseRunFolder = `./output/${dateFolder}/${sanitizedTitle}_${timeString}`;
	
	// Save the full ChatGPT response as JSON in the output folder
	const gptResponsePath = `${baseRunFolder}/gpt_response.json`;
	if (!fs.existsSync(baseRunFolder)) fs.mkdirSync(baseRunFolder, { recursive: true });
	fs.writeFileSync(gptResponsePath, JSON.stringify({ fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, tags }, null, 2));

	// Use the image URLs provided by GPT - they're already perfect and relevant!
	let finalImageUrls = [null, null];
	console.log(`[DEBUG] GPT provided ${image_urls ? image_urls.length : 0} image URLs and ${image_search_terms ? image_search_terms.length : 0} search terms`);
	
	// Use the first two image URLs from GPT response
	if (image_urls && image_urls.length >= 2) {
		finalImageUrls = [image_urls[0], image_urls[1]];
		console.log('[DEBUG] Using GPT-provided image URLs:', finalImageUrls);
	} else if (image_urls && image_urls.length === 1) {
		finalImageUrls = [image_urls[0], null];
		console.log('[DEBUG] Using 1 GPT-provided image URL:', finalImageUrls[0]);
	} else {
		console.log('[DEBUG] No GPT image URLs available, using placeholders');
		finalImageUrls = [null, null]; // null means use placeholder
	}

	// Force template2 for testing
	const selectedTemplate = 'svg2';
	console.log(`[Template] Using template: ${selectedTemplate} (forced for testing)`);

	// Generate for each account
	const accounts = [1, 2, 3];
	const results = [];

	for (const accountNum of accounts) {
		console.log(`\n🎬 Generating for Account ${accountNum}...`);
		
		try {
			// Create account-specific folder
			const accountRunFolder = `${baseRunFolder}/account_${accountNum}`;
			if (!fs.existsSync(accountRunFolder)) fs.mkdirSync(accountRunFolder, { recursive: true });
			
			// Get account-specific overlay
			const overlayPath = getRandomOverlay(accountNum);
			console.log(`[DEBUG] Using overlay for account ${accountNum}: ${overlayPath}`);

			// Get account-specific content (different handle/name/avatar/images for each account)
			const accountContent = await getFactAndWittyReply(topic, accountNum);
			const characterName = accountContent.name || 'Character Name';
			const characterHandle = accountContent.handle || '@character';
			// Use account-specific images and avatar
			let accountImageUrls = [null, null];
			if (accountContent.image_urls && accountContent.image_urls.length >= 2) {
				accountImageUrls = [accountContent.image_urls[0], accountContent.image_urls[1]];
			} else if (accountContent.image_urls && accountContent.image_urls.length === 1) {
				accountImageUrls = [accountContent.image_urls[0], null];
			}
			// Fix avatar handling - ensure it's a string URL or null
			let accountAvatar = null;
			if (accountContent.avatar_urls && accountContent.avatar_urls[0] && typeof accountContent.avatar_urls[0] === 'string') {
				accountAvatar = accountContent.avatar_urls[0];
			}

			// Define output paths for this account
			const framePath = `${accountRunFolder}/frame.png`;
			const videoPath = `${accountRunFolder}/video.mp4`;
			const debugSvgPath = `${accountRunFolder}/debug_text.svg`;

			console.log('🎨 Generating template with images:', accountImageUrls);
			console.log('🎨 Using avatar:', accountAvatar);
			
			try {
				if (typeof selectedTemplate === 'string' && selectedTemplate.startsWith('svg')) {
					const templateNum = selectedTemplate.replace('svg', '');
					await renderSvgTemplate({
						templateNum,
						images: [
							{ url: accountImageUrls[0] },
							{ url: accountImageUrls[1] }
						],
						avatar: accountAvatar,
						fact: accountContent.fact,
						reply: accountContent.reply,
						handle: characterHandle,
						name: characterName,
						outputPath: framePath,
						overlayPath: overlayPath
					});
					console.log(`✅ SVG template generation completed for account ${accountNum}!`);
				} else {
					await selectedTemplate({
						overlayPath: overlayPath,
						image1: accountImageUrls[0],
						image2: accountImageUrls[1],
						fact: accountContent.fact,
						reply: accountContent.reply,
						outputPath: framePath,
						debugSvgPath,
						avatarPath: overlayPath, // Use overlay as avatar background
						handle: characterHandle,
						name: characterName
					});
					console.log(`✅ Template generation completed for account ${accountNum}!`);
				}
			} catch (templateError) {
				console.error(`❌ Template generation failed for account ${accountNum}:`, templateError.message);
				results.push({ account: accountNum, success: false, error: templateError.message });
				continue;
			}

			console.log('🎥 Creating video...');
			try {
				await createVideo(framePath, videoPath);
				console.log(`✅ Video creation completed for account ${accountNum}!`);
			} catch (videoError) {
				console.error(`❌ Video creation failed for account ${accountNum}:`, videoError.message);
				results.push({ account: accountNum, success: false, error: videoError.message });
				continue;
			}

			// Upload to YouTube if not in batch mode
			if (!isBatchMode) {
				try {
					console.log(`📺 Uploading to YouTube for account ${accountNum}...`);
					await uploadAndScheduleYouTubeShort(
						videoPath,
						youtube_title,
						youtube_description,
						scheduledPublishDate,
						accountNum
					);
					console.log(`✅ YouTube upload completed for account ${accountNum}!`);
				} catch (uploadError) {
					console.error(`❌ YouTube upload failed for account ${accountNum}:`, uploadError.message);
				}
			}

			results.push({ 
				account: accountNum, 
				success: true, 
				framePath, 
				videoPath, 
				overlayPath 
			});

			console.log(`🎉 Account ${accountNum} complete!`);
			console.log(`📁 Output files:`);
			console.log(`   - ${framePath} (composed image)`);
			console.log(`   - ${videoPath} (final video)`);
			console.log(`   - ${debugSvgPath} (debug SVG)`);

		} catch (error) {
			console.error(`❌ Failed to generate for account ${accountNum}:`, error.message);
			results.push({ account: accountNum, success: false, error: error.message });
		}
	}

	// Summary
	console.log('\n📊 Generation Summary:');
	const successful = results.filter(r => r.success);
	const failed = results.filter(r => !r.success);
	
	console.log(`✅ Successful: ${successful.length}/3 accounts`);
	successful.forEach(r => console.log(`   - Account ${r.account}: ${r.videoPath}`));
	
	if (failed.length > 0) {
		console.log(`❌ Failed: ${failed.length}/3 accounts`);
		failed.forEach(r => console.log(`   - Account ${r.account}: ${r.error}`));
	}

	return results;
}

