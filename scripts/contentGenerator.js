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
    return 'Write in an over-the-top "girl posting" voice — words like "omg", "literally", "obsessed", "no bc" — but channel it into GENUINE enthusiasm for a fascinating insight, not hate.'
  }
  return 'Write like a knowledgeable, enthusiastic film buff sharing a genuinely fascinating insight — smart and confident, the kind of take that makes people go "I never thought about that".'
}

function buildPrompt (topic, accountNumber) {
  return `Create a FASCINATING, scroll-stopping meme about "${topic}" for a Shorts channel whose audience is 16-34 film/TV/pop-culture fans who love discovering things they didn't know and debating them in the comments.

${voiceFor(accountNumber)}

The goal: make the viewer think "whoa, I never realized that" and feel smart — then want to add their own take in the comments. This is NOT generic hate or "X is overrated" clickbait. It is a genuinely interesting truth about something people already love, paired with an opinion worth debating. (The biggest channels in this niche win on insight, not outrage.)

Return ONLY valid JSON with EXACTLY these fields:
{
  "fact": "a genuinely FASCINATING, SPECIFIC insight about ${topic}: hidden lore, an alternate-history 'what if', a detail everyone missed, a deeper thematic meaning, a creator's intent, or a wild behind-the-scenes truth. 2-3 short sentences, roughly 150-210 characters — and ALWAYS finish your final sentence, never trail off mid-thought. Structure as an interesting setup THEN a payoff/twist that reframes how you see ${topic}. Must be SPECIFIC to a real character/scene/plot/creator and TRUE/credible — if it's a real fact, ground it (e.g. 'George Lucas said...'). NEVER generic 'bad'/'overrated'/'trash'.",
  "reply": "a thoughtful, smart, DEBATABLE opinion that builds on the fact and gives people something to agree or disagree with — a sharp observation a real fan would make. Keep it PUNCHY and SHORT: ONE natural sentence like a real fan's comment (8-16 words), never an essay, never trailing off mid-thought. NO emojis, NO questions, NO hashtags.",
  "youtube_title": "a short, natural, conversational comment-bait hook — a question or speculative 'imagine' the viewer wants to answer, e.g. 'What would you have done?', 'Did they take it too far?', 'Imagine if this actually happened', 'Bet you never noticed this'. Human and casual, NEVER a rigid clickbait template.",
  "youtube_description": "1 short intriguing sentence, then 8-12 hashtags MIXING: broad reach (#shorts #viral #movies), franchise/title-specific (e.g. #${topic.replace(/[^a-zA-Z0-9]/g, '')}), and discussion (#filmtheory #movielore #didyouknow #moviedebate)",
  "image_search_terms": ["3 specific search terms — use the exact ${topic} title, not generic words"],
  "avatar_search_terms": ["2 avatar/profile-pic search terms"],
  "handle": "<INVENT a realistic personal username a normal person would have: lowercase first/last-name bits, optional dots/underscores/2-digit number, e.g. @jess.carterr, @mikedelgado_, @tina.alv92 — NEVER a brand/page/bot-style name; do NOT echo this text>",
  "name": "<INVENT the matching real-person display name, e.g. Jess Carter — a plausible human name, not a page name; do NOT echo this text>",
  "mood": "the movie/show's single dominant mood, EXACTLY one of: horror, action, comedy, kids, scifi, fantasy, drama, thriller, neutral",
  "tags": ["3-6 short tags"]
}

Rules:
- GOAL: spark discussion through FASCINATION, not anger. The best posts reveal something true and surprising about a beloved topic, then offer a take worth debating.
- The fact must be genuinely interesting and SPECIFIC. If unsure it's true, pick a real, verifiable angle (lore, creator quotes, alternate endings, hidden details, thematic meaning) over a made-up claim.
- The reply is a smart opinion people will want to build on or argue with — clean, no questions/emojis/hashtags.
- The title is a natural, conversational comment-bait hook — never a rigid "The Hidden Meaning of X" template.
- Think "film buff sharing a mind-blowing fact", NOT "hater". Avoid generic insults and manufactured outrage.`
}

const SYSTEM_PROMPT =
  'You are a film and TV expert who writes short, fascinating, discussion-sparking social posts that reveal surprising truths about beloved movies and shows and invite debate. You favor genuine insight over outrage. Always respond with strict, valid JSON only.'

// Coerce a single value into a trimmed string. When truncation is needed, cut
// to the last COMPLETE sentence (so the insight's payoff is never a dangling
// fragment); if there's no sentence break, fall back to a word boundary so text
// is never chopped mid-word. A mid-word/mid-sentence cut looks broken on-card.
function asText (value, fallback, maxLen) {
  const str = typeof value === 'string' && value.trim() ? value.trim() : fallback
  if (!maxLen || str.length <= maxLen) return str
  const cut = str.slice(0, maxLen)
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (sentenceEnd > maxLen * 0.5) return cut.slice(0, sentenceEnd + 1).trim()
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut
  return trimmed.replace(/[\s,;:.–-]+$/, '')
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

// Random persona pool — used when the model echoes a placeholder handle/name,
// leaves it blank, or invents something bot/brand-looking. Every entry must
// read like a REAL PERSON commenting (first+last name, casual handle), never
// a meme page or a bot.
const PERSONAS = [
  { name: 'Jess Carter', handle: '@jess.carterr' },
  { name: 'Mike Delgado', handle: '@mikedelgado_' },
  { name: 'Tina Alvarez', handle: '@tina.alv92' },
  { name: 'Sam Okafor', handle: '@samokafor' },
  { name: 'Lena Brooks', handle: '@lenabrooks_04' },
  { name: 'Chris Bautista', handle: '@c.bautista7' },
  { name: 'Maya Lindqvist', handle: '@maya.lindq' },
  { name: 'Derek Liu', handle: '@derekliu88' },
  { name: 'Abby Stone', handle: '@abbystonee' },
  { name: 'Jordan Price', handle: '@jordanp_44' },
  { name: 'Nina Rossi', handle: '@nina.rossi3' },
  { name: 'Theo Marsh', handle: '@theomarsh_' }
]

// Detect placeholder/echoed text the model sometimes copies from the prompt.
const PLACEHOLDER_RE = /invent|do not echo|echo this|creative (display|handle)|unrelated_to_topic|display name|<.*>|punchy @handle|personal username/i

// What a real person's username looks like: lowercase letters/digits with
// optional dots/underscores, 3-25 chars. Anything else (spaces, symbols,
// uppercase soup) reads as a bot or a brand page.
const HUMAN_HANDLE_RE = /^[a-z0-9][a-z0-9._]{2,24}$/
// Display names: letters with normal name punctuation, max 30 chars.
const HUMAN_NAME_RE = /^[A-Za-z][A-Za-z .'-]{1,29}$/
// Digit-soup handles (@user48211998877) scream "bot" even when syntactically valid.
const MAX_HANDLE_DIGITS = 4

// Random (not topic-deterministic) so a repeat topic doesn't get pinned to
// the identical persona every day — that repetition itself reads as botted.
function fallbackPersona () {
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)]
}

// Salvage model output before rejecting it: strip illegal characters, fix
// case, trim length. Only fall back when nothing human-looking remains —
// over-rejecting would funnel everything into the small pool.
function salvageHandle (raw) {
  const cleaned = String(raw)
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._]/g, '')
    // Edge dots aren't valid usernames on most platforms; edge underscores are.
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24)
  if (!HUMAN_HANDLE_RE.test(cleaned)) return null
  if (cleaned.replace(/[^0-9]/g, '').length > MAX_HANDLE_DIGITS) return null
  return cleaned
}

function salvageName (raw) {
  const cleaned = String(raw)
    .replace(/[^A-Za-z .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30)
  return HUMAN_NAME_RE.test(cleaned) ? cleaned : null
}

function cleanPersona (rawName, rawHandle) {
  const bad = (v) => !v || typeof v !== 'string' || !v.trim() || PLACEHOLDER_RE.test(v)
  if (bad(rawName) || bad(rawHandle)) return fallbackPersona()

  const name = salvageName(rawName)
  const handle = salvageHandle(rawHandle)
  if (!name || !handle) return fallbackPersona()

  return { name, handle: `@${handle}` }
}

// Normalize a raw (possibly partial) model object into the full content shape.
export function normalizeContent (raw, topic) {
  const safe = raw && typeof raw === 'object' ? raw : {}
  const persona = cleanPersona(safe.name, safe.handle)
  return {
    fact: asText(safe.fact, `Most people never notice what ${topic} is really about`, 240),
    reply: asText(safe.reply, 'The best stories hide their meaning in plain sight', 160),
    // Cap at 100: YouTube rejects titles longer than 100 chars.
    youtube_title: asText(safe.youtube_title, `Bet you never noticed this about ${topic}`, 100),
    youtube_description: asText(
      safe.youtube_description,
      `The ${topic} detail everyone missed. #shorts #viral #movies #filmtheory #movielore #didyouknow`
    ),
    image_search_terms: asArray(safe.image_search_terms, [topic, `${topic} movie`, `${topic} poster`]),
    avatar_search_terms: asArray(safe.avatar_search_terms, [`${topic} avatar`, `${topic} icon`]),
    handle: persona.handle,
    name: persona.name,
    mood: asMood(safe.mood),
    tags: asArray(safe.tags, ['filmtheory', 'movielore', 'didyouknow'])
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

export const __config = { DEFAULT_MODEL, PERSONAS }
