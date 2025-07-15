import { template2 } from '../templates/template2.js';
import { callCustomGpt } from './generateMeme.js';
import fs from 'fs';
import path from 'path';

async function testTemplate2Live() {
    console.log('🎬 Live Testing Template 2 with Real Meme Generation Pipeline...\n');
    
    try {
        // Step 1: Get real meme content from GPT
        console.log('🤖 Getting meme content from GPT...');
        const topic = 'The Office';
        const gptResponse = await callCustomGpt(topic, 1);
        
        console.log('📝 GPT Response:');
        console.log(`   Fact: ${gptResponse.fact}`);
        console.log(`   Reply: ${gptResponse.reply}`);
        console.log(`   Handle: ${gptResponse.handle}`);
        console.log(`   Name: ${gptResponse.name}`);
        console.log(`   Image URLs: ${gptResponse.image_urls?.length || 0} found`);
        
        // Step 2: Set up test data
        const testData = {
            overlayPath: './assets/mainoverlay_1.png',
            image1: gptResponse.image_urls?.[0] || 'https://picsum.photos/400/600?random=1',
            image2: gptResponse.image_urls?.[1] || 'https://picsum.photos/400/600?random=2',
            fact: gptResponse.fact,
            reply: gptResponse.reply,
            outputPath: './test_output/live_template2_output.png',
            debugSvgPath: './test_output/live_template2_debug.svg',
            avatarPath: './assets/mainoverlay_1.png',
            handle: gptResponse.handle,
            name: gptResponse.name
        };

        // Step 3: Generate the meme using template2
        console.log('\n🎨 Generating meme with Template 2...');
        await template2(testData);
        
        console.log('✅ Live Template 2 test completed successfully!');
        console.log('📁 Output saved to:', testData.outputPath);
        console.log('📁 Debug SVG saved to:', testData.debugSvgPath);
        
        // Step 4: Check if files were created
        if (fs.existsSync(testData.outputPath)) {
            const stats = fs.statSync(testData.outputPath);
            console.log(`📊 Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        }
        
        if (fs.existsSync(testData.debugSvgPath)) {
            const stats = fs.statSync(testData.debugSvgPath);
            console.log(`📊 Debug SVG size: ${(stats.size / 1024).toFixed(2)} KB`);
        }
        
        console.log('\n🎉 Live test completed! Template 2 is working with the real pipeline!');
        
    } catch (error) {
        console.error('❌ Live Template 2 test failed:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Run the live test
testTemplate2Live(); 