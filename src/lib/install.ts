// Installazione di Player Hub sul telefono (web app → icona nella schermata Home).
// Android/Chrome: prompt nativo "Installa" (beforeinstallprompt, catturato all'avvio).
// iPhone: solo da Safari, con Condividi → Aggiungi alla schermata Home (guidato a passi).
export const APP_URL = 'https://playerhub.auviagency.com'
export const INSTALL_URL = APP_URL + '/scarica'
export const INSTALL_URL_EN = APP_URL + '/download'

let deferred: any = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferred = e
    listeners.forEach(f => f())
  })
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()) })
}
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const canPromptInstall = () => !!deferred
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  deferred.prompt()
  const r = await deferred.userChoice.catch(() => null)
  deferred = null
  listeners.forEach(f => f())
  return r?.outcome === 'accepted'
}

export type Platform = 'installed' | 'ios-safari' | 'ios-other' | 'android' | 'in-app' | 'desktop'

export function isStandalone() {
  return (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export function detectPlatform(): Platform {
  if (isStandalone()) return 'installed'
  const ua = navigator.userAgent
  // browser dentro Instagram, Facebook, WhatsApp, LinkedIn…: da lì non si installa
  if (/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|LinkedInApp|Line\/|Snapchat|TikTok/i.test(ua)) return 'in-app'
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? 'ios-other' : 'ios-safari'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}
export const isMobilePlatform = (p: Platform) => p === 'ios-safari' || p === 'ios-other' || p === 'android' || p === 'in-app'
