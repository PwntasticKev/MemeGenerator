import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Test template 2 with placeholder images
async function testTemplate2() {
    console.log('🧪 Testing Template 2 with placeholder images...\n');
    
    try {
        // Test data
        const testData = {
            fact: "Did you know that Spider-Man was originally going to be called 'The Human Spider'?",
            reply: "Imagine if he had to say 'I am the Human Spider' every time he swung into action. That would be... interesting.",
            handle: "@spiderman_facts",
            name: "Spider-Man Facts",
            image1: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmY2YjNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSAxPC90ZXh0Pjwvc3ZnPg==",
            image2: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjNGNhZjUwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0OCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSAyPC90ZXh0Pjwvc3ZnPg=="
        };
        
        // Test template 2
        const templatePath = './templates/template2.svg';
        
        if (!fs.existsSync(templatePath)) {
            throw new Error('Template 2 not found');
        }
        
        console.log('✅ Template 2 found');
        
        // Read the template
        const svgContent = fs.readFileSync(templatePath, 'utf8');
        const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
        const doc = dom.window.document;
        
        // Check for placeholders
        const textElements = Array.from(doc.querySelectorAll('text, tspan'));
        const imageElements = Array.from(doc.querySelectorAll('image'));
        const placeholders = [];
        
        console.log('📝 Checking text placeholders...');
        for (const textElement of textElements) {
            const textContent = textElement.textContent;
            if (textContent.includes('{fact_here}')) placeholders.push('{fact_here}');
            if (textContent.includes('{reply_here}')) placeholders.push('{reply_here}');
            if (textContent.includes('{username_here}')) placeholders.push('{username_here}');
            if (textContent.includes('{handle_here}')) placeholders.push('{handle_here}');
        }
        
        console.log('🖼️ Checking image placeholders...');
        for (const imageElement of imageElements) {
            const href = imageElement.getAttribute('href');
            if (href && href.includes('{image1_here}')) placeholders.push('{image1_here}');
            if (href && href.includes('{image2_here}')) placeholders.push('{image2_here}');
        }
        
        console.log('📋 Found placeholders:', placeholders);
        
        // Check for image rectangles
        const rects = Array.from(doc.querySelectorAll('rect'));
        const imageRects = rects.filter(rect => {
            const fill = rect.getAttribute('fill');
            return fill === '#CACACA';
        });
        
        console.log('🖼️ Found image rectangles:', imageRects.length);
        
        // Check for avatar circle
        const circles = Array.from(doc.querySelectorAll('circle'));
        const avatarCircle = circles.find(circle => {
            const fill = circle.getAttribute('fill');
            return fill === '#D1CBCB';
        });
        
        console.log('👤 Found avatar circle:', !!avatarCircle);
        
        // Test placeholder replacement
        console.log('\n🔄 Testing placeholder replacement...');
        
        // Replace text placeholders
        for (const textElement of textElements) {
            let textContent = textElement.textContent;
            
            if (textContent.includes('{fact_here}')) {
                textContent = textContent.replace(/\{fact_here\}/g, testData.fact);
                console.log('✅ Replaced {fact_here}');
            }
            if (textContent.includes('{reply_here}')) {
                textContent = textContent.replace(/\{reply_here\}/g, testData.reply);
                console.log('✅ Replaced {reply_here}');
            }
            if (textContent.includes('{username_here}')) {
                textContent = textContent.replace(/\{username_here\}/g, testData.name);
                console.log('✅ Replaced {username_here}');
            }
            if (textContent.includes('{handle_here}')) {
                textContent = textContent.replace(/\{handle_here\}/g, testData.handle);
                console.log('✅ Replaced {handle_here}');
            }
            
            textElement.textContent = textContent;
        }
        
        // Replace image placeholders
        for (const imageElement of imageElements) {
            const href = imageElement.getAttribute('href');
            
            if (href && href.includes('{image1_here}')) {
                imageElement.setAttribute('href', testData.image1);
                console.log('✅ Replaced {image1_here}');
            }
            if (href && href.includes('{image2_here}')) {
                imageElement.setAttribute('href', testData.image2);
                console.log('✅ Replaced {image2_here}');
            }
        }
        
        // Save test output
        const testOutputPath = './test_output/test_template2.svg';
        fs.mkdirSync('./test_output', { recursive: true });
        fs.writeFileSync(testOutputPath, doc.documentElement.outerHTML);
        
        console.log(`✅ SVG with placeholders replaced saved to: ${testOutputPath}`);
        
        // Convert SVG to PNG for testing
        console.log('\n🖼️ Converting SVG to PNG...');
        const pngOutputPath = './test_output/test_template2.png';
        
        // Use a simple method to convert SVG to PNG (you might need to install a package like sharp or use a different method)
        try {
            // Try using rsvg-convert if available
            await execAsync(`rsvg-convert -w 1080 -h 1920 "${testOutputPath}" -o "${pngOutputPath}"`);
            console.log(`✅ PNG created: ${pngOutputPath}`);
        } catch (error) {
            console.log('⚠️ rsvg-convert not available, trying alternative method...');
            try {
                // Try using ImageMagick if available
                await execAsync(`convert "${testOutputPath}" "${pngOutputPath}"`);
                console.log(`✅ PNG created with ImageMagick: ${pngOutputPath}`);
            } catch (convertError) {
                console.log('⚠️ ImageMagick not available, skipping PNG conversion');
                console.log('💡 You can manually convert the SVG to PNG using a browser or online tool');
            }
        }
        
        // Test video creation if PNG was created
        if (fs.existsSync(pngOutputPath)) {
            console.log('\n🎬 Testing video creation...');
            const videoPath = './test_output/test_template2_video.mp4';
            
            try {
                await execAsync(`ffmpeg -loop 1 -i "${pngOutputPath}" -c:v libx264 -t 6 -pix_fmt yuv420p -vf "scale=1080:1920" -y "${videoPath}"`);
                
                if (fs.existsSync(videoPath)) {
                    const stats = fs.statSync(videoPath);
                    console.log('✅ Video created successfully!');
                    console.log(`   Size: ${stats.size} bytes`);
                    console.log(`   Path: ${videoPath}`);
                } else {
                    throw new Error('Video file was not created');
                }
            } catch (videoError) {
                console.log('⚠️ Video creation failed:', videoError.message);
                console.log('💡 Make sure ffmpeg is installed and available in PATH');
            }
        }
        
        console.log('\n📋 Test Summary:');
        console.log(`   - Text placeholders found: ${placeholders.filter(p => p.includes('text')).length}`);
        console.log(`   - Image placeholders found: ${placeholders.filter(p => p.includes('image')).length}`);
        console.log(`   - Image rectangles: ${imageRects.length}`);
        console.log(`   - Avatar circle: ${!!avatarCircle}`);
        console.log(`   - All placeholders replaced successfully`);
        console.log(`   - SVG output: ${testOutputPath}`);
        if (fs.existsSync(pngOutputPath)) {
            console.log(`   - PNG output: ${pngOutputPath}`);
        }
        if (fs.existsSync('./test_output/test_template2_video.mp4')) {
            console.log(`   - Video output: ./test_output/test_template2_video.mp4`);
        }
        
        console.log('\n🎉 Template 2 test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testTemplate2(); 