import pkg from 'openai';
const { OpenAIApi, Configuration } = pkg;

// Configuration for OpenAI API
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here',
});
const openai = new OpenAIApi(configuration);

async function testPromptOnly() {
    console.log('🧪 Testing updated ChatGPT prompt for movie poster focus...\n');
    
    const topic = 'The Godfather';
    
    console.log(`📝 Testing topic: "${topic}"`);
    console.log('─'.repeat(50));
    
    try {
        // Create a comprehensive prompt for better search terms and character generation
        const prompt = `Create a viral meme about "${topic}" for social media. 

Requirements:
1. Generate a short, interesting fact or observation about ${topic} (max 100 characters)
2. Create a witty, casual reply that would go viral (max 80 characters) - NO EMOJIS
3. Provide 3 specific image search terms that will find relevant, high-quality movie/show images
4. Create a realistic username and handle for the meme creator (NOT related to the topic)
5. Generate a simple YouTube title and description

Format your response as JSON with these exact fields:
{
  "fact": "Your interesting fact here",
  "reply": "Your witty reply here - NO EMOJIS", 
  "youtube_title": "Simple title like 'Movie Fact' or 'Show Detail'",
  "youtube_description": "Brief description with hashtags",
  "image_search_terms": ["specific search term 1", "specific search term 2", "specific search term 3"],
  "avatar_search_terms": ["character avatar search 1", "character avatar search 2"],
  "image_urls": [],
  "avatar_urls": [],
  "handle": "@realisticusername",
  "name": "Realistic Name",
  "tags": ["relevant", "tags", "here"]
}

CRITICAL IMAGE SEARCH REQUIREMENTS:
- ALWAYS include "movie poster" or "official poster" in at least one search term
- ALWAYS include "key scene" or "official still" in another search term  
- ALWAYS include "HD" or "high quality" in search terms
- Focus on finding actual movie/show promotional materials, not generic images
- Examples: "${topic} movie poster HD", "${topic} key scene official still", "${topic} official movie poster"
- If the topic is not a movie/show, still use movie-style search terms like "poster style" or "cinematic"

IMPORTANT: 
- NO EMOJIS in any text fields (fact, reply, title, description)
- Image search terms MUST prioritize movie posters and official promotional materials
- Username and handle should be realistic and NOT related to the topic (e.g., "@alex_thompson", "Alex Thompson" - not "@wickfan" or "John Wick Fan")
- Handle should be a realistic social media username that someone would actually use
- Name should be a realistic first and last name
- Keep everything casual and viral-worthy`;

        const completion = await openai.createChatCompletion({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: 'You are a viral meme creator. Generate engaging, shareable content that will get likes and shares on social media. Always respond with valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.8,
            max_tokens: 500
        });

        const responseText = completion.data.choices[0].message.content.trim();
        console.log('[DEBUG] Raw GPT response:', responseText);
        
        // Try to parse JSON response
        let gptResponse;
        try {
            gptResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.log('[DEBUG] Failed to parse JSON, trying to extract...');
            // Try to extract JSON from the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                gptResponse = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Could not parse GPT response as JSON');
            }
        }
        
        console.log(`✅ Fact: ${gptResponse.fact}`);
        console.log(`💬 Reply: ${gptResponse.reply}`);
        console.log(`📺 Title: ${gptResponse.youtube_title}`);
        console.log(`🔍 Image Search Terms:`);
        gptResponse.image_search_terms.forEach((term, i) => {
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
        gptResponse.avatar_search_terms.forEach((term, i) => {
            console.log(`   ${i+1}. ${term}`);
        });
        console.log(`🏷️ Tags: ${gptResponse.tags.join(', ')}`);
        
        // Check if search terms follow the new requirements
        const hasPoster = gptResponse.image_search_terms.some(term => 
            term.toLowerCase().includes('poster')
        );
        const hasHD = gptResponse.image_search_terms.some(term => 
            term.toLowerCase().includes('hd') || term.toLowerCase().includes('high quality')
        );
        const hasScene = gptResponse.image_search_terms.some(term => 
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
    
    console.log('\n🎬 Test complete! Check if search terms now prioritize movie posters and official materials.');
}

testPromptOnly().catch(console.error); 