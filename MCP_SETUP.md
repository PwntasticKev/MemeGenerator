# MCP (Model Context Protocol) Image Scraping Setup

This project now includes an MCP server for more reliable and maintainable image scraping functionality.

## What is MCP?

MCP (Model Context Protocol) is a protocol that allows AI assistants to interact with external tools and services. In our case, we're using it to create a dedicated image scraping service that's more robust and easier to maintain than the previous direct Puppeteer implementation.

## Benefits of MCP for Image Scraping

1. **Better Separation of Concerns**: Image scraping logic is isolated in its own service
2. **More Reliable**: MCP servers can handle errors better and provide better logging
3. **Easier to Maintain**: The scraping logic is in its own service, making it easier to update
4. **Better Debugging**: MCP servers can provide better logging and monitoring
5. **Scalable**: Can easily add more search engines or features without affecting the main application

## Files Overview

### Core MCP Files

- **`mcp-server.js`**: The MCP server that handles image scraping requests
- **`mcp-client.js`**: Client wrapper that communicates with the MCP server
- **`scripts/generateMemeWithMCP.js`**: Updated meme generator that uses the MCP client

### MCP Server Features

The MCP server provides three main tools:

1. **`search_images`**: Search for images using multiple engines (Bing, Yahoo, DuckDuckGo)
2. **`validate_image`**: Validate that an image URL is accessible and valid
3. **`get_fallback_image`**: Get a fallback image from reliable services

## Installation

1. Install the MCP SDK:
```bash
npm install @modelcontextprotocol/sdk
```

2. Make the MCP server executable:
```bash
chmod +x mcp-server.js
```

## Usage

### Using the MCP-Enabled Meme Generator

```bash
node scripts/generateMemeWithMCP.js "Your Topic Here"
```

### Testing the MCP Implementation

```bash
node scripts/testMCP.js
```

### Manual MCP Server Testing

```bash
# Start the MCP server
node mcp-server.js

# In another terminal, test the client
node scripts/testMCP.js
```

## How It Works

1. **MCP Server** (`mcp-server.js`):
   - Runs as a separate process
   - Handles image scraping requests using Puppeteer
   - Provides fallback mechanisms for reliability
   - Communicates via stdio with the client

2. **MCP Client** (`mcp-client.js`):
   - Manages connection to the MCP server
   - Provides a clean API for image scraping
   - Handles connection errors and fallbacks
   - Automatically starts/stops the server process

3. **Meme Generator** (`scripts/generateMemeWithMCP.js`):
   - Uses the MCP client instead of direct Puppeteer calls
   - More reliable image scraping
   - Better error handling and fallbacks

## Configuration

The MCP server uses the same configuration as the original implementation:

- **Search Engines**: Bing, Yahoo, DuckDuckGo
- **Fallback Services**: Unsplash, Picsum, Placeholder services
- **Image Validation**: Checks content type, size, and accessibility
- **Retry Logic**: Multiple attempts with different search terms

## Troubleshooting

### Common Issues

1. **"Not connected" errors**: The MCP server process may not be starting properly
   - Check that `mcp-server.js` is executable
   - Verify that all dependencies are installed
   - Check console output for server startup errors

2. **Permission errors**: May need to run with sudo for npm install
   ```bash
   sudo npm install @modelcontextprotocol/sdk
   ```

3. **Image scraping failures**: The MCP server includes multiple fallback mechanisms
   - Check the console output for which services are being tried
   - The system will always return a working placeholder image

### Debug Mode

To see detailed MCP communication, you can modify the client to include more logging:

```javascript
// In mcp-client.js, add more console.log statements
console.log('[MCP Client] Detailed debug info:', result)
```

## Migration from Direct Puppeteer

If you're migrating from the original `generateMeme.js`:

1. **Replace imports**: Use `generateMemeWithMCP.js` instead
2. **Update scripts**: Change your npm scripts to use the MCP version
3. **Test thoroughly**: Run the test script to ensure everything works

## Future Enhancements

The MCP architecture makes it easy to add new features:

- **More search engines**: Add Google Images, Flickr, etc.
- **Image processing**: Add filters, cropping, etc.
- **Caching**: Cache successful image URLs
- **Rate limiting**: Better handling of API limits
- **Multiple servers**: Scale across multiple MCP server instances

## Performance

The MCP implementation provides:

- **Better reliability**: Multiple fallback mechanisms
- **Faster recovery**: Automatic retry with different search terms
- **Resource management**: Proper cleanup of browser instances
- **Error isolation**: Scraping failures don't affect the main application 