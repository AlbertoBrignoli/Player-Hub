// Funzioni accendibili/spegnibili senza perdere il lavoro.
// BACKSTAGE (profilo privato dell'atleta): spento il 25/10/2026 su richiesta di Alberto.
// Codice (src/modules/Backstage.tsx, src/components/CropBox.tsx) e database (tabelle bs_*,
// migrazioni 0049-0050) restano intatti: per riaccenderlo basta mettere true e pubblicare.
export const FEATURES = {
  backstage: false,
}
