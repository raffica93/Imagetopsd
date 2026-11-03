# FrescoLayers

Un editor di immagini per iPad che esporta **PSD con livelli pixel**. Il flusso è **carica → separa e correggi → esporta**. Usa React, Vite, Express e `ag-psd`.

## Uso su iPad

1. Apri l’app in Safari e carica PNG, JPG o WebP da Foto o File. Più immagini diventano livelli distinti.
2. Seleziona un livello e tocca **Separa in livelli**. Scegli **Anatomica** per personaggi, **Oggetti separati** per sticker distanziati oppure **Per colore** per illustrazioni a tinte distinte.
3. In Anatomica puoi richiedere contorni a Gemini dopo aver confermato l’invio della foto, oppure scegliere **Seleziona le parti a mano** senza chiave e senza inviare immagini.
4. Nella rifinitura scegli una parte: Tratto, Accessori, Occhi, Bocca, Capelli, Pelle, Vestiti, Sfondo o Da assegnare. **Tocca** identifica la parte sotto il dito. **Zona** seleziona una regione contigua di colore simile; regola la tolleranza e conferma con **Assegna a…**. **Lazo** delimita una zona prima di assegnarla. **Pennello** trasferisce direttamente i pixel alla parte scelta.
5. **Togli** sposta i pixel in **Da assegnare**. Annulla/ripristina recupera le correzioni. Due dita ingrandiscono e spostano la vista; sono disponibili anche Naviga, zoom e Adatta. Le viste Parte sola, Sovrapposizione e Composita aiutano a controllare la selezione.
6. Applica i livelli. Per correggerli di nuovo, seleziona una parte e riapri **Separa in livelli**: il gruppo viene aggiornato senza una seconda chiamata AI e senza aggiungere altri originali.
7. Tocca **Esporta → PSD a livelli → Prepara PSD**, poi **Condividi / Salva** o **Scarica file**. In Adobe Fresco usa **Importa e apri** dall’app File.

Le maschere anatomiche si dividono i pixel originali: ogni pixel visibile appartiene a una sola parte, anche con trasparenza tenue. I pixel non riconosciuti restano in **Da assegnare** e un originale nascosto permette il recupero. La ricomposizione dei livelli mantiene l’immagine sorgente; non ricostruisce le parti nascoste sotto capelli, vestiti o tratto. Il tratto viene stimato dal contrasto locale, escludendo lo sfondo: va controllato come le altre selezioni.

## AI e privacy

Gemini restituisce **contorni poligonali approssimativi**, che l’app converte in maschere pixel. Non sono segmentazioni precise garantite: capelli e pelle possono sovrapporsi, mancare dettagli o lasciare zone da assegnare. Il modello predefinito è `gemini-3.5-flash-lite`; è selezionabile anche `gemini-3.8-flash`. Disponibilità, quota gratuita ed eventuali costi dipendono dal progetto Google. Non viene scelto automaticamente un altro modello.

L’analisi anatomica AI invia la foto al server dell’app e a Google soltanto dopo consenso esplicito. La chiave può essere configurata nell’ambiente del server oppure inserita per la sessione; l’app non la salva in localStorage, nei progetti o nei log. La precedente voce `fresco_gemini_key` viene rimossa all’apertura della separazione. Non inserire chiavi in variabili `VITE_*` o nel repository.

Errori, quote esaurite, risposte incomplete e chiavi mancanti vengono mostrati senza applicare risultati alla foto. Se soltanto alcuni contorni sono invalidi, vengono scartati con un avviso e si possono rifinire quelli validi; le zone non assegnate restano recuperabili. Le sagome geometriche sono disponibili solo dopo aver caricato esplicitamente uno degli esempi. Non sostituiscono una risposta AI fallita.

La rifinitura manuale e le modalità Oggetti/Per colore lavorano nel browser. Il salvataggio automatico conserva **un solo progetto su quel browser**, senza sincronizzazione tra dispositivi. Esporta una copia `.frescolayers` come backup; usa una sola scheda per lo stesso lavoro.

## Altre funzioni e limiti

- Ritaglio rettangolare con trasferimento dei pixel, spostamento, rinomina, visibilità, blocco, duplicazione, ordine, opacità e modalità di fusione.
- PSD con anteprima composita e metadati dei livelli; PNG della composizione; progetto riapribile `.frescolayers` con maschere e gruppi di rifinitura.
- Recupero locale con IndexedDB; annulla/ripristina con budget di memoria; layout per iPad verticale, orizzontale e Split View.
- Fino a 32 livelli e 12 milioni di pixel sorgente complessivi. Le immagini importate vengono ridotte a 2560 px per lato e 4 milioni di pixel; limite di 30 MB per immagine e 64 MB per progetto.
- Le modalità classiche possono ignorare piccoli frammenti o trasparenze molto tenui: l’anteprima lo segnala. La modalità anatomica conserva tutti i pixel con alpha maggiore di zero.
- Il salvataggio locale non è un backup. Il sito richiede rete per il caricamento e non include una cache offline.
- Condivisione nativa e apertura in Adobe Fresco richiedono verifica su iPad reale; i test WebKit non sostituiscono questa prova.

## Sviluppo e pubblicazione

Richiede Node.js **22.12+** (CI: Node 24). Usa il lockfile npm incluso.

```sh
npm ci
npm run dev
```

Apri `http://localhost:3000`. Per un iPad sulla stessa rete usa l’indirizzo LAN del computer; la condivisione nativa richiede HTTPS.

Configura `GEMINI_API_KEY` nel pannello delle variabili del tuo hosting, oppure usa la chiave di sessione nell’interfaccia. Le variabili disponibili sono elencate in [`.env.example`](.env.example): il server legge l’ambiente del processo, **non carica automaticamente un file `.env`**. `GEMINI_MODEL` forza il modello sul server; `PORT` cambia la porta.

Per pubblicare l’app completa serve un host Node con HTTPS:

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

Express serve `dist/` e `/api/segment-semantic` sulla stessa origine. Consenti al proxy dell’hosting richieste di almeno 24 MB e tempi di risposta di almeno 100 secondi. `npm run preview` o un hosting di soli file statici servono il frontend ma **non forniscono l’API Gemini**; gli strumenti manuali e le modalità classiche rimangono utilizzabili.

## Verifica

```sh
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
npm run test:semantic
TEST_BROWSER=webkit npm run test:e2e
TEST_BROWSER=webkit npm run test:semantic
```

Gli script browser avviano e chiudono un server locale (porte 4173 e 4175). `TEST_BASE_URL` usa un server già avviato, `CHROMIUM_PATH` sceglie l’eseguibile e `TEST_ARTIFACTS` la cartella dei risultati.

I test unitari verificano contorni concavi, regioni disconnesse, assegnazione esclusiva dei pixel, tratto, selezioni, convalida del progetto ed errori dell’API senza ripiego sugli esempi. Le prove browser coprono rifinitura, zoom/pinch, annulla/ripristina, riapertura del gruppo, recupero locale, layout e ricomposizione del PSD identica alla sorgente. Usano immagini e risposte sintetiche dichiarate: verificano il software, **non la qualità del modello AI**. La CI esegue entrambi i flussi in Chromium e WebKit. Una prova reale di Gemini richiede una chiave e un controllo visivo dei contorni; non fa parte della CI.

## Struttura

- `server.ts` e `server/semanticApi.ts`: hosting Express e chiamate Google con consenso, timeout e convalida.
- `src/App.tsx`: progetto, livelli, importazione e recupero.
- `src/components/SemanticRefinementStudio.tsx`: selezione, correzione e navigazione touch.
- `src/utils/semanticProtocol.ts` e `semanticSegmentation.ts`: contorni, maschere, proprietà dei pixel e ricostruzione dei livelli.
- `src/utils/extraction.ts` e `src/workers/extraction.worker.ts`: modalità Oggetti e Per colore.
- `src/utils/psdExport.ts` e `projectStorage.ts`: esportazione e formato riapribile.
