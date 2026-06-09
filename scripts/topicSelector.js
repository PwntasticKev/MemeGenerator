// topicSelector.js  (Phase 3 — automatic daily topics)
//
// Picks the day's rage-bait topic with ZERO manual input:
//   1. Pull trending candidates from keyless feeds (Apple iTunes RSS + Wikipedia
//      top pageviews).
//   2. Ask GPT to rank the best rage-bait-able topics, avoiding recent history.
//   3. Validate image-resolvability (Phase 1 guarantee) — only return a topic we
//      can actually illustrate with real images. No blanks, ever.
//
//   import { selectDailyTopic } from './topicSelector.js'
//   const { topic, source } = await selectDailyTopic()

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import os from 'os'
import { fileURLToPath } from 'url'
import { getOpenAIClient, DEFAULT_MODEL } from './contentGenerator.js'
import { getValidImages } from './imageProvider.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const HISTORY_PATH = path.join(ROOT, 'data', 'posted-history.json')

// Curated last-resort seeds (all reliably image-resolvable) if every feed fails.
const SEED_TOPICS = [
  'The Godfather', 'Breaking Bad', 'Oppenheimer', 'Stranger Things',
  'Dune', 'Inside Out 2', 'The Batman', 'Squid Game'
]

// --- history --------------------------------------------------------------

export function loadHistory () {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
  } catch {
    return []
  }
}

export function recordPosted (entry) {
  const history = loadHistory()
  const next = [...history, entry]
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true })
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(next, null, 2))
  return next
}

function recentTopics (history, days = 30) {
  return history.slice(-days).map((h) => String(h.topic || '').toLowerCase())
}

// --- trending feeds (keyless) ---------------------------------------------

async function fetchAppleTop (kind) {
  // kind: topmovies | toptvepisodes | topalbums
  try {
    const { data } = await axios.get(
      `https://itunes.apple.com/us/rss/${kind}/limit=25/json`,
      { timeout: 10000 }
    )
    return (data?.feed?.entry || [])
      .map((e) => e['im:name']?.label)
      .filter(Boolean)
  } catch {
    return []
  }
}

function recentPageviewDate () {
  // Pageview "top" data lags ~1-2 days; use 2 days ago to be safe.
  const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return { y, m, day }
}

const WIKI_SKIP = /^(Main_Page|Special:|Wikipedia:|Portal:|Category:|Help:|Template:|File:)/

async function fetchWikipediaTrending () {
  try {
    const { y, m, day } = recentPageviewDate()
    const { data } = await axios.get(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${day}`,
      { timeout: 10000, headers: { 'User-Agent': 'MemeGenerator/1.0 (topic selection)' } }
    )
    return (data?.items?.[0]?.articles || [])
      .map((a) => a.article)
      .filter((a) => a && !WIKI_SKIP.test(a))
      .map((a) => a.replace(/_/g, ' '))
      .slice(0, 40)
  } catch {
    return []
  }
}

// Strip Wikipedia/Apple disambiguators & qualifiers that leak into copy/images,
// e.g. "Backrooms (film)" -> "Backrooms", "Dune (2021 film)" -> "Dune",
// "X (Original Motion Picture Soundtrack)" -> "X".
export function cleanTopic (t) {
  return String(t)
    .replace(/\s*\([^)]*\)\s*$/g, '')   // trailing (parenthetical)
    .replace(/\s*[:\-–]\s*(original motion picture soundtrack|soundtrack|the album|deluxe).*$/i, '')
    .trim()
}

// Combined, de-duplicated candidate list.
export async function fetchTrendingCandidates () {
  const [movies, tv, albums, wiki] = await Promise.all([
    fetchAppleTop('topmovies'),
    fetchAppleTop('toptvepisodes'),
    fetchAppleTop('topalbums'),
    fetchWikipediaTrending()
  ])
  const seen = new Set()
  const out = []
  for (const raw of [...movies, ...tv, ...albums, ...wiki]) {
    const t = cleanTopic(raw)
    const key = t.toLowerCase()
    if (key && !seen.has(key)) {
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

// --- GPT ranking ----------------------------------------------------------

// Audience + topic strategy, learned from what actually went viral on the
// channel (Tarantino films, Star Wars, John Wick, Minecraft Movie, Terrifier
// all hit 4k–27k; old/niche picks like Goonies & Happy Gilmore flopped at ~900).
const RANK_SYSTEM =
  'You pick topics for a viral rage-bait Shorts channel about movies, TV, and pop culture. ' +
  'The audience is 16-34 meme-native film/TV fans who love spicy hot takes and arguing in the comments ' +
  'about CURRENT and hugely popular franchises. Respond with strict JSON only.'

async function rankTopics (candidates, avoid) {
  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: RANK_SYSTEM },
        {
          role: 'user',
          content:
            `From this list of trending items, pick the 8 BEST rage-bait topics.\n\n` +
            `STRONGLY PREFER:\n` +
            `- Currently trending or recent (last ~5 years) movies & TV shows\n` +
            `- Massive passionate fandoms: Marvel, DC, Star Wars, John Wick, Dune, horror franchises (Terrifier, etc.), big Netflix/HBO shows, blockbuster sequels\n` +
            `- Titles people are actively arguing about right now\n\n` +
            `HARD-AVOID (these flop or backfire):\n` +
            `- Old/dated movies (pre-2010 unless a still-huge franchise)\n` +
            `- Obscure, arthouse, foreign, or niche titles nobody's talking about\n` +
            `- News, politics, tragedies, real people, poems, historical or non-entertainment topics\n` +
            `- AMBIGUOUS one-word or common-name titles that could mean several things (e.g. "Michael", "It", "Them", "Smile") — they break image search. Prefer a full, unmistakable title ("Deadpool & Wolverine", "Dune: Part Two", "Stranger Things").\n\n` +
            `Also AVOID anything similar to these recently-used: ${avoid.join(', ') || '(none)'}.\n\n` +
            `Trending items:\n${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n` +
            `Return JSON: {"topics": ["title1", ..., "title8"]}, best first. Each must be the EXACT, CLEAN ` +
            `movie/show/franchise name — do NOT add words like "The Drama of", ": A Debate", or "Reboot" unless that's the real title.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    })
    const text = completion.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(text)
    return Array.isArray(parsed.topics) ? parsed.topics.filter((t) => typeof t === 'string' && t.trim()) : []
  } catch (err) {
    console.warn(`⚠️  topicSelector: GPT ranking failed (${err.message})`)
    return []
  }
}

// --- image-resolvability gate ---------------------------------------------

async function topicHasImages (topic) {
  const tmp = path.join(os.tmpdir(), `topiccheck_${topic.replace(/[^a-z0-9]+/gi, '_')}_${process.pid}`)
  try {
    await getValidImages({
      searchTerms: [topic, `${topic} movie`, `${topic} poster`],
      count: 2,
      outputDir: tmp
    })
    return true
  } catch {
    return false
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// --- orchestration --------------------------------------------------------

/**
 * Select the day's topic with no manual input.
 * @param {Object} [opts]
 * @param {boolean} [opts.validateImages=true]  Require the topic to resolve to real images.
 * @returns {Promise<{topic: string, source: string, candidatesConsidered: number}>}
 */
export async function selectDailyTopic (opts = {}) {
  const validateImages = opts.validateImages !== false
  const history = loadHistory()
  const avoid = recentTopics(history)

  const candidates = await fetchTrendingCandidates()
  const ranked = candidates.length ? await rankTopics(candidates, avoid) : []

  // Ordered preference: GPT-ranked trending -> raw trending -> seeds.
  // Clean again in case the ranker re-introduced a qualifier.
  const ordered = [
    ...ranked.map(cleanTopic),
    ...candidates.filter((c) => !ranked.some((r) => r.toLowerCase() === c.toLowerCase())),
    ...SEED_TOPICS
  ].filter((t) => t && !avoid.includes(t.toLowerCase()))

  const sourceOf = (t) =>
    ranked.some((r) => r.toLowerCase() === t.toLowerCase())
      ? 'gpt-ranked-trending'
      : candidates.some((c) => c.toLowerCase() === t.toLowerCase())
        ? 'raw-trending'
        : 'seed'

  for (const topic of ordered) {
    if (!validateImages || (await topicHasImages(topic))) {
      return { topic, source: sourceOf(topic), candidatesConsidered: candidates.length }
    }
  }

  // Absolute fallback (should never hit): first seed, unvalidated.
  return { topic: SEED_TOPICS[0], source: 'seed-fallback', candidatesConsidered: candidates.length }
}
