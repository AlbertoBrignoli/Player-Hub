# Edge Functions archiviate

Queste funzioni sono state disattivate il 29/09/2026 durante l'audit di sicurezza: su Supabase sono state sostituite da uno stub che risponde 410 Gone.
Il codice è conservato qui solo come riferimento e non viene deployato.
Per ripristinarne una bisogna rideployarla aggiungendo un controllo di autenticazione (header `x-sync-secret` letto da `cp_secrets`, come fa `sync_player_matches`) e rigenerando ogni segreto marcato `REDACTED` nel sorgente.
