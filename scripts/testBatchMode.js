import { main } from './generateMeme.js';

console.log('🧪 Testing Batch Mode with Preset Account & Template');
console.log('====================================================');

async function testBatchMode() {
	try {
		console.log('\n📋 Test 1: Batch mode with preset account 2 and auto template');
		console.log('This will:');
		console.log('  - Use account 2 (preset)');
		console.log('  - Auto-select random template');
		console.log('  - Use preset topic');
		console.log('  - Auto-schedule for 2 hours');
		
		// Test with batch mode, preset account 2
		await main('Batch Test Topic', null, 2, true);
		
		console.log('\n✅ Batch mode test completed successfully!');
		console.log('Check the output folder for generated video and images.');
		
	} catch (error) {
		console.error('❌ Batch mode test failed:', error.message);
		console.error('Stack trace:', error.stack);
	}
}

// Run the test
testBatchMode(); 