# FrescoLayers

Un MVP per trasformare immagini in **PSD con livelli pixel**, con un’interfaccia pensata per iPad. Parte da Imagetopsd e mantiene React, Vite, la segmentazione cromatica e `ag-psd`; concentra l’esperienza in tre passaggi: **carica → separa e sistema → esporta**.

## Come usarlo su iPad

1. Apri l’app in Safari. Puoi aggiungerla alla schermata Home dal menu Condividi.
2. Tocca **Carica immagini** e seleziona PNG, JPG o WebP da Foto o File. Più immagini diventano livelli separati. Puoi cominciare anche con l’esempio incluso.
3. Seleziona un livello e tocca **Separa in livelli**. Usa “Oggetti separati” per sticker distanziati oppure “Per colore” per illustrazioni a tinte distinte. Controlla l’anteprima prima di applicare.
4. Sposta i livelli con un dito o Apple Pencil. Due dita ingrandiscono e spostano la vista. **Naviga**, **Adatta tela** e i tasti zoom permettono anche di navigare senza gesti.
5. **Ritaglia** trasferisce una zona rettangolare del livello selezionato in un livello nuovo. Gli altri pixel restano nel livello di origine. **Annulla/Ripristina** recupera le modifiche recenti.
6. Tocca **Esporta → PSD a livelli → Prepara PSD**. Quando il file è pronto, usa **Condividi / Salva** e scegli “Salva su File”, oppure **Scarica file**.
7. In Adobe Fresco scegli **Importa e apri** e seleziona il PSD dall’app File.

I livelli sono **raster/pixel**, non tracciati vettoriali nativi. L’anteprima usa gli stessi pixel esportati. Non viene eseguito alcun riconoscimento AI di soggetti: parti nascoste o sovrapposte non possono essere ricostruite da una foto piatta.

## Funzioni incluse

- Importazione singola o multipla, con convalida del contenuto e gestione degli errori senza perdere il progetto attuale.
- Separazione in Web Worker: oggetti con maschere indipendenti oppure gruppi cromatici con contorni. Rimozione opzionale del bianco collegato ai bordi; il bianco dentro un contorno resta intatto.
- Ritaglio manuale, spostamento, selezione sui pixel visibili, rinomina, visibilità, blocco, duplicazione, ordine, opacità e tre modalità di fusione.
- Annulla/ripristina, fino a 15 modifiche compatibilmente con il limite di memoria della cronologia.
- PSD con livelli, anteprima composita, ppi, nomi, ordine, posizione, opacità, visibilità e blocchi. PNG per il risultato visibile.
- **Progetto riapribile** `.frescolayers`: archivio ZIP con `project.json` versione 1 e PNG originali dei livelli. Importazione con convalida di dimensioni e limiti di espansione.
- Recupero automatico dell’ultimo progetto tramite IndexedDB. Indicatore del salvataggio e messaggi per spazio insufficiente o browser non compatibile.
- Layout per iPad verticale, orizzontale e Split View; dialoghi nativi con gestione del focus; controlli touch e tastiera (⌘/Ctrl Z e ⇧⌘/Ctrl Z).

## Dati e limiti dell’MVP

Le immagini sono elaborate **nel browser**. Non sono inviate a un server e non servono account, database remoto, chiavi API o servizi AI. Il salvataggio locale conserva **un solo progetto corrente su quel browser**: non sincronizza dispositivi e non è un backup. Esporta una copia `.frescolayers` prima di iniziare un altro progetto o cancellare i dati del browser. Usa una sola scheda dell’app per lo stesso lavoro.

- Fino a 32 livelli e 12 milioni di pixel sorgente complessivi, con limite separato per la memoria di annulla/ripristina.
- Ogni immagine importata viene ridotta, mantenendo le proporzioni, a un massimo di 2560 px per lato e 4 milioni di pixel. Il ridimensionamento viene comunicato nell’interfaccia. Limite di 30 MB per immagine e 64 MB per progetto riapribile.
- La separazione degli oggetti ignora frammenti sotto 12 pixel. Quella cromatica può escludere trasparenze molto tenui e piccoli gruppi; l’anteprima ne segnala il conteggio e l’operazione è annullabile.
- La separazione cromatica mantiene i pixel RGB originali; non sostituisce i colori con una palette. La rimozione del bianco è adatta a sfondi semplici, non a scontornare fotografie.
- La condivisione nativa dipende da Safari, dal formato e dal contesto HTTPS. Il download resta disponibile. Il file viene preparato prima del tocco che invoca la condivisione, per rispettare l’attivazione utente di iOS.
- L’app si può aggiungere alla schermata Home; **non include una cache offline del sito**. È necessaria una connessione per caricare l’app.
- L’apertura finale in Adobe Fresco e la condivisione nativa vanno confermate su un iPad reale. L’emulazione browser non sostituisce questa verifica.

## Sviluppo

Richiede Node.js **22.12+** (CI: Node 24). Il lockfile npm è incluso.

```sh
npm ci
npm run dev
```

Apri `http://localhost:3000`. Per provarlo da un iPad sulla stessa rete, usa l’indirizzo LAN del computer sulla porta 3000; la condivisione nativa richiede un’origine sicura HTTPS.

```sh
npm test           # Algoritmi di separazione e convalida dei progetti
npm run build     # TypeScript strict + build di produzione in dist/
npm run preview   # Anteprima della build
```

L’app è statica: pubblica `dist/` su un host HTTPS che mantenga i nomi degli asset e supporti i Web Worker ES module. Non servono variabili d’ambiente. Il progetto di origine resta su GitHub; un’eventuale copia pubblicata con Sites ha il proprio manifest di hosting nel checkout di pubblicazione.

### Prove nei browser

```sh
npx playwright install --with-deps chromium webkit
npm run test:e2e
TEST_BROWSER=webkit npm run test:e2e
```

Lo script avvia e chiude autonomamente Vite sulla porta 4173. In alternativa puoi passare `TEST_BASE_URL` per un server già avviato, anche una build servita in locale. `CHROMIUM_PATH` seleziona un eseguibile Chromium; `TEST_ARTIFACTS` sceglie la cartella di screenshot e file esportati (default `/tmp/frescolayers-test`).

Le prove coprono importazione errata, separazione tramite worker, proprietà dei livelli, annulla/ripristina, ritaglio senza duplicazione di pixel, spostamento/blocco, esportazioni PSD/PNG/progetto, lettura del PSD con confronto dei pixel e dei metadati, recupero IndexedDB, progetto corrotto e quattro dimensioni dello schermo. Chromium verifica anche un pinch con eventi touch reali del browser. La CI ripete build, test e prove in Chromium/WebKit.

## Struttura

- `src/App.tsx`: flusso del progetto, importazione e recupero locale.
- `src/components/`: area di lavoro, pannello livelli e tre dialoghi funzionali.
- `src/hooks/useProject.ts`: cronologia con budget di memoria e selezione.
- `src/utils/extraction.ts` + `src/workers/extraction.worker.ts`: separazione e maschere dei componenti.
- `src/utils/segmentationCore.ts`: algoritmo cromatico mantenuto dal progetto iniziale, con correzione degli indici dopo il filtro dei gruppi piccoli.
- `src/utils/psdExport.ts`: PSD, PNG e consegna del file al dispositivo.
- `src/utils/projectStorage.ts`: formato portatile, convalida e IndexedDB.

Sono stati rimossi conversione vettoriale automatica, tre modalità di anteprima, pannelli diagnostici, guide ripetute, comandi duplicati, dipendenze AI/server non utilizzate e gli asset temporanei di AI Studio.
