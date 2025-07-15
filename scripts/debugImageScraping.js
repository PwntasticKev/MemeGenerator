import { getScrapedImageForTerm, downloadImage } from './generateMeme.js';
import fs from 'fs';
import path from 'path';

async function debugImageScraping() {
    console.log('🔍 Debugging image scraping...\n');
    
    const testTerms = [
        'Superman movie poster',
        'Latina Supergirl',
        'Superman movie scene'
    ];
    
    for (let i = 0; i < testTerms.length; i++) {
        const term = testTerms[i];
        console.log(`\n${i + 1}️⃣ Testing term: "${term}"`);
        
        try {
            const imageUrl = await getScrapedImageForTerm(term);
            console.log(`✅ Got image URL: ${imageUrl}`);
            
            // Test downloading the image
            const testDir = './test_output';
            if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
            
            const imagePath = path.join(testDir, `debug_image_${i + 1}.png`);
            const success = await downloadImage(imageUrl, imagePath);
            
            if (success) {
                const stats = fs.statSync(imagePath);
                console.log(`✅ Downloaded successfully: ${imagePath} (${stats.size} bytes)`);
            } else {
                console.log(`❌ Failed to download image`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    console.log('\n🔍 Debug complete!');
}

debugImageScraping().catch(console.error); 