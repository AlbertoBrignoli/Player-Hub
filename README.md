# Player Hub — CRM multi-atleta × AUVI

CRM di gestione verticale **multi-atleta su singola istanza**. Un solo progetto Supabase e un solo
deploy Vercel servono tutti gli atleti AUVI: il selettore in alto cambia l'atleta attivo e la **RLS**
garantisce che ognuno (giocatore, procuratore, preparatore, assicuratore, commercialista, brand)
veda **solo** i dati di sua competenza.

Stack: Vite + React + TypeScript + `@supabase/supabase-js` (Auth magic-link, RLS reale, Storage).

## Moduli
- **Dashboard** — panoramica: prossimi impegni, scadenze, incassi, task aperte.
- **Performance** — scheda, partite, statistiche stagionali, rating, rassegna stampa (dati API-Football per l'atleta attivo).
- **Contratti** — accordi sportivi/mandato, scadenze, clausole.
- **Compensi** — entrate/uscite, commissioni AUVI, pagamenti collaboratori, scadenzario.
- **Documenti** — archivio privato su Supabase Storage (bucket `crm-documents`).
- **Sponsor** — accordi commerciali e deliverable con avanzamento.
- **Agenda** — impegni (partite, commerciale, personale, scadenze).
- **Task** — board condivisa AUVI ↔ Giocatore.
- **Messaggi** — chat diretta 1:1 (realtime).
- **Impostazioni** (solo admin) — whitelist degli indirizzi email autorizzati.

## Ruoli e accesso
- **Supabase Auth** via **magic link** (nessuna password) oppure email + password.
- Accesso consentito **solo** agli indirizzi presenti in `crm_allowed_emails` (un trigger blocca gli altri al primo login).
- Ruoli: `admin` (AUVI, gestisce tutto), `player`, `creator`, `brand`, `agente`, `preparatore`, `assicuratore`, `commercialista`. Enforcement via **RLS**, scopato per atleta.

## Setup locale
```bash
cp .env.example .env.local   # inserisci URL + anon/publishable key del progetto Supabase Player Hub
npm install
npm run dev                  # http://localhost:5190
```

## Env
| Variabile | Descrizione |
|---|---|
| `VITE_SUPABASE_URL` | URL del progetto Supabase Player Hub (condiviso da tutti gli atleti) |
| `VITE_SUPABASE_ANON_KEY` | Publishable (o anon) key del progetto |
| `VITE_PLAYER_NAME` | Etichetta di fallback (l'atleta attivo si sceglie dal selettore in alto) |
| `VITE_AGENCY_NAME` | Nome agenzia (default: AUVI Agency) |

## Deploy su Vercel
1. **GitHub** — repo `AlbertoBrignoli/Player-Hub`, push su `main` (auto-deploy).
2. **Vercel** — *Add New → Project* → importa il repo. Framework: **Vite** (build `npm run build`, output `dist`). Il file `vercel.json` gestisce già il rewrite SPA.
3. **Env su Vercel** — imposta le variabili qui sopra (Production + Preview).
4. **Supabase → Authentication → URL Configuration** — aggiungi l'URL Vercel di produzione come **Site URL** e in **Redirect URLs** (altrimenti i magic link non tornano all'app). In locale aggiungi anche `http://localhost:5190`.
5. Primo login: entra con `a.brignoli@auviagency.com` (già in whitelist come admin), poi da **Impostazioni** autorizza le altre email.

> Nota Vercel: la commit email deve essere collegata all'account GitHub — usa `albertobrignoli43@gmail.com`.

## Aggiungere un nuovo atleta (stessa istanza)
1. Inserisci i dati dell'atleta in **questo stesso** progetto Supabase (riga `player` con `api_player_id`, più i record `crm_*` collegati). Nessun nuovo progetto Supabase, nessun nuovo deploy Vercel.
2. In **Impostazioni** autorizza l'email dell'atleta (ruolo *Giocatore*) e le eventuali email dei professionisti collegati.
3. L'atleta compare nel selettore in alto e — grazie alla RLS — vede **solo** i propri dati.

## Database (progetto Supabase Player Hub)
Tabelle di gestione: `crm_profiles`, `crm_allowed_emails`, `crm_contracts`, `crm_documents`,
`crm_payments`, `crm_sponsors`, `crm_events`, `crm_tasks`, `crm_messages`.
Tabelle performance (già esistenti, sola lettura per l'app): `player`, `matches`, `player_stats_api`, `news`.
