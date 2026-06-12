// testPersona.js
//
// Offline unit tests for the commenter persona (name + @handle) so the fake
// comment always looks like a REAL PERSON, never a bot/brand page.
//
//   node scripts/testPersona.js     → exit 0 all pass, 1 otherwise

import { normalizeContent, __config } from './contentGenerator.js'

const HUMAN_HANDLE_RE = /^@[a-z0-9][a-z0-9._]{2,24}$/

const cases = []
const t = (name, actual, expected) => cases.push({ name, actual, expected })

// Echoed prompt placeholders fall back to a pool persona.
const echoed = normalizeContent(
  { name: '<INVENT a matching display name>', handle: '<INVENT a punchy @handle>' },
  'Some Topic'
)
t('echoed placeholder name falls back to a pool persona name',
  Boolean(echoed.name && !echoed.name.includes('<')), true)
t('echoed placeholder handle falls back to a human-looking handle',
  HUMAN_HANDLE_RE.test(echoed.handle), true)

// Good model output passes through, @ added when missing.
const good = normalizeContent({ name: 'Jess Carter', handle: 'jess.carterr' }, 'X')
t('valid handle gets @ prefix', good.handle, '@jess.carterr')
t('valid name passes through', good.name, 'Jess Carter')

// Bot/brand-looking handles are rejected in favor of a pool persona.
const junk = normalizeContent({ name: 'Cinema $hade!!', handle: '@Cinema Shade Page!!!' }, 'X')
t('handle with spaces/symbols/uppercase is replaced',
  HUMAN_HANDLE_RE.test(junk.handle), true)
t('name with symbols is replaced by a human name',
  /^[A-Za-z][A-Za-z .'-]{1,29}$/.test(junk.name), true)

const numbery = normalizeContent({ name: 'User 48211', handle: '@user48211998877' }, 'X')
t('long digit-soup bot handle is replaced',
  numbery.handle.replace(/[^0-9]/g, '').length <= 4, true)

// Salvageable output is normalized, NOT discarded (over-rejection would funnel
// every video into the small fallback pool).
const salvage = normalizeContent({ name: 'Mike Delgado', handle: '@Mike.Delgado_' }, 'X')
t('uppercase handle is lowercased and kept (trailing underscore preserved)',
  salvage.handle, '@mike.delgado_')
t('salvaged name is kept', salvage.name, 'Mike Delgado')

// Every pool persona must itself look human.
for (const p of __config.PERSONAS) {
  t(`pool persona "${p.name}" has a human-looking handle (${p.handle})`,
    HUMAN_HANDLE_RE.test(p.handle), true)
  t(`pool persona "${p.name}" has a real-person display name`,
    /^[A-Z][a-z]+ [A-Z]/.test(p.name), true)
}

let failed = 0
for (const c of cases) {
  const ok = c.actual === c.expected
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗ FAIL'}  ${c.name}${ok ? '' : ` (got ${JSON.stringify(c.actual)}, want ${JSON.stringify(c.expected)})`}`)
}
console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed === 0 ? 0 : 1)
