import { main } from './generateMeme.js';

console.log('🧪 Testing Improved Pipeline with Account & Template Selection');
console.log('============================================================');

async function testImprovedPipeline() {
	try {
		console.log('\n📋 Test 1: Interactive mode with account and template selection');
		console.log('This will prompt for:');
		console.log('  - Account selection (1 or 2)');
		console.log('  - Template selection (1)');
		console.log('  - Topic input');
		console.log('  - Scheduling');
		
		// Test with a simple topic
		await main('Test Topic', null, null, false);
		
		console.log('\n✅ Test completed successfully!');
		console.log('Check the output folder for generated video and images.');
		
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		console.error('Stack trace:', error.stack);
	}
}

// Run the test
testImprovedPipeline(); 