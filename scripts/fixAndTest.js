import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function fixAndTest() {
    console.log('🔧 Fixing and testing the pipeline...\n');
    
    try {
        // Step 1: Test GPT response
        console.log('1️⃣ Testing GPT response...');
        const { callCustomGpt } = await import('./generateMeme.js');
        const gptResponse = await callCustomGpt('Spider-Man');
        console.log('✅ GPT Response received');
        console.log('   Fact:', gptResponse.fact);
        console.log('   Reply:', gptResponse.reply);
        console.log('   Image search terms:', gptResponse.image_search_terms);

        // Step 2: Test getting 2 images
        console.log('\n2️⃣ Testing 2 image scraping...');
        const { getScrapedImageForTerm } = await import('./generateMeme.js');
        
        const image1 = await getScrapedImageForTerm(gptResponse.image_search_terms[0]);
        const image2 = await getScrapedImageForTerm(gptResponse.image_search_terms[1]);
        
        console.log('✅ Scraped images:');
        console.log('   Image 1:', image1);
        console.log('   Image 2:', image2);

        if (!image1 || !image2) {
            throw new Error('Failed to get 2 images');
        }

        // Step 3: Test image download
        console.log('\n3️⃣ Testing image downloads...');
        const { downloadImage } = await import('./generateMeme.js');
        const testDir = './test_output';
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
        
        const image1Path = path.join(testDir, 'image1.png');
        const image2Path = path.join(testDir, 'image2.png');
        
        await downloadImage(image1, image1Path);
        await downloadImage(image2, image2Path);
        
        console.log('✅ Downloaded images:');
        console.log('   Image 1:', image1Path, `(${fs.statSync(image1Path).size} bytes)`);
        console.log('   Image 2:', image2Path, `(${fs.statSync(image2Path).size} bytes)`);

        // Step 4: Test template generation (simplified)
        console.log('\n4️⃣ Testing template generation...');
        const sharp = (await import('sharp')).default;
        
        // Create a simple test composition
        const OUTPUT_WIDTH = 1080;
        const OUTPUT_HEIGHT = 1920;
        
        // Use existing overlay
        const overlayPath = './assets/mainoverlay_1.png';
        if (!fs.existsSync(overlayPath)) {
            throw new Error('Overlay not found: ' + overlayPath);
        }
        
        const framePath = path.join(testDir, 'test_frame.png');
        
        // Create a simple composition with the two images side by side
        await sharp(overlayPath)
            .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT)
            .composite([
                {
                    input: image1Path,
                    top: 400,
                    left: 100,
                    blend: 'over'
                },
                {
                    input: image2Path,
                    top: 400,
                    left: 600,
                    blend: 'over'
                }
            ])
            .png()
            .toFile(framePath);
        
        console.log('✅ Template generated:', framePath, `(${fs.statSync(framePath).size} bytes)`);

        // Step 5: Test video creation
        console.log('\n5️⃣ Testing video creation...');
        const { createVideo } = await import('./generateMeme.js');
        const videoPath = path.join(testDir, 'test_video.mp4');
        
        await createVideo(framePath, videoPath);
        
        if (fs.existsSync(videoPath)) {
            const stats = fs.statSync(videoPath);
            console.log('✅ Video created successfully!');
            console.log(`   Size: ${stats.size} bytes`);
            console.log(`   Path: ${videoPath}`);
            
            // Test video duration
            try {
                const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`);
                const duration = parseFloat(stdout.trim());
                console.log(`   Duration: ${duration}s`);
            } catch (e) {
                console.log('   Duration: Could not verify');
            }
        } else {
            throw new Error('Video file was not created');
        }

        // Step 6: Test the full pipeline with a simple run
        console.log('\n6️⃣ Testing full pipeline...');
        const { main } = await import('./generateMeme.js');
        
        // Create a simple test that bypasses user input
        const testTopic = 'Breaking Bad';
        console.log(`   Testing with topic: ${testTopic}`);
        
        // We'll test the main function but with a timeout
        const testPromise = main(testTopic, null, null, true); // batch mode
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Pipeline timeout')), 60000)
        );
        
        await Promise.race([testPromise, timeoutPromise]);
        
        console.log('\n🎉 All tests passed! Pipeline is working correctly.');
        console.log('\n📁 Generated files:');
        console.log(`   - ${image1Path}`);
        console.log(`   - ${image2Path}`);
        console.log(`   - ${framePath}`);
        console.log(`   - ${videoPath}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

fixAndTest(); 