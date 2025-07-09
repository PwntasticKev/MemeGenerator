import { callCustomGpt } from './generateMeme.js';

async function testControversialSearch() {
	try {
		console.log('🧪 Testing controversial image search...\n');
		
		// Test with a topic that should generate controversial search terms
		const testTopics = [
			'Game of Thrones',
			'Star Wars prequels', 
			'The Office',
			'Spider-Man 3',
			'Breaking Bad'
		];
		
		for (const topic of testTopics) {
			console.log(`📝 Testing topic: "${topic}"`);
			console.log('─'.repeat(50));
			
			const result = await callCustomGpt(topic);
			
			console.log(`✅ Fact: ${result.fact}`);
			console.log(`💬 Reply: ${result.reply}`);
			console.log(`📺 Title: ${result.youtube_title}`);
			console.log(`🔍 Image Search Terms:`);
			result.image_search_terms.forEach((term, i) => {
				console.log(`   ${i+1}. ${term}`);
			});
			console.log(`👤 Avatar Search Terms:`);
			result.avatar_search_terms.forEach((term, i) => {
				console.log(`   ${i+1}. ${term}`);
			});
			console.log(`🏷️ Tags: ${result.tags.join(', ')}`);
			console.log('\n');
		}
		
		console.log('✅ Controversial search test completed!');
		console.log('Check if the search terms include controversial keywords like:');
		console.log('- "controversial", "debated", "hated", "problematic"');
		console.log('- "worst", "best", "overrated", "underrated"');
		console.log('- "shocking", "outrage", "backlash", "fan war"');
		
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		console.error('Stack trace:', error.stack);
	}
}

// Run the test
testControversialSearch(); 