# FrescoLayers

Editor per iPad: **carica → scegli la complessità → esporta un PSD con livelli pixel**. React, Vite, Google Gemini, API condivisa Express/Worker e `ag-psd`.

## Uso su iPad

1. Carica PNG, JPG o WebP da Foto o File.
2. Tocca **Separa in livelli**, poi una complessità: il processo parte subito.
   - **Essenziale**: pochi oggetti principali; per esempio un’armatura intera.
   - **Bilanciata**: parti funzionali; per esempio armatura superiore e inferiore.
   - **Dettagliata**: componenti visibili; per esempio corazza, spallacci e gambali.
3. L’app riconosce le parti specifiche del soggetto, le seleziona su ritagli dedicati e crea i livelli nell’ordine proposto. Tratto e sfondo sono automatici. Non ci sono elenco da confermare o strumenti di rifinitura manuale.
4. Tocca **Esporta → Prepara PSD**, poi **Condividi / Salva** o **Scarica file**. In Adobe Fresco usa **Importa e apri** dall’app File.

In caso di errore o interruzione, **Riprendi analisi** riutilizza le parti già completate nella finestra corrente. Chiudendo la finestra si abbandonano i risultati non applicati. Una nuova complessità avvia un nuovo riconoscimento. Rianalizzare una parte sostituisce il gruppo precedente senza duplicare l’originale nascosto.

I livelli conservano i pixel originali: ogni pixel visibile appartiene a una sola parte. Le zone non riconosciute rimangono in **Da assegnare**, l’originale nascosto consente il recupero e la composizione preserva la sorgente. Non vengono ricostruite parti nascoste.

**Altri metodi · senza AI** contiene due alternative locali per sticker distanziati e grafica piatta, con sfondo automatico. Questi metodi possono ignorare piccoli frammenti; per conservare tutti i pixel usa il flusso delle parti AI.

## Una configurazione AI

- Provider: **Google Gemini**, tramite Google AI Studio.
- Modello predefinito: **`gemini-3.5-flash-lite`**, definito in `src/utils/aiConfig.ts`. L’eventuale `GEMINI_MODEL` dell’hosting determina il modello effettivo, mostrato in **Impostazioni AI**. Non ci sono menu di modelli duplicati né ripieghi automatici su altri modelli.
- Chiave del sito: secret **`GEMINI_API_KEY`**, configurato nell’hosting. Mai in `VITE_*`, repository o bundle.
- Chiave personale facoltativa: **Impostazioni AI → Chiave Google per questa sessione**. Ha precedenza sul secret e vive solo nella memoria della pagina; il ricaricamento la rimuove. Non viene salvata in localStorage, nei progetti o nei log. La vecchia voce `fresco_gemini_key` viene eliminata all’avvio.

Toccare una complessità autorizza l’invio della foto a Google; la prima richiesta riconosce le parti e le successive inviano un ritaglio per parte. Quote, disponibilità gratuita ed eventuale fatturazione dipendono dal progetto Google AI Studio. Il software non garantisce richieste gratuite o illimitate.

Gemini restituisce **contorni poligonali approssimativi**, convertiti in maschere pixel. Il tratto viene stimato dal contrasto locale e lo sfondo dai bordi dell’immagine. Queste stime possono includere zone sbagliate o lasciare dettagli non assegnati: non equivalgono a una segmentazione professionale precisa. La complessità cambia le istruzioni di raggruppamento, non garantisce un numero fisso di livelli.

Errori del servizio, quota esaurita e contorni inutilizzabili non applicano risultati alla foto. Le selezioni valide rimangono disponibili per riprendere. Non vengono usate sagome dimostrative al posto dell’analisi.

## Progetto ed esportazione

- Spostamento, rinomina, visibilità, blocco, duplicazione, ordine, opacità, fusione e ritaglio rettangolare nel normale editor.
- PSD a livelli, PNG della composizione, progetto riapribile `.frescolayers` con elenco delle parti e complessità.
- Salvataggio locale di un solo progetto su quel browser tramite IndexedDB; nessuna sincronizzazione. Esporta una copia per il backup e usa una sola scheda per lo stesso progetto.
- Fino a 32 livelli e 12 milioni di pixel sorgente complessivi. Importazione ridotta a 2560 px per lato e 4 milioni di pixel; massimo 30 MB per immagine e 64 MB per progetto.
- Layout iPad verticale, orizzontale e Split View; navigazione con due dita, annulla/ripristina.
- La condivisione nativa e l’apertura in Fresco richiedono verifica su iPad reale. Le prove WebKit non sostituiscono questa verifica.

## Sviluppo

Node.js 22.12+ (CI: Node 24), lockfile npm incluso.

```sh
npm ci
npm run dev
```

Apri `http://localhost:3000`. Configura l’ambiente del processo usando i nomi di `.env.example`; il server non carica automaticamente `.env`. Per leggere un file locale con Node puoi usare `node --env-file=.env --import tsx server.ts`.

Per hosting Node con HTTPS:

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

Express serve frontend e API dalla stessa origine. Il proxy deve consentire richieste di 24 MB e risposte di almeno 100 secondi. `npm run preview` serve solo il frontend: le funzioni AI richiedono l’API.

## Hosting Sites

Il sito esistente è dichiarato in `.openai/hosting.json`. **`npm run build:site`** genera il Worker autonomo in `build/site/`, con frontend e API condivisa. Configura `GEMINI_API_KEY` come secret e, se necessario, `GEMINI_MODEL` nell’ambiente Sites. `/api/health` restituisce soltanto disponibilità della chiave e modello effettivo, mai il secret.

Pubblica tramite Sites sul progetto esistente, preservando gli accessi. Per provare il pacchetto identico alla produzione: `node scripts/preview-site.mjs`, poi `TEST_BASE_URL=http://127.0.0.1:4177` negli script browser.

## Verifica

```sh
npm test
npm run build:site
node tests/worker-bundle.mjs
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run test:semantic
TEST_BROWSER=webkit npm run test:e2e
TEST_BROWSER=webkit npm run test:semantic
```

I test verificano convalida, complessità nel prompt, coordinate dei ritagli, conservazione dei pixel, ordine, secret separati per richiesta e API senza sagome di ripiego. I browser coprono avvio con un solo tocco, selezione e applicazione automatiche, ripresa dopo quota esaurita, chiave in memoria, sostituzione dei gruppi, metadati, PSD e quattro dimensioni dello schermo. Le risposte Google sintetiche in CI verificano il software; la qualità dei contorni richiede prove su foto reali con una chiave valida.

## Struttura

- `src/components/AISettings.tsx`: configurazione unica e chiave della sessione.
- `src/components/SemanticDiscovery.tsx`: complessità, riconoscimento e selezione automatica per ritagli.
- `src/components/ExtractModal.tsx`: applicazione diretta e metodi locali opzionali.
- `src/utils/aiConfig.ts`: modello e istruzioni delle complessità.
- `src/utils/semanticProtocol.ts`, `semanticSegmentation.ts`: parti, maschere e proprietà esclusive dei pixel.
- `server/semanticApi.ts`, `hosting/semanticWorker.ts`: stessa API per Node e Worker.
- `src/utils/projectStorage.ts`, `psdExport.ts`: salvataggio ed esportazione.
