// Genera scripts/data/football_exercises.json — la selezione AUVI "calcio" della libreria esercizi.
//
//   node scripts/build-football-exercises.mjs
//
// Legge scripts/data/exercises.json (yuhonas/free-exercise-db, Unlicense; scaricato con
//   curl -sSL -o scripts/data/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json)
// e fonde i dati della fonte (istruzioni, muscoli, attrezzi, livello, immagini) con i metadati calcio
// decisi qui sotto. Gli esercizi che nella fonte non esistono sono voci AUVI (slug "auvi:<nome>"),
// con i soli metadati oggettivi; le istruzioni AUVI (poche, solo esercizi da manuale) vanno validate
// dal preparatore. Poi: node scripts/seed-exercises.mjs → scripts/data/seed_exercises.sql

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, 'data', 'exercises.json')
const OUT = join(here, 'data', 'football_exercises.json')

// ---- mappe fonte → italiano ----------------------------------------------------------
const MUSCLE = {
  quadriceps: 'Quadricipiti', hamstrings: 'Femorali', glutes: 'Glutei', calves: 'Polpacci',
  adductors: 'Adduttori', abductors: 'Abduttori', abdominals: 'Addominali', 'lower back': 'Lombari',
  'middle back': 'Dorso', lats: 'Dorsali', chest: 'Pettorali', shoulders: 'Spalle', triceps: 'Tricipiti',
  biceps: 'Bicipiti', traps: 'Trapezi', forearms: 'Avambracci', neck: 'Collo',
}
const EQUIP = {
  'body only': 'Corpo libero', barbell: 'Bilanciere', dumbbell: 'Manubri', cable: 'Cavi', machine: 'Macchina',
  kettlebells: 'Kettlebell', bands: 'Elastici', 'medicine ball': 'Palla medica', 'exercise ball': 'Fitball',
  'foam roll': 'Foam roller', other: 'Altro', 'e-z curl bar': 'Bilanciere EZ',
}
const LEVEL = { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Avanzato' }
const LAT = { B: 'bilaterale', U: 'unilaterale', A: 'alternato' }

// ---- vocabolari controllati ------------------------------------------------------------
const CATEGORIES = ['Forza', 'Potenza', 'Pliometria', 'Velocità e agilità', 'Prevenzione', 'Core', 'Parte superiore', 'Mobilità e attivazione', 'Recupero']
const GOALS = ['Forza', 'Forza massimale', 'Potenza', 'Esplosività', 'Velocità', 'Accelerazione', 'Decelerazione', 'Cambio di direzione', 'Agilità', 'Mobilità', 'Stabilità', 'Prevenzione infortuni', 'Recupero', 'Attivazione']
const PATTERNS = ['squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'jump', 'sprint', 'cod', 'rotation', 'anti-rotation', 'isometric', 'mobility']

// abbreviazioni per tenere la tabella leggibile
const F = 'Forza', FM = 'Forza massimale', P = 'Potenza', E = 'Esplosività', V = 'Velocità', AC = 'Accelerazione',
  DE = 'Decelerazione', CD = 'Cambio di direzione', AG = 'Agilità', MO = 'Mobilità', ST = 'Stabilità',
  PI = 'Prevenzione infortuni', RE = 'Recupero', AT = 'Attivazione'
const FEM = 'Femorali', ADD = 'Pubalgia/adduttori', CAV = 'Caviglia', LCA = 'LCA/ginocchio', LOMB = 'Lombari', SPA = 'Spalla'

// ---- voci dalla fonte -----------------------------------------------------------------
// [nome nella fonte, name_it, categoria, sottocategoria, pattern, lateralità, obiettivi, rilevanza 1-3, prevenzione]
const FED = [
  // FORZA — squat
  ['Barbell Squat', 'Back squat con bilanciere', 'Forza', 'Squat', 'squat', 'B', [F, FM], 3],
  ['Front Barbell Squat', 'Front squat con bilanciere', 'Forza', 'Squat', 'squat', 'B', [F, FM], 3],
  ['Goblet Squat', 'Goblet squat', 'Forza', 'Squat', 'squat', 'B', [F], 3],
  ['Bodyweight Squat', 'Squat a corpo libero', 'Forza', 'Squat', 'squat', 'B', [F, AT], 2],
  ['Box Squat', 'Box squat', 'Forza', 'Squat', 'squat', 'B', [F, FM], 2],
  ['Dumbbell Squat', 'Squat con manubri', 'Forza', 'Squat', 'squat', 'B', [F], 2],
  ['Leg Press', 'Leg press', 'Forza', 'Squat', 'squat', 'B', [F], 2],
  ['Kettlebell Pistol Squat', 'Pistol squat con kettlebell', 'Forza', 'Squat monopodalico', 'squat', 'U', [F, ST], 2, [LCA]],
  // FORZA — split squat / affondi / step up
  ['Split Squats', 'Split squat', 'Forza', 'Affondi e split squat', 'lunge', 'U', [F, ST], 3, [LCA]],
  ['Split Squat with Dumbbells', 'Split squat con manubri', 'Forza', 'Affondi e split squat', 'lunge', 'U', [F, ST], 3, [LCA]],
  ['One Leg Barbell Squat', 'Affondo bulgaro con bilanciere', 'Forza', 'Affondi e split squat', 'lunge', 'U', [F, ST], 3, [LCA]],
  ['Barbell Lunge', 'Affondo con bilanciere', 'Forza', 'Affondi e split squat', 'lunge', 'A', [F], 3],
  ['Dumbbell Lunges', 'Affondi con manubri', 'Forza', 'Affondi e split squat', 'lunge', 'A', [F], 3],
  ['Bodyweight Walking Lunge', 'Affondi camminati a corpo libero', 'Forza', 'Affondi e split squat', 'lunge', 'A', [F, AT], 2],
  ['Dumbbell Rear Lunge', 'Affondo indietro con manubri', 'Forza', 'Affondi e split squat', 'lunge', 'A', [F, DE], 3],
  ['Crossover Reverse Lunge', 'Affondo indietro incrociato', 'Mobilità e attivazione', 'Anche', 'lunge', 'A', [MO, ST], 2],
  ['Barbell Side Split Squat', 'Affondo laterale con bilanciere', 'Forza', 'Affondi e split squat', 'lunge', 'A', [F, CD], 3, [ADD]],
  ['Barbell Step Ups', 'Step up con bilanciere', 'Forza', 'Step up', 'lunge', 'U', [F, ST], 3, [LCA]],
  ['Dumbbell Step Ups', 'Step up con manubri', 'Forza', 'Step up', 'lunge', 'U', [F, ST], 3, [LCA]],
  ['Step-up with Knee Raise', 'Step up con slancio del ginocchio', 'Forza', 'Step up', 'lunge', 'U', [F, AT], 2],
  // FORZA — hinge / catena posteriore
  ['Barbell Deadlift', 'Stacco da terra', 'Forza', 'Stacchi', 'hinge', 'B', [F, FM], 3],
  ['Trap Bar Deadlift', 'Stacco con trap bar', 'Forza', 'Stacchi', 'hinge', 'B', [F, FM, P], 3],
  ['Sumo Deadlift', 'Stacco sumo', 'Forza', 'Stacchi', 'hinge', 'B', [F, FM], 2],
  ['Romanian Deadlift', 'Stacco rumeno', 'Forza', 'Stacchi', 'hinge', 'B', [F, PI], 3, [FEM]],
  ['Stiff-Legged Dumbbell Deadlift', 'Stacco a gambe tese con manubri', 'Forza', 'Stacchi', 'hinge', 'B', [F, PI], 3, [FEM]],
  ['Kettlebell One-Legged Deadlift', 'Stacco rumeno monopodalico con kettlebell', 'Forza', 'Stacchi', 'hinge', 'U', [F, ST, PI], 3, [FEM]],
  ['Good Morning', 'Good morning', 'Forza', 'Stacchi', 'hinge', 'B', [F], 2, [FEM]],
  ['Pull Through', 'Pull through al cavo', 'Forza', 'Glutei', 'hinge', 'B', [F, AT], 2],
  ['Barbell Hip Thrust', 'Hip thrust con bilanciere', 'Forza', 'Glutei', 'hinge', 'B', [F, AC], 3],
  ['Barbell Glute Bridge', 'Glute bridge con bilanciere', 'Forza', 'Glutei', 'hinge', 'B', [F], 3],
  ['Butt Lift (Bridge)', 'Ponte glutei', 'Forza', 'Glutei', 'hinge', 'B', [F, AT], 2],
  ['Single Leg Glute Bridge', 'Ponte glutei monopodalico', 'Forza', 'Glutei', 'hinge', 'U', [F, ST, AT], 3, [FEM]],
  ['Hyperextensions (Back Extensions)', 'Iperestensioni lombari (back extension)', 'Forza', 'Catena posteriore', 'hinge', 'B', [F, PI], 2, [LOMB]],
  ['Reverse Hyperextension', 'Reverse hyper', 'Forza', 'Catena posteriore', 'hinge', 'B', [F], 2],
  ['Farmer\'s Walk', 'Farmer\'s walk (camminata del contadino)', 'Forza', 'Trasporti', 'carry', 'B', [F, ST], 2],
  ['Sled Push', 'Spinta della slitta', 'Potenza', 'Slitta', 'sprint', 'A', [P, AC], 3],
  // POLPACCI / CAVIGLIA (forza)
  ['Standing Calf Raises', 'Calf raise in piedi', 'Prevenzione', 'Caviglia/polpaccio', 'isometric', 'B', [F, PI], 3, [CAV]],
  ['Standing Dumbbell Calf Raise', 'Calf raise in piedi con manubri', 'Prevenzione', 'Caviglia/polpaccio', 'isometric', 'B', [F, PI], 3, [CAV]],
  ['Seated Calf Raise', 'Calf raise da seduto (soleo)', 'Prevenzione', 'Caviglia/polpaccio', 'isometric', 'B', [F, PI], 3, [CAV]],
  ['Dumbbell Seated One-Leg Calf Raise', 'Calf raise da seduto monopodalico con manubrio', 'Prevenzione', 'Caviglia/polpaccio', 'isometric', 'U', [F, PI], 3, [CAV]],
  ['Rocking Standing Calf Raise', 'Calf raise in piedi con oscillazione', 'Prevenzione', 'Caviglia/polpaccio', 'isometric', 'B', [F, MO], 2, [CAV]],
  ['Balance Board', 'Tavoletta propriocettiva', 'Prevenzione', 'Caviglia/polpaccio', 'isometric', 'B', [ST, PI], 3, [CAV, LCA]],
  // FEMORALI
  ['Glute Ham Raise', 'Glute-ham raise (GHD)', 'Prevenzione', 'Femorali', 'hinge', 'B', [F, PI], 3, [FEM]],
  ['Natural Glute Ham Raise', 'Glute-ham raise naturale', 'Prevenzione', 'Femorali', 'hinge', 'B', [F, PI], 3, [FEM]],
  ['Floor Glute-Ham Raise', 'Glute-ham raise a terra', 'Prevenzione', 'Femorali', 'hinge', 'B', [F, PI], 3, [FEM]],
  ['Lying Leg Curls', 'Leg curl sdraiato', 'Prevenzione', 'Femorali', 'isometric', 'B', [F, PI], 3, [FEM]],
  ['Seated Leg Curl', 'Leg curl da seduto', 'Prevenzione', 'Femorali', 'isometric', 'B', [F, PI], 3, [FEM]],
  ['Standing Leg Curl', 'Leg curl in piedi monopodalico', 'Prevenzione', 'Femorali', 'isometric', 'U', [F, PI], 3, [FEM]],
  ['Ball Leg Curl', 'Leg curl su fitball', 'Prevenzione', 'Femorali', 'hinge', 'B', [F, ST, PI], 3, [FEM]],
  ['Platform Hamstring Slides', 'Hamstring slide (leg curl in scivolamento)', 'Prevenzione', 'Femorali', 'hinge', 'U', [F, PI], 3, [FEM]],
  ['Seated Band Hamstring Curl', 'Leg curl da seduto con elastico', 'Prevenzione', 'Femorali', 'isometric', 'B', [F, AT], 2, [FEM]],
  // ADDUTTORI / ABDUTTORI
  ['Band Hip Adductions', 'Adduzione dell\'anca con elastico', 'Prevenzione', 'Adduttori', 'isometric', 'U', [F, PI], 3, [ADD]],
  ['Cable Hip Adduction', 'Adduzione dell\'anca al cavo', 'Prevenzione', 'Adduttori', 'isometric', 'U', [F, PI], 3, [ADD], { primary: ['Adduttori'] }], // fonte: primario 'quadriceps' (errato)
  ['Thigh Adductor', 'Adductor machine', 'Prevenzione', 'Adduttori', 'isometric', 'B', [F, PI], 2, [ADD]],
  ['Thigh Abductor', 'Abductor machine', 'Prevenzione', 'Abduttori', 'isometric', 'B', [F, AT], 2],
  ['Side Lying Groin Stretch', 'Allungamento adduttori sul fianco', 'Mobilità e attivazione', 'Adduttori', 'mobility', 'U', [MO], 2, [ADD]],
  ['Groiners', 'Groiners', 'Mobilità e attivazione', 'Adduttori', 'mobility', 'A', [MO, AT], 2, [ADD]],
  ['Adductor', 'Foam roller adduttori', 'Recupero', 'Automassaggio', 'mobility', 'U', [RE, MO], 2],
  // POTENZA — salti
  ['Freehand Jump Squat', 'Squat jump a corpo libero', 'Potenza', 'Salti verticali', 'jump', 'B', [P, E], 3],
  ['Weighted Jump Squat', 'Squat jump con sovraccarico', 'Potenza', 'Salti verticali', 'jump', 'B', [P, E], 3],
  ['Rocket Jump', 'Salto con contromovimento e slancio delle braccia', 'Potenza', 'Salti verticali', 'jump', 'B', [P, E], 3],
  ['Star Jump', 'Star jump', 'Potenza', 'Salti verticali', 'jump', 'B', [P, E], 2],
  ['Front Box Jump', 'Box jump', 'Potenza', 'Salti verticali', 'jump', 'B', [P, E], 3],
  ['Box Jump (Multiple Response)', 'Box jump ripetuti', 'Potenza', 'Salti verticali', 'jump', 'B', [P, E], 3],
  ['Standing Long Jump', 'Salto in lungo da fermo (broad jump)', 'Potenza', 'Salti orizzontali', 'jump', 'B', [P, E, AC], 3],
  ['Side Standing Long Jump', 'Salto in lungo laterale da fermo', 'Potenza', 'Salti laterali', 'jump', 'B', [P, CD], 3],
  ['Split Jump', 'Split jump (affondo saltato)', 'Potenza', 'Salti unilaterali', 'jump', 'A', [P, E], 3],
  ['Scissors Jump', 'Scissor jump (affondi saltati alternati)', 'Potenza', 'Salti unilaterali', 'jump', 'A', [P, E], 2],
  ['Lateral Bound', 'Balzo laterale (lateral bound)', 'Potenza', 'Salti laterali', 'jump', 'A', [P, CD, DE], 3, [LCA]],
  ['Alternate Leg Diagonal Bound', 'Balzi alternati in diagonale (bounding)', 'Potenza', 'Salti orizzontali', 'jump', 'A', [P, AC, CD], 3],
  ['Single-Leg Hop Progression', 'Balzi monopodalici in avanti sui coni', 'Potenza', 'Salti unilaterali', 'jump', 'U', [P, ST], 3, [LCA]],
  ['Single-Leg Lateral Hop', 'Balzi laterali monopodalici', 'Potenza', 'Salti unilaterali', 'jump', 'U', [P, CD, ST], 3, [LCA, CAV]],
  ['One-Arm Kettlebell Swings', 'Swing monobraccio con kettlebell', 'Potenza', 'Hinge balistico', 'hinge', 'U', [P, E], 2],
  ['Power Clean', 'Girata al petto (power clean)', 'Potenza', 'Sollevamenti olimpici', 'hinge', 'B', [P, E], 2],
  ['Hang Clean', 'Girata dall\'appeso (hang clean)', 'Potenza', 'Sollevamenti olimpici', 'hinge', 'B', [P, E], 2],
  ['Medicine Ball Scoop Throw', 'Lancio della palla medica dal basso', 'Potenza', 'Lanci con palla medica', 'hinge', 'B', [P, E], 2],
  ['Backward Medicine Ball Throw', 'Lancio all\'indietro della palla medica', 'Potenza', 'Lanci con palla medica', 'hinge', 'B', [P, E], 2],
  ['Overhead Slam', 'Slam della palla medica', 'Potenza', 'Lanci con palla medica', 'rotation', 'B', [P], 2],
  // PLIOMETRIA
  ['Knee Tuck Jump', 'Tuck jump (salto raccolto)', 'Pliometria', 'Rimbalzi', 'jump', 'B', [E, P], 3],
  ['Hurdle Hops', 'Salti sugli ostacolini', 'Pliometria', 'Rimbalzi', 'jump', 'B', [E, P], 3],
  ['Front Cone Hops (or hurdle hops)', 'Salti frontali sui coni', 'Pliometria', 'Rimbalzi', 'jump', 'B', [E, P], 3],
  ['Lateral Cone Hops', 'Salti laterali sui coni', 'Pliometria', 'Rimbalzi laterali', 'jump', 'B', [E, CD], 3, [CAV]],
  ['Lateral Box Jump', 'Salto laterale sul box', 'Pliometria', 'Rimbalzi laterali', 'jump', 'B', [E, CD], 2],
  ['Side to Side Box Shuffle', 'Box shuffle laterale', 'Pliometria', 'Rimbalzi laterali', 'jump', 'A', [E, AG], 2],
  ['Linear Depth Jump', 'Depth jump', 'Pliometria', 'Pliometria intensiva', 'jump', 'B', [E, P], 3],
  // VELOCITÀ E AGILITÀ
  ['Linear 3-Part Start Technique', 'Tecnica di partenza in 3 tempi', 'Velocità e agilità', 'Accelerazione', 'sprint', 'A', [V, AC], 3],
  ['Linear Acceleration Wall Drill', 'Wall drill di accelerazione', 'Velocità e agilità', 'Accelerazione', 'sprint', 'A', [AC], 3],
  ['Sled Drag - Harness', 'Traino della slitta con imbragatura', 'Velocità e agilità', 'Sprint resistiti', 'sprint', 'A', [AC, P], 3],
  ['Prowler Sprint', 'Sprint con prowler', 'Velocità e agilità', 'Sprint resistiti', 'sprint', 'A', [AC, P], 3],
  ['Fast Skipping', 'Skip veloce', 'Velocità e agilità', 'Tecnica di corsa', 'sprint', 'A', [V, AT], 3],
  ['Moving Claw Series', 'Calciata dietro in corsa (claw drill)', 'Velocità e agilità', 'Tecnica di corsa', 'sprint', 'A', [V], 2],
  ['Single Leg Butt Kick', 'Calciata ai glutei monopodalica', 'Velocità e agilità', 'Tecnica di corsa', 'jump', 'U', [V, E], 2],
  ['Bench Sprint', 'Bench sprint (cambi rapidi sul rialzo)', 'Velocità e agilità', 'Frequenza', 'sprint', 'A', [V, AT], 2],
  ['Carioca Quick Step', 'Passo incrociato rapido (carioca)', 'Velocità e agilità', 'Agilità laterale', 'cod', 'A', [AG, CD], 3],
  ['Side Hop-Sprint', 'Salti laterali + sprint', 'Velocità e agilità', 'Reattività', 'cod', 'B', [AG, AC], 3],
  ['Single-Cone Sprint Drill', 'Sprint attorno al cono', 'Velocità e agilità', 'Cambio di direzione', 'cod', 'A', [AG, CD], 3],
  // CORE
  ['Plank', 'Plank', 'Core', 'Anti-estensione', 'isometric', 'B', [ST], 3],
  ['Side Bridge', 'Plank laterale (side plank)', 'Core', 'Anti-flessione laterale', 'isometric', 'U', [ST], 3],
  ['Push Up to Side Plank', 'Piegamento + plank laterale', 'Core', 'Anti-flessione laterale', 'isometric', 'A', [ST, F], 2],
  ['Dead Bug', 'Dead bug', 'Core', 'Anti-estensione', 'isometric', 'A', [ST, AT], 3, [LOMB]],
  ['Pallof Press', 'Pallof press', 'Core', 'Anti-rotazione', 'anti-rotation', 'U', [ST], 3],
  ['Pallof Press With Rotation', 'Pallof press con rotazione', 'Core', 'Rotazione', 'rotation', 'U', [ST, P], 2],
  ['Standing Cable Wood Chop', 'Wood chop al cavo', 'Core', 'Rotazione', 'rotation', 'U', [P, ST], 3],
  ['Standing Cable Lift', 'Cable lift (dal basso in alto)', 'Core', 'Rotazione', 'rotation', 'U', [ST], 2],
  ['Russian Twist', 'Russian twist', 'Core', 'Rotazione', 'rotation', 'B', [ST], 2],
  ['Landmine 180\'s', 'Landmine 180', 'Core', 'Rotazione', 'rotation', 'B', [P, ST], 2],
  ['Hanging Leg Raise', 'Leg raise alla sbarra', 'Core', 'Flessione', 'isometric', 'B', [F], 2],
  ['Wind Sprints', 'Knee raise alternati alla sbarra', 'Core', 'Flessione', 'isometric', 'A', [F], 2],
  ['Ab Roller', 'Ab wheel (ruota addominale)', 'Core', 'Anti-estensione', 'isometric', 'B', [ST, F], 3],
  ['Exercise Ball Pull-In', 'Pull-in sulla fitball', 'Core', 'Anti-estensione', 'isometric', 'B', [ST], 2],
  ['Mountain Climbers', 'Mountain climber', 'Core', 'Dinamico', 'sprint', 'A', [ST, AT], 2],
  // PARTE SUPERIORE
  ['Barbell Bench Press - Medium Grip', 'Panca piana con bilanciere', 'Parte superiore', 'Spinta orizzontale', 'push', 'B', [F, FM], 2],
  ['Dumbbell Bench Press', 'Panca piana con manubri', 'Parte superiore', 'Spinta orizzontale', 'push', 'B', [F], 2],
  ['Incline Dumbbell Press', 'Panca inclinata con manubri', 'Parte superiore', 'Spinta orizzontale', 'push', 'B', [F], 2],
  ['Pushups', 'Piegamenti sulle braccia (push up)', 'Parte superiore', 'Spinta orizzontale', 'push', 'B', [F, ST], 2],
  ['Standing Military Press', 'Military press in piedi', 'Parte superiore', 'Spinta verticale', 'push', 'B', [F], 2],
  ['Dumbbell Shoulder Press', 'Shoulder press con manubri', 'Parte superiore', 'Spinta verticale', 'push', 'B', [F], 2],
  ['Side Lateral Raise', 'Alzate laterali', 'Parte superiore', 'Spalle', 'push', 'B', [F], 1],
  ['Pullups', 'Trazioni alla sbarra (pull up)', 'Parte superiore', 'Tirata verticale', 'pull', 'B', [F], 2],
  ['Chin-Up', 'Trazioni presa supina (chin up)', 'Parte superiore', 'Tirata verticale', 'pull', 'B', [F], 2],
  ['Band Assisted Pull-Up', 'Trazioni assistite con elastico', 'Parte superiore', 'Tirata verticale', 'pull', 'B', [F], 2],
  ['Wide-Grip Lat Pulldown', 'Lat machine presa larga', 'Parte superiore', 'Tirata verticale', 'pull', 'B', [F], 2],
  ['Seated Cable Rows', 'Pulley basso (rematore al cavo)', 'Parte superiore', 'Tirata orizzontale', 'pull', 'B', [F], 2],
  ['One-Arm Dumbbell Row', 'Rematore con manubrio a un braccio', 'Parte superiore', 'Tirata orizzontale', 'pull', 'U', [F], 2],
  ['Bent Over Barbell Row', 'Rematore con bilanciere', 'Parte superiore', 'Tirata orizzontale', 'pull', 'B', [F], 2],
  ['Inverted Row', 'Rematore inverso', 'Parte superiore', 'Tirata orizzontale', 'pull', 'B', [F], 2],
  ['Suspended Row', 'Rematore in sospensione (TRX)', 'Parte superiore', 'Tirata orizzontale', 'pull', 'B', [F], 2],
  ['Face Pull', 'Face pull', 'Parte superiore', 'Spalle', 'pull', 'B', [F, PI], 2, [SPA]],
  ['Band Pull Apart', 'Band pull apart', 'Parte superiore', 'Spalle', 'pull', 'B', [AT, PI], 2, [SPA]],
  ['External Rotation with Band', 'Extrarotazione della spalla con elastico', 'Parte superiore', 'Spalle', 'rotation', 'U', [AT, PI], 2, [SPA]],
  // MOBILITÀ E ATTIVAZIONE
  ['World\'s Greatest Stretch', 'World\'s greatest stretch', 'Mobilità e attivazione', 'Mobilità globale', 'mobility', 'A', [MO, AT], 3],
  ['Inchworm', 'Inchworm (bruco)', 'Mobilità e attivazione', 'Mobilità globale', 'mobility', 'B', [MO, AT], 3],
  ['Kneeling Hip Flexor', 'Allungamento flessori dell\'anca in ginocchio', 'Mobilità e attivazione', 'Flessori dell\'anca', 'mobility', 'U', [MO], 3],
  ['Intermediate Hip Flexor and Quad Stretch', 'Allungamento flessori dell\'anca e quadricipite con cinghia', 'Mobilità e attivazione', 'Flessori dell\'anca', 'mobility', 'U', [MO], 2],
  ['Quad Stretch', 'Allungamento quadricipite sul fianco', 'Mobilità e attivazione', 'Quadricipiti', 'mobility', 'U', [MO], 2],
  ['Hamstring Stretch', 'Allungamento femorali', 'Mobilità e attivazione', 'Femorali', 'mobility', 'U', [MO], 3, [FEM]],
  ['90/90 Hamstring', 'Allungamento femorali 90/90', 'Mobilità e attivazione', 'Femorali', 'mobility', 'U', [MO], 2, [FEM]],
  ['Runner\'s Stretch', 'Runner\'s stretch', 'Mobilità e attivazione', 'Femorali', 'mobility', 'U', [MO], 2],
  ['Calf Stretch Hands Against Wall', 'Allungamento polpaccio al muro', 'Mobilità e attivazione', 'Caviglia/polpaccio', 'mobility', 'U', [MO], 3, [CAV]],
  ['Standing Soleus And Achilles Stretch', 'Allungamento soleo e tendine d\'Achille', 'Mobilità e attivazione', 'Caviglia/polpaccio', 'mobility', 'U', [MO], 3, [CAV]],
  ['Ankle Circles', 'Circonduzioni della caviglia', 'Mobilità e attivazione', 'Caviglia/polpaccio', 'mobility', 'U', [MO, AT], 2, [CAV]],
  ['Hip Circles (prone)', 'Circonduzioni dell\'anca in quadrupedia', 'Mobilità e attivazione', 'Anche', 'mobility', 'U', [MO, AT], 2],
  ['Standing Hip Circles', 'Circonduzioni dell\'anca in piedi', 'Mobilità e attivazione', 'Anche', 'mobility', 'U', [MO, AT], 3],
  ['Monster Walk', 'Monster walk con elastico', 'Mobilità e attivazione', 'Attivazione glutei', 'isometric', 'A', [AT, ST], 3, [LCA]],
  ['Glute Kickback', 'Glute kickback in quadrupedia', 'Mobilità e attivazione', 'Attivazione glutei', 'hinge', 'U', [AT], 2],
  ['Hip Extension with Bands', 'Estensione dell\'anca con elastico', 'Mobilità e attivazione', 'Attivazione glutei', 'hinge', 'U', [AT], 2],
  // RECUPERO
  ['Bicycling, Stationary', 'Cyclette', 'Recupero', 'Cardio a bassa intensità', 'mobility', 'A', [RE], 2],
  ['Walking, Treadmill', 'Camminata su tapis roulant', 'Recupero', 'Cardio a bassa intensità', 'mobility', 'A', [RE], 2],
  ['Jogging, Treadmill', 'Corsa lenta su tapis roulant', 'Recupero', 'Cardio a bassa intensità', 'sprint', 'A', [RE], 2],
  ['Elliptical Trainer', 'Ellittica', 'Recupero', 'Cardio a bassa intensità', 'mobility', 'A', [RE], 2],
  ['Rowing, Stationary', 'Vogatore', 'Recupero', 'Cardio a bassa intensità', 'pull', 'B', [RE], 1],
  ['Hamstring-SMR', 'Foam roller femorali', 'Recupero', 'Automassaggio', 'mobility', 'U', [RE, MO], 2],
  ['Quadriceps-SMR', 'Foam roller quadricipiti', 'Recupero', 'Automassaggio', 'mobility', 'U', [RE, MO], 2],
  ['Calves-SMR', 'Foam roller polpacci', 'Recupero', 'Automassaggio', 'mobility', 'U', [RE, MO], 2],
  ['Iliotibial Tract-SMR', 'Foam roller bandelletta ileotibiale', 'Recupero', 'Automassaggio', 'mobility', 'U', [RE, MO], 2],
  ['Piriformis-SMR', 'Foam roller piriforme', 'Recupero', 'Automassaggio', 'mobility', 'U', [RE, MO], 2],
  ['Child\'s Pose', 'Posizione del bambino (child\'s pose)', 'Recupero', 'Allungamento', 'mobility', 'B', [RE, MO], 1],
]

// ---- voci AUVI (non presenti nella fonte) --------------------------------------------------
// Solo metadati oggettivi. `steps` solo per esercizi da manuale (2-4 passi standard) → da validare.
const NOTE = 'istruzioni AUVI da validare dal preparatore'
const AUVI = [
  { name: 'Nordic Hamstring Curl', name_it: 'Nordic hamstring curl', category: 'Prevenzione', subcategory: 'Femorali', primary: ['Femorali'], secondary: ['Glutei', 'Polpacci'], equip: ['Corpo libero'], difficulty: 'Avanzato', lat: 'B', pattern: 'hinge', goals: [F, PI], rel: 3, inj: [FEM],
    steps: ['In ginocchio su un tappetino, caviglie bloccate da un compagno o da un supporto fisso; busto e cosce allineati.', 'Scendere in avanti il più lentamente possibile mantenendo anche estese (corpo in linea da ginocchia a testa).', 'Quando non si riesce più a frenare, accompagnare la caduta con le mani in posizione di piegamento.', 'Tornare alla posizione iniziale spingendo con le mani, con il minimo aiuto necessario.'] },
  { name: 'Copenhagen Plank (Short Lever)', name_it: 'Copenhagen plank (leva corta)', category: 'Prevenzione', subcategory: 'Adduttori', primary: ['Adduttori'], secondary: ['Addominali'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'U', pattern: 'isometric', goals: [F, ST, PI], rel: 3, inj: [ADD],
    steps: ['Plank laterale sull\'avambraccio con il ginocchio della gamba superiore appoggiato su una panca.', 'Sollevare il bacino fino ad allineare spalle, anca e ginocchio; la gamba inferiore resta sotto la panca o si porta verso di essa.', 'Mantenere la posizione per il tempo prescritto, poi cambiare lato.'] },
  { name: 'Copenhagen Plank (Long Lever)', name_it: 'Copenhagen plank (leva lunga)', category: 'Prevenzione', subcategory: 'Adduttori', primary: ['Adduttori'], secondary: ['Addominali'], equip: ['Corpo libero'], difficulty: 'Avanzato', lat: 'U', pattern: 'isometric', goals: [F, ST, PI], rel: 3, inj: [ADD],
    steps: ['Plank laterale sull\'avambraccio con la caviglia/piede della gamba superiore appoggiato su una panca.', 'Sollevare il bacino fino ad allineare spalle, anca e piede; la gamba inferiore resta libera sotto la panca.', 'Mantenere la posizione per il tempo prescritto, poi cambiare lato.'] },
  { name: 'Copenhagen Adduction', name_it: 'Copenhagen adduction (dinamico)', category: 'Prevenzione', subcategory: 'Adduttori', primary: ['Adduttori'], secondary: ['Addominali'], equip: ['Corpo libero'], difficulty: 'Avanzato', lat: 'U', pattern: 'isometric', goals: [F, PI], rel: 3, inj: [ADD] },
  { name: 'Adductor Squeeze (Ball)', name_it: 'Squeeze adduttori con palla', category: 'Prevenzione', subcategory: 'Adduttori', primary: ['Adduttori'], secondary: [], equip: ['Altro'], difficulty: 'Principiante', lat: 'B', pattern: 'isometric', goals: [F, PI, AT], rel: 3, inj: [ADD] },
  { name: 'Lateral Slide Lunge (Adductor Slide)', name_it: 'Affondo laterale in scivolamento (adductor slide)', category: 'Prevenzione', subcategory: 'Adduttori', primary: ['Adduttori'], secondary: ['Glutei', 'Quadricipiti'], equip: ['Altro'], difficulty: 'Intermedio', lat: 'U', pattern: 'lunge', goals: [F, PI], rel: 3, inj: [ADD] },
  { name: 'Side Lunge', name_it: 'Affondo laterale a corpo libero', category: 'Forza', subcategory: 'Affondi e split squat', primary: ['Quadricipiti', 'Adduttori'], secondary: ['Glutei'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'lunge', goals: [F, MO, CD], rel: 3, inj: [ADD],
    steps: ['In piedi, piedi alla larghezza delle anche.', 'Fare un ampio passo laterale e piegare il ginocchio della gamba che avanza, spingendo il bacino indietro; l\'altra gamba resta tesa.', 'Spingere con la gamba piegata per tornare alla posizione iniziale; alternare o completare un lato.'] },
  { name: 'Cossack Squat', name_it: 'Cossack squat', category: 'Mobilità e attivazione', subcategory: 'Adduttori', primary: ['Adduttori', 'Quadricipiti'], secondary: ['Glutei'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'squat', goals: [MO, F], rel: 2, inj: [ADD] },
  { name: 'Adductor Rock Back Stretch', name_it: 'Allungamento adduttori in quadrupedia (rock back)', category: 'Mobilità e attivazione', subcategory: 'Adduttori', primary: ['Adduttori'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'mobility', goals: [MO], rel: 2, inj: [ADD] },
  { name: 'Dumbbell Bulgarian Split Squat', name_it: 'Affondo bulgaro con manubri', category: 'Forza', subcategory: 'Affondi e split squat', primary: ['Quadricipiti', 'Glutei'], secondary: ['Femorali', 'Adduttori'], equip: ['Manubri'], difficulty: 'Intermedio', lat: 'U', pattern: 'lunge', goals: [F, ST], rel: 3, inj: [LCA],
    steps: ['In piedi davanti a una panca, un manubrio per mano; il dorso del piede posteriore appoggiato sulla panca.', 'Scendere piegando il ginocchio anteriore finché la coscia anteriore è circa parallela al suolo, busto stabile.', 'Risalire spingendo sul piede anteriore; completare le ripetizioni e cambiare gamba.'] },
  { name: 'Dumbbell Single-Leg Romanian Deadlift', name_it: 'Stacco rumeno monopodalico con manubrio', category: 'Forza', subcategory: 'Stacchi', primary: ['Femorali', 'Glutei'], secondary: ['Lombari'], equip: ['Manubri'], difficulty: 'Intermedio', lat: 'U', pattern: 'hinge', goals: [F, ST, PI], rel: 3, inj: [FEM] },
  { name: 'Single-Leg Hip Thrust', name_it: 'Hip thrust monopodalico', category: 'Forza', subcategory: 'Glutei', primary: ['Glutei'], secondary: ['Femorali'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'U', pattern: 'hinge', goals: [F, ST], rel: 3 },
  { name: 'Lateral Step-Up', name_it: 'Step up laterale', category: 'Forza', subcategory: 'Step up', primary: ['Quadricipiti', 'Glutei'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'lunge', goals: [F, ST], rel: 2, inj: [LCA] },
  { name: 'Trap Bar Jump', name_it: 'Salto con trap bar', category: 'Potenza', subcategory: 'Salti verticali', primary: ['Quadricipiti', 'Glutei'], secondary: ['Femorali', 'Polpacci'], equip: ['Altro'], difficulty: 'Intermedio', lat: 'B', pattern: 'jump', goals: [P, E], rel: 3 },
  { name: 'Countermovement Jump (Hands on Hips)', name_it: 'Countermovement jump (CMJ, mani ai fianchi)', category: 'Potenza', subcategory: 'Salti verticali', primary: ['Quadricipiti', 'Glutei'], secondary: ['Femorali', 'Polpacci'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'jump', goals: [P, E], rel: 3,
    steps: ['In piedi, piedi alla larghezza delle anche, mani sui fianchi per tutta la durata.', 'Scendere rapidamente in un piegamento parziale (contromovimento) e invertire subito saltando il più in alto possibile.', 'Atterrare sugli avampiedi con ginocchia leggermente flesse, allineate sopra i piedi.'] },
  { name: 'Single-Leg Countermovement Jump', name_it: 'Salto verticale monopodalico (CMJ monopodalico)', category: 'Potenza', subcategory: 'Salti unilaterali', primary: ['Quadricipiti', 'Glutei'], secondary: ['Polpacci'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'U', pattern: 'jump', goals: [P, E, ST], rel: 3, inj: [LCA] },
  { name: 'Drop Jump', name_it: 'Drop jump (salto in basso-alto)', category: 'Pliometria', subcategory: 'Pliometria intensiva', primary: ['Polpacci', 'Quadricipiti'], secondary: ['Glutei'], equip: ['Altro'], difficulty: 'Avanzato', lat: 'B', pattern: 'jump', goals: [E, P], rel: 3 },
  { name: 'Pogo Jumps', name_it: 'Pogo jump (saltelli di caviglia)', category: 'Pliometria', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'jump', goals: [E, PI], rel: 3, inj: [CAV],
    steps: ['In piedi, piedi alla larghezza delle anche, ginocchia quasi estese.', 'Saltellare in modo continuo spingendo principalmente dalle caviglie, con contatti al suolo brevi sugli avampiedi.', 'Mantenere busto dritto e ritmo costante per il numero di contatti prescritto.'] },
  { name: 'Lateral Pogo Jumps', name_it: 'Pogo jump laterali', category: 'Pliometria', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: ['Adduttori', 'Abduttori'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'jump', goals: [E, CD, PI], rel: 3, inj: [CAV] },
  { name: 'Single-Leg Pogo Jumps', name_it: 'Pogo jump monopodalici', category: 'Pliometria', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: [], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'U', pattern: 'jump', goals: [E, ST, PI], rel: 3, inj: [CAV] },
  { name: 'Ankle Hops', name_it: 'Ankle hops (saltelli in avanti di caviglia)', category: 'Pliometria', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'jump', goals: [E, PI], rel: 2, inj: [CAV] },
  { name: 'Acceleration Sprint 10 m', name_it: 'Sprint di accelerazione 10 m', category: 'Velocità e agilità', subcategory: 'Accelerazione', primary: ['Quadricipiti', 'Glutei', 'Femorali'], secondary: ['Polpacci'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'sprint', goals: [V, AC], rel: 3 },
  { name: 'Acceleration Sprint 20-30 m', name_it: 'Sprint di accelerazione 20-30 m', category: 'Velocità e agilità', subcategory: 'Accelerazione', primary: ['Quadricipiti', 'Glutei', 'Femorali'], secondary: ['Polpacci'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'sprint', goals: [V, AC], rel: 3 },
  { name: 'Flying Sprint', name_it: 'Sprint lanciato (flying sprint)', category: 'Velocità e agilità', subcategory: 'Velocità massima', primary: ['Femorali', 'Glutei', 'Quadricipiti'], secondary: ['Polpacci'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'sprint', goals: [V], rel: 3, inj: [FEM] },
  { name: 'Deceleration Drill', name_it: 'Esercitazione di decelerazione (sprint e frenata)', category: 'Velocità e agilità', subcategory: 'Decelerazione', primary: ['Quadricipiti', 'Glutei'], secondary: ['Femorali', 'Polpacci'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'cod', goals: [DE, PI], rel: 3, inj: [LCA] },
  { name: 'Change of Direction 505', name_it: 'Cambio di direzione 505 (180°)', category: 'Velocità e agilità', subcategory: 'Cambio di direzione', primary: ['Quadricipiti', 'Glutei'], secondary: ['Adduttori', 'Polpacci'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'cod', goals: [CD, DE, AC], rel: 3, inj: [LCA] },
  { name: 'Cutting Drill 45°', name_it: 'Cambio di direzione a 45° (cutting)', category: 'Velocità e agilità', subcategory: 'Cambio di direzione', primary: ['Quadricipiti', 'Glutei'], secondary: ['Adduttori', 'Polpacci'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'cod', goals: [CD, AG], rel: 3, inj: [LCA] },
  { name: 'Lateral Shuffle', name_it: 'Passo accostato laterale (shuffle)', category: 'Velocità e agilità', subcategory: 'Agilità laterale', primary: ['Quadricipiti', 'Glutei'], secondary: ['Adduttori', 'Abduttori', 'Polpacci'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'cod', goals: [AG, CD], rel: 3,
    steps: ['Posizione atletica: piedi più larghi delle spalle, ginocchia e anche flesse, busto leggermente in avanti.', 'Spostarsi lateralmente spingendo con la gamba opposta alla direzione, senza incrociare né unire i piedi.', 'Mantenere il bacino basso e all\'altezza costante per tutta la distanza, poi invertire la direzione.'] },
  { name: 'Crossover Run', name_it: 'Corsa incrociata (crossover run)', category: 'Velocità e agilità', subcategory: 'Agilità laterale', primary: ['Quadricipiti', 'Glutei'], secondary: ['Adduttori', 'Abduttori'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'A', pattern: 'cod', goals: [AG, CD, AC], rel: 3 },
  { name: 'Backpedal', name_it: 'Corsa all\'indietro (backpedal)', category: 'Velocità e agilità', subcategory: 'Agilità', primary: ['Quadricipiti'], secondary: ['Polpacci', 'Glutei'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'sprint', goals: [AG, DE], rel: 3,
    steps: ['Posizione atletica con busto leggermente in avanti e peso sugli avampiedi.', 'Correre all\'indietro con passi corti e rapidi, spingendo con gli avampiedi e mantenendo le ginocchia flesse.', 'Tenere lo sguardo avanti e le braccia che accompagnano il movimento.'] },
  { name: 'A-Skip', name_it: 'Skip A', category: 'Velocità e agilità', subcategory: 'Tecnica di corsa', primary: ['Quadricipiti', 'Polpacci'], secondary: ['Glutei', 'Femorali'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'sprint', goals: [V, AT], rel: 3 },
  { name: 'High Knees', name_it: 'Skip alto (ginocchia alte)', category: 'Velocità e agilità', subcategory: 'Tecnica di corsa', primary: ['Quadricipiti'], secondary: ['Polpacci', 'Addominali'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'sprint', goals: [V, AT], rel: 2 },
  { name: 'Tibialis Raise', name_it: 'Tibialis raise (sollevamento delle punte)', category: 'Prevenzione', subcategory: 'Caviglia/polpaccio', primary: ['Tibiale anteriore'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'isometric', goals: [F, PI], rel: 3, inj: [CAV],
    steps: ['In piedi con schiena e glutei appoggiati al muro, talloni a circa 20-30 cm dal muro, gambe tese.', 'Sollevare le punte dei piedi il più in alto possibile tenendo i talloni a terra.', 'Riabbassare le punte in modo controllato senza appoggiarle del tutto e ripetere.'] },
  { name: 'Bent-Knee Soleus Raise', name_it: 'Soleus raise a ginocchio flesso', category: 'Prevenzione', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'isometric', goals: [F, PI], rel: 3, inj: [CAV] },
  { name: 'Single-Leg Calf Raise', name_it: 'Calf raise monopodalico', category: 'Prevenzione', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'isometric', goals: [F, PI], rel: 3, inj: [CAV] },
  { name: 'Knee-to-Wall Ankle Dorsiflexion', name_it: 'Mobilità in dorsiflessione di caviglia (ginocchio al muro)', category: 'Mobilità e attivazione', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'mobility', goals: [MO], rel: 3, inj: [CAV],
    steps: ['In piedi di fronte al muro in posizione di affondo corto, piede anteriore a qualche centimetro dal muro.', 'Portare il ginocchio anteriore verso il muro mantenendo il tallone a terra e il ginocchio in linea con il secondo dito.', 'Tornare indietro e ripetere; allontanare gradualmente il piede dal muro.'] },
  { name: 'Single-Leg Balance', name_it: 'Equilibrio monopodalico', category: 'Prevenzione', subcategory: 'Caviglia/polpaccio', primary: ['Polpacci'], secondary: ['Glutei'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'isometric', goals: [ST, PI], rel: 3, inj: [CAV, LCA] },
  { name: 'Bird Dog', name_it: 'Bird dog', category: 'Core', subcategory: 'Anti-rotazione', primary: ['Addominali', 'Lombari'], secondary: ['Glutei', 'Spalle'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'anti-rotation', goals: [ST, AT], rel: 2, inj: [LOMB],
    steps: ['In quadrupedia: mani sotto le spalle, ginocchia sotto le anche, schiena neutra.', 'Estendere contemporaneamente un braccio in avanti e la gamba opposta indietro, senza ruotare il bacino.', 'Tornare in quadrupedia in modo controllato e alternare i lati.'] },
  { name: 'Hanging Knee Raise', name_it: 'Hanging knee raise (ginocchia al petto alla sbarra)', category: 'Core', subcategory: 'Flessione', primary: ['Addominali'], secondary: [], equip: ['Altro'], difficulty: 'Intermedio', lat: 'B', pattern: 'isometric', goals: [F], rel: 2,
    steps: ['Appendersi alla sbarra con presa prona, braccia tese e corpo fermo.', 'Portare le ginocchia verso il petto flettendo le anche, senza dondolare.', 'Riabbassare le gambe in modo controllato fino all\'estensione.'] },
  { name: 'Side Plank with Hip Abduction', name_it: 'Plank laterale con abduzione dell\'anca', category: 'Core', subcategory: 'Anti-flessione laterale', primary: ['Addominali', 'Abduttori'], secondary: ['Glutei'], equip: ['Corpo libero'], difficulty: 'Intermedio', lat: 'U', pattern: 'isometric', goals: [ST, AT], rel: 2 },
  { name: 'Mini Band Lateral Walk', name_it: 'Camminata laterale con miniband', category: 'Mobilità e attivazione', subcategory: 'Attivazione glutei', primary: ['Abduttori', 'Glutei'], secondary: [], equip: ['Elastici'], difficulty: 'Principiante', lat: 'B', pattern: 'isometric', goals: [AT, ST], rel: 3, inj: [LCA],
    steps: ['Miniband sopra le ginocchia o alle caviglie; posizione di mezzo squat con piedi alla larghezza delle anche.', 'Fare passi laterali mantenendo la tensione dell\'elastico, senza unire i piedi e senza ondeggiare con il busto.', 'Completare la distanza o i passi prescritti e ripetere nella direzione opposta.'] },
  { name: 'Mini Band Glute Bridge', name_it: 'Ponte glutei con miniband', category: 'Mobilità e attivazione', subcategory: 'Attivazione glutei', primary: ['Glutei'], secondary: ['Abduttori', 'Femorali'], equip: ['Elastici'], difficulty: 'Principiante', lat: 'B', pattern: 'hinge', goals: [AT], rel: 2 },
  { name: 'Clamshell', name_it: 'Clamshell (conchiglia) con elastico', category: 'Mobilità e attivazione', subcategory: 'Attivazione glutei', primary: ['Glutei', 'Abduttori'], secondary: [], equip: ['Elastici'], difficulty: 'Principiante', lat: 'U', pattern: 'isometric', goals: [AT], rel: 2,
    steps: ['Sdraiati sul fianco, anche e ginocchia flesse, piedi uniti; miniband sopra le ginocchia (facoltativa).', 'Mantenendo i piedi a contatto, aprire il ginocchio superiore senza ruotare il bacino all\'indietro.', 'Tornare in modo controllato; completare le ripetizioni e cambiare lato.'] },
  { name: 'Leg Swings (Front-Back)', name_it: 'Slanci della gamba avanti-dietro', category: 'Mobilità e attivazione', subcategory: 'Anche', primary: ['Femorali'], secondary: ['Quadricipiti', 'Glutei'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'mobility', goals: [MO, AT], rel: 3 },
  { name: 'Leg Swings (Lateral)', name_it: 'Slanci laterali della gamba', category: 'Mobilità e attivazione', subcategory: 'Anche', primary: ['Adduttori', 'Abduttori'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'U', pattern: 'mobility', goals: [MO, AT], rel: 3 },
  { name: '90/90 Hip Switch', name_it: 'Mobilità d\'anca 90/90', category: 'Mobilità e attivazione', subcategory: 'Anche', primary: ['Glutei'], secondary: ['Adduttori', 'Abduttori'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'mobility', goals: [MO], rel: 2 },
  { name: 'Walking Knee Hug', name_it: 'Ginocchio al petto in camminata', category: 'Mobilità e attivazione', subcategory: 'Anche', primary: ['Glutei'], secondary: ['Femorali'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'mobility', goals: [MO, AT], rel: 2 },
  { name: 'Recovery Walk', name_it: 'Camminata defaticante', category: 'Recupero', subcategory: 'Cardio a bassa intensità', primary: ['Quadricipiti'], secondary: ['Polpacci'], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'A', pattern: 'mobility', goals: [RE], rel: 2 },
  { name: 'Diaphragmatic Breathing', name_it: 'Respirazione diaframmatica', category: 'Recupero', subcategory: 'Respirazione', primary: ['Addominali'], secondary: [], equip: ['Corpo libero'], difficulty: 'Principiante', lat: 'B', pattern: 'isometric', goals: [RE], rel: 1 },
]

// ---- costruzione ---------------------------------------------------------------------
const kebab = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/°/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const src = JSON.parse(readFileSync(SRC, 'utf8'))
const byName = new Map(src.map((e) => [e.name, e]))
const errors = []
const check = (it) => {
  if (!CATEGORIES.includes(it.category)) errors.push(`${it.name}: categoria ${it.category}`)
  for (const g of it.performance_goals) if (!GOALS.includes(g)) errors.push(`${it.name}: obiettivo ${g}`)
  if (!PATTERNS.includes(it.movement_pattern)) errors.push(`${it.name}: pattern ${it.movement_pattern}`)
  if (![1, 2, 3].includes(it.football_relevance)) errors.push(`${it.name}: rilevanza`)
}

const items = []
for (const [srcName, name_it, category, subcategory, pattern, lat, goals, rel, inj = [], fix = {}] of FED) {
  const e = byName.get(srcName)
  if (!e) { errors.push(`non trovato nella fonte: ${srcName}`); continue }
  const mapM = (arr) => [...new Set(arr.map((m) => MUSCLE[m] ?? m))]
  const primary = fix.primary ?? mapM(e.primaryMuscles)
  const it = {
    slug: `fed:${e.id}`,
    name: e.name,
    name_it,
    category,
    subcategory,
    primary_muscles: primary,
    secondary_muscles: mapM(e.secondaryMuscles).filter((m) => !primary.includes(m)),
    equipment_tags: e.equipment ? [EQUIP[e.equipment] ?? e.equipment] : [],
    difficulty: LEVEL[e.level] ?? null,
    laterality: LAT[lat],
    movement_pattern: pattern,
    performance_goals: goals,
    football_relevance: rel,
    injury_prevention: inj,
    position_relevance: [],
    instructions: e.instructions ?? [],
    instructions_lang: 'en',
    coaching_cues: [],
    common_mistakes: [],
    source: 'free-exercise-db',
    source_license: 'Unlicense',
    source_id: e.id,
    source_meta: { force: e.force, mechanic: e.mechanic, category: e.category },
  }
  check(it); items.push(it)
}
for (const a of AUVI) {
  if (byName.has(a.name)) errors.push(`voce AUVI presente nella fonte, usare fed: ${a.name}`)
  const it = {
    slug: `auvi:${kebab(a.name)}`,
    name: a.name,
    name_it: a.name_it,
    category: a.category,
    subcategory: a.subcategory,
    primary_muscles: a.primary,
    secondary_muscles: a.secondary,
    equipment_tags: a.equip,
    difficulty: a.difficulty,
    laterality: LAT[a.lat],
    movement_pattern: a.pattern,
    performance_goals: a.goals,
    football_relevance: a.rel,
    injury_prevention: a.inj ?? [],
    position_relevance: [],
    instructions: a.steps ?? [],
    instructions_lang: a.steps ? 'it' : null,
    coaching_cues: [],
    common_mistakes: [],
    source: 'auvi',
    source_license: 'AUVI',
    ...(a.steps ? { source_note: NOTE } : {}),
  }
  check(it); items.push(it)
}
const slugs = new Set(); const names = new Set()
for (const it of items) {
  if (slugs.has(it.slug)) errors.push(`slug duplicato ${it.slug}`)
  if (names.has(it.name.toLowerCase())) errors.push(`nome duplicato ${it.name}`)
  slugs.add(it.slug); names.add(it.name.toLowerCase())
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }

writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString().slice(0, 10),
  source: 'yuhonas/free-exercise-db (Unlicense) + voci AUVI',
  count: items.length,
  items,
}, null, 2) + '\n')
const by = (k) => items.reduce((m, it) => ((m[it[k]] = (m[it[k]] ?? 0) + 1), m), {})
console.log(`${items.length} esercizi → ${OUT}`)
console.log(by('category'))
console.log(by('source'))
