import { main } from './generateMeme.js';

// Test the new all-accounts functionality
async function testAllAccounts() {
    console.log('🧪 Testing all-accounts functionality...');
    
    try {
        // Test with a simple topic
        const topic = 'Spider-Man';
        console.log(`📝 Testing with topic: ${topic}`);
        
        // Call main with all-accounts flag simulated
        // We'll need to modify the args array to include --all-accounts
        process.argv.push('--all-accounts');
        process.argv.push('--skip-review');
        
        await main(topic, null, null, true); // isBatchMode = true to skip prompts
        
        console.log('✅ All-accounts test completed successfully!');
    } catch (error) {
        console.error('❌ All-accounts test failed:', error.message);
        throw error;
    }
}

// Run the test
testAllAccounts().catch(console.error); 