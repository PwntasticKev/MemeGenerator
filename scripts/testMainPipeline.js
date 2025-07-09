import { main } from './generateMeme.js';

async function testMainPipeline() {
    console.log('🎬 Testing main pipeline...\n');
    
    try {
        // Test with a simple topic
        const testTopic = 'Breaking Bad';
        console.log(`📝 Testing with topic: "${testTopic}"`);
        
        // Run the main pipeline in batch mode (no user input)
        await main(testTopic, null, null, true);
        
        console.log('\n🎉 Main pipeline test completed!');
        
    } catch (error) {
        console.error('\n❌ Main pipeline test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

testMainPipeline(); 