import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function simpleTest() {
    console.log('🧪 Running simple pipeline test...\n');
    
    try {
        // Step 1: Test GPT response 
        console.log('1️⃣ Testing GPT response...');
        const { callCustomGpt } = await import('./generateMeme.js');
        const gptResponse = await callCustomGpt('Spider-Man');
        console.log('✅ GPT Response:', {
            fact: gptResponse.fact,
            reply: gptResponse.reply,
            image_search_terms: gptResponse.image_search_terms,
            avatar_search_terms: gptResponse.avatar_search_terms
        });

        // Step 2: Test image scraping
        console.log('\n2️⃣ Testing image scraping...');
        const { getScrapedImageForTerm } = await import('./generateMeme.js');
        const imageUrl = await getScrapedImageForTerm('Spider-Man movie poster');
        console.log('✅ Scraped image:', imageUrl);

        // Step 3: Test image download
        console.log('\n3️⃣ Testing image download...');
        const { downloadImage } = await import('./generateMeme.js');
        const testDir = './test_output';
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
        
        const downloadedPath = path.join(testDir, 'test_image.png');
        await downloadImage(imageUrl, downloadedPath);
        console.log('✅ Downloaded image to:', downloadedPath);

        // Step 4: Test video creation
        console.log('\n4️⃣ Testing video creation...');
        const { createVideo } = await import('./generateMeme.js');
        const videoPath = path.join(testDir, 'test_video.mp4');
        await createVideo(downloadedPath, videoPath);
        
        if (fs.existsSync(videoPath)) {
            const stats = fs.statSync(videoPath);
            console.log('✅ Video created successfully!');
            console.log(`   Size: ${stats.size} bytes`);
            console.log(`   Path: ${videoPath}`);
        } else {
            throw new Error('Video file was not created');
        }

        // Step 5: Test FFmpeg directly
        console.log('\n5️⃣ Testing FFmpeg directly...');
        const ffmpegVideoPath = path.join(testDir, 'ffmpeg_test.mp4');
        await execAsync(`ffmpeg -loop 1 -i "${downloadedPath}" -c:v libx264 -t 6 -pix_fmt yuv420p -vf "scale=1080:1920" -y "${ffmpegVideoPath}"`);
        
        if (fs.existsSync(ffmpegVideoPath)) {
            const stats = fs.statSync(ffmpegVideoPath);
            console.log('✅ FFmpeg test successful!');
            console.log(`   Size: ${stats.size} bytes`);
        } else {
            throw new Error('FFmpeg test failed');
        }

        console.log('\n🎉 All tests passed! Pipeline is working correctly.');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

simpleTest(); 