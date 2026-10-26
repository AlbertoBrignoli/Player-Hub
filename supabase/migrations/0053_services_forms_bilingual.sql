-- Ripristina i form di Myro e Power Health in italiano: come il resto dell'app,
-- in inglese li traduce il dizionario (src/lib/i18n.tsx) quando l'app è in inglese.

update public.crm_services set form_schema = '[{"key":"per_chi","type":"radio","label":"A che punto siete?","options":["In attesa di un bambino","Neonato (0-3 mesi)","Bambino 3-12 mesi","Bambino oltre 1 anno"],"section":"LA TUA FAMIGLIA","required":true},
    {"key":"data","type":"date","label":"Data prevista del parto o data di nascita","section":"LA TUA FAMIGLIA"},
    {"key":"gemelli","type":"radio","label":"Gemelli?","options":["No","Sì"],"section":"LA TUA FAMIGLIA"},
    {"key":"servizi","help":"anche più di una","type":"multiselect","label":"Di cosa avete bisogno?","options":["Nanny / assistenza al neonato","Ostetrica a domicilio","Allattamento","Routine dei pasti","Sonno del bambino","Preparazione al parto","Pilates pre e post parto"],"section":"DI COSA AVETE BISOGNO","required":true},
    {"key":"orario","type":"radio","label":"In quali momenti?","options":["Di giorno","Di notte","Giorno e notte","Da definire"],"section":"DI COSA AVETE BISOGNO"},
    {"key":"frequenza","type":"radio","label":"Con che frequenza?","options":["Qualche ora a settimana","Tutti i giorni","Durante le trasferte della squadra","Da definire"],"section":"DI COSA AVETE BISOGNO"},
    {"key":"inizio","type":"radio","label":"Quando vorreste iniziare?","options":["Subito","Entro un mese","Dopo il parto","Solo informazioni"],"section":"DI COSA AVETE BISOGNO"},
    {"key":"zona","type":"text","label":"In che zona di Atene vivete?","placeholder":"Es. Glyfada, Kifisia, Vouliagmeni…","section":"DOVE E COME"},
    {"key":"lingue","help":"anche più di una","type":"multiselect","label":"Lingue preferite","options":["Italiano","Inglese","Greco"],"section":"DOVE E COME"},
    {"key":"contatto","type":"radio","label":"Come preferite essere contattati?","options":["Chiamata","WhatsApp","Email"],"section":"DOVE E COME"},
    {"key":"note","help":"facoltativo ma prezioso","type":"textarea","label":"Qualcosa che dobbiamo sapere","placeholder":"Es. abitudini del bambino, allergie, chi c’è in casa, giorni delle trasferte…","section":"DOVE E COME"}]'::jsonb
where partner_name = 'Myro';

update public.crm_services set form_schema = '[{"key":"obiettivi","help":"anche più di una","type":"multiselect","label":"Su cosa vuoi lavorare?","options":["Energia e recupero","Sonno e stress","Difese immunitarie","Muscoli e articolazioni","Digestione e intestino","Pelle, capelli e unghie"],"section":"IL TUO OBIETTIVO","required":true},
    {"key":"momento","type":"radio","label":"In che fase sei?","options":["Stagione in corso","Ritiro / pre-campionato","Recupero infortunio","Pausa"],"section":"IL TUO OBIETTIVO"},
    {"key":"attuali","type":"radio","label":"Usi già integratori?","options":["No","Ogni tanto","Sì, regolarmente"],"section":"PER CONSIGLIARTI BENE"},
    {"key":"staff","type":"radio","label":"Chi segue la tua integrazione?","options":["Lo staff medico del club","Il mio nutrizionista","Nessuno, vorrei un consiglio"],"section":"PER CONSIGLIARTI BENE"},
    {"key":"allergie","type":"text","label":"Allergie o intolleranze","placeholder":"Es. lattosio, glutine… (lascia vuoto se nessuna)","section":"PER CONSIGLIARTI BENE"},
    {"key":"consegna","type":"radio","label":"Dove ti servono?","options":["Atene","Altra città in Grecia","Italia","Altro paese"],"section":"CONSEGNA"},
    {"key":"contatto","type":"radio","label":"Come preferisci essere contattato?","options":["Chiamata","WhatsApp","Email"],"section":"CONSEGNA"},
    {"key":"note","help":"facoltativo","type":"textarea","label":"Note","placeholder":"Es. prodotti che usi già, orari degli allenamenti, esigenze particolari…","section":"CONSEGNA"}]'::jsonb
where partner_name = 'Power Health';

