import mcpClient from '../mcp-client.js'

async function testMCP () {
  console.log('🧪 Testing MCP Image Scraping...\n')

  try {
    // Test 1: Search for images
    console.log('1️⃣ Testing image search...')
    const searchResults = await mcpClient.searchImages('Spider-Man movie poster HD', 2)
    console.log('✅ Search results:', searchResults)

    // Test 2: Validate an image
    if (searchResults.length > 0) {
      console.log('\n2️⃣ Testing image validation...')
      const isValid = await mcpClient.validateImage(searchResults[0])
      console.log('✅ Image validation result:', isValid)
    }

    // Test 3: Get fallback image
    console.log('\n3️⃣ Testing fallback image...')
    const fallbackUrl = await mcpClient.getFallbackImage('test query')
    console.log('✅ Fallback image URL:', fallbackUrl)

    // Test 4: Test the main scraping function
    console.log('\n4️⃣ Testing main scraping function...')
    const imageUrl = await mcpClient.getScrapedImageForTerm('Avengers movie poster HD')
    console.log('✅ Main scraping result:', imageUrl)

    console.log('\n🎉 All MCP tests passed!')
  } catch (error) {
    console.error('❌ MCP test failed:', error.message)
  } finally {
    // Clean up
    await mcpClient.disconnect()
    console.log('\n🔌 MCP client disconnected')
  }
}

// Run the test
testMCP()
