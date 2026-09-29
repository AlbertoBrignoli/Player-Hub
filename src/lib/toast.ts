// Toast leggerissimi via CustomEvent: nessun context, nessuna dipendenza.
// toast('Fatto') | toast('Qualcosa è andato storto', 'err')
// toast('Foto scartata', 'ok', { label: 'Annulla', onClick: ripristina })
let seq = 0

export interface ToastAction { label: string; onClick: () => void }

export function toast(msg: string, kind: 'ok' | 'err' = 'ok', action?: ToastAction) {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { id: ++seq, msg, kind, action } }))
}

// Azione distruttiva con "Annulla" al posto della conferma: l'elemento sparisce
// subito dalla vista, l'operazione vera parte dopo `ms` se nessuno annulla.
export function undoable(msg: string, commit: () => unknown, undo: () => void, ms = 5000) {
  let done = false
  const timer = window.setTimeout(async () => {
    if (done) return
    done = true
    try { await commit() } catch { toast('Operazione non riuscita', 'err'); undo() }
  }, ms)
  toast(msg, 'ok', {
    label: 'Annulla',
    onClick: () => { if (done) return; done = true; clearTimeout(timer); undo() },
  })
}
