import { callCustomGpt } from './generateMeme.js';

async function testUpdatedPrompt() {
    console.log('🧪 Testing updated ChatGPT prompt for movie poster focus...\n');
    
    const testTopics = [
        'The Godfather',
        'Spider-Man',
        'Star Wars',
        'Breaking Bad',
        'The Office',
        'John Wick',
        'Superman',
        'Batman'
    ];
    
    for (const topic of testTopics) {
        console.log(`📝 Testing topic: "${topic}"`);
        console.log('─'.repeat(50));
        
        try {
            const result = await callCustomGpt(topic);
            
            console.log(`✅ Fact: ${result.fact}`);
            console.log(`💬 Reply: ${result.reply}`);
            console.log(`📺 Title: ${result.youtube_title}`);
            console.log(`🔍 Image Search Terms:`);
            result.image_search_terms.forEach((term, i) => {
                const hasPoster = term.toLowerCase().includes('poster');
                const hasHD = term.toLowerCase().includes('hd') || term.toLowerCase().includes('high quality');
                const hasOfficial = term.toLowerCase().includes('official');
                const hasScene = term.toLowerCase().includes('scene') || term.toLowerCase().includes('still');
                
                let indicators = [];
                if (hasPoster) indicators.push('🎬 POSTER');
                if (hasHD) indicators.push('📺 HD');
                if (hasOfficial) indicators.push('🏆 OFFICIAL');
                if (hasScene) indicators.push('🎭 SCENE');
                
                const indicatorText = indicators.length > 0 ? ` [${indicators.join(' ')}]` : '';
                console.log(`   ${i+1}. ${term}${indicatorText}`);
            });
            console.log(`👤 Avatar Search Terms:`);
            result.avatar_search_terms.forEach((term, i) => {
                console.log(`   ${i+1}. ${term}`);
            });
            console.log(`🏷️ Tags: ${result.tags.join(', ')}`);
            
            // Check if search terms follow the new requirements
            const hasPoster = result.image_search_terms.some(term => 
                term.toLowerCase().includes('poster')
            );
            const hasHD = result.image_search_terms.some(term => 
                term.toLowerCase().includes('hd') || term.toLowerCase().includes('high quality')
            );
            const hasScene = result.image_search_terms.some(term => 
                term.toLowerCase().includes('scene') || term.toLowerCase().includes('still')
            );
            
            if (hasPoster && hasHD && hasScene) {
                console.log(`✅ PASS: Search terms include poster, HD, and scene/still keywords`);
            } else {
                console.log(`❌ FAIL: Missing required keywords - Poster: ${hasPoster}, HD: ${hasHD}, Scene: ${hasScene}`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        console.log('\n');
    }
    
    console.log('🎬 Test complete! Check if all search terms now prioritize movie posters and official materials.');
}

testUpdatedPrompt().catch(console.error); 