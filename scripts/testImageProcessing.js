import axios from 'axios'
import canvas from 'canvas'

async function testImageProcessing () {
  console.log('🧪 Testing image processing...\n')

  // Test URLs that were causing issues
  const testUrls = [
    'https://sp.yimg.com/ib/th?id=OPHS.mD23hvboxz66HA474C474&o=5&pid=21.1&w=174&h=174',
    'https://th.bing.com/th/id/OIP.BY5DoVUcjknPz6Tk0wJ9kwHaDt?w=403&h=175&c=7&r=0&o=7&pid=1.7&rm=3'
  ]

  for (let i = 0; i < testUrls.length; i++) {
    const url = testUrls[i]
    console.log(`📝 Testing image ${i + 1}: ${url}`)

    try {
      // Download image
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      console.log(`✅ Downloaded: ${resp.data.length} bytes`)

      // Try to convert with Sharp
      try {
        const sharp = await import('sharp')
        const converted = await sharp.default(resp.data)
          .png()
          .resize(400, 300, { fit: 'cover', position: 'center' })
          .toBuffer()

        console.log(`✅ Converted to PNG: ${converted.length} bytes`)

        // Try to load with Canvas
        const img = await canvas.loadImage(converted)
        console.log(`✅ Canvas loaded successfully: ${img.width}x${img.height}`)
      } catch (sharpError) {
        console.log(`❌ Sharp conversion failed: ${sharpError.message}`)

        // Try JPEG conversion
        try {
          const sharp = await import('sharp')
          const converted = await sharp.default(resp.data)
            .jpeg()
            .resize(400, 300, { fit: 'cover', position: 'center' })
            .toBuffer()

          console.log(`✅ Converted to JPEG: ${converted.length} bytes`)

          // Try to load with Canvas
          const img = await canvas.loadImage(converted)
          console.log(`✅ Canvas loaded successfully: ${img.width}x${img.height}`)
        } catch (jpegError) {
          console.log(`❌ JPEG conversion failed: ${jpegError.message}`)

          // Try original image
          try {
            const img = await canvas.loadImage(resp.data)
            console.log(`✅ Canvas loaded original: ${img.width}x${img.height}`)
          } catch (canvasError) {
            console.log(`❌ Canvas failed with original: ${canvasError.message}`)
          }
        }
      }
    } catch (downloadError) {
      console.log(`❌ Download failed: ${downloadError.message}`)
    }

    console.log('')
  }

  console.log('🎯 Image processing test complete!')
}

testImageProcessing().catch(console.error)
