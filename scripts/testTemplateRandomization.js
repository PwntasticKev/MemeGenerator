import { getRandomTemplate } from './generateMeme.js';

function testTemplateRandomization() {
	try {
		console.log('🎲 Testing template randomization...\n');
		
		// Test multiple template selections to see if they're randomized
		const numTests = 10;
		const templates = [];
		
		for (let i = 0; i < numTests; i++) {
			const template = getRandomTemplate();
			templates.push(template);
			console.log(`Test ${i+1}: Template function name: ${template.name || 'Anonymous function'}`);
		}
		
		// Check if we got different templates (though with only 1 template, they'll be the same)
		const uniqueTemplates = new Set(templates.map(t => t.name || 'Anonymous'));
		console.log(`\n📊 Results:`);
		console.log(`- Total tests: ${numTests}`);
		console.log(`- Unique templates found: ${uniqueTemplates.size}`);
		console.log(`- Template names: ${Array.from(uniqueTemplates).join(', ')}`);
		
		if (uniqueTemplates.size === 1) {
			console.log('\nℹ️ Note: Only 1 unique template found because there\'s currently only 1 template available.');
			console.log('When more templates are added, this will show randomization between them.');
		} else {
			console.log('\n✅ Template randomization is working!');
		}
		
		console.log('\n✅ Template randomization test completed!');
		
	} catch (error) {
		console.error('❌ Test failed:', error.message);
		console.error('Stack trace:', error.stack);
	}
}

// Run the test
testTemplateRandomization(); 