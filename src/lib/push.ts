import { supabase } from './supabase'

// Chiave pubblica VAPID (ruotata il 29/09/2026). La privata vive solo in cp_secrets.
const VAPID_PUBLIC = 'BLI1QMfUoxMzckpgPktyw4FoWHYaAg-Bi673G8SvopmGMbrScFiiOi5fr9fD6HpmDgBlRASH2Mh_81on_IxubkI'

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Su iPhone le Web Push funzionano solo se l'app è aggiunta alla schermata Home.
export function isIosBrowser() {
  const standalone = (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone
}

export async function getPushState(): Promise<'on' | 'off' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg && await reg.pushManager.getSubscription()
    if (!sub) return 'off'
    // iscrizione fatta con le vecchie chiavi: non riceve più nulla, va rifatta
    if (!sameKey(sub)) { await sub.unsubscribe(); return 'off' }
    return 'on'
  } catch {
    return 'off'
  }
}

export async function enablePush(userId: string, role: string): Promise<string | null> {
  if (!pushSupported()) return 'Questo browser non supporta le notifiche push.'
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'Permesso notifiche negato: attivalo dalle impostazioni del browser.'
    const old = await reg.pushManager.getSubscription()
    if (old && !sameKey(old)) await old.unsubscribe()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
    })
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const { error } = await supabase.from('crm_push_subscriptions').upsert({
      user_id: userId,
      role,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
    }, { onConflict: 'endpoint' })
    return error ? error.message : null
  } catch (e: any) {
    return e?.message || 'Attivazione non riuscita.'
  }
}

function sameKey(sub: PushSubscription) {
  const k = sub.options?.applicationServerKey
  if (!k) return true
  const a = new Uint8Array(k)
  const b = urlB64ToUint8(VAPID_PUBLIC)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function urlB64ToUint8(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}
