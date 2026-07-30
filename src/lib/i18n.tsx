import React, { createContext, useContext, useState } from 'react'

/* Sistema lingue di Player Hub.
   Impianto "chiave = frase italiana": t('Prossima partita') resta italiano in IT,
   e in EN cerca la traduzione qui sotto (se manca, torna l'italiano: nessun testo rotto). */

export type Lang = 'it' | 'en'

interface LangState {
  lang: Lang
  setLang: (l: Lang) => void
  t: (s: string) => string
}

const Ctx = createContext<LangState>({ lang: 'it', setLang: () => {}, t: (s) => s })
export const useLang = () => useContext(Ctx)

function readInitial(): Lang {
  try {
    const saved = localStorage.getItem('ph_lang')
    if (saved === 'it' || saved === 'en') return saved
  } catch { /* no-op */ }
  return 'it' // default italiano
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial)
  const setLang = (l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('ph_lang', l) } catch { /* no-op */ }
  }
  const t = (s: string) => (lang === 'en' ? (EN[s] ?? s) : s)
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

// Bandiera per cambiare lingua (da mettere nell'header).
export function LangToggle() {
  const { lang, setLang } = useLang()
  const langs: { code: Lang; flag: string; label: string }[] = [
    { code: 'it', flag: '🇮🇹', label: 'IT' },
    { code: 'en', flag: '🇬🇧', label: 'EN' },
  ]
  return (
    <div style={{ display: 'inline-flex', background: 'var(--card, #141416)', border: '1px solid var(--border, #2a2a2e)', borderRadius: 9, padding: 2 }}>
      {langs.map(l => (
        <button key={l.code} onClick={() => setLang(l.code)} title={l.label} aria-label={l.label}
          style={{
            border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 7, fontSize: 12.5, fontWeight: 800,
            display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1,
            background: lang === l.code ? 'var(--accent, #c6ff3a)' : 'transparent',
            color: lang === l.code ? '#0a0a0c' : 'var(--text-dim, #8b8b95)',
          }}>
          <span style={{ fontSize: 14 }}>{l.flag}</span>{l.label}
        </button>
      ))}
    </div>
  )
}

// ---- Dizionario EN (chiave = frase italiana). Fase 1: menu, titoli, login, dashboard. ----
const EN: Record<string, string> = {
  // gruppi menu
  'Servizi AUVI': 'AUVI Services',
  'Il mio club': 'My club',
  'Panoramica': 'Overview',
  'Contenuti': 'Content',
  'Gestione': 'Management',
  'Operatività · extra campo': 'Operations · off-field',
  'Sistema': 'System',
  'Partnership': 'Partnership',
  'Preparazione': 'Fitness',
  'Ufficio': 'Office',
  'Atleta': 'Athlete',
  'Procura': 'Agency',
  'Fitness': 'Fitness',
  'Operatività': 'Operations',
  'Assicurazioni': 'Insurance',
  'Legal & Tax': 'Legal & Tax',
  // voci menu
  'Il mio team': 'My team',
  'Performance': 'Performance',
  'AUVI Performance': 'AUVI Performance',
  'Profilo': 'Profile',
  'Cal. Editoriale': 'Editorial Cal.',
  'Media': 'Media',
  'Contratti e Documenti': 'Contracts & Documents',
  'Sponsor': 'Sponsors',
  'Commercial Profile': 'Commercial Profile',
  'Il mio profilo': 'My profile',
  'Agenda': 'Agenda',
  'Task': 'Tasks',
  'Messaggi': 'Messages',
  'Collegamenti': 'Connections',
  'Impostazioni': 'Settings',
  'Home': 'Home',
  'Media Kit': 'Media Kit',
  'Campagne': 'Campaigns',
  'Ricerca talent': 'Talent search',
  'La mia scheda': 'My card',
  'Area Fitness': 'Fitness area',
  'Il mio ufficio': 'My office',
  'Scheda atleta': 'Athlete profile',
  'Contratti': 'Contracts',
  'Documenti': 'Documents',
  'Polizze': 'Policies',
  'Scadenze': 'Deadlines',
  'Fisco e legale': 'Tax & legal',
  'Richieste servizi': 'Service requests',
  // titoli/sottotitoli pagina
  'Quadro generale della gestione': 'Management overview',
  'Preparazione atletica e performance': 'Athletic preparation and performance',
  'Profilo Preparatore': 'Fitness coach profile',
  'Il tuo profilo professionale': 'Your professional profile',
  'Spedizioni, equipaggiamento e contatti club': 'Shipments, equipment and club contacts',
  'Statistiche, partite e rendimento': 'Stats, matches and performance',
  'Accordi sportivi e scadenze': 'Sporting agreements and deadlines',
  'Archivio file riservato': 'Private file archive',
  'Calendario Editoriale': 'Editorial Calendar',
  'Partite, copy e grafiche pronte da pubblicare': 'Matches, copy and graphics ready to publish',
  'Foto, selezioni e grafiche del team': 'Photos, selections and team graphics',
  'Sponsor & Commerciale': 'Sponsors & Commercial',
  'Accordi e deliverable': 'Agreements and deliverables',
  'Misura il tuo valore, scopri i brand compatibili, costruisci opportunità': 'Measure your value, discover matching brands, build opportunities',
  'Extra campo · impegni, prenotazioni, call, viaggi': 'Off-field · events, bookings, calls, travel',
  'Attività condivise': 'Shared tasks',
  'Comunicazione diretta': 'Direct communication',
  'Password, accessi e configurazione': 'Password, access and configuration',
  'La tua scheda e gli atleti in partnership': 'Your card and partnership athletes',
  'Agenda personale, clienti e cassa · area privata': 'Personal agenda, clients and cash · private area',
  'La tua scheda e i tuoi assistiti': 'Your card and your clients',
  'La tua scheda e gli atleti seguiti': 'Your card and the athletes you follow',
  'Richieste di accesso agli atleti': 'Athlete access requests',
  'Contatti e agenzia': 'Contacts and agency',
  'Polizze, documenti e scadenze': 'Policies, documents and deadlines',
  'Pagamenti, documenti e richieste': 'Payments, documents and requests',
  'Servizi e partner a tua disposizione': 'Services and partners at your disposal',
  'Il tuo team di lavoro': 'Your working team',
  'Accordi, scadenze e archivio file riservato': 'Agreements, deadlines and private file archive',
  'Contatti e studio': 'Contacts and firm',
  'Contatti personali e agenzia': 'Personal contacts and agency',
  "I numeri dell'atleta": "The athlete's numbers",
  'Proponi contenuti e carica lo shooting': 'Propose content and upload the shooting',
  'Dati e referente del brand': 'Brand data and contact',
  'Trova gli atleti del roster più in linea con il tuo brand': 'Find the roster athletes that best fit your brand',
  // login
  'IL TUO SPAZIO RISERVATO': 'YOUR PRIVATE SPACE',
  'PARTNER NEL TUO HUB': 'PARTNERS IN YOUR HUB',
  'Bentornato.': 'Welcome back.',
  'Accedi al tuo Player Hub.': 'Sign in to your Player Hub.',
  'EMAIL': 'EMAIL',
  'PASSWORD': 'PASSWORD',
  'NASCONDI': 'HIDE',
  'MOSTRA': 'SHOW',
  'Accesso in corso…': 'Signing in…',
  'Entra': 'Sign in',
  'Accesso su invito · solo indirizzi autorizzati': 'Invite-only · authorized addresses only',
  'Al primo accesso usa il link via email, poi imposta la password dalle Impostazioni.': 'On first access use the email link, then set your password in Settings.',
  'Inserisci email e password per continuare.': 'Enter email and password to continue.',
  'Inserisci prima la tua email.': 'Enter your email first.',
  'Ti abbiamo inviato un link di accesso. Controlla la posta (anche lo spam).': 'We sent you a sign-in link. Check your inbox (and spam too).',
  'Email o password non corretti. Se è il tuo primo accesso o hai dimenticato la password, usa il link via email.': 'Incorrect email or password. If this is your first access or you forgot your password, use the email link.',
  'Email non ancora confermata: usa il link via email per completare il primo accesso.': 'Email not yet confirmed: use the email link to complete first access.',
  'Troppi tentativi ravvicinati. Attendi un minuto e riprova.': 'Too many attempts in a row. Wait a minute and try again.',
  'Si è verificato un errore. Riprova.': 'Something went wrong. Please try again.',
  // dashboard
  'Da preparare': 'To prepare',
  'Copy pronto': 'Copy ready',
  'Grafica': 'Graphic',
  'Pronto': 'Ready',
  'Buongiorno': 'Good morning',
  'Buon pomeriggio': 'Good afternoon',
  'Buonasera': 'Good evening',
  'Oggi': 'Today',
  'Domani': 'Tomorrow',
  'IN CASA': 'HOME',
  'TRASFERTA': 'AWAY',
  'In casa': 'Home',
  'Trasferta': 'Away',
  'Nato il': 'Born',
  'Gestione riservata AUVI': 'AUVI private management',
  'Ultima partita': 'Last match',
  'Da fare ora': 'To do now',
  'Foto da approvare': 'Photos to approve',
  'Selezioni in attesa del tuo ok': 'Selections awaiting your approval',
  'In lavorazione': 'In progress',
  'In stagione': 'This season',
  'Dettagli →': 'Details →',
  'Presenze': 'Appearances',
  'Rating': 'Rating',
  'Gol': 'Goals',
  'Prossima partita': 'Next match',
  'Calendario →': 'Calendar →',
  'Nessuna partita in programma al momento.': 'No matches scheduled at the moment.',
  'Prossimo contenuto da pubblicare': 'Next content to publish',
  'Apri →': 'Open →',
  'Primo accesso o password dimenticata →': 'First access or forgot password →',
  'Contratti, compensi, sponsor, agenda, servizi: tutto in un unico posto. Tu pensi a giocare — Player Hub tiene insieme la tua carriera e la fa crescere.': 'Contracts, fees, sponsors, agenda, services: all in one place. You focus on playing — Player Hub holds your career together and helps it grow.',
  'Assist': 'Assists',
  'Ultime 5 · andamento rating': 'Last 5 · rating trend',
  'Comp.': 'Comp.',
  'Data': 'Date',
  'Match': 'Match',
  'Min.': 'Min.',
  'Aerei %': 'Aerial %',
  'Avanti %': 'Forward %',
  'Azioni %': 'Actions %',
  'Duelli %': 'Duels %',
  'Int.': 'Int.',
  'Lanci %': 'Long balls %',
  'Pass %': 'Pass %',
  'Rec.': 'Rec.',
  'Storico competizioni': 'Competition history',
  'Competizione': 'Competition',
  'Pres.': 'Apps',
  'Stagione': 'Season',
  'Rassegna stampa': 'Press review',
  'Età': 'Age',
  'Altezza': 'Height',
  'Piede': 'Foot',
  'Maglia': 'Shirt',
  'Sofascore ↗': 'Sofascore ↗',
  'Indirizzo principale': 'Main address',
  'Italia': 'Italy',
  'Paese': 'Country',
  'Città': 'City',
  'CAP': 'ZIP',
  'Indirizzo': 'Address',
  'Telefono': 'Phone',
  'Persona di riferimento': 'Contact person',
  'Nome': 'Name',
  'Relazione': 'Relationship',
  'Moglie/Compagna': 'Wife/Partner',
  'Genitore': 'Parent',
  'Fratello/Sorella': 'Sibling',
  'Procuratore': 'Agent',
  'Altro': 'Other',
  'Telefono rif.': 'Contact phone',
  'Email rif.': 'Contact email',
  'Scarpe': 'Boots',
  'Adidas, Nike…': 'Adidas, Nike…',
  'Brand': 'Brand',
  'Numero': 'Size',
  'Modello': 'Model',
  'Nome sponsor o No': 'Sponsor name or No',
  'Sponsor attuale': 'Current sponsor',
  'Guanti (portieri)': 'Gloves (goalkeepers)',
  'Taglia': 'Size',
  'Team Manager': 'Team Manager',
  'Addetto stampa': 'Press officer',
  'Media Officer': 'Media Officer',
  'Segreteria club': 'Club office',
  'Link materiali club': 'Club materials link',
  'Link accesso materiali': 'Materials access link',
  'Username': 'Username',
  'Mostra': 'Show',
  'Nascondi': 'Hide',
  'Salva': 'Save',
  'Salvo…': 'Saving…',
  'Salvato ✓': 'Saved ✓',
  'Nessun atleta selezionato': 'No athlete selected',
  'Seleziona un atleta dal menù in alto.': 'Select an athlete from the menu above.',
  'Spedizioni': 'Shipments',
  'Equipment': 'Equipment',
  'Contatti': 'Contacts',
  'Profilo atleta': 'Athlete profile',
  'Scadenza contratto': 'Contract expiry',
  'Link esterni': 'External links',
  'Transfermarkt ↗': 'Transfermarkt ↗',
}
