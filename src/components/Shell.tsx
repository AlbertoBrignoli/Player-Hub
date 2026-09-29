import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { supabase } from '../lib/supabase'
import { initials } from '../lib/format'
import NotificationBell from './NotificationBell'
import { useLang, LangToggle } from '../lib/i18n'
import Toaster from './Toaster'
import PushNudge from './PushNudge'
import Icon from './Icon'
import { Modal, Field, Input, Tabs, Empty } from './ui'

// Schermate home dei vari ruoli: qui compare l'invito ad attivare le notifiche.
const HOME_ROUTES = ['dashboard', 'brandhome', 'agent-home', 'insurer-home', 'tax-home', 'physio-home']

export const APP_VERSION = 'v6.2'

export interface NavDef {
  key: string; label: string; icon: string; adminOnly?: boolean; roles?: string[]
  /** sezione con schede: le route elencate sono le schede della stessa voce di menu */
  tabs?: { key: string; label: string; roles?: string[] }[]
}

// Menu principale (admin / player / creator): 5 gruppi, niente gruppi da una voce,
// le azioni quotidiane (Messaggi, Agenda, Task) subito dopo i contenuti.
export const NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Principale', items: [
    { key: 'dashboard', label: 'Home', icon: 'home' },
    { key: 'editorial', label: 'Calendario', icon: 'calendar', tabs: [
      { key: 'editorial', label: 'Editoriale' },
      { key: 'agenda', label: 'Impegni' },
      { key: 'tasks', label: 'Task' },
    ]},
    { key: 'media', label: 'Media', icon: 'image' },
    { key: 'services', label: 'Servizi AUVI', icon: 'layers' },
    { key: 'performance', label: 'Atleta', icon: 'activity', tabs: [
      { key: 'performance', label: 'Performance' },
      { key: 'fitness', label: 'Preparazione' },
      { key: 'profile', label: 'Profilo' },
    ]},
    { key: 'commercial', label: 'Business', icon: 'briefcase', tabs: [
      { key: 'commercial', label: 'Profilo commerciale', roles: ['admin', 'player', 'creator'] },
      { key: 'sponsors', label: 'Sponsor' },
      { key: 'contracts', label: 'Contratti' },
      { key: 'documents', label: 'Documenti' },
    ]},
  ]},
  { group: 'Altro', items: [
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'messages', label: 'Chat', icon: 'message' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
]

// Menu dedicato ai brand: solo media kit, scheda e chat.
export const BRAND_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Partnership', items: [
    { key: 'brandhome', label: 'Home', icon: 'grid' },
    { key: 'mediakit', label: 'Media Kit', icon: 'activity' },
    { key: 'campaigns', label: 'Campagne', icon: 'image' },
    { key: 'talent', label: 'Ricerca talent', icon: 'star' },
    { key: 'brandcard', label: 'La mia scheda', icon: 'award' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
  ]},
]

// ---- Ufficio del professionista: un solo telaio per tutti i ruoli pro ----
// Principale = Home ufficio, I miei atleti, Agenda/Calendario, Chat + area del ruolo;
// Altro = il mio profilo e gli extra del ruolo. Cambiano solo le voci dell'area.
type ProRole = 'agente' | 'assicuratore' | 'commercialista' | 'preparatore' | 'fisioterapista'
export const PRO_ROLES: Record<ProRole, { home: string; profile: string; area: NavDef[]; extra: NavDef[]; tab: { key: string; label: string; icon: string } }> = {
  agente: {
    home: 'agent-home', profile: 'agent-profile',
    area: [
      { key: 'dashboard', label: 'Atleta', icon: 'activity', tabs: [
        { key: 'dashboard', label: 'Panoramica' },
        { key: 'performance', label: 'Performance' },
        { key: 'fitness', label: 'Preparazione' },
        { key: 'profile', label: 'Scheda' },
      ]},
      { key: 'media', label: 'Media', icon: 'image' },
      { key: 'commercial', label: 'Business', icon: 'briefcase', tabs: [
        { key: 'commercial', label: 'Profilo commerciale' },
        { key: 'sponsors', label: 'Sponsor' },
        { key: 'contracts', label: 'Contratti' },
        { key: 'documents', label: 'Documenti' },
      ]},
    ],
    extra: [],
    tab: { key: 'dashboard', label: 'Atleta', icon: 'activity' },
  },
  assicuratore: {
    home: 'insurer-home', profile: 'insurer-profile',
    area: [
      { key: 'insurance', label: 'Polizze', icon: 'lock' },
      { key: 'documents', label: 'Documenti', icon: 'archive' },
    ],
    extra: [],
    tab: { key: 'insurance', label: 'Polizze', icon: 'lock' },
  },
  commercialista: {
    home: 'tax-home', profile: 'tax-profile',
    area: [
      { key: 'legaltax', label: 'Fisco e legale', icon: 'briefcase' },
      { key: 'documents', label: 'Documenti', icon: 'archive' },
    ],
    extra: [{ key: 'services', label: 'Richieste servizi', icon: 'layers' }],
    tab: { key: 'legaltax', label: 'Fisco', icon: 'briefcase' },
  },
  preparatore: {
    home: 'dashboard', profile: 'coach-profile',
    area: [
      { key: 'fitness', label: 'Preparazione', icon: 'dumbbell', tabs: [
        { key: 'fitness', label: 'Programmi' },
        { key: 'training-builder', label: 'Crea scheda' },
        { key: 'exercise-library', label: 'Libreria esercizi' },
        { key: 'performance', label: 'Performance' },
      ]},
      { key: 'coach-office', label: 'Clienti e cassa', icon: 'inbox' },
    ],
    extra: [],
    tab: { key: 'fitness', label: 'Fitness', icon: 'dumbbell' },
  },
  fisioterapista: {
    home: 'physio-home', profile: 'physio-profile',
    area: [{ key: 'physio-office', label: 'Studio', icon: 'briefcase' }],
    extra: [],
    tab: { key: 'physio-office', label: 'Studio', icon: 'briefcase' },
  },
}

export function proNav(role: ProRole): { group: string; items: NavDef[] }[] {
  const r = PRO_ROLES[role]
  // l'agente lavora anche su contenuti ed editoriale: Calendario completo al posto della sola Agenda
  const cal: NavDef = role === 'agente'
    ? { key: 'editorial', label: 'Calendario', icon: 'calendar', tabs: [
        { key: 'agenda', label: 'Impegni' },
        { key: 'editorial', label: 'Editoriale' },
        { key: 'tasks', label: 'Task' },
      ]}
    : { key: 'agenda', label: 'Agenda', icon: 'calendar' }
  return [
    { group: 'Ufficio', items: [
      { key: r.home, label: 'Home', icon: 'home' },
      { key: 'my-athletes', label: 'I miei atleti', icon: 'users' },
      cal,
      { key: 'messages', label: 'Chat', icon: 'message' },
    ]},
    { group: 'Area di lavoro', items: r.area },
    { group: 'Altro', items: [
      { key: r.profile, label: 'Il mio profilo', icon: 'user' },
      ...r.extra,
    ]},
  ]
}

// Tab bar dei professionisti: Home, Atleti, area del ruolo, Agenda (+ Altro)
export function proTabbar(role: ProRole) {
  const r = PRO_ROLES[role]
  return [
    { key: r.home, label: 'Home', icon: 'home' },
    { key: 'my-athletes', label: 'Atleti', icon: 'users' },
    r.tab,
    role === 'agente' ? { key: 'editorial', label: 'Calendario', icon: 'calendar' } : { key: 'agenda', label: 'Agenda', icon: 'calendar' },
  ]
}

const TITLES: Record<string, { t: string; s: string }> = {
  dashboard: { t: 'Home', s: 'Quadro generale della gestione' },
  fitness: { t: 'Preparazione', s: 'AUVI Performance · preparazione atletica' },
  'coach-profile': { t: 'Profilo Preparatore', s: 'Il tuo profilo professionale' },
  profile: { t: 'Profilo', s: 'Spedizioni, equipaggiamento e contatti club' },
  performance: { t: 'Performance', s: 'Statistiche, partite e rendimento' },
  contracts: { t: 'Contratti', s: 'Accordi sportivi e scadenze' },
  documents: { t: 'Documenti', s: 'Archivio file riservato' },
  editorial: { t: 'Calendario', s: 'Partite, copy e grafiche pronte da pubblicare' },
  media: { t: 'Media', s: 'Foto, selezioni e grafiche del team' },
  sponsors: { t: 'Sponsor & Commerciale', s: 'Accordi e deliverable' },
  commercial: { t: 'Commercial Profile', s: 'Misura il tuo valore, scopri i brand compatibili, costruisci opportunità' },
  agenda: { t: 'Agenda', s: 'Extra campo · impegni, prenotazioni, call, viaggi' },
  tasks: { t: 'Task', s: 'Attività condivise' },
  messages: { t: 'Messaggi', s: 'Comunicazione diretta' },
  settings: { t: 'Impostazioni', s: 'Password, accessi e configurazione' },
  brandhome: { t: 'Home', s: 'La tua scheda e gli atleti in partnership' },
  'coach-office': { t: 'Il mio ufficio', s: 'Agenda personale, clienti e cassa · area privata' },
  'agent-home': { t: 'Home', s: 'La tua scheda e i tuoi assistiti' },
  'insurer-home': { t: 'Home', s: 'La tua scheda e gli atleti seguiti' },
  'access-requests': { t: 'Collegamenti', s: 'Richieste di accesso agli atleti' },
  'insurer-profile': { t: 'Il mio profilo', s: 'Contatti e agenzia' },
  insurance: { t: 'Insurance', s: 'Polizze, documenti e scadenze' },
  legaltax: { t: 'Legal & Tax', s: 'Pagamenti, documenti e richieste' },
  services: { t: 'Servizi AUVI', s: 'Servizi e partner a tua disposizione' },
  'my-team': { t: 'Il mio team', s: 'Il tuo team di lavoro' },
  'training-builder': { t: 'Crea scheda', s: 'Modelli di allenamento da assegnare ai tuoi atleti' },
  'exercise-library': { t: 'Libreria esercizi', s: 'Cerca, filtra e crea esercizi per le sessioni' },
  'my-athletes': { t: 'I miei atleti', s: 'Collegamenti, inviti e accesso rapido a ogni atleta' },
  archivio: { t: 'Contratti e Documenti', s: 'Accordi, scadenze e archivio file riservato' },
  'tax-home': { t: 'Home', s: 'La tua scheda e gli atleti seguiti' },
  'tax-profile': { t: 'Il mio profilo', s: 'Contatti e studio' },
  'physio-home': { t: 'Home', s: 'La tua scheda e gli atleti seguiti' },
  'physio-profile': { t: 'Il mio profilo', s: 'Anagrafica, contatti e biografia' },
  'physio-office': { t: 'Il mio ufficio', s: 'Atleti seguiti e spazio clinico' },
  'agent-profile': { t: 'Il mio profilo', s: 'Contatti personali e agenzia' },
  mediakit: { t: 'Media Kit', s: "I numeri dell'atleta" },
  campaigns: { t: 'Campagne', s: 'Proponi contenuti e carica lo shooting' },
  brandcard: { t: 'La mia scheda', s: 'Dati e referente del brand' },
  talent: { t: 'Ricerca talent', s: 'Trova gli atleti del roster più in linea con il tuo brand' },
}

export default function Shell({ route, setRoute, right, children }: {
  route: string; setRoute: (r: string) => void; right?: React.ReactNode; children: React.ReactNode
}) {
  const { profile, isAdmin, isBrand, role, signOut } = useAuth()
  const { t: tr } = useLang()
  const { athletes, athleteId, setAthleteId, canSwitch, loading: athletesLoading } = useAthlete()
  const [open, setOpen] = useState(false)
  const baseTitle = TITLES[route] || { t: '', s: '' }
  const athleteName = athletes.find(a => a.api_player_id === athleteId)?.name
  const title0 = route === 'mediakit' && athleteName
    ? { t: baseTitle.t, s: `I numeri di ${athleteName}` }
    : baseTitle
  const isCoach = role === 'preparatore'
  const isAgent = role === 'agente'
  const isInsurer = role === 'assicuratore'
  const isTax = role === 'commercialista'
  const isPhysio = role === 'fisioterapista'

  // Profili in cui questo utente può entrare (es. brand / procuratore).
  // Il selettore compare solo se ne ha più di uno.
  const [myRoles, setMyRoles] = useState<{ role: string; label: string | null }[]>([])
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('crm_user_roles').select('role, label')
      .then(({ data }) => {
        // un ruolo può comparire più volte (es. una riga per atleta): nel menu basta una voce
        const seen = new Set<string>()
        setMyRoles(((data as any[]) || []).filter(r => !seen.has(r.role) && !!seen.add(r.role)))
      })
  }, [profile?.id])

  // Con più profili sullo stesso account, full_name resta quello del ruolo con cui
  // è stato creato: per l'agente si usa il nome del profilo procuratore.
  const [agentName, setAgentName] = useState<string | null>(null)
  useEffect(() => {
    if (role !== 'agente' || !profile?.id) { setAgentName(null); return }
    supabase.from('crm_agent_profile').select('name').eq('agent_id', profile.id).maybeSingle()
      .then(({ data }) => setAgentName((data as any)?.name || null))
  }, [role, profile?.id])

  async function switchRole(next: string) {
    if (next === role) return
    const { error } = await supabase.rpc('crm_switch_role', { p_role: next })
    if (error) { alert(error.message); return }
    window.location.reload()
  }
  const isPro = isCoach || isAgent || isInsurer || isTax || isPhysio
  const nav = isBrand ? BRAND_NAV : isPro ? proNav(role as ProRole) : NAV
  // professionista senza atleti: le aree di lavoro non hanno dati da mostrare (evita caricamenti infiniti)
  const proFree = isPro ? [PRO_ROLES[role as ProRole].home, PRO_ROLES[role as ProRole].profile, 'my-athletes', 'settings', 'access-requests', 'coach-office', 'exercise-library', 'training-builder'] : []
  const needsAthlete = isPro && !athletesLoading && athletes.length === 0 && !proFree.includes(route)

  // Sezioni con schede: una voce di menu raggruppa più schermate (es. Calendario =
  // Editoriale · Impegni · Task). La voce resta attiva su tutte le sue schede e,
  // quando la riapri, torna all'ultima scheda che stavi guardando.
  const visibleItem = (i: NavDef) => (!i.adminOnly || isAdmin) && (!i.roles || (!!role && i.roles.includes(role)))
  const tabsOf = (i: NavDef) => (i.tabs || []).filter(t => !t.roles || (!!role && t.roles.includes(role)))
  const allItems = nav.flatMap(g => g.items).filter(visibleItem)
  const hub = allItems.find(i => i.key === route || tabsOf(i).some(t => t.key === route))
  const hubTabs = hub ? tabsOf(hub) : []
  useEffect(() => {
    if (hub && hubTabs.some(t => t.key === route)) {
      try { sessionStorage.setItem('hub:' + hub.key, route) } catch { /* modalità privata */ }
    }
  }, [route]) // eslint-disable-line react-hooks/exhaustive-deps
  function openItem(i: NavDef) {
    const tabs = tabsOf(i)
    let target = tabs.length ? tabs[0].key : i.key
    try {
      const last = sessionStorage.getItem('hub:' + i.key)
      if (last && tabs.some(t => t.key === last)) target = last
    } catch { /* modalità privata */ }
    setRoute(target)
    setOpen(false)
  }
  const isActiveItem = (key: string) => hub?.key === key

  // Voci della barra in basso (telefono). Nel menu "Altro" su telefono non si ripetono.
  const tabbarItems: { key: string; label: string; icon: string }[] = isBrand
    ? [
              { key: 'brandhome', label: 'Home', icon: 'grid' },
              { key: 'mediakit', label: 'Numeri', icon: 'activity' },
              { key: 'campaigns', label: 'Campagne', icon: 'image' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
    : isPro ? proTabbar(role as ProRole)
    : [
              { key: 'dashboard', label: 'Home', icon: 'home' },
              { key: 'editorial', label: 'Calendario', icon: 'calendar' },
              { key: 'media', label: 'Media', icon: 'image' },
              { key: 'services', label: 'Servizi', icon: 'layers' },
            ]
  const tabbarKeys = new Set(tabbarItems.map(t => t.key))
  const title = hub && hubTabs.length > 1 ? { t: hub.label, s: title0.s } : title0

  return (
    <div className="app">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}
        style={{ paddingBottom: 'calc(26px + env(safe-area-inset-bottom))' }}>
        <div className="brand" style={{ flexShrink: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <img className="brand-wordmark" src="/brand/auvi-wordmark.svg" alt="AUVI" />
          <div className="brand-sub">Player Hub · {APP_VERSION}</div>
        </div>
        <nav className="nav"
          style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {nav.map(g => {
            const items = g.items.filter(visibleItem)
            if (!items.length) return null
            return (
              <React.Fragment key={g.group}>
                <div className="nav-label">{tr(g.group)}</div>
                {items.map(i => (
                  <button key={i.key} className={`nav-item ${isActiveItem(i.key) ? 'active' : ''} ${tabbarKeys.has(i.key) ? 'in-tabbar' : ''}`}
                    onClick={() => openItem(i)}>
                    <span className="nav-ico"><Icon name={i.icon} size={17} /></span>{tr(i.label)}
                  </button>
                ))}
              </React.Fragment>
            )
          })}
        </nav>
        <div className="sidebar-foot" style={{ flexShrink: 0 }}>
          <button className={`user-chip ${route === 'settings' ? 'active' : ''}`} onClick={() => { setRoute('settings'); setOpen(false) }}
            title="Impostazioni: password, calendario sul telefono, notifiche" style={{ width: '100%', textAlign: 'left' }}>
            <div className="avatar">{initials(agentName || profile?.full_name || profile?.email)}</div>
            <div className="user-meta">
              <div className="user-name">{agentName || profile?.full_name || profile?.email}</div>
              <div className="user-role">{role === 'admin' ? 'AUVI · Advisor' : role === 'creator' ? 'Team · Creator' : role === 'preparatore' ? 'Preparatore Atletico' : role === 'brand' ? 'Brand · Partner' : role === 'agente' ? 'Procuratore' : role === 'assicuratore' ? 'Assicuratore' : role === 'commercialista' ? 'Commercialista' : role === 'fisioterapista' ? 'Fisioterapista' : 'Giocatore'}</div>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', display: 'grid' }}><Icon name="sliders" size={16} /></span>
          </button>
          {myRoles.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-dim)', marginBottom: 5 }}>
                Cambia profilo
              </div>
              <select className="input" style={{ width: '100%', fontSize: 13 }}
                value={role || ''} onChange={e => switchRole(e.target.value)}>
                {myRoles.map(r => (
                  <option key={r.role} value={r.role}>{r.label || r.role}</option>
                ))}
              </select>
            </div>
          )}
          <div className="drawer-lang" style={{ marginTop: 10 }}><LangToggle /></div>
          <button className="btn" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={signOut}>
            <Icon name="logout" size={15} /> Esci
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="flex gap">
            <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" size={17} /></button>
            <div>
              {HOME_ROUTES.includes(route) && <img className="topbar-wordmark" src="/brand/auvi-wordmark.svg" alt="AUVI" />}
              <div className={`page-title ${HOME_ROUTES.includes(route) ? 'desktop-only' : ''}`}>{tr(title.t)}</div>
              <div className="page-sub">{tr(title.s)}</div>
            </div>
          </div>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            {canSwitch && (
              <select
                aria-label="Atleta gestito"
                title="Atleta gestito"
                value={athleteId ?? ''}
                onChange={e => setAthleteId(Number(e.target.value))}
                className="select athlete-select"
              >
                {athletes.map(a => (
                  <option key={a.api_player_id} value={a.api_player_id}>{a.name || `#${a.api_player_id}`}</option>
                ))}
              </select>
            )}
            <span className="topbar-lang"><LangToggle /></span>
            {right}<NotificationBell goto={setRoute} />
          </div>
        </div>
        <div className="content">
          {HOME_ROUTES.includes(route) && <PushNudge />}
          {hub && hubTabs.length > 1 && (
            <div className="hub-tabs">
              <Tabs tabs={hubTabs.map(t => ({ key: t.key, label: tr(t.label) }))} value={route} onChange={k => setRoute(k)} />
            </div>
          )}
          {needsAthlete ? (
            <Empty icon={<Icon name="users" size={24} strokeWidth={1.6} />} title={tr('Nessun atleta collegato')}
              hint={tr("Quest'area si riempie quando un atleta accetta il tuo invito.")}
              action={{ label: tr('Invita un atleta'), onClick: () => setRoute('my-athletes') }} />
          ) : children}
        </div>
      </div>

      {/* Tab bar mobile (iOS): pollice, zero frizioni. "Altro" apre il drawer completo. */}
      <nav className="tabbar">
        {tabbarItems.map(t => (
          <button key={t.key} className={`tab-item ${!open && (route === t.key || isActiveItem(t.key)) ? 'active' : ''}`}
            onClick={() => { const it = allItems.find(i => i.key === t.key); if (it) openItem(it); else { setRoute(t.key); setOpen(false) } }}>
            <span className="tab-ico"><Icon name={t.icon} size={21} strokeWidth={1.7} /></span>
            <span className="tab-lbl">{t.label}</span>
          </button>
        ))}
        <button className={`tab-item ${open ? 'active' : ''}`} onClick={() => setOpen(true)} aria-label="Altre sezioni">
          <span className="tab-ico"><Icon name="menu" size={21} strokeWidth={1.7} /></span>
          <span className="tab-lbl">Altro</span>
        </button>
      </nav>

      <Toaster />
    </div>
  )
}
