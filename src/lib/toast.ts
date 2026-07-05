// Toast leggerissimi via CustomEvent: nessun context, nessuna dipendenza.
// toast('Fatto ✓') | toast('Qualcosa è andato storto', 'err')
let seq = 0

export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { id: ++seq, msg, kind } }))
}
