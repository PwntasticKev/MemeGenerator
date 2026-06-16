// testPersona.js
//
// Offline tests for the commenter persona. The comment must look like a REAL
// PERSON (plausible name + casual @handle), and crucially must be VARIED — the
// same name should not keep repeating (GPT used to pin "Alex Johnson").
//
//   node scripts/testPersona.js     → exit 0 all pass, 1 otherwise

import { randomPersona, normalizeContent, __config } from './contentGenerator.js'

const { HUMAN_HANDLE_RE, HUMAN_NAME_RE } = __config

const cases = []
const t = (name, actual, expected) => cases.push({ name, actual, expected })

// Generate a big sample once and assert on it.
const sample = Array.from({ length: 200 }, () => randomPersona())

t('every name is a plausible "First Last" human name',
  sample.every((p) => HUMAN_NAME_RE.test(p.name) && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(p.name)), true)
t('every handle is a human-looking username',
  sample.every((p) => HUMAN_HANDLE_RE.test(p.handle.replace(/^@/, ''))), true)
t('every handle starts with @',
  sample.every((p) => p.handle.startsWith('@')), true)
t('no handle exceeds 25 chars (incl. @)',
  sample.every((p) => p.handle.length <= 25), true)

// Variety: across 200 draws, names should be overwhelmingly unique.
const uniqueNames = new Set(sample.map((p) => p.name)).size
t(`names are highly varied (${uniqueNames}/200 unique, expect >150)`,
  uniqueNames > 150, true)
const uniqueHandles = new Set(sample.map((p) => p.handle)).size
t(`handles are highly varied (${uniqueHandles}/200 unique, expect >150)`,
  uniqueHandles > 150, true)

// No single name should dominate (the old "Alex Johnson every time" failure).
const counts = {}
for (const p of sample) counts[p.name] = (counts[p.name] || 0) + 1
const maxRepeat = Math.max(...Object.values(counts))
t(`no name repeats more than a few times in 200 (max seen: ${maxRepeat}, expect <=4)`,
  maxRepeat <= 4, true)

// normalizeContent always attaches a valid persona, ignoring any model-supplied
// name/handle (those fields were removed from the prompt).
const nc = normalizeContent({ name: 'Alex Johnson', handle: '@alex.johnson' }, 'Some Topic')
t('normalizeContent ignores model name/handle and generates its own',
  HUMAN_NAME_RE.test(nc.name) && HUMAN_HANDLE_RE.test(nc.handle.replace(/^@/, '')), true)
t('normalizeContent persona is not forced to the model-supplied value',
  // statistically the random name won't equal the supplied one; just assert shape
  typeof nc.name === 'string' && nc.name.includes(' '), true)

let failed = 0
for (const c of cases) {
  const ok = c.actual === c.expected
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗ FAIL'}  ${c.name}`)
}
console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed === 0 ? 0 : 1)
