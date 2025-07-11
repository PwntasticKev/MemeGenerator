import sharp from 'sharp';
import fs from 'fs';

async function convertSvgToPng() {
    try {
        const svgPath = 'output/2025-07-10/Spider-Man_twist_20250710145323/Spider-Man_twist_frame.svg';
        const pngPath = 'output/2025-07-10/Spider-Man_twist_20250710145323/Spider-Man_twist_frame.png';
        
        console.log('Converting SVG to PNG...');
        
        await sharp(svgPath)
            .resize(1080, 1920)
            .png()
            .toFile(pngPath);
            
        console.log(`✅ Successfully converted to ${pngPath}`);
        
        // Check if file was created
        if (fs.existsSync(pngPath)) {
            const stats = fs.statSync(pngPath);
            console.log(`File size: ${stats.size} bytes`);
        }
        
    } catch (error) {
        console.error('Error converting SVG to PNG:', error);
    }
}

convertSvgToPng(); 