// Controllo lingue: elenca le frasi passate a t()/tr() che non hanno la traduzione inglese
// nel dizionario di src/lib/i18n.tsx.  Uso: node scripts/i18n-audit.mjs [filtro-file]
import fs from 'fs'
import path from 'path'
const dict = fs.readFileSync('src/lib/i18n.tsx', 'utf8')
const keys = new Set()
for (const m of dict.matchAll(/^\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*:/gm)) keys.add(eval(m[1]))
const files = []
const walk = d => fs.readdirSync(d).forEach(f => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !p.endsWith('i18n.tsx') && files.push(p) })
walk('src')
const only = process.argv.slice(2)
let n = 0
for (const f of files) {
  if (only.length && !only.some(o => f.includes(o))) continue
  const s = fs.readFileSync(f, 'utf8')
  const miss = new Set()
  for (const m of s.matchAll(/\b(?:tr|t)\((\s*(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))\s*\)/g)) {
    let k; try { k = eval(m[1]) } catch { continue }
    if (!keys.has(k)) miss.add(k)
  }
  if (miss.size) { console.log('## ' + f); for (const k of miss) { console.log('  ' + JSON.stringify(k)); n++ } }
}
console.log('Frasi senza inglese:', n, '· voci nel dizionario:', keys.size)
