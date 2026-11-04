# Prompt per continuare FrescoLayers con Gemini

Lavora sul repository https://github.com/raffica93/Imagetopsd, partendo dal main aggiornato. Leggi prima README e istruzioni locali. Non riportare in produzione i vecchi flussi manuali.

L’app deve restare semplice su iPad: **carica → Separa in livelli → tocca una complessità → livelli applicati automaticamente → PSD**. Le tre complessità guidano il raggruppamento del modello: Essenziale mantiene un’armatura intera, Bilanciata distingue le parti funzionali, Dettagliata distingue anche componenti visibili. L’elenco deve adattarsi al soggetto reale, senza categorie anatomiche obbligatorie.

Mantieni due fasi: riconoscimento con nomi/posizioni/ordine, poi selezione su un ritaglio per parte. Le posizioni della prima fase non sono maschere. Nessuna conferma intermedia, editor dell’elenco o rifinitura manuale. Tratto e sfondo sono interni e automatici. In caso di errore preserva la sorgente e consenti di riprendere soltanto le richieste mancanti.

Il provider è Google Gemini. `src/utils/aiConfig.ts` definisce il modello predefinito e i profili; l’hosting può configurare `GEMINI_MODEL`. Verifica il modello effettivamente disponibile e le quote del progetto prima delle prove. Non promettere gratuità illimitata. La chiave del sito è il secret `GEMINI_API_KEY`; una chiave personale può essere inserita in Impostazioni AI e resta solo nella memoria della sessione. Non introdurre altre variabili per chiavi, menu di modelli duplicati o ripieghi su modelli diversi.

Non mettere credenziali in frontend, file esportati, repository, log o test. Non sostituire una risposta AI fallita con sagome geometriche. La generazione o modifica dell’immagine non è segmentazione: conserva i pixel originali, assegna ogni pixel visibile a un solo livello e lascia quelli incerti in Da assegnare. Conserva un originale nascosto. Rianalizzare un gruppo lo sostituisce senza duplicarlo.

Migliora soprattutto la precisione delle maschere: i contorni poligonali attuali sono approssimativi. Controlla foto reali, parti disconnesse, occhi, accessori piccoli, capelli e confini con lo sfondo. Se proponi un modello di segmentazione dedicato, documenta costi, hosting e limiti prima di introdurre dipendenze. Non presentare test sintetici come prova della qualità AI.

Esegui test unitari, build Sites, verifica del Worker e prove Chromium/WebKit. Controlla avvio automatico, complessità, ripresa dopo errore, chiavi solo in memoria, ordine, metadati, pixel del PSD, iPad verticale/orizzontale e Split View. La condivisione nativa e l’apertura in Fresco richiedono un iPad reale.

Per pubblicare usa il progetto Sites già dichiarato in `.openai/hosting.json`, preservandone gli accessi. Tieni GitHub main e il sorgente Sites allineati.
