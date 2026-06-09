import pkg from 'openai'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const { OpenAIApi, Configuration } = pkg

// Configuration for OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
})
const openai = new OpenAIApi(configuration)

async function testControversialPrompt () {
  console.log('🧪 Testing UPDATED controversial prompt...\n')

  const topic = 'Breaking Bad'

  console.log(`📝 Testing topic: "${topic}"`)
  console.log('─'.repeat(50))

  try {
    // AGGRESSIVE controversial prompt
    const prompt = `Create a VIRAL, CONTROVERSIAL meme about "${topic}" that will SPARK OUTRAGE and get people FIGHTING in the comments. Make content that's so provocative it goes viral through pure controversy.

Requirements:
1. Generate a SHOCKING, CONTROVERSIAL fact about ${topic} (max 100 characters) - make the MOST CONTROVERSIAL statement possible that will make people angry
2. Create a RAGE BAIT reply that will trigger emotional responses (max 80 characters) - NO EMOJIS, NO QUESTIONS - make the most inflammatory statement possible
3. Provide 3 specific image search terms that will find relevant, high-quality movie/show images
4. Create a creative username and handle for the meme creator (NOT related to the topic)
5. Generate a CONTROVERSIAL YouTube title and description that will spark outrage

Format your response as JSON with these exact fields:
{
  "fact": "Your shocking, controversial fact here",
  "reply": "Your rage bait reply here - NO EMOJIS", 
  "youtube_title": "Controversial title that will spark outrage",
  "youtube_description": "Provocative description with hashtags that will trigger debate",
  "image_search_terms": ["specific search term 1", "specific search term 2", "specific search term 3"],
  "avatar_search_terms": ["character avatar search 1", "character avatar search 2"],
  "image_urls": [],
  "avatar_urls": [],
  "handle": "@creativeusername",
  "name": "Creative Name",
  "tags": ["controversy", "debate", "outrage"]
}

CONTENT REQUIREMENTS:
- The fact should be SHOCKING, DIVISIVE, and CONTROVERSIAL - make statements that will make people angry and want to fight
- Focus on: unpopular opinions, hot takes, controversial interpretations, divisive statements, shocking revelations
- Use phrases like: "is actually trash", "was always garbage", "the truth about", "nobody wants to admit", "the real reason", "secretly sucks", "is just", "was never good", "has always been overrated", "is the worst", "is completely overrated", "is actually terrible", "was really just", "is secretly awful"
- Make people want to argue, fight, and share their outrage
- Examples: "X is actually the worst", "The truth about Y nobody wants to admit", "Z was always garbage", "A is secretly terrible", "The real reason B sucks", "C is completely overrated", "D was never that good", "E has always been trash", "F is just awful", "G is actually terrible"
- The reply should be PURE RAGE BAIT - make the most inflammatory statement possible that triggers emotional responses
- Focus on: clever wordplay, sarcastic observations, witty commentary, smart insults, clever critiques
- Use phrases like: "This is trash", "Facts don't care about feelings", "The truth hurts", "This aged poorly", "Iconic behavior", "This is why we can't have nice things", "Hard pill to swallow", "The audacity is unmatched", "This is why we can't have nice things", "The truth nobody wants to hear", "This is the reality check we all need", "The facts are undeniable", "This is the cold hard truth", "This is garbage", "Pure trash", "Absolutely terrible", "Complete garbage", "This is awful", "Terrible take", "Worst opinion", "This is why society is doomed", "This is peak stupidity", "This is why we can't have nice things", "This is the worst take", "This is why everything is terrible", "This is peak ignorance", "This is why we're doomed", "This is the worst thing ever", "This is why we can't have nice things", "This is peak stupidity", "This is why society is doomed"
- ALWAYS make BOLD, DIVISIVE STATEMENTS - never ask questions in the reply
- NEVER use question marks or phrases like "What do you think?", "Agree or disagree?", "Do you think...?", "Change my mind", "Prove me wrong"
- Reply examples: "This is trash", "Facts don't care about feelings", "The truth hurts", "This aged poorly", "Iconic behavior", "This is why we can't have nice things", "Hard pill to swallow", "The audacity is unmatched", "This is why we can't have nice things", "The truth nobody wants to hear", "This is the reality check we all need", "The facts are undeniable", "This is the cold hard truth", "This is garbage", "Pure trash", "Absolutely terrible", "Complete garbage", "This is awful", "Terrible take", "Worst opinion", "This is why society is doomed", "This is peak stupidity", "This is why we can't have nice things", "This is the worst take", "This is why everything is terrible", "This is peak ignorance", "This is why we're doomed", "This is the worst thing ever", "This is why we can't have nice things", "This is peak stupidity", "This is why society is doomed"

CRITICAL IMAGE SEARCH REQUIREMENTS:
- ALWAYS include "HD" or "high quality" in ALL search terms
- Focus on finding high-quality movie/show images, scenes, and promotional materials
- PRIORITIZE OFFICIAL CONTENT: Include terms like "official poster", "promotional image", "movie poster", "official still", "character portrait"
- BE VERY SPECIFIC: Use exact character names, movie titles, and specific scenes
- Examples: "Iron Man official poster HD", "Black Panther movie poster high quality", "Spider-Man official still HD", "Batman character portrait HD", "Captain America promotional image high quality"
- Avoid generic terms like "image" or "picture" - be specific about movie/show content
- Include the movie/show name in search terms for better relevance
- Focus on images that will work well in a square/portrait format for social media
- Use specific character names when possible (e.g., "Tony Stark" instead of just "Iron Man")
- Include action words like "portrait", "close-up", "headshot", "character study"
- PRIORITIZE OFFICIAL MOVIE CONTENT over fan art or generic images

USERNAME REQUIREMENTS:
- Create creative, memorable usernames that are NOT related to the topic
- Use handles like: @meme_lord, @cinema_sage, @film_whisperer, @movie_mind, @cinema_insights, @film_philosopher, @movie_mastermind, @cinema_critic, @film_theorist, @movie_analyst
- Names should be creative but not too realistic - avoid common names like "John" or "Sarah"
- Examples: MemeLord, CinemaSage, FilmWhisperer, MovieMind, CinemaInsights, FilmPhilosopher, MovieMastermind, CinemaCritic, FilmTheorist, MovieAnalyst

YOUTUBE REQUIREMENTS:
- Titles should be CONTROVERSIAL and PROVOCATIVE to spark outrage
- Focus on controversy and divisive takes that will trigger emotional responses
- Use phrases like: "The Truth About", "Why X Sucks", "The Real Problem With", "Why Nobody Talks About", "The Controversial Truth", "Why X Is Actually Terrible", "The Shocking Truth", "Why X Is Overrated", "The Real Reason X Sucks", "Why X Is Actually Garbage"
- Descriptions should encourage outrage and heated debate`

    const completion = await openai.createChatCompletion({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a VIRAL CONTROVERSY CREATOR who specializes in SHOCKING and PROVOCATIVE content that sparks OUTRAGE and gets people FIGHTING in the comments. Your goal is to create the MOST CONTROVERSIAL statements possible that will make people angry and want to fight. Focus on shocking statements, unpopular opinions, divisive takes, and pure rage bait that triggers emotional responses. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 500
    })

    const responseText = completion.data.choices[0].message.content.trim()
    console.log('[DEBUG] Raw GPT response:', responseText)

    // Try to parse JSON response
    let gptResponse
    try {
      gptResponse = JSON.parse(responseText)
    } catch (parseError) {
      console.log('[DEBUG] Failed to parse JSON, trying to extract...')
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        gptResponse = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse GPT response as JSON')
      }
    }

    console.log(`✅ Fact: ${gptResponse.fact}`)
    console.log(`💬 Reply: ${gptResponse.reply}`)
    console.log(`📺 Title: ${gptResponse.youtube_title}`)
    console.log(`📝 Description: ${gptResponse.youtube_description}`)
    console.log('🔍 Image Search Terms:')
    gptResponse.image_search_terms.forEach((term, i) => {
      console.log(`   ${i + 1}. ${term}`)
    })
    console.log(`👤 Handle: ${gptResponse.handle}`)
    console.log(`👤 Name: ${gptResponse.name}`)
    console.log(`🏷️ Tags: ${gptResponse.tags.join(', ')}`)

    console.log('\n🎯 Controversy Level Assessment:')
    const factControversy = gptResponse.fact.toLowerCase().includes('trash') || gptResponse.fact.toLowerCase().includes('garbage') || gptResponse.fact.toLowerCase().includes('terrible') || gptResponse.fact.toLowerCase().includes('worst') || gptResponse.fact.toLowerCase().includes('overrated') || gptResponse.fact.toLowerCase().includes('sucks')
    const replyControversy = gptResponse.reply.toLowerCase().includes('trash') || gptResponse.reply.toLowerCase().includes('garbage') || gptResponse.reply.toLowerCase().includes('terrible') || gptResponse.reply.toLowerCase().includes('worst') || gptResponse.reply.toLowerCase().includes('awful') || gptResponse.reply.toLowerCase().includes('stupidity') || gptResponse.reply.toLowerCase().includes('doomed')

    console.log(`   Fact controversy: ${factControversy ? '🔥 HIGH' : '😐 LOW'}`)
    console.log(`   Reply controversy: ${replyControversy ? '🔥 HIGH' : '😐 LOW'}`)

    if (factControversy && replyControversy) {
      console.log('🎉 PERFECT! Both fact and reply are highly controversial!')
    } else if (factControversy || replyControversy) {
      console.log('⚠️  PARTIAL: One element is controversial, but could be stronger')
    } else {
      console.log('❌ WEAK: Content is not controversial enough')
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    console.error('Stack trace:', error.stack)
  }
}

testControversialPrompt()
