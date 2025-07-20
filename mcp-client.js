import { spawn } from 'child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

class ImageScrapingMCPClient {
  constructor () {
    this.client = null
    this.serverProcess = null
  }

  async connect () {
    if (this.client) {
      return this.client
    }

    // Start the MCP server process
    this.serverProcess = spawn('node', ['mcp-server.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Create transport and client
    const transport = new StdioClientTransport(
      this.serverProcess.stdin,
      this.serverProcess.stdout
    )

    this.client = new Client({
      name: 'image-scraping-client',
      version: '1.0.0'
    })

    await this.client.connect(transport)

    // Handle server process errors
    this.serverProcess.stderr.on('data', (data) => {
      console.log(`[MCP Client] Server stderr: ${data}`)
    })

    this.serverProcess.on('error', (error) => {
      console.error(`[MCP Client] Server process error: ${error.message}`)
    })

    this.serverProcess.on('close', (code) => {
      console.log(`[MCP Client] Server process closed with code ${code}`)
      this.client = null
    })

    console.log('[MCP Client] Connected to image scraping server')
    return this.client
  }

  async disconnect () {
    if (this.serverProcess) {
      this.serverProcess.kill()
      this.serverProcess = null
    }
    this.client = null
    console.log('[MCP Client] Disconnected from image scraping server')
  }

  async searchImages (query, numImages = 2, engines = ['bing', 'yahoo', 'duckduckgo']) {
    try {
      const client = await this.connect()

      const result = await client.callTool({
        name: 'search_images',
        arguments: {
          query,
          numImages,
          engines
        }
      })

      if (result.content && result.content[0] && result.content[0].text) {
        const response = JSON.parse(result.content[0].text)
        return response.images || []
      }

      return []
    } catch (error) {
      console.error(`[MCP Client] Error searching images: ${error.message}`)
      return []
    }
  }

  async validateImage (url) {
    try {
      const client = await this.connect()

      const result = await client.callTool({
        name: 'validate_image',
        arguments: { url }
      })

      if (result.content && result.content[0] && result.content[0].text) {
        const response = JSON.parse(result.content[0].text)
        return response.valid || false
      }

      return false
    } catch (error) {
      console.error(`[MCP Client] Error validating image: ${error.message}`)
      return false
    }
  }

  async getFallbackImage (query) {
    try {
      const client = await this.connect()

      const result = await client.callTool({
        name: 'get_fallback_image',
        arguments: { query }
      })

      if (result.content && result.content[0] && result.content[0].text) {
        const response = JSON.parse(result.content[0].text)
        return response.url || null
      }

      return null
    } catch (error) {
      console.error(`[MCP Client] Error getting fallback image: ${error.message}`)
      return null
    }
  }

  // Enhanced image scraping with MCP - Fallback to direct Puppeteer
  async getScrapedImageForTerm (term) {
    console.log(`[MCP Client] Getting image for term: "${term}"`)

    try {
      // Import the working image scraping functions from the original file
      const { searchBingImagesPuppeteer, searchYahooImagesPuppeteer, searchDuckDuckGoImagesPuppeteer } = await import('./scripts/generateMeme.js')

      // Try search engines directly (bypassing MCP for now)
      const engines = [
        searchBingImagesPuppeteer,
        searchYahooImagesPuppeteer,
        searchDuckDuckGoImagesPuppeteer
      ]

      // Enhanced search variations for better quality and relevance
      const searchVariations = [
        // Premium quality searches (try these first)
        term + ' official movie poster HD',
        term + ' promotional poster high quality',
        term + ' character portrait HD',
        term + ' official still HD',
        term + ' movie scene high quality',
        term + ' character close-up HD',
        term + ' official artwork high quality',
        term + ' movie poster HD',
        term + ' promotional image high quality',
        // Specific character searches
        term + ' character HD',
        term + ' character portrait high quality',
        // Original term variations
        term,
        term.replace('HD', 'high quality'),
        term.replace('high quality', 'HD'),
        // Fallback variations
        term + ' movie',
        term + ' character',
        term.replace(/\s+/g, ' ') + ' official'
      ]

      for (const searchTerm of searchVariations) {
        console.log(`[MCP Client] Trying search variation: "${searchTerm}"`)

        for (const engine of engines) {
          try {
            console.log(`[MCP Client] Trying ${engine.name} for term "${searchTerm}"`)
            const scraped = await engine(searchTerm, 10, 100) // Get more images to try
            console.log(`[MCP Client] ${engine.name} returned ${scraped ? scraped.length : 0} images`)

            if (scraped && scraped.length > 0) {
              // Try to validate multiple images, prioritize higher quality
              for (let i = 0; i < Math.min(scraped.length, 15); i++) {
                const imageUrl = scraped[i]
                console.log(`[MCP Client] Testing image ${i + 1}: ${imageUrl}`)

                try {
                  const axios = await import('axios')
                  const response = await axios.default.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 8000, // Faster timeout
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                      Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
                      'Accept-Language': 'en-US,en;q=0.9',
                      'Cache-Control': 'no-cache'
                    }
                  })

                  if (response.status === 200 && response.data) {
                    const contentType = response.headers['content-type']
                    const contentLength = response.data.byteLength
                    console.log(`[MCP Client] Image response: ${response.status} ${contentType} (${contentLength} bytes)`)

                    if (contentType && (contentType.startsWith('image/') || contentType.includes('image'))) {
                      // Prioritize higher quality images
                      if (contentLength > 10000) { // At least 10KB for premium quality
                        console.log(`[MCP Client] Premium quality image found: ${imageUrl} (${contentType}, ${contentLength} bytes)`)
                        return imageUrl
                      } else if (contentLength > 5000) { // At least 5KB for good quality
                        console.log(`[MCP Client] Good quality image found: ${imageUrl} (${contentType}, ${contentLength} bytes)`)
                        return imageUrl
                      } else if (contentLength > 2000) { // At least 2KB for acceptable quality
                        console.log(`[MCP Client] Acceptable image found: ${imageUrl} (${contentType}, ${contentLength} bytes)`)
                        return imageUrl
                      }
                    }
                  }
                } catch (e) {
                  console.log(`[MCP Client] Image validation failed for ${imageUrl}: ${e.message}`)
                }
              }
            }
          } catch (e) {
            console.warn(`[MCP Client] ${engine.name} failed for term "${searchTerm}":`, e.message)
          }
        }
      }

      // If search engines fail, try reliable fallback services
      console.log('[MCP Client] Search engines failed, trying reliable fallback services...')
      const fallbackServices = [
        `https://source.unsplash.com/featured/?${encodeURIComponent(term)}`,
        `https://picsum.photos/600/400?random=${Math.floor(Math.random() * 1000)}`,
        `https://source.unsplash.com/600x400/?${encodeURIComponent(term)}`
      ]

      for (const fallbackUrl of fallbackServices) {
        try {
          console.log(`[MCP Client] Trying fallback service: ${fallbackUrl}`)
          const axios = await import('axios')
          const response = await axios.default.get(fallbackUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
          })

          if (response.status === 200 && response.data && response.data.byteLength > 1000) {
            console.log(`[MCP Client] Fallback image found: ${fallbackUrl} (${response.data.byteLength} bytes)`)
            return fallbackUrl
          }
        } catch (e) {
          console.log(`[MCP Client] Fallback service failed: ${e.message}`)
        }
      }

      // GUARANTEED fallback: Always return a working placeholder URL
      console.log(`[MCP Client] All fallbacks failed, using GUARANTEED placeholder for "${term}"`)
      const guaranteedPlaceholder = `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(term.slice(0, 20))}`
      console.log(`[MCP Client] GUARANTEED image URL: ${guaranteedPlaceholder}`)
      return guaranteedPlaceholder
    } catch (error) {
      console.error(`[MCP Client] Error in getScrapedImageForTerm: ${error.message}`)

      // Return guaranteed fallback on any error
      const guaranteedUrl = `https://via.placeholder.com/600x400/667eea/ffffff?text=${encodeURIComponent(term.slice(0, 20))}`
      return guaranteedUrl
    }
  }
}

// Export singleton instance
const mcpClient = new ImageScrapingMCPClient()

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[MCP Client] Shutting down...')
  await mcpClient.disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[MCP Client] Shutting down...')
  await mcpClient.disconnect()
  process.exit(0)
})

export default mcpClient
