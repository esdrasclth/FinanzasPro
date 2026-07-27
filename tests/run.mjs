// Corre todas las suites de extremo a extremo contra un servidor ya levantado.
//
// Cada suite crea su propio usuario y sus propios datos, así que se pueden
// ejecutar en cualquier orden y no dependen entre sí.
//
//   npm run test:e2e
//
// Ver tests/README.md para levantar la base local antes.

import { readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE_URL || 'http://localhost:3000'

// Un filtro opcional permite correr una sola suite: npm run test:e2e -- repartos
const filtro = process.argv[2] || ''

const suites = readdirSync(join(aqui, 'e2e'))
  .filter(f => f.endsWith('.mjs'))
  .filter(f => !filtro || f.includes(filtro))
  .sort()

if (suites.length === 0) {
  console.error(filtro ? `Ninguna suite coincide con "${filtro}"` : 'No hay suites en tests/e2e')
  process.exit(1)
}

// Falla pronto y con un mensaje claro si nadie está escuchando: es el error
// más común al correrlas.
try {
  const r = await fetch(`${BASE}/login`, { redirect: 'manual' })
  if (r.status >= 500) throw new Error('respuesta ' + r.status)
} catch {
  console.error(`\nNo hay un servidor respondiendo en ${BASE}.`)
  console.error('Levántalo con `npm run dev` (ver tests/README.md) y vuelve a intentar.\n')
  process.exit(1)
}

const correr = (archivo) =>
  new Promise(res => {
    const p = spawn(process.execPath, [join(aqui, 'e2e', archivo)], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: BASE },
    })
    p.on('close', code => res(code === 0))
  })

console.log(`\nEjecutando ${suites.length} ${suites.length === 1 ? 'suite' : 'suites'} contra ${BASE}\n`)

const fallidas = []
for (const s of suites) {
  console.log(`\n──────── ${s}`)
  if (!(await correr(s))) fallidas.push(s)
}

console.log('\n════════════════════════════════════════')
if (fallidas.length === 0) {
  console.log(`Todas las suites pasaron (${suites.length})`)
  process.exit(0)
}
console.log(`${fallidas.length} de ${suites.length} suites fallaron:`)
fallidas.forEach(f => console.log('  · ' + f))
process.exit(1)
