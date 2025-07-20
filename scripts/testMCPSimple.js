import mcpClient from '../mcp-client.js'

async function testMCPSimple () {
  console.log('🧪 Testing MCP Image Scraping (Simple)...\n')

  try {
    // Test the main scraping function with a simple query
    console.log('1️⃣ Testing main scraping function...')
    const imageUrl = await mcpClient.getScrapedImageForTerm('Batman movie poster HD')
    console.log('✅ Main scraping result:', imageUrl)

    // Test with another query
    console.log('\n2️⃣ Testing with another query...')
    const imageUrl2 = await mcpClient.getScrapedImageForTerm('Spider-Man movie scene HD')
    console.log('✅ Second scraping result:', imageUrl2)

    console.log('\n🎉 MCP simple tests completed!')
  } catch (error) {
    console.error('❌ MCP test failed:', error.message)
  } finally {
    // Clean up
    await mcpClient.disconnect()
    console.log('\n🔌 MCP client disconnected')
  }
}

// Run the test
testMCPSimple()
