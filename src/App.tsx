import { lazy, Suspense } from 'react'
import { useAuth } from './auth/AuthContext'
import Login from './auth/Login'
import { useLang } from './lib/i18n'
import Shell from './components/Shell'
import { Spinner } from './components/ui'
import { useHashRoute } from './lib/route'

import Dashboard from './modules/Dashboard'
import PasswordSetup from './components/PasswordSetup'
import { ProPhotoGate } from './components/ProImages'
import { FEATURES } from './lib/features'
import ErrorBoundary from './components/ErrorBoundary'

// Ogni sezione si scarica solo quando la apri (la Home resta subito pronta): primo avvio più veloce da telefono
// Dopo una nuova versione i file vecchi non esistono più: se una sezione non si scarica, ricarica l'app una volta
const lazyPage = <T,>(load: () => Promise<{ default: T }>) => lazy(() => load().then(m => {
  try { sessionStorage.removeItem('chunk-retry') } catch { /* modalità privata */ }
  return m as any
}, err => {
  let tried = false
  try { tried = sessionStorage.getItem('chunk-retry') === '1'; sessionStorage.setItem('chunk-retry', '1') } catch { /* modalità privata */ }
  if (!tried) window.location.reload()
  throw err
}))
const Performance = lazyPage(() => import('./modules/Performance'))
const Profile = lazyPage(() => import('./modules/Profile'))
const Fitness = lazyPage(() => import('./modules/Fitness'))
const FitnessCoachProfile = lazyPage(() => import('./modules/FitnessCoachProfile'))
const Contracts = lazyPage(() => import('./modules/Contracts'))
const Documents = lazyPage(() => import('./modules/Documents'))
const InsuranceDocuments = lazyPage(() => import('./modules/InsuranceDocuments'))
const Editorial = lazyPage(() => import('./modules/Editorial'))
const Media = lazyPage(() => import('./modules/Media'))
const Sponsors = lazyPage(() => import('./modules/Sponsors'))
const Commercial = lazyPage(() => import('./modules/Commercial'))
const Agenda = lazyPage(() => import('./modules/Agenda'))
const Tasks = lazyPage(() => import('./modules/Tasks'))
const Messages = lazyPage(() => import('./modules/Messages'))
const Mail = lazyPage(() => import('./modules/Mail'))
const Settings = lazyPage(() => import('./modules/Settings'))
const MediaKit = lazyPage(() => import('./modules/MediaKit'))
const BrandCard = lazyPage(() => import('./modules/BrandCard'))
const BrandHome = lazyPage(() => import('./modules/BrandHome'))
const CoachOffice = lazyPage(() => import('./modules/CoachOffice'))
const AgentProfile = lazyPage(() => import('./modules/AgentProfile'))
const Insurance = lazyPage(() => import('./modules/Insurance'))
const InsurerProfile = lazyPage(() => import('./modules/InsurerProfile'))
const AccessRequests = lazyPage(() => import('./modules/AccessRequests'))
const LegalTax = lazyPage(() => import('./modules/LegalTax'))
const Services = lazyPage(() => import('./modules/Services'))
const TaxAdvisorProfile = lazyPage(() => import('./modules/TaxAdvisorProfile'))
const Wealth = lazyPage(() => import('./modules/Wealth'))
const ItemPage = lazyPage(() => import('./modules/ItemPage'))
const WealthProfile = lazyPage(() => import('./modules/WealthProfile'))
const PhysioProfile = lazyPage(() => import('./modules/PhysioProfile'))
const PhysioOffice = lazyPage(() => import('./modules/PhysioOffice'))
const NutriProfile = lazyPage(() => import('./modules/NutriProfile'))
const NutriMenu = lazyPage(() => import('./modules/NutriMenu'))
const BrandCampaigns = lazyPage(() => import('./modules/BrandCampaigns'))
const MyTeam = lazyPage(() => import('./modules/MyTeam'))
const MyFiles = lazyPage(() => import('./modules/MyFiles'))
const Backstage = lazyPage(() => import('./modules/Backstage'))
const Archivio = lazyPage(() => import('./modules/Archivio'))
const TalentSearch = lazyPage(() => import('./modules/TalentSearch'))
const MyAthletes = lazyPage(() => import('./modules/MyAthletes'))
const ProHome = lazyPage(() => import('./modules/ProHome'))
const ExerciseLibrary = lazyPage(() => import('./modules/fitness/ExerciseLibrary'))
const TrainingBuilder = lazyPage(() => import('./modules/fitness/TrainingBuilder'))
const PartnerHome = lazyPage(() => import('./modules/PartnerHome'))
const InstallPage = lazyPage(() => import('./modules/InstallPage'))

export default function App() {
  const { session, profile, loading } = useAuth()
  const [routeState, setRoute] = useHashRoute()

  // pagina pubblica d'invito (QR code): si apre anche senza accesso
  if (/^\/(scarica|download|install|app)\/?$/.test(window.location.pathname)) return <Suspense fallback={<Spinner />}><InstallPage /></Suspense>
  if (loading) return <Spinner />
  if (!session) return <Login />

  // Sessione presente ma profilo assente = email non in whitelist (trigger ha bloccato)
  if (!profile) return <NoAccess />

  // Il brand ha un set di schermate dedicato e non accede alle aree interne.
  const isBrand = profile.role === 'brand'
  const brandAllowed = ['settings', 'brandhome', 'mediakit', 'campaigns', 'brandcard', 'talent', 'messages', 'backstage']
  // Il preparatore vede solo fitness, performance dell'atleta e chat.
  const coachAllowed = ['training-builder', 'exercise-library', 'my-athletes', 'settings', 'dashboard', 'fitness', 'coach-profile', 'coach-office', 'performance', 'agenda', 'messages', 'access-requests', 'my-team', 'my-files', 'wealth', 'item']
  const isCoach = profile.role === 'preparatore'
  // L'agente vede solo le competenze del procuratore.
  const agentAllowed = ['my-athletes', 'settings', 'agent-home', 'dashboard', 'performance', 'profile', 'editorial', 'media',
                        'contracts', 'documents', 'sponsors', 'commercial', 'cp-opps', 'cp-kit', 'cp-profile', 'fitness',
                        'agenda', 'tasks', 'messages', 'agent-profile', 'insurance', 'legaltax', 'services', 'services-extra', 'services-req', 'access-requests', 'my-team', 'archivio', 'my-files', 'wealth', 'item']
  const isAgent = profile.role === 'agente'
  // L'assicuratore vede solo la sua area: polizze, scadenze e chat.
  const insurerAllowed = ['my-athletes', 'settings', 'insurer-home', 'insurance', 'insurer-profile', 'documents', 'agenda', 'messages', 'access-requests', 'my-team', 'my-files', 'wealth', 'item']
  const isInsurer = profile.role === 'assicuratore'
  // Il commercialista vede solo la sua area.
  const taxAllowed = ['my-athletes', 'settings', 'tax-home', 'legaltax', 'tax-profile', 'services', 'services-extra', 'services-req', 'documents', 'agenda', 'messages', 'access-requests', 'my-team', 'my-files', 'wealth', 'item']
  const isTax = profile.role === 'commercialista'
  // Il fisioterapista vede la sua area: home, profilo, chat e collegamenti.
  const physioAllowed = ['agenda', 'my-athletes', 'settings', 'physio-home', 'physio-profile', 'physio-office', 'messages', 'access-requests', 'my-team', 'my-files', 'wealth', 'item']
  const isPhysio = profile.role === 'fisioterapista'
  // Il nutrizionista lavora sul calendario dell'atleta: piano alimentare e integratori.
  const nutriAllowed = ['agenda', 'my-athletes', 'settings', 'nutri-home', 'nutri-profile', 'nutri-menu', 'messages', 'access-requests', 'my-team', 'my-files', 'wealth', 'item']
  const isNutri = profile.role === 'nutrizionista'
  // Il wealth manager (Delian & Co.) vede il patrimonio dei suoi atleti, agenda e chat.
  const wealthAllowed = ['my-athletes', 'settings', 'wealth-home', 'wealth', 'wealth-profile', 'agenda', 'messages', 'access-requests', 'my-team', 'my-files', 'item']
  const isWealth = profile.role === 'wealth'
  // Il partner dei servizi (es. Scouting Department) vede solo la sua area di lavoro.
  const partnerAllowed = ['partner-home', 'settings']
  const isPartner = profile.role === 'partner'
  const home = isPartner ? 'partner-home' : isBrand ? 'brandhome' : isAgent ? 'agent-home' : isInsurer ? 'insurer-home' : isTax ? 'tax-home' : isPhysio ? 'physio-home' : isNutri ? 'nutri-home' : isWealth ? 'wealth-home' : 'dashboard'
  let route = routeState ?? home
  if (isBrand && !brandAllowed.includes(route)) route = 'brandhome'
  if (isCoach && !coachAllowed.includes(route)) route = 'dashboard'
  if (isAgent && !agentAllowed.includes(route)) route = 'agent-home'
  if (isInsurer && !insurerAllowed.includes(route)) route = 'insurer-home'
  if (isTax && !taxAllowed.includes(route)) route = 'tax-home'
  if (isPhysio && !physioAllowed.includes(route)) route = 'physio-home'
  if (isNutri && !nutriAllowed.includes(route)) route = 'nutri-home'
  if (isWealth && !wealthAllowed.includes(route)) route = 'wealth-home'
  if (isPartner && !partnerAllowed.includes(route)) route = 'partner-home'
  // Backstage spento (src/lib/features.ts): eventuali link vecchi tornano alla home
  if (route === 'backstage' && !FEATURES.backstage) route = home

  const view = (() => {
    switch (route) {
      case 'brandhome': return <BrandHome goto={setRoute} />
      case 'mediakit': return <MediaKit />
      case 'campaigns': return <BrandCampaigns />
      case 'brandcard': return <BrandCard goto={setRoute} />
      case 'talent': return <TalentSearch goto={setRoute} />
      case 'dashboard': return profile.role === 'preparatore' ? <ProHome goto={setRoute} /> : <Dashboard goto={setRoute} />
      case 'performance': return <Performance goto={setRoute} />
      case 'profile': return <Profile />
      case 'fitness': return <Fitness goto={setRoute} />
      case 'coach-profile': return <FitnessCoachProfile goto={setRoute} />
      case 'coach-office': return <CoachOffice />
      case 'agent-home': return <ProHome goto={setRoute} />
      case 'insurance': return <Insurance />
      case 'insurer-home': return <ProHome goto={setRoute} />
      case 'insurer-profile': return <InsurerProfile />
      case 'access-requests': return <AccessRequests />
      case 'legaltax': return <LegalTax />
      case 'services': return <Services />
      case 'services-extra': case 'services-req': return <Services />
      case 'my-team': return <MyTeam goto={setRoute} />
      case 'my-files': return <MyFiles />
      case 'backstage': return <Backstage />
      case 'my-athletes': return <MyAthletes />
      case 'exercise-library': return <ExerciseLibrary mode="browse" />
      case 'training-builder': return <TrainingBuilder goto={setRoute} />
      case 'archivio': return <Archivio />
      case 'tax-home': return <ProHome goto={setRoute} />
      case 'tax-profile': return <TaxAdvisorProfile />
      case 'wealth': return <Wealth />
      case 'item': return <ItemPage />
      case 'wealth-home': return <ProHome goto={setRoute} />
      case 'wealth-profile': return <WealthProfile />
      case 'physio-home': return <ProHome goto={setRoute} />
      case 'partner-home': return <PartnerHome />
      case 'physio-profile': return <PhysioProfile />
      case 'physio-office': return <PhysioOffice />
      case 'nutri-home': return <ProHome goto={setRoute} />
      case 'nutri-profile': return <NutriProfile />
      case 'nutri-menu': return <NutriMenu />
      case 'agent-profile': return <AgentProfile />
      case 'mail': return <Mail />
      case 'contracts': return <Contracts />
      case 'documents': return isInsurer ? <InsuranceDocuments /> : <Documents />
      case 'editorial': return <Editorial />
      case 'media': return <Media />
      case 'sponsors': return <Sponsors />
      case 'commercial': return <Commercial />
      case 'cp-opps': return <Commercial page="opportunita" />
      case 'cp-kit': return <Commercial page="mediakit" />
      case 'cp-profile': return <Commercial page="profilo" />
      case 'cp-admin': return <Commercial page="gestione" />
      case 'agenda': return <Agenda goto={setRoute} />
      case 'tasks': return <Tasks />
      case 'messages': return <Messages />
      case 'settings': return <Settings />
      default: return isBrand ? <MediaKit /> : profile.role === 'preparatore' ? <ProHome goto={setRoute} /> : <Dashboard goto={setRoute} />
    }
  })()

  return (
    <>
      <Shell route={route} setRoute={setRoute}><ErrorBoundary resetKey={route}><Suspense fallback={<Spinner />}>{view}</Suspense></ErrorBoundary></Shell>
      <PasswordSetup />
      <ProPhotoGate />
    </>
  )
}

function NoAccess() {
  const { signOut } = useAuth()
  const { t } = useLang()
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="login-logo" style={{ margin: '0 auto 20px' }}>A</div>
        <div className="login-title">{t('Accesso non autorizzato')}</div>
        <div className="login-sub">{t("Questo indirizzo email non è abilitato all'ingresso in questo spazio riservato.")}</div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={signOut}>{t('Esci')}</button>
      </div>
    </div>
  )
}
