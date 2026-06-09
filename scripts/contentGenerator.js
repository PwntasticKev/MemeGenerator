// contentGenerator.js
//
// Single source of truth for meme COPY generation. Replaces the three
// copy-pasted GPT prompts (generateMeme.js / generateMemeWithMCP.js /
// generateMemeSimple.js) and the deprecated openai@3 `createChatCompletion`.
//
// Modern OpenAI SDK (v4+), JSON mode, cheap+smart default model.
//
//   import { generateMemeContent } from './contentGenerator.js'
//   const content = await generateMemeContent('Oppenheimer', { accountNumber: 1 })
//
// Returns a fully-populated, validated content object (never throws on a bad
// model response — falls back to safe defaults so the pipeline keeps moving).

import 'dotenv/config'
import OpenAI from 'openai'

// gpt-4o-mini: cheaper than the old gpt-3.5-turbo default AND noticeably smarter,
// with reliable JSON mode. Override with OPENAI_MODEL (e.g. gpt-4.1-nano for even
// lower cost). Kept in one place so the whole pipeline moves together.
const DEFAULT_MODEL = 'gpt-4o-mini'

let client

function getClient () {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set')
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

// Shared, lazily-created OpenAI client for other modules (e.g. topicSelector).
export function getOpenAIClient () {
  return getClient()
}

export { DEFAULT_MODEL }

// Account-specific voice. Account 2 historically used a "girl posting" register.
function voiceFor (accountNumber) {
  if (accountNumber === 2) {
    return 'Write in an over-the-top "girl posting" voice — words like "omg", "literally", "obsessed", "no bc" — while staying provocative and rage-bait.'
  }
  return 'Write with sharp, confident, slightly smug energy — like someone with strong informed opinions who loves to stir the pot.'
}

function buildPrompt (topic, accountNumber) {
  return `Create a VIRAL, RAGE-BAIT meme about "${topic}" for a Shorts channel whose audience is 16-34 film/TV/pop-culture fans who love spicy hot takes and arguing in the comments.

${voiceFor(accountNumber)}

Return ONLY valid JSON with EXACTLY these fields:
{
  "fact": "a punchy hot take about ${topic} (MAX 80 chars, under 12 words) that ATTACKS something fans love OR makes a claim they'll rush to correct/defend — engineered to make ${topic} fans angry enough to COMMENT. Be specific to ${topic} (a character, scene, plot, or its hype), never generic 'bad'/'trash'. Short so it loops.",
  "reply": "a smug doubling-down reply (max 70 chars) that pours fuel and makes people NEED to reply — NO emojis, NO questions, NO hashtags",
  "youtube_title": "a curiosity-gap title using a PROVEN viral formula (these consistently outperform on this channel): 'The Hidden Meaning of ${topic}', 'The Real Truth About ${topic} Revealed', '${topic} EXPOSED', 'Why ${topic} Is Not What You Think', 'The ${topic} Detail Everyone Missed'",
  "youtube_description": "1 short provocative sentence, then 10-15 hashtags MIXING: broad reach (#shorts #fyp #viral #movies), franchise/title-specific (e.g. #${topic.replace(/[^a-zA-Z0-9]/g, '')}), and debate (#hottake #filmtheory #moviedebate #unpopularopinion)",
  "image_search_terms": ["3 specific search terms — use the exact ${topic} title, not generic words"],
  "avatar_search_terms": ["2 avatar/profile-pic search terms"],
  "handle": "<INVENT a punchy @handle, lowercase, e.g. @cinemashade or @hottakeharold — do NOT echo this text>",
  "name": "<INVENT a matching display name, e.g. Cinema Shade — do NOT echo this text>",
  "mood": "the movie/show's single dominant mood, EXACTLY one of: horror, action, comedy, kids, scifi, fantasy, drama, thriller, neutral",
  "tags": ["3-6 short tags"]
}

Rules:
- GOAL: drive COMMENTS. Pick the take most likely to make ${topic}'s fanbase argue — challenge a beloved character/scene/ending, call something overrated/underrated, or pit fan camps against each other. On-topic controversy ONLY (about the movie/show, never real-world hate).
- Keep the fact SHORT and punchy (loops > read-time).
- The reply must be clean (no hashtags/emojis/questions) and provocative enough that people reply to argue.
- The title MUST use one of the proven curiosity-gap formulas above.
- Make it unique; avoid generic insults.`
}

const SYSTEM_PROMPT =
  'You are a viral rage-bait creator. You write short, provocative, controversial social posts that trigger strong reactions and comment-section fights. Always respond with strict, valid JSON only.'

// Coerce a single value into a trimmed string with a max length.
function asText (value, fallback, maxLen) {
  const str = typeof value === 'string' && value.trim() ? value.trim() : fallback
  return maxLen ? str.slice(0, maxLen) : str
}

// Canonical moods shared with the overlay tagger/matcher.
export const MOODS = ['horror', 'action', 'comedy', 'kids', 'scifi', 'fantasy', 'drama', 'thriller', 'neutral']

function asMood (value) {
  const v = String(value || '').toLowerCase().trim()
  return MOODS.includes(v) ? v : 'neutral'
}

// Coerce into a non-empty array of strings, else fallback.
function asArray (value, fallback) {
  if (Array.isArray(value)) {
    const cleaned = value.map((v) => String(v).trim()).filter(Boolean)
    if (cleaned.length) return cleaned
  }
  return fallback
}

// Random persona pool — used when the model echoes a placeholder handle/name
// instead of inventing one, or leaves it blank.
const PERSONAS = [
  { name: 'Cinema Shade', handle: '@cinemashade' },
  { name: 'Hot Take Harold', handle: '@hottakeharold' },
  { name: 'The Spicy Critic', handle: '@spicycritic' },
  { name: 'Reel Truths', handle: '@reeltruths' },
  { name: 'Unpopular Opinions', handle: '@unpopular.ops' },
  { name: 'Couch Contrarian', handle: '@couchcontrarian' },
  { name: 'Plot Hole Patrol', handle: '@plotholepatrol' },
  { name: 'Screen Sniper', handle: '@screensniper' }
]

// Detect placeholder/echoed text the model sometimes copies from the prompt.
const PLACEHOLDER_RE = /invent|do not echo|echo this|creative (display|handle)|unrelated_to_topic|display name|<.*>|punchy @handle/i

function cleanPersona (rawName, rawHandle, topic) {
  const bad = (v) => !v || typeof v !== 'string' || !v.trim() || PLACEHOLDER_RE.test(v)
  if (bad(rawName) || bad(rawHandle)) {
    // Deterministic-ish pick from topic so it's stable per topic but varied across topics.
    const idx = Math.abs([...String(topic)].reduce((a, c) => a + c.charCodeAt(0), 0)) % PERSONAS.length
    return PERSONAS[idx]
  }
  return { name: rawName.trim(), handle: rawHandle.trim().startsWith('@') ? rawHandle.trim() : `@${rawHandle.trim()}` }
}

// Normalize a raw (possibly partial) model object into the full content shape.
export function normalizeContent (raw, topic) {
  const safe = raw && typeof raw === 'object' ? raw : {}
  const persona = cleanPersona(safe.name, safe.handle, topic)
  return {
    fact: asText(safe.fact, `${topic} is the most overrated thing of the decade`, 120),
    reply: asText(safe.reply, 'Finally someone said it out loud', 90),
    youtube_title: asText(safe.youtube_title, `The Truth About ${topic}`),
    youtube_description: asText(
      safe.youtube_description,
      `Why ${topic} is not what you think. #hottake #controversial #viral #shorts`
    ),
    image_search_terms: asArray(safe.image_search_terms, [topic, `${topic} movie`, `${topic} poster`]),
    avatar_search_terms: asArray(safe.avatar_search_terms, [`${topic} avatar`, `${topic} icon`]),
    handle: persona.handle,
    name: persona.name,
    mood: asMood(safe.mood),
    tags: asArray(safe.tags, ['hottake', 'controversial', 'viral'])
  }
}

/**
 * Generate validated meme copy for a topic.
 * @param {string} topic
 * @param {Object} [opts]
 * @param {number} [opts.accountNumber=1]
 * @param {string} [opts.model]  Override model (else OPENAI_MODEL or DEFAULT_MODEL).
 * @returns {Promise<Object>} normalized content object (see normalizeContent)
 */
export async function generateMemeContent (topic, opts = {}) {
  if (!topic || !String(topic).trim()) {
    throw new Error('generateMemeContent: topic is required')
  }
  const accountNumber = opts.accountNumber || 1
  const model = opts.model || process.env.OPENAI_MODEL || DEFAULT_MODEL

  try {
    const completion = await getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(topic, accountNumber) }
      ],
      temperature: 0.9,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    })

    const text = completion.choices?.[0]?.message?.content?.trim() || '{}'
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : {}
    }
    return normalizeContent(parsed, topic)
  } catch (err) {
    console.warn(`⚠️  contentGenerator: model call failed (${err.message}); using safe fallback copy.`)
    return normalizeContent(null, topic)
  }
}

export const __config = { DEFAULT_MODEL }
