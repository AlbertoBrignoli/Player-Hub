// AUVI Exercise Library — seed della selezione calcio
// =====================================================
// Come si usa
//   1. (solo se si cambia la selezione) node scripts/build-football-exercises.mjs
//        → rigenera scripts/data/football_exercises.json da scripts/data/exercises.json
//   2. node scripts/seed-exercises.mjs
//        → scrive scripts/data/seed_exercises.sql (nessuna dipendenza npm, nessun accesso al DB)
//   3. applicare scripts/data/seed_exercises.sql al database (SQL editor di Supabase o psql),
//      DOPO la migrazione supabase/migrations/0028_exercise_library.sql.
//
// Cosa fa lo SQL (una sola transazione, rieseguibile con lo stesso risultato):
//   - carica le voci in una tabella temporanea (_seed_ex), poi aggancia le righe già esistenti
//     con lo stesso nome (lower(name), slug ancora NULL) assegnando lo slug, poi un solo
//     INSERT ... SELECT ... ON CONFLICT (slug) DO UPDATE; infine controlla che tutte le voci
//     risultino curate (altrimenti RAISE EXCEPTION → rollback);
//   - le righe nuove nascono con image_url NULL e gen_status 'pending' (niente immagini esterne:
//     le immagini valide sono solo quelle AUVI nel bucket exercise-images);
//   - sulle righe esistenti NON tocca mai image_url / image_3d_url / video_url / gen_* / archived;
//   - mette curated = true sulle voci della selezione; non cancella né archivia nient'altro
//     (il resto del catalogo resta disponibile dietro il filtro "catalogo completo");
//   - description: se già presente non viene sovrascritta; coaching_cues / common_mistakes /
//     position_relevance vuoti nel seed non cancellano quelli eventualmente scritti in app.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const IN = join(here, 'data', 'football_exercises.json')
const OUT = join(here, 'data', 'seed_exercises.sql')
const T = 'public.fitness_exercise_library'

const { items } = JSON.parse(readFileSync(IN, 'utf8'))

const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`)
const arr = (a) => (!a || a.length === 0 ? `'{}'::text[]` : `ARRAY[${a.map(q).join(', ')}]::text[]`)
const int = (n) => (Number.isInteger(n) ? String(n) : 'NULL')

// righe di staging: una VALUES per voce, poi un solo UPDATE (aggancio per nome) e un solo upsert
const SEED_COLS = [
  ['slug', 'text'], ['name', 'text'], ['name_it', 'text'], ['category', 'text'], ['subcategory', 'text'],
  ['difficulty', 'text'], ['note', 'text'], ['instructions', 'text[]'], ['coaching_cues', 'text[]'],
  ['common_mistakes', 'text[]'], ['primary_muscles', 'text[]'], ['secondary_muscles', 'text[]'],
  ['equipment_tags', 'text[]'], ['movement_pattern', 'text'], ['laterality', 'text'], ['source', 'text'],
  ['source_license', 'text'], ['football_relevance', 'smallint'], ['performance_goals', 'text[]'],
  ['position_relevance', 'text[]'], ['injury_prevention', 'text[]'],
]
const row = (it) => '(' + [
  q(it.slug), q(it.name), q(it.name_it), q(it.category), q(it.subcategory), q(it.difficulty),
  q(it.source === 'auvi' && it.instructions?.length ? (it.source_note ?? 'istruzioni AUVI da validare dal preparatore') : null),
  arr(it.instructions), arr(it.coaching_cues), arr(it.common_mistakes), arr(it.primary_muscles),
  arr(it.secondary_muscles), arr(it.equipment_tags), q(it.movement_pattern), q(it.laterality), q(it.source),
  q(it.source_license), int(it.football_relevance), arr(it.performance_goals), arr(it.position_relevance),
  arr(it.injury_prevention),
].join(', ') + ')'

// description: testo delle istruzioni (voci AUVI: con la nota "da validare" davanti); NULL se non ci sono
const DESC = `CASE WHEN cardinality(s.instructions) = 0 THEN NULL
       WHEN s.note IS NOT NULL THEN '[' || s.note || '] ' || array_to_string(s.instructions, ' ')
       ELSE array_to_string(s.instructions, ' ') END`

// campi aggiornati sulle righe esistenti (mai image_url / image_3d_url / video_url / gen_* / archived)
const keepIfEmpty = (c) => `${c} = CASE WHEN cardinality(EXCLUDED.${c}) > 0 THEN EXCLUDED.${c} ELSE fel.${c} END`
const ON_CONFLICT = [
  'name = EXCLUDED.name', 'name_it = EXCLUDED.name_it', 'category = EXCLUDED.category', 'subcategory = EXCLUDED.subcategory',
  'muscle_group = EXCLUDED.muscle_group', 'equipment = EXCLUDED.equipment', 'difficulty = EXCLUDED.difficulty',
  'description = COALESCE(fel.description, EXCLUDED.description)',
  'instructions = EXCLUDED.instructions', keepIfEmpty('coaching_cues'), keepIfEmpty('common_mistakes'),
  'primary_muscles = EXCLUDED.primary_muscles', 'secondary_muscles = EXCLUDED.secondary_muscles',
  'equipment_tags = EXCLUDED.equipment_tags', 'movement_pattern = EXCLUDED.movement_pattern',
  'laterality = EXCLUDED.laterality', 'source = EXCLUDED.source', 'source_license = EXCLUDED.source_license',
  'is_custom = false', 'curated = true', 'football_relevance = EXCLUDED.football_relevance',
  'performance_goals = EXCLUDED.performance_goals', keepIfEmpty('position_relevance'),
  'injury_prevention = EXCLUDED.injury_prevention',
].join(',\n    ')

const count = (k) => items.reduce((m, it) => ((m[it[k]] = (m[it[k]] ?? 0) + 1), m), {})
const byCat = count('category'); const bySrc = count('source')
const out = []
out.push(
  '-- AUVI Exercise Library — seed selezione calcio (generato da scripts/seed-exercises.mjs, non modificare a mano)',
  `-- generato: ${new Date().toISOString()}`,
  `-- voci curate: ${items.length}`,
  `-- per fonte: ${Object.entries(bySrc).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
  `-- per categoria: ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
  `-- statement: 1 CREATE TEMP TABLE + 1 INSERT staging (${items.length} righe) + 1 UPDATE (aggancio per nome) + 1 INSERT ... ON CONFLICT (slug)`,
  '-- requisito: migrazione 0028_exercise_library.sql (colonne nuove + indice unico fel_slug_key)',
  '-- idempotente: rieseguibile; non tocca image_url / image_3d_url / video_url delle righe esistenti',
  '',
  'BEGIN;',
  '',
)
out.push(
  `CREATE TEMP TABLE _seed_ex (${SEED_COLS.map(([c, t]) => `${c} ${t}`).join(', ')}) ON COMMIT DROP;`,
  '',
  `INSERT INTO _seed_ex (${SEED_COLS.map(([c]) => c).join(', ')}) VALUES`,
  items.map((it) => `-- ${it.slug} · ${it.name_it}\n${row(it)}`).join(',\n') + ';',
  '',
  '-- 1) aggancio delle righe già importate (stesso nome, slug ancora NULL)',
  `UPDATE ${T} AS fel SET slug = s.slug FROM _seed_ex s`,
  '  WHERE fel.slug IS NULL AND lower(fel.name) = lower(s.name)',
  `    AND NOT EXISTS (SELECT 1 FROM ${T} x WHERE x.slug = s.slug);`,
  '',
  '-- 2) upsert per slug: le righe nuove nascono senza immagine (image_url NULL, gen_status pending)',
  `INSERT INTO ${T} AS fel (slug, name, name_it, category, subcategory, muscle_group, equipment, difficulty, description,`,
  '  instructions, coaching_cues, common_mistakes, primary_muscles, secondary_muscles, equipment_tags, movement_pattern,',
  '  laterality, source, source_license, is_custom, curated, football_relevance, performance_goals, position_relevance,',
  '  injury_prevention, image_url, gen_status)',
  'SELECT s.slug, s.name, s.name_it, s.category, s.subcategory, s.primary_muscles[1], s.equipment_tags[1], s.difficulty,',
  `  ${DESC},`,
  '  s.instructions, s.coaching_cues, s.common_mistakes, s.primary_muscles, s.secondary_muscles, s.equipment_tags,',
  '  s.movement_pattern, s.laterality, s.source, s.source_license, false, true, s.football_relevance,',
  `  s.performance_goals, s.position_relevance, s.injury_prevention, NULL, 'pending'`,
  'FROM _seed_ex s',
  `ON CONFLICT (slug) DO UPDATE SET\n    ${ON_CONFLICT};`,
  '',
  '-- 3) controllo: tutte le voci del seed devono esistere e risultare curate, altrimenti si annulla tutto',
  'DO $$',
  'DECLARE n int;',
  'BEGIN',
  `  SELECT count(*) INTO n FROM ${T} fel JOIN _seed_ex s ON s.slug = fel.slug WHERE fel.curated;`,
  `  IF n <> ${items.length} THEN RAISE EXCEPTION 'seed esercizi: attese ${items.length} voci curate, trovate %', n; END IF;`,
  'END $$;',
  '',
  'COMMIT;',
  '',
  '-- verifica (sola lettura)',
  `SELECT source, category, count(*) FROM ${T} WHERE curated GROUP BY 1, 2 ORDER BY 1, 2;`,
  '',
)
const sql = out.join('\n')
writeFileSync(OUT, sql)
console.log(`${items.length} voci → ${OUT} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB)`)
console.log('per fonte:', bySrc)
console.log('per categoria:', byCat)
