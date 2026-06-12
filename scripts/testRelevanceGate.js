// testRelevanceGate.js
//
// Offline unit tests for the image relevance gate (no network). Guards the
// "both images must be the SAME movie/show, not just loosely related" rule:
//   - whole-word matching (no substring false-positives)
//   - ALL distinctive topic words must appear in the source title
//   - sequel/year numerals (II, 2, 1962) are kept and veto conflicting titles
//   - numeralConflict() keeps the two images of one video on the same edition
//
//   node scripts/testRelevanceGate.js     → exit 0 all pass, 1 otherwise

import { isRelevantTitle, numeralConflict } from './imageProvider.js'

const cases = []
const t = (name, actual, expected) => cases.push({ name, actual, expected })

// --- whole-word matching ----------------------------------------------------
t('substring is not a word match ("Dandelions" ≠ "Dandelion")',
  isRelevantTitle('Dandelions field in spring', 'Dandelion'), false)
t('exact single-token topic matches',
  isRelevantTitle('Dandelion (2026 film) poster', 'Dandelion'), true)

// --- ALL distinctive words required (the Super Mario failure) ---------------
t('different movie sharing 2/3 words is rejected',
  isRelevantTitle('The Super Mario Bros. Movie', 'The Super Mario Galaxy Movie'), false)
t('same movie with extra words (soundtrack) is accepted',
  isRelevantTitle('The Super Mario Galaxy Movie (Original Soundtrack)', 'The Super Mario Galaxy Movie'), true)
t('person photo missing the title words is rejected',
  isRelevantTitle('James Cameron at the premiere', 'Avatar: Fire and Ash'), false)
t('commons file title containing all words is accepted',
  isRelevantTitle('File:Avatar Fire and Ash logo.png', 'Avatar: Fire and Ash'), true)

// --- sequel/year numerals kept as veto tokens -------------------------------
t('original-film art is rejected for a sequel topic (II vs 1995)',
  isRelevantTitle('Mortal Kombat (1995 film)', 'Mortal Kombat II'), false)
t('sequel art is accepted for the sequel topic',
  isRelevantTitle('Mortal Kombat II (2026 film)', 'Mortal Kombat II'), true)
t('remake year conflicts with the original-year topic',
  isRelevantTitle('Cape Fear (1991 film)', 'Cape Fear (1962)'), false)
t('matching year is accepted',
  isRelevantTitle('Cape Fear 1962 poster', 'Cape Fear (1962)'), true)
t('a title with NO numeral is not vetoed (iTunes titles rarely carry years)',
  isRelevantTitle('Cape Fear', 'Cape Fear (1962)'), true)

// --- numeralConflict: cross-image same-edition guard -------------------------
t('1991 vs 1962 titles conflict',
  numeralConflict('Cape Fear (1991 film)', 'Cape Fear 1962 poster'), true)
t('II vs 1995 titles conflict',
  numeralConflict('Mortal Kombat II', 'Mortal Kombat (1995)'), true)
t('shared numeral does not conflict',
  numeralConflict('Mortal Kombat II (2026)', 'File:Mortal Kombat II logo.png'), false)
t('numeral-free title never conflicts',
  numeralConflict('Avatar Fire and Ash poster', 'Avatar Fire and Ash 2025 teaser'), false)
t('both numeral-free never conflicts',
  numeralConflict('Hokum poster', 'Hokum still'), false)
t('resolution tokens are not edition numerals (720 vs 1080)',
  numeralConflict('Dune 720 screenshot', 'Dune 1080 poster'), false)
t('roman and digit forms of the same sequel do not conflict (II vs 2)',
  numeralConflict('Mortal Kombat II poster', 'Mortal Kombat 2 still'), false)
t('digit-form sequel title is accepted for roman-numeral topic',
  isRelevantTitle('Mortal Kombat 2 (2026)', 'Mortal Kombat II'), true)

// --- run ---------------------------------------------------------------------
let failed = 0
for (const c of cases) {
  const ok = c.actual === c.expected
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗ FAIL'}  ${c.name}${ok ? '' : ` (got ${c.actual}, want ${c.expected})`}`)
}
console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed === 0 ? 0 : 1)
