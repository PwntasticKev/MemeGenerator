import { main } from './generateMeme.js';

async function testCorePipeline() {
    console.log('🎬 Testing core pipeline (no YouTube upload)...\n');
    
    try {
        // Test with a simple topic
        const testTopic = 'The Office';
        console.log(`📝 Testing with topic: "${testTopic}"`);
        
        // Run the main pipeline in batch mode (no user input, no YouTube upload)
        await main(testTopic, null, null, true);
        
        console.log('\n🎉 Core pipeline test completed successfully!');
        console.log('✅ Video generated without YouTube upload');
        
    } catch (error) {
        console.error('\n❌ Core pipeline test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testCorePipeline(); 