// imageProvider.js
//
// Bulletproof image sourcing for the meme pipeline.
//
// Design goals (see relaunch Phase 1):
//   1. NEVER ship a blank / random / placeholder image. Every returned image is
//      decoded and validated. If no source yields a valid image, we THROW so the
//      caller can skip the post rather than publish garbage.
//   2. Prefer real, topical sources in priority order:
//        TMDB (movies/TV/people) -> Google CSE -> Wikipedia/Wikimedia -> Bing scrape
//      The first three are keyed/keyless HTTP APIs; the Bing scraper is injected by
//      the caller (it lives in generateMeme.js and needs puppeteer).
//   3. Immutable style: functions return new values, no shared mutable state.
//
// All functions are intentionally small and independently testable.

import axios from 'axios'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Hosts that only ever serve placeholder / random / non-topical images.
// We refuse these outright even if they return a technically-valid JPEG.
const BANNED_HOSTS = [
  'via.placeholder.com',
  'placehold.co',
  'placehold.it',
  'picsum.photos',
  'source.unsplash.com', // shut down in 2024 — always fails or redirects
  'dummyimage.com',
  'loremflickr.com'
]

const VALIDATION_DEFAULTS = Object.freeze({
  minWidth: 320,
  minHeight: 320,
  maxAspectRatio: 3.0, // reject banners / 1px lines / spacer images
  allowedFormats: ['jpeg', 'png', 'webp', 'gif']
})

// Returns { valid, reason, meta } — never throws.
export async function validateImageBuffer (buffer, options = {}) {
  const cfg = { ...VALIDATION_DEFAULTS, ...options }

  if (!buffer || buffer.length < 2048) {
    return { valid: false, reason: `too small (${buffer ? buffer.length : 0} bytes)`, meta: null }
  }

  try {
    const meta = await sharp(buffer).metadata()
    const { width, height, format } = meta

    if (!width || !height) {
      return { valid: false, reason: 'undecodable / no dimensions', meta }
    }
    if (!cfg.allowedFormats.includes(format)) {
      return { valid: false, reason: `format "${format}" not allowed`, meta }
    }
    if (width < cfg.minWidth || height < cfg.minHeight) {
      return { valid: false, reason: `dimensions ${width}x${height} below min ${cfg.minWidth}x${cfg.minHeight}`, meta }
    }
    const aspect = Math.max(width / height, height / width)
    if (aspect > cfg.maxAspectRatio) {
      return { valid: false, reason: `aspect ratio ${aspect.toFixed(2)} too extreme`, meta }
    }
    return { valid: true, reason: 'ok', meta: { width, height, format } }
  } catch (err) {
    return { valid: false, reason: `decode failed: ${err.message}`, meta: null }
  }
}

// Lightweight perceptual hash (8x8 average-hash, 64 bits) to detect when two
// images are the SAME picture even at different URLs/sizes. Returns a bit string.
export async function perceptualHash (buffer) {
  try {
    const data = await sharp(buffer).resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer()
    let sum = 0
    for (const px of data) sum += px
    const avg = sum / data.length
    let bits = ''
    for (const px of data) bits += px >= avg ? '1' : '0'
    return bits
  } catch {
    return null
  }
}

// Hamming distance between two equal-length bit strings.
function hammingDistance (a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

// Two 64-bit average-hashes within this distance are treated as the same image.
const DUPLICATE_HASH_THRESHOLD = 8

function isDuplicateHash (hash, acceptedHashes) {
  if (!hash) return false
  return acceptedHashes.some((h) => hammingDistance(hash, h) <= DUPLICATE_HASH_THRESHOLD)
}

function hostOf (url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function isBannedHost (url) {
  const host = hostOf(url)
  return BANNED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Fetch a URL and validate its bytes, retrying on transient throttling (429/503).
// Returns { url, buffer, meta } or null.
export async function fetchAndValidate (url, options = {}) {
  if (!url || isBannedHost(url)) return null
  const maxAttempts = options.retries ?? 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: options.timeout || 12000,
        maxContentLength: 25 * 1024 * 1024,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
        },
        validateStatus: (s) => (s >= 200 && s < 300) || s === 429 || s === 503
      })

      // Back off and retry on throttling.
      if (response.status === 429 || response.status === 503) {
        if (attempt < maxAttempts) {
          await sleep(400 * attempt + Math.floor(200 * attempt))
          continue
        }
        return null
      }

      const buffer = Buffer.from(response.data)
      const contentType = String(response.headers['content-type'] || '')
      if (contentType && !contentType.startsWith('image/')) return null

      const result = await validateImageBuffer(buffer, options.validation)
      if (!result.valid) return null
      return { url, buffer, meta: result.meta }
    } catch {
      if (attempt < maxAttempts) {
        await sleep(300 * attempt)
        continue
      }
      return null
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Relevance: only accept images whose source TITLE actually matches the topic,
// so we never ship a valid-but-unrelated picture (e.g. a random face for an
// off-catalog movie). If a source can't confirm relevance, the image is dropped.
// ---------------------------------------------------------------------------

const TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'vs',
  'movie', 'film', 'official', 'trailer', 'soundtrack', 'original', 'motion',
  'picture', 'ep', 'single', 'album', 'feat', 'featuring', 'presents', 'part',
  'season', 'episode', 'series', 'show', 'hd', 'poster', 'debate', 'drama'
])

function significantTokens (text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w))
}

// Does `candidateTitle` plausibly refer to the same thing as `topic`?
// Requires that a majority of the topic's distinctive tokens appear in the title.
export function isRelevantTitle (candidateTitle, topic) {
  const topicTokens = significantTokens(topic)
  if (topicTokens.length === 0) return true // nothing to match on — don't over-filter
  const hay = ' ' + String(candidateTitle).toLowerCase().replace(/[^a-z0-9]/g, ' ') + ' '
  const matched = topicTokens.filter((t) => hay.includes(' ' + t + ' ') || hay.includes(t))
  const ratio = matched.length / topicTokens.length
  // Single-token topics: that token must be present. Multi-token: at least half.
  return topicTokens.length === 1 ? matched.length === 1 : ratio >= 0.5
}

// ---------------------------------------------------------------------------
// Source: TMDB (best for movies / TV / people)
// ---------------------------------------------------------------------------

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w780'

export function tmdbConfigured () {
  return Boolean(process.env.TMDB_API_KEY)
}

async function tmdbSearchMulti (query) {
  const key = process.env.TMDB_API_KEY
  if (!key) return null
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${key}&query=${encodeURIComponent(query)}&include_adult=false`
  const { data } = await axios.get(url, { timeout: 10000 })
  const hit = (data.results || []).find((r) =>
    ['movie', 'tv', 'person'].includes(r.media_type)
  )
  return hit || null
}

async function tmdbImageUrls (query, limit) {
  const key = process.env.TMDB_API_KEY
  if (!key) return []
  try {
    const hit = await tmdbSearchMulti(query)
    if (!hit) return []

    const type = hit.media_type
    const id = hit.id
    const endpoint =
      type === 'person'
        ? `https://api.themoviedb.org/3/person/${id}/images?api_key=${key}`
        : `https://api.themoviedb.org/3/${type}/${id}/images?api_key=${key}`

    const { data } = await axios.get(endpoint, { timeout: 10000 })
    const paths = [
      ...(data.posters || []),
      ...(data.backdrops || []),
      ...(data.profiles || [])
    ]
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
      .map((p) => p.file_path)
      .filter(Boolean)
      .map((p) => `${TMDB_IMG_BASE}${p}`)

    return paths.slice(0, limit)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Source: Google Custom Search (requires GOOGLE_API_KEY + CX_ID)
// ---------------------------------------------------------------------------

export function googleConfigured () {
  return Boolean(process.env.GOOGLE_API_KEY && process.env.CX_ID)
}

async function googleImageUrls (query, limit) {
  if (!googleConfigured()) return []
  try {
    const url =
      'https://www.googleapis.com/customsearch/v1' +
      `?key=${process.env.GOOGLE_API_KEY}` +
      `&cx=${process.env.CX_ID}` +
      `&q=${encodeURIComponent(query)}` +
      '&searchType=image&imgSize=large&num=' +
      Math.min(limit, 10)
    const { data } = await axios.get(url, { timeout: 10000 })
    return (data.items || []).map((i) => i.link).filter(Boolean)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Source: iTunes / Apple Search API (keyless, high-quality official artwork)
//
// Best keyless source for pop-culture: official movie posters, TV season art,
// and album covers. Artwork comes back at 100px but Apple's CDN serves any size
// by swapping the dimensions segment, so we request large, sharp images.
// Generous rate limits (~20 req/min) — comfortably fine for daily posting.
// ---------------------------------------------------------------------------

function upscaleItunesArtwork (url) {
  // e.g. .../source/100x100bb.jpg -> .../source/1200x1200bb.jpg
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, '/1200x1200bb.$1')
}

async function itunesGet (url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await axios.get(url, { timeout: 10000, validateStatus: (s) => s < 600 })
      if (res.status === 403 || res.status === 429) {
        if (i < attempts) { await sleep(700 * i); continue }
        return { results: [] }
      }
      return res.data || { results: [] }
    } catch {
      if (i < attempts) { await sleep(500 * i); continue }
      return { results: [] }
    }
  }
  return { results: [] }
}

async function itunesImageUrls (query, limit, topic) {
  const entities = ['movie', 'tvSeason', 'album', 'musicVideo']
  const relevanceTarget = topic || query
  try {
    const groups = await Promise.all(
      entities.map(async (entity) => {
        try {
          const url =
            'https://itunes.apple.com/search' +
            `?term=${encodeURIComponent(query)}` +
            `&entity=${entity}&limit=4`
          const data = await itunesGet(url)
          return (data.results || [])
            // Only keep results whose title actually matches the topic.
            .filter((r) => isRelevantTitle(
              `${r.trackName || ''} ${r.collectionName || ''} ${r.artistName || ''}`,
              relevanceTarget
            ))
            .map((r) => r.artworkUrl100 || r.artworkUrl60)
            .filter(Boolean)
            .map(upscaleItunesArtwork)
        } catch {
          return []
        }
      })
    )
    const flat = groups.flat()
    return flat.slice(0, Math.max(limit + 2, 4))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Source: Wikipedia / Wikimedia (keyless, works today, great for named entities)
// ---------------------------------------------------------------------------

const WIKI_HEADERS = { 'User-Agent': 'MemeGenerator/1.0 (image sourcing; contact via repo)' }

// Wikipedia article lead images — one strong, topical image per matched page.
// Only pages whose TITLE matches the topic are used (Wikipedia search is fuzzy
// and otherwise returns loosely-related people/places).
async function wikipediaLeadImageUrls (query, limit, topic) {
  try {
    const url =
      'https://en.wikipedia.org/w/api.php' +
      '?action=query&format=json&origin=*' +
      '&generator=search&gsrlimit=' +
      Math.max(limit, 3) +
      `&gsrsearch=${encodeURIComponent(query)}` +
      '&prop=pageimages&piprop=original|thumbnail&pithumbsize=800'
    const { data } = await axios.get(url, { timeout: 10000, headers: WIKI_HEADERS })
    const pages = data?.query?.pages ? Object.values(data.query.pages) : []
    return pages
      .sort((a, b) => (a.index || 99) - (b.index || 99))
      .filter((p) => isRelevantTitle(p.title || '', topic || query))
      .map((p) => p?.original?.source || p?.thumbnail?.source)
      .filter(Boolean)
  } catch {
    return []
  }
}

// Wikimedia Commons file search (namespace 6) — many real topical image files
// per query. This is what makes the keyless path reliably reach 2+ images.
async function wikimediaCommonsImageUrls (query, limit, topic) {
  try {
    const url =
      'https://commons.wikimedia.org/w/api.php' +
      '?action=query&format=json&origin=*' +
      '&generator=search&gsrnamespace=6&gsrlimit=' +
      Math.max(limit + 6, 10) +
      `&gsrsearch=${encodeURIComponent(query)}` +
      '&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=900'
    const { data } = await axios.get(url, { timeout: 10000, headers: WIKI_HEADERS })
    const pages = data?.query?.pages ? Object.values(data.query.pages) : []
    return pages
      .sort((a, b) => (a.index || 99) - (b.index || 99))
      // The file title (e.g. "File:Breaking Bad logo.svg") must match the topic.
      .filter((p) => isRelevantTitle(p.title || '', topic || query))
      .map((p) => {
        const info = p?.imageinfo?.[0]
        if (!info) return null
        const mime = String(info.mime || '')
        // Skip SVGs/PDF/TIFF that sharp-on-canvas handles poorly as photos.
        if (mime && !/^image\/(jpe?g|png|webp|gif)$/.test(mime)) return null
        return info.thumburl || info.url
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

// Combined keyless Wikimedia source: lead images first (most on-topic), then
// Commons file search to backfill additional distinct images.
async function wikipediaImageUrls (query, limit, topic) {
  const [lead, commons] = await Promise.all([
    wikipediaLeadImageUrls(query, limit, topic),
    wikimediaCommonsImageUrls(query, limit, topic)
  ])
  return [...lead, ...commons]
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Build an ordered, de-duplicated list of candidate URLs across all sources.
async function gatherCandidateUrls (term, perSource, scrape, topic) {
  const groups = await Promise.all([
    tmdbImageUrls(term, perSource),
    googleImageUrls(term, perSource),
    itunesImageUrls(term, perSource, topic),
    wikipediaImageUrls(term, perSource, topic),
    typeof scrape === 'function'
      ? Promise.resolve(scrape(term, perSource)).catch(() => [])
      : Promise.resolve([])
  ])
  const seen = new Set()
  const ordered = []
  for (const group of groups) {
    for (const u of group || []) {
      if (u && !seen.has(u) && !isBannedHost(u)) {
        seen.add(u)
        ordered.push(u)
      }
    }
  }
  return ordered
}

/**
 * Fetch `count` validated, topical images and write them to `outputDir`.
 *
 * @param {Object} opts
 * @param {string[]} opts.searchTerms  Ordered search terms (best first).
 * @param {number}   opts.count        How many valid images to return.
 * @param {string}   opts.outputDir    Directory to write validated images into.
 * @param {Function} [opts.scrape]     Optional (term, n) => Promise<string[]> Bing/puppeteer fallback.
 * @returns {Promise<Array<{path, url, meta}>>}  Exactly `count` entries, or throws.
 */
export async function getValidImages ({ searchTerms, count = 2, outputDir, scrape, topic: topicArg }) {
  if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
    throw new Error('getValidImages: searchTerms is required')
  }
  if (!outputDir) throw new Error('getValidImages: outputDir is required')
  fs.mkdirSync(outputDir, { recursive: true })

  // Relevance is matched against the TOPIC (not each search term), so generic
  // GPT search terms can't drag in unrelated images.
  const topic = topicArg || searchTerms[0]

  const collected = []
  const usedUrls = new Set()
  const acceptedHashes = []

  for (const term of searchTerms) {
    if (collected.length >= count) break
    const candidates = await gatherCandidateUrls(term, count + 6, scrape, topic)
    for (const url of candidates) {
      if (collected.length >= count) break
      if (usedUrls.has(url)) continue
      usedUrls.add(url)
      const result = await fetchAndValidate(url)
      if (!result) continue

      // Reject images that are visually the same as one we already accepted, so
      // multi-image layouts never show the same picture twice.
      const hash = await perceptualHash(result.buffer)
      if (isDuplicateHash(hash, acceptedHashes)) continue
      if (hash) acceptedHashes.push(hash)

      const ext = result.meta.format === 'jpeg' ? 'jpg' : result.meta.format
      const filePath = path.join(outputDir, `image_${collected.length + 1}.${ext}`)
      fs.writeFileSync(filePath, result.buffer)
      collected.push({ path: filePath, url, meta: result.meta })
    }
  }

  if (collected.length < count) {
    throw new Error(
      `getValidImages: only found ${collected.length}/${count} valid images for terms [${searchTerms.join(', ')}]. ` +
        'Refusing to ship blanks — skipping this post.'
    )
  }
  return collected
}

export const __test = { isBannedHost, hostOf, BANNED_HOSTS, VALIDATION_DEFAULTS }
