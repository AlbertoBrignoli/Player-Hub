# Player Hub — CRM 1:1 Giocatore × AUVI

CRM di gestione verticale, **un atleta per istanza**. Ogni giocatore ha:
il **suo** progetto Supabase (dati isolati) e il **suo** deploy Vercel dallo stesso template.

Stack: Vite + React + TypeScript + `@supabase/supabase-js` (Auth magic-link, RLS reale, Storage).

## Moduli
- **Dashboard** — panoramica: prossimi impegni, scadenze, incassi, task aperte.
- **Performance** — scheda, partite, statistiche stagionali, rating, rassegna stampa (dati API-Football già presenti nel Supabase dell'atleta).
- **Contratti** — accordi sportivi/mandato, scadenze, clausole.
- **Compensi** — entrate/uscite, commissioni AUVI, pagamenti collaboratori, scadenzario.
- **Documenti** — archivio privato su Supabase Storage (bucket `crm-documents`).
- **Sponsor** — accordi commerciali e deliverable con avanzamento.
- **Agenda** — impegni (partite, commerciale, personale, scadenze).
- **Task** — board condivisa AUVI ↔ Giocatore.
- **Messaggi** — chat diretta 1:1 (realtime).
- **Impostazioni** (solo admin) — whitelist degli indirizzi email autorizzati.

## Ruoli e accesso
- **Supabase Auth** via **magic link** (nessuna password).
- Accesso consentito **solo** agli indirizzi presenti in `crm_allowed_emails` (un trigger blocca gli altri al primo login).
- Ruoli: `admin` (AUVI, gestisce tutto) e `player` (vede tutto, aggiorna task assegnate a sé, carica documenti, scrive messaggi). Enforcement via **RLS**.

## Setup locale
```bash
cp .env.example .env.local   # inserisci URL + anon/publishable key del Supabase dell'atleta
npm install
npm run dev                  # http://localhost:5190
```

## Env
| Variabile | Descrizione |
|---|---|
| `VITE_SUPABASE_URL` | URL del progetto Supabase dell'atleta |
| `VITE_SUPABASE_ANON_KEY` | Publishable (o anon) key del progetto |
| `VITE_PLAYER_NAME` | Nome mostrato nell'interfaccia |
| `VITE_AGENCY_NAME` | Nome agenzia (default: AUVI Agency) |

## Deploy su Vercel (come VGA)
1. **GitHub** — crea un repo (es. `AlbertoBrignoli/player-hub`) e fai push di questa cartella.
2. **Vercel** — *Add New → Project* → importa il repo. Framework: **Vite** (build `npm run build`, output `dist`). Il file `vercel.json` gestisce già il rewrite SPA.
3. **Env su Vercel** — imposta le 4 variabili qui sopra (Production + Preview).
4. **Supabase → Authentication → URL Configuration** — aggiungi l'URL Vercel di produzione come **Site URL** e in **Redirect URLs** (altrimenti i magic link non tornano all'app). In locale aggiungi anche `http://localhost:5190`.
5. Primo login: entra con `a.brignoli@auviagency.com` (già in whitelist come admin), poi da **Impostazioni** autorizza l'email personale del giocatore.

> Nota Vercel: la commit email deve essere collegata all'account GitHub — usa `albertobrignoli43@gmail.com`.

## Replicare per un nuovo atleta
1. Nuovo progetto Supabase → applica le migrazioni `crm_*` (schema, RLS/auth, bucket Storage) — vedi `supabase/migrations/`.
2. Nuovo deploy Vercel da questo repo con le env dell'atleta (o nuovo repo, se vuoi storia separata).
3. In Impostazioni autorizza le email di atleta + AUVI.

## Database (progetto Supabase dell'atleta)
Tabelle di gestione: `crm_profiles`, `crm_allowed_emails`, `crm_contracts`, `crm_documents`,
`crm_payments`, `crm_sponsors`, `crm_events`, `crm_tasks`, `crm_messages`.
Tabelle performance (già esistenti, sola lettura per l'app): `player`, `matches`, `player_stats_api`, `news`.
