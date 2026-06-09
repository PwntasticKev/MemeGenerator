import pkg from 'openai'
import dotenv from 'dotenv'

dotenv.config()

const { OpenAIApi, Configuration } = pkg

// Configuration for OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
})
const openai = new OpenAIApi(configuration)

// Cost per 1K tokens (as of 2024)
const MODEL_COSTS = {
  'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 }
}

async function testModelCosts () {
  console.log('🧪 Testing different GPT models for cost efficiency...\n')

  const topic = 'The Godfather'
  const prompt = `Create a viral meme about "${topic}". Generate a witty fact (max 100 chars), a clever reply (max 80 chars), and 3 image search terms. Return as JSON with fields: fact, reply, image_search_terms.`

  const models = ['gpt-3.5-turbo', 'gpt-4-turbo', 'gpt-4']

  for (const model of models) {
    console.log(`📝 Testing ${model}...`)
    console.log('─'.repeat(50))

    try {
      const startTime = Date.now()

      const completion = await openai.createChatCompletion({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a viral meme creator. Generate engaging content and respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 300
      })

      const endTime = Date.now()
      const responseTime = endTime - startTime

      const response = completion.data.choices[0].message.content
      const usage = completion.data.usage

      // Calculate costs
      const inputCost = (usage.prompt_tokens / 1000) * MODEL_COSTS[model].input
      const outputCost = (usage.completion_tokens / 1000) * MODEL_COSTS[model].output
      const totalCost = inputCost + outputCost

      console.log(`✅ Response received in ${responseTime}ms`)
      console.log(`📊 Tokens: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} total`)
      console.log(`💰 Cost: $${inputCost.toFixed(4)} input + $${outputCost.toFixed(4)} output = $${totalCost.toFixed(4)} total`)

      // Try to parse and show sample output
      try {
        const parsed = JSON.parse(response)
        console.log(`🎯 Sample fact: "${parsed.fact?.slice(0, 50)}..."`)
        console.log(`💬 Sample reply: "${parsed.reply?.slice(0, 30)}..."`)
      } catch (e) {
        console.log(`📝 Raw response preview: "${response.slice(0, 100)}..."`)
      }

      console.log('')
    } catch (error) {
      console.log(`❌ Error with ${model}: ${error.message}`)
      console.log('')
    }
  }

  // Show cost comparison
  console.log('💰 COST COMPARISON (per typical meme generation):')
  console.log('─'.repeat(50))

  const typicalTokens = { input: 200, output: 150 } // Typical for your use case

  for (const [model, costs] of Object.entries(MODEL_COSTS)) {
    const inputCost = (typicalTokens.input / 1000) * costs.input
    const outputCost = (typicalTokens.output / 1000) * costs.output
    const totalCost = inputCost + outputCost

    console.log(`${model}: $${totalCost.toFixed(4)} per generation`)
  }

  console.log('\n💡 RECOMMENDATION:')
  console.log('For meme generation, GPT-3.5-turbo provides excellent quality at ~10x lower cost than GPT-4.')
  console.log('Set OPENAI_MODEL=gpt-3.5-turbo in your .env file for maximum cost efficiency.')
}

testModelCosts().catch(console.error)
