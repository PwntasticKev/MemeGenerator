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

// Sequel numbers, roman numerals, and years distinguish EDITIONS of the same
// franchise ("Mortal Kombat" vs "Mortal Kombat II", "Cape Fear (1962)" vs the
// 1991 remake). They are short, so they need their own pattern — the length>=3
// word filter would drop them.
//
// Deliberately NARROW: only sequel numbers 1-19 and 19xx/20xx years. A bare
// \d+ would treat resolution tokens (720, 1080, 2160) as editions and falsely
// reject valid images. Single-letter romans (i, v, x) are also deliberately
// excluded — they collide with ordinary words/initials ("Saw X", "Rocky V"
// are simply treated as numeral-free rather than risk false vetoes).
const SEQUEL_OR_YEAR_RE = /^(1[0-9]?|[2-9]|19\d{2}|20\d{2})$/
// Roman numerals canonicalize to digits so "Mortal Kombat II" and
// "Mortal Kombat 2" are recognized as the SAME edition.
const ROMAN_TO_DIGIT = Object.freeze({
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9',
  xi: '11', xii: '12', xiii: '13', xiv: '14', xv: '15'
})

function isNumeralToken (w) {
  return SEQUEL_OR_YEAR_RE.test(w) || Object.hasOwn(ROMAN_TO_DIGIT, w)
}

function tokenize (text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function significantTokens (text) {
  return tokenize(text).filter(
    (w) => (w.length >= 3 || isNumeralToken(w)) && !TITLE_STOPWORDS.has(w)
  )
}

// Edition-distinguishing tokens (sequel numbers / years) of a title, in
// canonical digit form (II -> 2).
function numeralTokens (text) {
  return tokenize(text)
    .filter(isNumeralToken)
    .map((w) => ROMAN_TO_DIGIT[w] || w)
}

// Do two source titles refer to DIFFERENT editions of something? True when both
// carry numerals (sequel number / year) and they share none — e.g. "Cape Fear
// (1991 film)" vs "Cape Fear 1962 poster". Used so the images of one video can
// never mix two films/editions. A numeral-free title never conflicts.
export function numeralConflict (titleA, titleB) {
  const a = numeralTokens(titleA)
  const b = numeralTokens(titleB)
  if (a.length === 0 || b.length === 0) return false
  return !a.some((n) => b.includes(n))
}

// Does `candidateTitle` plausibly refer to the same thing as `topic`?
// EVERY distinctive word of the topic must appear as a whole word in the title
// (a 2/3 overlap let "Super Mario Bros" art through for "Super Mario Galaxy"),
// and a title carrying a sequel/year numeral that contradicts the topic's is
// rejected. Titles with no numeral are NOT vetoed — catalog titles (iTunes)
// rarely carry years.
export function isRelevantTitle (candidateTitle, topic) {
  const topicTokens = significantTokens(topic)
  if (topicTokens.length === 0) return true // nothing to match on — don't over-filter
  const hay = ' ' + tokenize(candidateTitle).join(' ') + ' '
  const words = topicTokens.filter((t) => !isNumeralToken(t))
  if (!words.every((w) => hay.includes(` ${w} `))) return false
  const topicNums = numeralTokens(topic)
  const titleNums = numeralTokens(candidateTitle)
  if (topicNums.length > 0 && titleNums.length > 0 && !topicNums.some((n) => titleNums.includes(n))) {
    return false
  }
  return true
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

async function tmdbImageUrls (query, limit, topic) {
  const key = process.env.TMDB_API_KEY
  if (!key) return []
  try {
    const hit = await tmdbSearchMulti(query)
    if (!hit) return []
    const hitTitle = hit.title || hit.name || ''
    if (!isRelevantTitle(hitTitle, topic || query)) return []

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
      .map((p) => ({ url: `${TMDB_IMG_BASE}${p}`, title: hitTitle }))

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

async function googleImageUrls (query, limit, topic) {
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
    return (data.items || [])
      .filter((i) => isRelevantTitle(`${i.title || ''} ${i.snippet || ''}`, topic || query))
      .map((i) => (i.link ? { url: i.link, title: i.title || '' } : null))
      .filter(Boolean)
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

// Poster/still entities (movie, TV) vs. music entities (album, musicVideo).
// Soundtrack/album covers are a WEAK first frame for a movie/TV channel — a
// CD or a busy collage instead of key art — so the orchestrator queries the
// two sets separately and treats music art as backfill only. See
// gatherCandidateUrls.
const ITUNES_POSTER_ENTITIES = ['movie', 'tvSeason']
const ITUNES_MUSIC_ENTITIES = ['album', 'musicVideo']

async function itunesImageUrls (query, limit, topic, entities = ITUNES_POSTER_ENTITIES) {
  const relevanceTarget = topic || query
  // iTunes search returns ZERO results when the term carries a disambiguation
  // parenthetical ("Cape Fear (1991)") — strip it from the QUERY only; the
  // full topic still drives relevance, and the result's releaseDate year is
  // appended to its title so the year veto can tell editions apart.
  const searchTerm = query.replace(/\s*\([^)]*\)\s*$/, '').trim() || query
  try {
    const groups = await Promise.all(
      entities.map(async (entity) => {
        try {
          const url =
            'https://itunes.apple.com/search' +
            `?term=${encodeURIComponent(searchTerm)}` +
            `&entity=${entity}&limit=4`
          const data = await itunesGet(url)
          return (data.results || [])
            .map((r) => {
              const year = String(r.releaseDate || '').slice(0, 4)
              const title = [r.trackName, r.collectionName, r.artistName, year]
                .filter(Boolean)
                .join(' ')
              return { raw: r.artworkUrl100 || r.artworkUrl60, title }
            })
            // Only keep results whose title actually matches the topic.
            .filter((c) => c.raw && isRelevantTitle(c.title, relevanceTarget))
            .map((c) => ({ url: upscaleItunesArtwork(c.raw), title: c.title }))
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
      .map((p) => {
        const src = p?.original?.source || p?.thumbnail?.source
        return src ? { url: src, title: p.title || '' } : null
      })
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
        const src = info.thumburl || info.url
        return src ? { url: src, title: p.title || '' } : null
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// Build an ordered, de-duplicated list of candidates across all sources. Each
// candidate is { url, title } — title is the SOURCE's name for the image (used
// for the cross-image same-edition check). Scraped URLs have no title (null).
//
// Order is by IMAGE TYPE, not just by source, so the strongest first frame
// wins. Real poster/still art (TMDB, Google, iTunes movie/TV, Wikipedia lead)
// comes FIRST; soundtrack/album covers and Commons file noise are BACKFILL,
// used only when no real key art exists. This stops weak topics from shipping
// a CD cover as image #1 (the Avatar / Mortal Kombat II failure).
async function gatherCandidateUrls (term, perSource, scrape, topic) {
  const [posterTier, backfillTier] = await Promise.all([
    Promise.all([
      tmdbImageUrls(term, perSource, topic),
      googleImageUrls(term, perSource, topic),
      itunesImageUrls(term, perSource, topic, ITUNES_POSTER_ENTITIES),
      wikipediaLeadImageUrls(term, perSource, topic)
    ]),
    Promise.all([
      itunesImageUrls(term, perSource, topic, ITUNES_MUSIC_ENTITIES),
      wikimediaCommonsImageUrls(term, perSource, topic),
      typeof scrape === 'function'
        ? Promise.resolve(scrape(term, perSource))
          .then((urls) => (urls || []).map((u) => ({ url: u, title: null })))
          .catch(() => [])
        : Promise.resolve([])
    ])
  ])
  const groups = [...posterTier, ...backfillTier]
  const seen = new Set()
  const ordered = []
  for (const group of groups) {
    for (const c of group || []) {
      if (c && c.url && !seen.has(c.url) && !isBannedHost(c.url)) {
        seen.add(c.url)
        ordered.push(c)
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
  const acceptedTitles = []

  for (const term of searchTerms) {
    if (collected.length >= count) break
    const candidates = await gatherCandidateUrls(term, count + 6, scrape, topic)
    for (const { url, title } of candidates) {
      if (collected.length >= count) break
      if (usedUrls.has(url)) continue
      usedUrls.add(url)

      // Same-edition guard: all images of one video must depict the SAME
      // film/show. A candidate whose source title carries a sequel/year numeral
      // conflicting with an already-accepted image's title (e.g. "Cape Fear
      // (1991)" after "Cape Fear 1962 poster") is a different edition — skip it.
      if (title && acceptedTitles.some((t) => numeralConflict(title, t))) continue

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
      if (title) acceptedTitles.push(title)
      collected.push({ path: filePath, url, title: title || null, meta: result.meta })
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
