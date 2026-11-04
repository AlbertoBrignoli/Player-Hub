import { teamLogo, leagueLogo } from '../lib/logos'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { Spinner, Modal } from '../components/ui'
import Icon from '../components/Icon'
import { defaultWeek } from '../components/WeekPlan'
import { QuickAddModal, useQuickAddPermissions } from '../components/QuickAdd'
import HomeContacts from './home/HomeContacts'
import HomeServices from './home/HomeServices'
import HomeTodo from './home/HomeTodo'
import { fmtDate, fmtMatchTime, daysUntil, isImageFile } from '../lib/format'
import type { Player, EventItem, Contract, Match, StatsMatch, EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'
const CHIP: Record<string, { l: string; c: string }> = {
  da_preparare: { l: 'Da preparare', c: 'ed-chip-gold' },
  copy_pronto: { l: 'Copy pronto', c: 'ed-chip-blue' },
  grafica_caricata: { l: 'Grafica', c: 'ed-chip-gold' },
  pronto: { l: 'Pronto', c: 'ed-chip-green' },
}

// Home = pagina di punta, pensata prima per il telefono (375px).
// Ordine: 1 identità, 2 azioni rapide, 3 da fare ora, 4 prossima partita,
// 5 prossimi giorni, 6 stagione + ultima partita, 7 referenti.
// Desktop (>880px): colonna sinistra 1-4, destra 5-7. Stesso DOM, nessun `order`.
const HOME_CSS = `
/* La tua stagione: barra compatta sotto la partita, cliccabile */
.home-season { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer; background: var(--surface); color: var(--ink); border: 1px solid var(--border); border-radius: 20px; padding: 10px 12px; min-height: 56px; transition: transform .12s, border-color .15s; }
.home-season:hover { border-color: var(--border-2); }
.home-season:active { transform: scale(.985); }
.home-season-ic { width: 32px; height: 32px; border-radius: 12px; background: var(--yellow); color: var(--ink); display: grid; place-items: center; flex-shrink: 0; }
.home-season-k { font-size: var(--fs-meta); font-weight: var(--w-semi); color: var(--text-dim); flex-shrink: 0; }
.home-season-nums { flex: 1; min-width: 0; display: flex; justify-content: flex-end; gap: 14px; font-size: var(--fs-meta); color: var(--text-dim); white-space: nowrap; overflow: hidden; }
.home-season-nums b { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 15px; color: var(--ink); font-variant-numeric: tabular-nums; }
@media (max-width: 600px) { .home-season-k { display: none; } .home-season-nums { justify-content: space-between; gap: 8px; } }

.home { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 28px; align-items: start; }
.home-col { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.home-sec { min-width: 0; width: 100%; }
/* riga Oggi: il prossimo impegno, un tocco lo apre */
.home-today { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; padding: 10px 14px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); cursor: pointer; font: inherit; color: var(--text); }
.home-today:hover { border-color: var(--border-2); }
.home-today-ic { width: 32px; height: 32px; border-radius: 12px; background: var(--yellow); color: var(--ink); display: grid; place-items: center; flex-shrink: 0; }
.home-today-k { font-size: var(--fs-meta); font-weight: var(--w-bold); color: var(--text-dim); }
.home-today-t { font-size: var(--fs-body); font-weight: var(--w-semi); }
.home-group { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.home-group > .home-h { margin-bottom: 0; }
.home-trunc { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.home-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 17px; font-weight: var(--w-bold); letter-spacing: -.2px; color: var(--ink); margin: 0 2px 10px; }
.home-h-link { border: 0; background: none; padding: 4px 0; font: inherit; font-size: var(--fs-meta); font-weight: 600; letter-spacing: 0; color: var(--text-dim); cursor: pointer; display: inline-flex; align-items: center; gap: 2px; }
.home-h-link:hover { color: var(--ink); }
.home-h .n { font-weight: 600; font-size: var(--fs-meta); letter-spacing: 0; text-transform: none; color: var(--text-faint); }
.home-card { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; text-align: left; }
button.home-card { cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .12s; }
button.home-card:hover { border-color: var(--border-2); box-shadow: var(--shadow-sm); }
button.home-card:active, .home-qa:active, .home-contact:active { transform: scale(.98); }

/* 1 identita */
.home-id { display: flex; align-items: center; gap: 14px; }
.home-id-ph { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-2); flex-shrink: 0; }
.home-id-hi { font-size: 12.5px; color: var(--text-faint); font-weight: 400; }
.home-id-name { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 22px; line-height: 1.05; margin-top: 2px; }
.home-id-role { font-size: 12.5px; color: var(--text-dim); margin-top: 3px; }

/* 1+2 intestazione: un riquadro giallo AUVI con chi sei e le azioni rapide (su telefono sotto il nome) */
.home-top { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; flex-wrap: wrap;
  border: 1px solid var(--border); border-radius: 20px; padding: 14px 16px; color: var(--ink);
  background: var(--surface); }
/* Colori della Home: base chiara come le pagine interne; il nero solo per i due "momenti vetrina"
   (prossima partita e copertina Servizi, foto in bianco e nero sotto velo nero); il giallo come accento. */
.home-svc-hero { --home-photo: url(/servizi/auvi-performance.jpg); }
.home-svc-hero::before { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(100deg, rgba(10,10,10,.93) 0%, rgba(10,10,10,.8) 55%, rgba(10,10,10,.6) 100%), var(--home-photo) center / cover; filter: grayscale(1); }
.home-id-line { display: none; }
.home-top .home-id { flex: 1 1 300px; min-width: min(300px, 100%); }
.home-top .home-qas { display: flex; gap: 10px; flex: 0 0 auto; width: auto; }
.home-top .home-qa { width: 52px; }
.home-top .home-qa-ic { width: 44px; height: 44px; }
.home-qa-edit { align-self: flex-start; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; margin-top: 8px; }
.home-qa-edit:hover { color: var(--ink); border-color: var(--border-2); }
.qa-pick { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 6px 12px 6px 6px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); font: inherit; color: var(--text); cursor: pointer; }
.qa-pick.on { border-color: var(--ink); }
.qa-pick:disabled { opacity: .45; cursor: default; }
.qa-pick-ic { width: 36px; height: 36px; border-radius: 12px; background: var(--bg-2); display: grid; place-items: center; }
.qa-pick.on .qa-pick-ic { background: var(--yellow); }
.qa-pick-n { width: 24px; height: 24px; border-radius: 50%; background: var(--ink); color: var(--yellow); font-size: 12.5px; font-weight: 800; display: grid; place-items: center; }
/* sul giallo i cerchi sono tutti uguali: bianchi con bordo nero */
.home-top .home-qa .home-qa-ic, .home-top .home-qa.primary .home-qa-ic { background: var(--bg-2); color: var(--ink); border: 0; }
.home-top .home-qa:hover .home-qa-ic { background: var(--yellow); }
.home-top .home-qa-badge { border-color: var(--surface); }
.home-top .home-qa.primary .home-qa-ic { box-shadow: none; }
@media (max-width: 600px) { .home-top .home-qas { width: 100%; justify-content: space-around; } }

/* 2 azioni rapide */
.home-qas { display: grid; gap: 8px; }
.home-qa { display: flex; flex-direction: column; align-items: center; gap: 7px; min-height: 44px; padding: 2px 0; background: none; border: none; cursor: pointer; transition: transform .12s; }
.home-qa-ic { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); color: var(--text); transition: border-color .15s, background .15s; }
.home-qa:hover .home-qa-ic { border-color: var(--border-2); }
.home-qa.primary .home-qa-ic { background: var(--yellow); border-color: var(--yellow); color: var(--ink); }
.home-qa-l { font-size: 12.5px; font-weight: 600; color: var(--text); }
.home-qa-ic { position: relative; }
.home-qa.primary .home-qa-ic { box-shadow: 0 6px 18px -8px rgba(10,10,10,.35); }
.home-qa-badge { position: absolute; top: -4px; right: -8px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 12px; background: var(--ink); color: var(--yellow); font-size: 11px; font-weight: 800; display: grid; place-items: center; border: 2px solid var(--bg); font-variant-numeric: tabular-nums; }
.home-score-content { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border-radius: 20px; background: rgba(255,255,255,.1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); text-align: left; }
.home-score-content img, .home-score-content-ic { width: 38px; height: 38px; border-radius: 12px; object-fit: cover; flex-shrink: 0; display: grid; place-items: center; background: rgba(255,255,255,.12); }
.home-score-content-k { font-size: 11px; color: rgba(255,255,255,.7); font-weight: 600; letter-spacing: .3px; }
.home-score-content-st { color: var(--yellow); }

/* 3 da fare ora */
.home-todo { display: flex; flex-direction: column; gap: 10px; }
.home-thumbs { display: flex; gap: 4px; margin-top: 8px; }
.home-thumbs img { width: 28px; height: 28px; border-radius: 8px; object-fit: cover; display: block; opacity: 0; transition: opacity .25s; }
.home-thumbs img.ok { opacity: 1; }
.home-thumbs img:not(.ok) { display: none; } /* niente buchi mentre carica */
.home-calm { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.home-calm-ic { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-2); color: var(--text-dim); display: grid; place-items: center; flex-shrink: 0; }

/* 4 tabellone prossima partita */
.home-score .ed-hero-img { filter: grayscale(1); }
.home-score.ed-hero { height: auto; min-height: 0; padding: 0; border: 1px solid var(--border); display: block; cursor: pointer; }
.home-score-body { position: relative; padding: 16px 16px 16px; }
.home-score .ed-livepill { margin-bottom: 14px; background: var(--yellow); color: var(--ink); }
.home-score .ed-livepill .ed-livedot { background: var(--ink); }
.home-score .ed-livepill span { color: var(--ink); }
.home-score-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; }
.home-team { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; text-align: center; }
.home-team-logo { width: 46px; height: 46px; object-fit: contain; }
.home-team-ini { width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,.1); display: grid; place-items: center; font-weight: 700; font-size: 15px; }
.home-team-n { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 12.5px; line-height: 1.15; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
.home-kick { text-align: center; padding: 0 4px; }
.home-kick-t { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 22px; line-height: 1; font-variant-numeric: tabular-nums; }
.home-kick-d { font-size: 11px; font-weight: 600; letter-spacing: .6px; text-transform: uppercase; color: rgba(255,255,255,.72); margin-top: 6px; }
.home-score-meta { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.14); font-size: 12.5px; font-weight: 600; color: rgba(255,255,255,.82); min-width: 0; }
.home-score-meta img { width: 18px; height: 18px; object-fit: contain; flex-shrink: 0; }

/* 5 prossimi giorni: un blocco per giorno, a destra gli impegni con l'ora */
/* prossimi giorni: card chiara, giorni della settimana in giallo AUVI */
.home-agenda .home-tl-day { background: var(--yellow); }
.home-agenda .home-tl-day .w { color: rgba(10,10,10,.7); }
.home-agenda .home-tl-day .d { color: var(--ink); }
.home-tl-group { display: flex; gap: 12px; padding: 10px 14px; align-items: flex-start; }
.home-tl-group + .home-tl-group { border-top: 1px solid var(--border); }
.home-tl-items { flex: 1; min-width: 0; display: grid; gap: 6px; padding-top: 4px; }
.home-tl-item { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.home-tl-row { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; }
.home-tl-row + .home-tl-row { border-top: 1px solid var(--border); }
.home-tl-day { width: 44px; flex-shrink: 0; text-align: center; border-radius: 12px; background: var(--bg-2); padding: 5px 0 4px; }
.home-tl-day .w { font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--text-faint); }
.home-tl-day .d { font-weight: 700; font-size: 15px; line-height: 1.1; color: var(--text); font-variant-numeric: tabular-nums; }
.home-tl-time { width: 42px; flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--text-dim); font-variant-numeric: tabular-nums; }
.home-tl-t { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--text); }

/* 6 stagione */
.home-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 16px 6px 14px; }
.home-stat { text-align: center; min-width: 0; }
.home-stat + .home-stat { border-left: 1px solid var(--border); }
.home-stat .v { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; font-size: 24px; line-height: 1; font-variant-numeric: tabular-nums; }
.home-stat .l { font-size: 12.5px; color: var(--text-faint); margin-top: 6px; font-weight: 400; }
.home-last { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--border); font-size: 12.5px; min-width: 0; }
.home-last .k { color: var(--text-faint); font-weight: 600; flex-shrink: 0; }
.home-last .m { flex: 1; min-width: 0; font-weight: 600; color: var(--text); }
.home-last .x { color: var(--text-faint); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.home-note { font-size: 12.5px; color: var(--text-faint); padding: 0 14px 12px; text-align: center; }

/* 7 referenti: una fila di foto rotonde con nome e ruolo sotto */
.home-contacts { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.home-contacts::-webkit-scrollbar { display: none; }
.home-contact { flex: 0 0 92px; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px 2px; background: none; border: 0; cursor: pointer; text-align: center; min-width: 0; }
.home-contact-av { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border-2); }
.home-contact:hover .home-contact-av { box-shadow: 0 0 0 2px var(--ink); }
.home-contact-auvi { display: grid; place-items: center; background: var(--ink); box-shadow: 0 0 0 2px var(--yellow); }
.home-contact-auvi img { width: 46%; height: auto; }
.home-contact-ini { display: grid; place-items: center; background: var(--bg-2); color: var(--text); font-weight: 700; font-size: 15px; }
.home-contact-n { font-size: 12.5px; font-weight: 600; color: var(--text); max-width: 100%; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.home-contact-r { font-size: 11px; color: var(--text-faint); max-width: 100%; }

/* 8 servizi AUVI: una copertina sola, tutta cliccabile, che invita ad aprire */
.home-svc-hero { position: relative; display: block; width: 100%; min-height: 230px; padding: 0; border: 0; border-radius: 20px; overflow: hidden; cursor: pointer; text-align: left; background: var(--ink); color: #fff; transition: transform .12s; }
.home-svc-hero:active { transform: scale(.985); }
.home-svc-hero::before { transition: transform .6s ease; }
.home-svc-hero:hover::before { transform: scale(1.04); }
.home-svc-in { position: relative; display: flex; flex-direction: column; gap: 6px; min-height: 230px; padding: 20px; }
.home-svc-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.home-svc-k { font-size: var(--fs-label); font-weight: var(--w-bold); letter-spacing: 1.3px; text-transform: uppercase; color: var(--yellow); }
.home-svc-live { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.14); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font-size: var(--fs-meta); font-weight: 600; }
.home-svc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--yellow); animation: homePulse 2s infinite; }
@keyframes homePulse { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
.home-svc-t { font-family: var(--font-display); font-stretch: 125%; font-weight: 700; text-transform: uppercase; font-size: 22px; line-height: 1.1; max-width: 460px; margin-top: 4px; }
.home-svc-s { font-size: var(--fs-body); color: rgba(255,255,255,.78); max-width: 440px; line-height: 1.45; }
.home-svc-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: auto; padding-top: 14px; }
.home-svc-logos { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.home-svc-lg { height: 30px; padding: 0 12px; border-radius: 999px; display: inline-flex; align-items: center; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.home-svc-lg img { height: 14px; width: auto; max-width: 84px; object-fit: contain; }
.home-svc-cta { display: inline-flex; align-items: center; gap: 4px; padding: 10px 14px 10px 16px; border-radius: 999px; background: var(--yellow); color: var(--ink); font-weight: var(--w-bold); font-size: var(--fs-body); }
@media (min-width: 881px) { .home-contacts { flex-wrap: wrap; overflow: visible; } }
@media (max-width: 600px) { .home-svc-lg:nth-child(n+4) { display: none; } }
@media (prefers-reduced-motion: reduce) { .home-svc-dot { animation: none; } .home-svc-hero:hover::before { transform: none; } }


@media (max-width: 880px) {
  /* le due colonne si sciolgono in una sola, riordinata per priorità */
  .home { display: flex; flex-direction: column; align-items: stretch; gap: 20px; }
  .home-col { display: contents; }
  .home-o1 { order: 1; } .home-o2 { order: 2; } .home-o3 { order: 3; } .home-o4 { order: 4; }
  .home-o5 { order: 5; } .home-o6 { order: 6; } .home-o7 { order: 7; }
}
@media (max-width: 1280px) { .home-desk { display: none; } }
/* iPhone: tutto più compatto, come le app Apple (meno aria morta, stesse gerarchie) */
@media (max-width: 600px) {
  .home { gap: 16px; }
  .home-id-ph, .home-id .avatar { width: 44px !important; height: 44px !important; border-radius: 12px !important; }
  .home-id-hi, .home-id-name { display: none; }
  .home-id-line { display: block; font-size: 17px; line-height: 1.25; color: var(--text); }
  .home-id-line b { font-weight: var(--w-bold); }
  .home-top { padding: 12px; border-radius: 20px; }
  .home-top { gap: 12px; }
  .home-top .home-qa { width: auto; flex: 1; gap: 5px; }
  .home-top .home-qa-ic { width: 40px; height: 40px; }
  .home-qa-l { font-size: 11px; }
  .home-score-body { padding: 14px; }
  .home-score .ed-livepill { margin-bottom: 10px; }
  .home-team-logo, .home-team-ini { width: 38px; height: 38px; }
  .home-kick-t { font-size: 20px; }
  .home-score-meta { margin-top: 12px; padding-top: 10px; }
  .home-svc-hero, .home-svc-in { min-height: 0; }
  .home-svc-in { padding: 16px; }
  .home-svc-t { font-size: 18px; }
  .home-svc-s { font-size: var(--fs-meta); }
  .home-svc-foot { padding-top: 12px; }
  .home-tl-group { padding: 9px 12px; }
  .home-h { margin-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .home-thumbs img { transition: none; }
  button.home-card:active, .home-qa:active, .home-contact:active { transform: none; }
}
`

// Nome corto per il tabellone: via sigle societarie e anni di fondazione.
function shortTeam(name: string | null | undefined) {
  if (!name) return ''
  const s = name
    .replace(/\b(F\.?C\.?|A\.?F\.?C\.?|S\.?S\.?C\.?|A\.?C\.?|S\.?C\.?|U\.?S\.?|S\.?S\.?|CF|FK|PAE|GFC|Calcio|Football Club)\b/gi, '')
    .replace(/\b(18|19|20)\d{2}\b/g, '')
    .replace(/\s{2,}/g, ' ').trim()
  return s || name
}

function Team({ name, logo }: { name: string | null; logo: string | null }) {
  const [broken, setBroken] = useState(false)
  const short = shortTeam(name)
  return (
    <div className="home-team">
      {logo && !broken
        ? <img className="home-team-logo" src={logo} alt="" onError={() => setBroken(true)} />
        : <span className="home-team-ini">{short.slice(0, 1)}</span>}
      <span className="home-team-n" title={name || ''}>{short}</span>
    </div>
  )
}


export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile, role, isTeam } = useAuth()
  const { athleteId, athleteTz } = useAthlete()
  const { t, lang } = useLang()
  const { canEvent } = useQuickAddPermissions()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [lastMatch, setLastMatch] = useState<StatsMatch | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [nextContent, setNextContent] = useState<EditorialEntry | null>(null)
  const [nextContentThumb, setNextContentThumb] = useState<string | null>(null)
  const [toApprove, setToApprove] = useState<MediaItem[]>([])
  const [accessPending, setAccessPending] = useState(0)
  const [proposals, setProposals] = useState(0)
  // l'unica azione attiva dell'atleta: il programma settimanale del club
  const [planMissing, setPlanMissing] = useState(false)
  const [adding, setAdding] = useState<'event' | 'task' | null>(null)
  // cerchi della Home scelti dall'atleta (max 5, in ordine), salvati su questo dispositivo
  const qaStore = `home_qa:${profile?.id || ''}`
  const [qaKeys, setQaKeys] = useState<string[] | null>(() => { try { const v = localStorage.getItem(`home_qa:${profile?.id || ''}`); return v ? JSON.parse(v) : null } catch { return null } })
  const [editQa, setEditQa] = useState(false)
  // Task aperti dell'atleta (attività + documenti richiesti dal commercialista): stesso conteggio della pagina Task
  const [openTasks, setOpenTasks] = useState(0)
  useEffect(() => {
    if (!athleteId) { setOpenTasks(0); return }
    Promise.all([
      supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('player_id', athleteId).neq('status', 'done'),
      supabase.from('crm_tax_items').select('id', { count: 'exact', head: true }).eq('player_id', athleteId).eq('kind', 'richiesta').eq('status', 'aperto'),
    ]).then(([a, b]) => setOpenTasks((a.count || 0) + (b.count || 0)))
  }, [athleteId])
  const isPlayer = role === 'player'
  const [hasMailbox, setHasMailbox] = useState(false)
  useEffect(() => {
    if (!athleteId) { setHasMailbox(false); return }
    supabase.from('crm_mailboxes').select('player_id').eq('player_id', athleteId).maybeSingle()
      .then(({ data }) => setHasMailbox(!!data))
  }, [athleteId])

  useEffect(() => {
    if (!athleteId) return
    (async () => {
      const todayKey = new Date().toISOString().slice(0, 10)
      const pid = athleteId
      const [p, m, t, ev, ct, ed, ph, rq, pr, wp] = await Promise.all([
        supabase.from('player').select('*').eq('api_player_id', pid).maybeSingle(),
        supabase.from('matches').select('*').eq('player_id', pid).order('match_date', { ascending: true }),
        supabase.from('player_stats_match').select('*').eq('player_id', pid).order('match_date', { ascending: false }).limit(1),
        supabase.from('crm_events').select('*').eq('player_id', pid).gte('start_at', new Date().toISOString()).order('start_at').limit(8),
        supabase.from('crm_contracts').select('*').eq('player_id', pid),
        supabase.from('crm_editorial').select('*').eq('player_id', pid).gte('entry_date', todayKey)
          .neq('status', 'pubblicato').order('entry_date').limit(1).maybeSingle(),
        supabase.from('crm_media').select('*').eq('player_id', pid).eq('status', 'da_approvare').order('created_at', { ascending: false }),
        isPlayer
          ? supabase.from('crm_access_requests').select('id').eq('player_id', pid).eq('status', 'pending')
          : Promise.resolve({ data: [] as any[] }),
        // proposte del team (preparatore, procuratore...) che aspettano la conferma dell'atleta
        isPlayer
          ? supabase.from('crm_events').select('id', { count: 'exact', head: true }).eq('player_id', pid)
              .eq('request_status', 'da_confermare').in('proposed_by_role', ['agente', 'preparatore', 'assicuratore', 'commercialista', 'fisioterapista', 'nutrizionista', 'wealth', 'partner'])
          : Promise.resolve({ count: 0 }),
        isPlayer
          ? supabase.from('crm_week_plans').select('id', { count: 'exact', head: true }).eq('player_id', pid)
              .eq('week_start', defaultWeek()).eq('status', 'confermato')
          : Promise.resolve({ count: 1 }),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      {
        const nowIso = new Date().toISOString()
        const pastPlayed = (((m.data as any[]) || [])
          .filter(x => x.match_date && x.match_date < nowIso && (x.minutes ?? 0) > 0)
          .sort((a, b) => (b.match_date || '').localeCompare(a.match_date || '')))
        const lm = pastPlayed[0]
        if (lm) {
          const isHome = (lm.venue || '').toLowerCase() === 'home'
          const hs = lm.team_score == null ? null : (isHome ? lm.team_score : lm.opponent_score)
          const as = lm.team_score == null ? null : (isHome ? lm.opponent_score : lm.team_score)
          const score = (hs != null && as != null) ? ` ${hs}:${as}` : ''
          setLastMatch({ match_name: `${shortTeam(lm.home_team)} - ${shortTeam(lm.away_team)}${score}`, match_date: lm.match_date, minutes: lm.minutes ?? 0, competition: lm.league } as any)
        } else {
          setLastMatch(((t.data as StatsMatch[]) || [])[0] || null)
        }
      }
      setEvents((ev.data as EventItem[]) || [])
      setContracts((ct.data as Contract[]) || [])
      setAccessPending(((rq.data as any[]) || []).length)
      setProposals((pr as { count: number | null }).count || 0)
      setPlanMissing(isPlayer && !((wp as { count: number | null }).count))
      const content = ed.data as EditorialEntry | null
      setNextContent(content)
      const photos = (ph.data as MediaItem[]) || []
      setToApprove(photos)
      setLoading(false)

      // miniature dopo il primo disegno: la Home non aspetta le immagini
      if (content) {
        const { data: cm } = await supabase.from('crm_media').select('storage_path,file_name')
          .eq('editorial_id', content.id).limit(4)
        const img = (cm || []).find(x => isImageFile((x as any).file_name))
        if (img) {
          const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl((img as any).storage_path, 3600)
          if (s?.signedUrl) setNextContentThumb(s.signedUrl)
        }
      }
    })()
  }, [athleteId, isPlayer])

  if (loading) return <Spinner />

  // ---- dati derivati ----
  const locale = lang === 'en' ? 'en-GB' : 'it-IT'
  const nextMatch = matches.find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  // Stagione corrente = quella della partita piu recente; presenze/rating/gol si riferiscono a essa.
  const curSeason = matches.length
    ? matches.reduce((a, b) => ((a.match_date || '') > (b.match_date || '') ? a : b)).season
    : null
  const inSeason = (m: any) => curSeason == null || m.season === curSeason
  const played = matches.filter(m => inSeason(m) && m.minutes != null && m.minutes > 0)
  const presenze = played.length
  const minutes = played.reduce((s, m) => s + (m.minutes || 0), 0)
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = matches.filter(inSeason).reduce((s, m) => s + (m.goals || 0), 0)
  const nextContractExpiry = contracts
    .filter(c => c.end_date).map(c => ({ c, d: daysUntil(c.end_date) }))
    .filter(x => x.d != null && x.d >= 0).sort((a, b) => (a.d! - b.d!))[0]

  const h = new Date().getHours()
  const greeting = t(h < 13 ? 'Buongiorno' : h < 19 ? 'Buon pomeriggio' : 'Buonasera')
  const firstName = (profile?.full_name || '').split(' ')[0]
  const roleLine = player
    ? [player.position, player.team_name, player.shirt_number != null ? `#${player.shirt_number}` : null].filter(Boolean).join(' · ')
    : t('Gestione riservata AUVI')

  // ---- 1 identita ----
  const identity = (
    <header className="home-sec home-id">
      {player?.photo_url
        ? <img className="home-id-ph" src={player.photo_url} alt="" />
        : <div className="avatar" style={{ width: 52, height: 52, fontSize: 18, borderRadius: 12, flexShrink: 0 }}>{(player?.name || firstName || 'A')[0]}</div>}
      <div style={{ minWidth: 0 }}>
        <div className="home-id-hi home-trunc">{greeting}{firstName ? `, ${firstName}` : ''}</div>
        {/* telefono: saluto e nome dell'atleta in una riga sola */}
        <div className="home-id-line home-trunc">{greeting}, <b>{player?.name || t('Atleta')}</b></div>
        <h1 className="home-id-name home-trunc">{player?.name || t('Atleta')}</h1>
        <div className="home-id-role home-trunc">{roleLine}</div>
      </div>
    </header>
  )

  // ---- 2 azioni rapide: l'atleta sceglie quali (fino a 5) e in che ordine, con "Modifica" ----
  type QA = { key: string; label: string; icon: string; run: () => void; badge?: number }
  const ALL: QA[] = [
    // il numero su Media = foto da approvare
    { key: 'media', label: t('Media'), icon: 'image', run: () => goto('media?tab=cartelle'), badge: toApprove.length },
    ...(canEvent ? [{ key: 'event', label: t('Impegno'), icon: 'calendar', run: () => setAdding('event') }] : []),
    { key: 'tasks', label: t('Task'), icon: 'check-square', run: () => goto('tasks'), badge: openTasks },
    // Mail solo se l'atleta ha la casella AUVI
    ...(hasMailbox ? [{ key: 'mail', label: t('Mail'), icon: 'mail', run: () => goto('mail') }] : []),
    { key: 'chat', label: t('Chat'), icon: 'message', run: () => goto('messages') },
    { key: 'docs', label: t('Documenti'), icon: 'archive', run: () => goto('documents') },
    { key: 'fitness', label: t('Preparazione'), icon: 'dumbbell', run: () => goto('fitness') },
    { key: 'services', label: t('Servizi'), icon: 'layers', run: () => goto('services') },
    { key: 'agenda', label: t('Calendario'), icon: 'calendar', run: () => goto('agenda') },
    { key: 'contracts', label: t('Contratti'), icon: 'briefcase', run: () => goto('contracts') },
  ]
  const DEFAULT_QA = ['media', 'event', 'tasks', 'mail', 'chat']
  const chosen = (qaKeys || DEFAULT_QA).map(k => ALL.find(q => q.key === k)).filter(Boolean) as QA[]
  const qas: QA[] = (chosen.length ? chosen : ALL.filter(q => DEFAULT_QA.includes(q.key))).slice(0, 5)
  function saveQa(keys: string[]) {
    setQaKeys(keys)
    try { localStorage.setItem(qaStore, JSON.stringify(keys)) } catch { /* modalità privata */ }
  }
  const quick = (
    <nav className="home-sec home-qas" aria-label={t('Azioni rapide')} style={{ gridTemplateColumns: `repeat(${qas.length}, minmax(0, 1fr))` }}>
      {qas.map(q => (
        <button key={q.key} className={`home-qa home-qa-${q.key}${q.badge ? ' primary' : ''}`} onClick={q.run}
          aria-label={q.badge ? `${q.label}: ${q.badge} ${q.key === 'tasks' ? t('da fare') : t('da approvare')}` : q.label}>
          <span className="home-qa-ic">
            <Icon name={q.icon} size={21} strokeWidth={1.7} />
            {!!q.badge && <span className="home-qa-badge">{q.badge > 99 ? '99+' : q.badge}</span>}
          </span>
          <span className="home-qa-l">{q.label}</span>
        </button>
      ))}
      <button className="home-qa-edit" onClick={() => setEditQa(true)} aria-label={t('Scegli le azioni della Home')} title={t('Modifica')}>
        <Icon name="sliders" size={14} />
      </button>
    </nav>
  )

  // ---- 3 da fare ora: solo ciò che non ha già un posto in Home ----
  // (foto → icona Foto delle azioni rapide; prossimo contenuto → tabellone partita)
  const todo = accessPending > 0 || planMissing ? (
    <section className="home-sec">
      <div className="home-todo">
        {planMissing && (
          <button className="ed-action prio" onClick={() => goto('agenda?plan=1')}>
            <div className="ed-action-num"><Icon name="upload" size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ed-action-t">{t('Carica il programma della settimana')}</div>
              <div className="ed-action-s">{t('Il PDF o la foto del club: lo leggo io, tu spunti e salvi. Al resto pensa il tuo team.')}</div>
            </div>
            <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          </button>
        )}
        {accessPending > 0 && <button className="ed-action prio" onClick={() => goto('access-requests')}>
          <div className="ed-action-num">{accessPending}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ed-action-t">{t('Richieste di accesso')}</div>
            <div className="ed-action-s">{t('Professionisti che chiedono di entrare nella tua area')}</div>
          </div>
          <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        </button>}
      </div>
    </section>
  ) : null

  // ---- Oggi: la sintesi del giorno in una riga (come WHOOP/Oura): il prossimo impegno ----
  const nextEv = events[0]
  const today = (
    <section className="home-sec">
      <button className="home-today" onClick={() => goto(nextEv ? `agenda?event=${nextEv.id}` : 'agenda')}>
        <span className="home-today-ic"><Icon name="calendar" size={16} /></span>
        <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1 }}>
          <span className="home-today-k">{t('Oggi')}</span>
          <span className="home-today-t home-trunc">
            {nextEv
              ? `${new Date(nextEv.start_at).toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: athleteTz || undefined }).replace('.', '')} · ${nextEv.title}`
              : t('Nessun impegno in programma.')}
          </span>
        </span>
        <Icon name="chevron-right" size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
      </button>
    </section>
  )

  // ---- 4 tabellone prossima partita ----
  let hero: ReactNode
  if (nextMatch?.match_date) {
    const d = new Date(nextMatch.match_date)
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
    const when = days <= 0 ? t('Oggi') : days === 1 ? t('Domani') : t('Fra {n} giorni').replace('{n}', String(days))
    const dayLabel = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: athleteTz || undefined }).replace(/\./g, '')
    const home = (nextMatch.venue || '').toLowerCase() === 'home'
    const lg = leagueLogo(nextMatch.league)
    hero = (
      <button className="ed-hero home-score home-sec" onClick={() => goto(nextContent ? `editorial?entry=${nextContent.id}` : 'performance')}
        aria-label={`${t('Prossima partita')}: ${nextMatch.home_team} - ${nextMatch.away_team}${nextContent ? ` · ${t('Prossimo contenuto')}` : ''}`}>
        {player?.stadium_photo_url && <img className="ed-hero-img" src={player.stadium_photo_url} alt="" style={{ opacity: .38 }} />}
        <div className="ed-hero-scrim" style={{ background: 'linear-gradient(180deg, rgba(10,10,10,.55) 0%, rgba(10,10,10,.82) 100%)' }} />
        <div className="home-score-body">
          <div className="ed-livepill"><span className="ed-livedot" /><span>{t('Prossima')} · {when}</span></div>
          <div className="home-score-row">
            <Team name={nextMatch.home_team} logo={teamLogo(nextMatch.home_team, nextMatch.home_logo)} />
            <div className="home-kick">
              <div className="home-kick-t">{fmtMatchTime(nextMatch.match_date, athleteTz)}</div>
              <div className="home-kick-d">{dayLabel}</div>
            </div>
            <Team name={nextMatch.away_team} logo={teamLogo(nextMatch.away_team, nextMatch.away_logo)} />
          </div>
          <div className="home-score-meta">
            {lg && <img src={lg} alt="" />}
            {nextMatch.league && <span className="home-trunc" style={{ minWidth: 0 }}>{nextMatch.league}</span>}
            {nextMatch.league && <span style={{ opacity: .45 }}>|</span>}
            <span style={{ flexShrink: 0 }}>{home ? t('In casa') : t('Trasferta')}</span>
          </div>
          {nextContent && (
            <div className="home-score-content">
              {nextContentThumb
                ? <img src={nextContentThumb} alt="" />
                : <span className="home-score-content-ic"><Icon name="image" size={15} strokeWidth={1.6} /></span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="home-score-content-k home-trunc">{t('Contenuto')} · {fmtDate(nextContent.entry_date)} · <span className="home-score-content-st">{t(CHIP[nextContent.status]?.l || 'In lavorazione')}</span></div>
                <div className="home-trunc" style={{ fontWeight: 600, fontSize: 12.5 }}>{nextContent.title}</div>
              </div>
              <Icon name="chevron-right" size={16} style={{ opacity: .7, flexShrink: 0 }} />
            </div>
          )}
        </div>
      </button>
    )
  } else {
    hero = (
      <button className="home-card home-sec home-calm" onClick={() => goto('performance')}>
        <span className="home-calm-ic"><Icon name="ball" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('Prossima partita')}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>{t('Nessuna partita in programma al momento.')}</div>
        </div>
        <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
      </button>
    )
  }

  // ---- 5 prossimi giorni: impegni raggruppati per giorno (la data compare una volta) ----
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: athleteTz || undefined })
  const days: [string, EventItem[]][] = []
  for (const e of events) {
    const k = dayKey(e.start_at)
    const g = days.find(x => x[0] === k)
    if (g) g[1].push(e); else days.push([k, [e]])
  }
  const agenda = (
    <section className="home-sec">
      <div className="home-h">{t('Calendario')}<button className="home-h-link" onClick={() => goto('agenda')}>{t('Apri')} <Icon name="chevron-right" size={14} /></button></div>
      <button className="home-card home-agenda" onClick={() => goto('agenda')} aria-label={t('Apri agenda')}>
        {events.length === 0 ? (
          <div className="home-tl-row">
            <span className="home-tl-t faint" style={{ fontWeight: 400 }}>{t('Nessun impegno in programma.')}</span>
            <Icon name="chevron-right" size={18} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          </div>
        ) : days.map(([key, list]) => {
          const d = new Date(list[0].start_at)
          return (
            <div className="home-tl-group" key={key}>
              <div className="home-tl-day">
                <div className="w">{d.toLocaleDateString(locale, { weekday: 'short', timeZone: athleteTz || undefined }).replace('.', '')}</div>
                <div className="d">{d.toLocaleDateString(locale, { day: 'numeric', timeZone: athleteTz || undefined })}</div>
              </div>
              <div className="home-tl-items">
                {list.map(e => (
                  <div className="home-tl-item" key={e.id}>
                    <span className="home-tl-time">{new Date(e.start_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: athleteTz || undefined })}</span>
                    <span className="home-tl-t home-trunc">{e.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </button>
    </section>
  )

  // ---- 6 la stagione: il calcio viene prima di tutto ----
  // Card gialla del brand, ben riconoscibile: 4 numeri della stagione in corso,
  // sotto l'ultima partita giocata. Un tocco apre Performance.
  const seasonLabel = curSeason ? `${curSeason}/${String((Number(curSeason) + 1) % 100).padStart(2, '0')}` : ''
  const stats = (
    <section className="home-sec">
      {/* barra compatta sotto la partita: i 4 numeri della stagione, un tocco apre Performance */}
      <button className="home-season" onClick={() => goto('performance')} aria-label={`${t('La tua stagione')} ${seasonLabel} · ${t('Apri Performance')}`}>
        <span className="home-season-ic"><Icon name="ball" size={16} strokeWidth={1.8} /></span>
        <span className="home-season-k">{t('Stagione')}{seasonLabel ? ` ${seasonLabel}` : ''}</span>
        <span className="home-season-nums">
          <span><b>{presenze}</b> {t('pres.')}</span>
          <span><b>{minutes.toLocaleString(locale)}</b>′</span>
          <span><b>{goals}</b> {t('gol')}</span>
          <span><b>{avgRating ? avgRating.toFixed(2) : '-'}</b> {t('voto')}</span>
        </span>
        <Icon name="chevron-right" size={16} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
      </button>
    </section>
  )

  return (
    <div className="home">
      <style>{HOME_CSS}</style>
      <div className="home-col">
        {/* su telefono una colonna sola, ma con le priorità del PC: in alto chi sei e le azioni,
            poi Atleta (prossima partita e presenze), Calendario e Servizi. Ogni titolo è il nome
            della voce di menu in cui porta */}
        <div className="home-o1"><div className="home-sec home-top">
          {identity}
          {quick}
        </div></div>
        <div className="home-o2">{today}</div>
        {/* le cose concrete da fare, ognuna con la sua azione: si smarca qui */}
        <div className="home-o2"><HomeTodo goto={goto} locale={locale} tz={athleteTz} /></div>
        {todo && <div className="home-o2">{todo}</div>}
        {/* Atleta: prossima partita e numeri della stagione, sotto lo stesso titolo del menu */}
        <div className="home-o3 home-group">
          <div className="home-h">{t('Atleta')}<button className="home-h-link" onClick={() => goto('performance')}>{t('Apri')} <Icon name="chevron-right" size={14} /></button></div>
          {hero}
          {stats}
        </div>
        <div className="home-o7"><HomeServices goto={goto} /></div>
      </div>
      <div className="home-col">
        <div className="home-o4">{agenda}</div>
        {/* referenti solo su PC: su telefono e iPad sono già in Il mio team */}
        <div className="home-o6 home-desk"><HomeContacts goto={goto} title={t('Il mio team')} /></div>
      </div>
      {adding && <QuickAddModal initialKind={adding} onClose={() => setAdding(null)} />}
      {editQa && (
        <Modal title={t('Le tue azioni rapide')} onClose={() => setEditQa(false)} dismissable
          footer={<>
            <button className="btn btn-ghost" onClick={() => saveQa(DEFAULT_QA)}>{t('Ripristina')}</button>
            <button className="btn btn-primary" onClick={() => setEditQa(false)}>{t('Fatto')}</button>
          </>}>
          <div className="t-meta" style={{ marginBottom: 10 }}>{t('Scegline fino a 5: compaiono nella Home in questo ordine.')}</div>
          <div className="grid" style={{ gap: 6 }}>
            {ALL.map(q => {
              const keys = qas.map(x => x.key)
              const i = keys.indexOf(q.key)
              const on = i >= 0
              return (
                <button key={q.key} className={`qa-pick ${on ? 'on' : ''}`} disabled={!on && keys.length >= 5}
                  onClick={() => saveQa(on ? keys.filter(k => k !== q.key) : [...keys, q.key])}>
                  <span className="qa-pick-ic"><Icon name={q.icon} size={16} /></span>
                  <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{q.label}</span>
                  {on ? <span className="qa-pick-n">{i + 1}</span> : <Icon name="plus" size={14} />}
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}
