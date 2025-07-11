import fs from 'fs';
import path from 'path';

// Test the overlay selection for different accounts
async function testOverlaySelection() {
    console.log('🧪 Testing overlay selection for different accounts...');
    
    // Copy the getRandomOverlay function logic here for testing
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
    
    const accounts = [1, 2, 3];
    
    for (const accountNum of accounts) {
        console.log(`\n📁 Testing Account ${accountNum}:`);
        
        try {
            const overlayPath = getRandomOverlay(accountNum);
            console.log(`   Selected overlay: ${overlayPath}`);
            
            // Check if the file exists
            if (fs.existsSync(overlayPath)) {
                const stats = fs.statSync(overlayPath);
                console.log(`   ✅ File exists (${stats.size} bytes)`);
                
                // Verify it's from the correct account directory
                if (overlayPath.includes(`account_${accountNum}`)) {
                    console.log(`   ✅ Correctly from account_${accountNum} directory`);
                } else {
                    console.log(`   ⚠️  Warning: Not from account_${accountNum} directory`);
                }
            } else {
                console.log(`   ❌ File does not exist`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
    }
    
    console.log('\n✅ Overlay selection test completed!');
}

// Run the test
testOverlaySelection().catch(console.error); 