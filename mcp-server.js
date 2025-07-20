#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import puppeteer from 'puppeteer'
import axios from 'axios'

class ImageScrapingMCPServer {
  constructor () {
    this.server = new Server(
      {
        name: 'image-scraping-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )

    this.setupToolHandlers()
  }

  setupToolHandlers () {
    // Tool: Search for images using multiple engines
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'search_images':
          return await this.searchImages(args)
        case 'validate_image':
          return await this.validateImage(args)
        case 'get_fallback_image':
          return await this.getFallbackImage(args)
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })
  }

  async searchImages ({ query, numImages = 2, engines = ['bing', 'yahoo', 'duckduckgo'] }) {
    console.log(`[MCP] Searching for images: "${query}" using engines: ${engines.join(', ')}`)

    const results = []
    const shuffledEngines = engines.sort(() => Math.random() - 0.5)

    for (const engine of shuffledEngines) {
      try {
        console.log(`[MCP] Trying ${engine} for query: "${query}"`)
        const images = await this.searchEngine(engine, query, numImages)

        if (images && images.length > 0) {
          console.log(`[MCP] ${engine} found ${images.length} images`)
          results.push(...images)

          if (results.length >= numImages) {
            break
          }
        }
      } catch (error) {
        console.warn(`[MCP] ${engine} failed: ${error.message}`)
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            images: results.slice(0, numImages),
            query,
            engines_used: shuffledEngines
          })
        }
      ]
    }
  }

  async searchEngine (engine, query, numImages) {
    const browser = await puppeteer.launch({
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
    })

    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1366, height: 768 })
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Upgrade-Insecure-Requests': '1'
      })

      let searchUrl
      switch (engine) {
        case 'bing':
          searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&tsc=ImageBasicHover`
          break
        case 'yahoo':
          searchUrl = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`
          break
        case 'duckduckgo':
          searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&iar=images&iax=images&ia=images`
          break
        default:
          throw new Error(`Unsupported engine: ${engine}`)
      }

      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      })

      await page.waitForSelector('img', { timeout: 20000 })

      // Scroll to load more images
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => { window.scrollBy(0, window.innerHeight) })
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000))
      }

      const imageData = await page.evaluate(() => {
        const images = []
        const imgElements = document.querySelectorAll('img')

        for (const img of imgElements) {
          const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original')
          if (!src) continue

          const isImageUrl = src.match(/\.(jpg|jpeg|png|gif|webp)/i) ||
                                     src.includes('image') ||
                                     src.includes('img') ||
                                     src.startsWith('data:image') ||
                                     src.includes('bing.com/th') ||
                                     src.includes('yahoo.com/th') ||
                                     src.includes('duckduckgo.com/th')

          if (!isImageUrl) continue

          const width = parseInt(img.getAttribute('width') || img.naturalWidth || img.offsetWidth || '0')
          const height = parseInt(img.getAttribute('height') || img.naturalHeight || img.offsetHeight || '0')

          if (width > 50 && height > 50) {
            images.push({
              url: src,
              width,
              height,
              score: width * height,
              alt: img.getAttribute('alt') || '',
              className: img.className || ''
            })
          }
        }

        return images.sort((a, b) => b.score - a.score)
      })

      return imageData.slice(0, numImages).map(img => img.url)
    } finally {
      await browser.close()
    }
  }

  async validateImage ({ url }) {
    console.log(`[MCP] Validating image: ${url}`)

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      })

      const isValid = response.status === 200 &&
                     response.data &&
                     response.data.byteLength > 1000 &&
                     response.headers['content-type']?.startsWith('image/')

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              valid: isValid,
              url,
              size: response.data?.byteLength || 0,
              contentType: response.headers['content-type'] || 'unknown'
            })
          }
        ]
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              valid: false,
              url,
              error: error.message
            })
          }
        ]
      }
    }
  }

  async getFallbackImage ({ query }) {
    console.log(`[MCP] Getting fallback image for: "${query}"`)

    const fallbackServices = [
      `https://source.unsplash.com/featured/?${encodeURIComponent(query)}`,
      `https://picsum.photos/600/400?random=${Math.floor(Math.random() * 1000)}`,
      `https://picsum.photos/600/400?blur=2&random=${Math.floor(Math.random() * 1000)}`,
      `https://source.unsplash.com/600x400/?${encodeURIComponent(query)}`,
      `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(query.slice(0, 20))}`,
      `https://dummyimage.com/600x400/4facfe/ffffff&text=${encodeURIComponent(query.slice(0, 20))}`
    ]

    for (const fallbackUrl of fallbackServices) {
      try {
        const response = await axios.get(fallbackUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        })

        if (response.status === 200 && response.data && response.data.byteLength > 1000) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  url: fallbackUrl,
                  size: response.data.byteLength,
                  service: 'fallback'
                })
              }
            ]
          }
        }
      } catch (error) {
        console.log(`[MCP] Fallback service failed: ${error.message}`)
      }
    }

    // Guaranteed fallback
    const guaranteedUrl = `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(query.slice(0, 20))}`
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            url: guaranteedUrl,
            service: 'guaranteed_placeholder'
          })
        }
      ]
    }
  }

  async run () {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.log('[MCP] Image scraping server started')
  }
}

// Start the server
const server = new ImageScrapingMCPServer()
server.run().catch(console.error)
