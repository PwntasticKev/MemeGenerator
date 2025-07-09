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
function getRandomTemplate() {
	const idx = Math.floor(Math.random() * templates.length);
	return templates[idx];
}

async function getFactAndWittyReply(topic) {
	try {
		// Assume callCustomGpt is implemented elsewhere to hit your custom GPT endpoint
		const gptResponse = await callCustomGpt(topic);
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
			tags
		};
	} catch (error) {
		console.error('❌ Error getting meme data from custom GPT:', error.message);
		return {
			fact: `Did you know? ${topic} is more interesting than you think!`,
			reply: `Bro, that's wild!`,
			youtube_title: `Amazing ${topic} Facts!`,
			youtube_description: `You won't believe these ${topic} facts! #shorts #viral #facts #mindblown`,
			image_search_terms: [],
			avatar_search_terms: [],
			image_urls: [],
			avatar_urls: [],
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

// Main image scraping logic: try Bing, Yahoo, DuckDuckGo in random order for each slot
export async function getScrapedImageForTerm(term) {
    const engines = [
        searchBingImagesPuppeteer,
        searchYahooImagesPuppeteer,
        searchDuckDuckGoImagesPuppeteer
    ];
    const shuffledEngines = engines.sort(() => Math.random() - 0.5);
    
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
    
    // If all engines fail, try a simple fallback approach
    console.log(`[DEBUG] All engines failed for "${term}", trying fallback...`);
    try {
        const fallbackUrl = `https://source.unsplash.com/featured/?${encodeURIComponent(term)}`;
        console.log(`[DEBUG] Trying fallback URL: ${fallbackUrl}`);
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
        console.log(`[DEBUG] Fallback failed: ${e.message}`);
    }
    
    return null;
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

function getRandomOverlay() {
	const overlayDir = './assets';
	const files = fs.readdirSync(overlayDir);
	const overlays = files.filter(f => f.startsWith('mainoverlay_') && (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')));
	if (overlays.length === 0) return './assets/overlay.png';
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

Options:
  --font-size=<number>    Font size in pixels (default: 48)
  --text-color=<color>    Text color (default: white)
  --username=<string>     Username to display (default: @memecreator)
  --handle=<string>       Handle/display name (default: Meme Creator)
  --image-url=<url>       Custom image URL (optional)
  --skip-review           Skip image approval process (auto-approve all images)
  --no-review             Alias for --skip-review

Examples:
  node scripts/generateMeme.js --font-size=60 --text-color=yellow
  node scripts/generateMeme.js --username="@kevinlee" --handle="Kevin Lee"
  node scripts/generateMeme.js --skip-review
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
		const overlayPath = getRandomOverlay();
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

		// Template selection (only in interactive mode)
		let selectedTemplate;
		if (!isBatchMode && !skipReview) {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			const templatePrompt = `\nSelect template (1-1, default: 1): `;
			const templateAnswer = await new Promise(resolve => {
				rl.question(templatePrompt, answer => {
					rl.close();
					const parsed = parseInt(answer.trim());
					if (!isNaN(parsed) && parsed === 1) {
						resolve(parsed);
					} else {
						resolve(1); // Default to template 1
					}
				});
			});
			selectedTemplate = getTemplateByIndex(templateAnswer);
			console.log(`[Template] Using template #${templateAnswer}`);
		} else {
			selectedTemplate = getRandomTemplate();
		}

		// Get user input for topic (or use preset topic)
		let topic;
		if (presetTopic) {
			topic = presetTopic;
			console.log(`📝 Using preset topic: ${topic}`);
		} else {
			const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
			topic = await new Promise((resolve) => {
				rl.question('Enter your topic (e.g., "The Godfather", "Mondays", "Yoda"): ', resolve);
			});
			rl.close();
			if (!topic.trim()) {
				console.log('❌ No topic provided. Exiting...');
				return;
			}
		}

		// Get fact, witty reply, YouTube title and description
		const { fact, reply, youtube_title, youtube_description, image_search_terms, avatar_search_terms, image_urls, avatar_urls, tags } = await getFactAndWittyReply(topic);
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

		// Trust your custom GPT's image URLs - they're already perfect and relevant!
		let finalImageUrls = [null, null];
		let usedUrls = new Set();
		console.log(`[DEBUG] GPT provided ${image_urls ? image_urls.length : 0} image URLs and ${image_search_terms ? image_search_terms.length : 0} search terms`);
		let searchTerms = Array.isArray(image_search_terms) ? image_search_terms : [image_search_terms || topic];

		// New image selection logic: always scrape, never duplicate, never use overlay/placeholder
		const getScrapedImageForTermLocal = async (term) => {
			try {
				const scraped = await getScrapedImageForTerm(term);
				if (scraped && scraped !== './assets/overlay.png' && scraped !== overlayPath) {
					return scraped;
				}
			} catch (e) {
				console.log(`[DEBUG] Error scraping for term "${term}":`, e.message);
			}
			return null;
		};

		let scrapedImages = [];
		let usedTerms = new Set();
		let termsToTry = Array.isArray(image_search_terms) ? [...image_search_terms] : [topic];
		termsToTry = termsToTry.filter(Boolean);

		for (let slot = 0; slot < 2; slot++) {
			let found = false;
			let shuffledTerms = termsToTry.sort(() => Math.random() - 0.5);
			for (let term of shuffledTerms) {
				if (usedTerms.has(term)) continue;
				const img = await getScrapedImageForTermLocal(term);
				if (img) {
					scrapedImages[slot] = img;
					usedTerms.add(term);
					found = true;
					break;
				}
			}
			// If not found, try the topic as a fallback
			if (!found && !usedTerms.has(topic)) {
				const img = await getScrapedImageForTermLocal(topic);
				if (img) {
					scrapedImages[slot] = img;
					usedTerms.add(topic);
					found = true;
				}
			}
			if (!found) {
				console.error(`[ERROR] Could not find a real image for slot ${slot+1}. Tried terms: ${shuffledTerms.join(', ')} and topic: ${topic}`);
				throw new Error('Could not find two real images for the meme.');
			}
		}
		finalImageUrls = scrapedImages;
		console.log('[DEBUG] Final image URLs used:', finalImageUrls);
		console.log('[DEBUG] Checking if images are valid before template generation...');
		
		// Overlay path was already initialized earlier
		
		// Verify that we have valid images before proceeding
		for (let i = 0; i < finalImageUrls.length; i++) {
			if (!finalImageUrls[i]) {
				console.log(`[DEBUG] Warning: Image ${i+1} is null/undefined`);
			} else {
				console.log(`[DEBUG] Image ${i+1}: ${finalImageUrls[i]}`);
			}
		}

		// Guarantee both image slots are filled
		if (!finalImageUrls[0] && finalImageUrls[1]) {
			finalImageUrls[0] = finalImageUrls[1];
		} else if (!finalImageUrls[1] && finalImageUrls[0]) {
			finalImageUrls[1] = finalImageUrls[0];
		}
		// If either is still missing, keep retrying with new search terms (up to a reasonable max attempts)
		const MAX_IMAGE_RETRIES = 8;
		let retryCount = 0;
		while ((!finalImageUrls[0] || !finalImageUrls[1]) && retryCount < MAX_IMAGE_RETRIES) {
			for (let slot = 0; slot < 2; slot++) {
				if (!finalImageUrls[slot]) {
					for (let term of searchTerms) {
						try {
							const scraped = await getScrapedImageForTermLocal(term);
							if (scraped && scraped !== overlayPath && scraped !== './assets/overlay.png' && scraped !== finalImageUrls[1-slot]) {
								finalImageUrls[slot] = scraped;
								break;
							}
						} catch (e) {}
					}
				}
			}
			// If still missing, duplicate the valid one as last resort
			if (!finalImageUrls[0] && finalImageUrls[1]) finalImageUrls[0] = finalImageUrls[1];
			if (!finalImageUrls[1] && finalImageUrls[0]) finalImageUrls[1] = finalImageUrls[0];
			retryCount++;
		}
		// After all scraping and validation attempts
		if (!finalImageUrls[0] && finalImageUrls[1]) {
			finalImageUrls[0] = finalImageUrls[1];
		} else if (!finalImageUrls[1] && finalImageUrls[0]) {
			finalImageUrls[1] = finalImageUrls[0];
		}
		// If either slot is still missing or is './assets/overlay.png', duplicate the valid image (never use overlay image)
		for (let slot = 0; slot < 2; slot++) {
			if (!finalImageUrls[slot] || finalImageUrls[slot] === './assets/overlay.png' || finalImageUrls[slot] === overlayPath) {
				const otherSlot = slot === 0 ? 1 : 0;
				if (finalImageUrls[otherSlot] && finalImageUrls[otherSlot] !== './assets/overlay.png' && finalImageUrls[otherSlot] !== overlayPath) {
					finalImageUrls[slot] = finalImageUrls[otherSlot];
				} else {
					throw new Error('Could not find two valid images for the meme.');
				}
			}
		}
		// Final check: if still missing, use guaranteed image function
		for (let slot = 0; slot < 2; slot++) {
			if (!finalImageUrls[slot] || finalImageUrls[slot] === './assets/overlay.png' || finalImageUrls[slot] === overlayPath) {
				console.log(`[DEBUG] Slot ${slot+1} still missing, using guaranteed image function...`);
				const guaranteedImage = await getGuaranteedImage(topic);
				finalImageUrls[slot] = guaranteedImage;
				console.log(`[DEBUG] Slot ${slot+1} now has: ${guaranteedImage}`);
			}
		}
		
		// Final final check: if still missing, throw error (should never happen)
		if (!finalImageUrls[0] || !finalImageUrls[1]) {
			throw new Error('Could not find two valid images for the meme.');
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
		
		// Generate random handle and name for the avatar
		const { name: randomName, handle: randomHandle } = generateRandomHandleAndName();

		console.log('🎨 Generating template with images:', finalImageUrls);
		try {
			await selectedTemplate({
				overlayPath: overlayPath,
				image1: finalImageUrls[0],
				image2: finalImageUrls[1],
				fact,
				reply,
				outputPath: framePath,
				debugSvgPath,
				avatarPath: overlayPath, // Use overlay as avatar background
				handle: randomHandle,
				name: randomName
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

// Run the main function with topic if provided
main(topicArg, null, null, isBatchMode || skipReview);

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
export async function callCustomGpt(topic) {
	try {
		console.log('[DEBUG] Using PlotTwistCentralMemes GPT for topic:', topic);
		
		// Use your PlotTwistCentralMemes custom GPT
		// Custom GPT ID: g-686842445ff48191bc501953dc890a28-meme-gen
		
		// Try using the direct API call to your custom GPT
		// Custom GPTs can be accessed via the beta API
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
"youtube_title": "A punchy, slang-friendly YouTube Shorts title (max 25 characters) that blends clickbait tactics with topic relevance. Use one of the following styles: Don't click this sound, Wait till the end, They did WHAT?, You won't believe this, Don't like this video. Title must feel like a dare, challenge, or twist — not a generic phrase.",
"youtube_description": "A compelling YouTube description (max 200 characters) that includes 2–5 relevant hashtags (#shorts, #viral, #mindblown, #facts, etc). Must be directly about the topic and encourage engagement.",
"image_search_terms": ["Specific search term 1", "Specific search term 2", "Specific search term 3", "Specific search term 4"],
"avatar_search_terms": ["Avatar search term 1", "Avatar search term 2"],
"image_urls": ["Valid JPEG or PNG URL 1", "Valid JPEG or PNG URL 2", "Valid JPEG or PNG URL 3", "Valid JPEG or PNG URL 4"],
"avatar_urls": ["Valid avatar URL 1", "Valid avatar URL 2"],
"tags": ["keyword1", "keyword2", "keyword3"]
}

Image Search Terms Rules:

For image_search_terms, create 4 specific search terms that will find relevant, high-quality images:

1. ALWAYS include "movie", "show", "film", "series", "character", "actor", "actress", "scene", "poster", "still", "screenshot", or "official" in your search terms
2. Examples: "Spider-Man movie poster", "Breaking Bad Walter White scene", "Game of Thrones Jon Snow character", "The Office Michael Scott actor"
3. Be specific about the content - don't use generic terms like "funny" or "meme"
4. Focus on official content, character images, movie posters, or key scenes
5. Include the exact title/name when possible

Avatar Search Terms Rules:

For avatar_search_terms, create 2 search terms specifically for finding avatar/profile picture style images:

1. Include terms like "avatar", "profile picture", "headshot", "portrait", "character face", "actor headshot"
2. Examples: "Spider-Man avatar", "Tony Stark profile picture", "Walter White portrait", "Darth Vader character face"
3. Focus on close-up, portrait-style images that work well as overlays
4. Prefer character faces, actor headshots, or iconic character portraits

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
					content: `Generate a plot twist meme about: ${topic}`
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
				const requiredFields = ['fact', 'reply', 'youtube_title', 'youtube_description', 'image_search_terms', 'avatar_search_terms', 'image_urls', 'avatar_urls', 'tags'];
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
				reply: "Of course he did. That line feeds better than half the MCU.",
				youtube_title: "Don't skip pizza time",
				youtube_description: "That line? Totally unscripted. #shorts #spiderman #pizza #viral #facts",
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
				fact: `Did you know? ${topic} has a surprising plot twist that will blow your mind!`,
				reply: "Wait, what? That changes everything!",
				youtube_title: `${topic} plot twist`,
				youtube_description: `You won't believe this ${topic} fact! #shorts #viral #facts #mindblown`,
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
				tags: [topic.toLowerCase().replace(/\s+/g, ''), "plotwist", "facts", "viral", "mindblown"]
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

