import { callCustomGpt } from './generateMeme.js';

async function testAccountContext() {
	try {
		console.log('🧪 Testing account-specific context...\n');
		
		const testTopics = [
			'Spider-Man',
			'Game of Thrones',
			'The Office',
			'Star Wars'
		];
		
		for (const topic of testTopics) {
			console.log(`📝 Testing topic: "${topic}"`);
			console.log('─'.repeat(50));
			
			// Test account 1 (normal style)
			console.log('\n👤 ACCOUNT 1 (Normal Style):');
			const result1 = await callCustomGpt(topic, 1);
			console.log(`✅ Fact: ${result1.fact}`);
			console.log(`💬 Reply: ${result1.reply}`);
			console.log(`📺 Title: ${result1.youtube_title}`);
			console.log(`📝 Description: ${result1.youtube_description}`);
			
			// Test account 2 (girl style)
			console.log('\n👧 ACCOUNT 2 (Girl Style):');
			const result2 = await callCustomGpt(topic, 2);
			console.log(`✅ Fact: ${result2.fact}`);
			console.log(`💬 Reply: ${result2.reply}`);
			console.log(`📺 Title: ${result2.youtube_title}`);
			console.log(`📝 Description: ${result2.youtube_description}`);
			
			console.log('\n' + '='.repeat(60) + '\n');
		}
		
		console.log('✅ Account context test completed!');
		console.log('\nExpected differences:');
		console.log('- Account 2 should use girl-style language (omg, literally, so good, etc.)');
		console.log('- Account 1 should use normal, casual language');
		console.log('- Both should have simple, human-like titles (no clickbait)');
		console.log('- Titles should be like "Spider-Man fact", "Movie detail", etc.');
		
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		console.error('Stack trace:', error.stack);
	}
}

// Run the test
testAccountContext(); 