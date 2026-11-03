# Prompt per continuare FrescoLayers con Gemini

Importa il repository dal branch main in Gemini / Google AI Studio con un modello disponibile nel piano gratuito del tuo account. Se non può leggere GitHub, carica il progetto come ZIP. Allega a Gemini la foto originale e lo screenshot della separazione frammentata, che non sono nel repository.

Il 3 novembre 2026 la documentazione ufficiale consultata elenca gemini-3.8-flash con input/output gratuiti nel Free Tier. Disponibilità nel singolo account, quote e qualità delle maschere vanno verificate. La generazione di immagini è distinta dalla segmentazione e può avere prezzi diversi.

Fonti: [prezzi ufficiali](https://ai.google.dev/gemini-api/docs/pricing), [segmentazione](https://ai.google.dev/gemini-api/docs/image-understanding#segmentation), [quote](https://ai.google.dev/gemini-api/docs/rate-limits).

Copia tutto il blocco seguente:

```text
Lavora come sviluppatore senior con competenze di visione artificiale e UX touch. Continua FrescoLayers dal repository https://github.com/raffica93/Imagetopsd, branch main.

OBIETTIVO E STATO
L’app trasforma immagini in PSD a livelli per Adobe Fresco su iPad. L’utente apprezza l’interfaccia attuale: mantienila semplice e coerente. Il problema è il motore di separazione: produce frammenti per colore, mentre servono parti del personaggio riconoscibili e modificabili.
Leggi README.md, docs/proposta-separazione-semantica.md e le eventuali istruzioni AGENTS.md. Esamina poi src/App.tsx, src/components/ExtractModal.tsx, src/utils/extraction.ts, src/utils/segmentationCore.ts, src/workers/extraction.worker.ts, src/utils/psdExport.ts e src/utils/projectStorage.ts.
MVP e proposta sono su main. La separazione anatomica e il nuovo livello del tratto NON sono ancora implementati.
Il codice usa React, TypeScript strict, Vite, ag-psd, Canvas e Web Worker. Funzionano gestione livelli, ritaglio, pinch, annulla/ripristina, IndexedDB, PSD/PNG e progetti .frescolayers.
Prima della consegna passavano 15 test e prove sulla build in Chromium/WebKit: NON erano prove della qualità della segmentazione anatomica. Verifica di nuovo nel tuo ambiente.
Le prove preliminari con BiSeNet ResNet18, Xenova/face-parsing SegFormer quantizzato e UNet/MobileNetV2 per anime sono state insufficienti sulla foto dell’utente. Non presentarli come una soluzione già validata. Pesi e script sperimentali non sono nel repository.
L’app attuale elabora tutto nel browser, senza backend AI o chiavi API. Sito esistente: https://frescolayers-ipad-mvp.raffaeleliporace.chatgpt.site. Non presumere di avere accesso al suo hosting.
L’immagine originale del personaggio e lo screenshot del risultato frammentato vanno allegati a questa conversazione: non sono nel repository pubblico.

MODELLO GRATUITO
Usa solo servizi gratuiti entro le quote. Distingui il modello che usi per sviluppare da quello eventualmente chiamato dall’app.
Per l’inferenza valuta un Gemini Flash multimodale con Free Tier: candidato gemini-3.8-flash, se ancora disponibile gratuitamente nel mio account. Verifica modello, prezzi, quote, ciclo di vita e formato delle maschere sulla documentazione ufficiale aggiornata. Rendi configurabile l’ID del modello.
Non attivare billing, prove con rinnovo, GPU a pagamento o fallback verso modelli a pagamento. Se la quota finisce, conserva il progetto e mostra un errore chiaro. Non aggirare i limiti e non promettere gratuità illimitata; separa quota AI e hosting.
Se manca una chiave gratuita utilizzabile, prepara l’integrazione e testala con risposte di prova dichiarate come tali: la verifica reale resta da eseguire. Non inventare risultati di inferenza.

LIVELLI ATTESI
Dall’alto verso il basso, quando presenti:
1. Tratto / contorni della penna.
2. Accessori, compresi gli orecchini.
3. Occhi.
4. Bocca.
5. Capelli, comprese le ciocche laterali lunghe.
6. Pelle: viso, orecchie e collo insieme.
7. Vestiti.
8. Sfondo.
9. Originale intatto, nascosto, per recupero.
Non creare etichette vuote o rinominare cluster di colore per simulare il riconoscimento.

IMPLEMENTAZIONE
1. Crea un branch da main. Mantieni la UI e le funzioni già utili.
2. Prima dell’integrazione completa realizza un prototipo sulla foto dell’utente e su un secondo personaggio diverso. Mostra maschere reali: valuta capelli/pelle, occhi, bocca, accessori e vestiti. Descrizioni e rettangoli da soli non sono una separazione dei pixel.
3. Valuta la segmentazione nativa documentata da Gemini, con etichette, box e maschere o poligoni nel formato realmente supportato dal modello scelto. Convalida schema, coordinate e dimensioni, decodifica e riporta tutto sul canvas originale. Non assumere che API o versioni diverse usino formati identici. La capacità documentata non garantisce qualità sugli anime: misurala.
4. Usa le maschere per ripartire i pixel originali, conservando RGB, alpha e posizione. Risolvi sovrapposizioni e zone non assegnate senza perdere o duplicare pixel. La ricomposizione dei livelli visibili deve preservare l’immagine iniziale. Mantieni l’originale nascosto e non inventare parti coperte.
5. Separa il tratto DOPO aver distinto personaggio e sfondo. Il fondo nero non è tratto; campiture e ombre non sono automaticamente linee. Considera contrasto locale, bordi e forma dei segni, anche marroni/colorati. Aggiungi sensibilità e anteprima. Non usare la sola luminosità globale. Da un JPG piatto il tratto è una stima raster: non promettere pennellate/vettori originali né colori ricostruiti sotto la penna.
6. Offri un’anteprima grande con maschere e confronto con l’originale. Aggiungi correzione touch: seleziona una parte, aggiungi/togli zone, unisci gruppi o assegna una zona ad Accessori. Supporta dita/Pencil e annulla/ripristina anche nelle correzioni. Segnala parti incerte senza percentuali di affidabilità inventate.
7. Esporta PSD con nomi e ordine concordati, preservando opacità, visibilità, posizione e ppi. Mantieni le modalità sticker e colori per le immagini adatte.

API E PRIVACY
Se usi Gemini API, crea un endpoint server leggero compatibile con un piano di hosting gratuito e documenta avvio/deploy. La chiave GEMINI_API_KEY resta solo sul server: mai in VITE_*, bundle, repository, log o file scaricabili.
Aggiungi convalida e limite degli upload, timeout, annullamento, retry limitati per errori temporanei e protezione dell’endpoint da uso non autorizzato.
L’invio a Google cambia la privacy dell’app: rendilo chiaro prima dell’analisi, con azione esplicita dell’utente e indicazione dei termini del Free Tier, inclusa la possibile utilizzazione dei dati per migliorare i prodotti Google. Non salvare immagini sul server se non necessario.
Mantieni locali progetto, correzioni e PSD. Errori o annullamenti devono lasciare intatti i livelli. Non ripiegare sui cluster cromatici chiamandoli analisi semantica.

VERIFICA E CONSEGNA
Esegui npm ci, npm test e npm run build. Esegui npm run test:e2e e TEST_BROWSER=webkit npm run test:e2e quando browser e dipendenze sono disponibili; dichiara ciò che non hai potuto verificare.
Aggiungi test significativi per coordinate/decodifica maschere, overlap, pixel non assegnati, ricomposizione, tratto distinto dallo sfondo, correzioni/cronologia, risposte malformate, timeout e quota 429. I test automatici non sostituiscono il confronto visivo delle maschere.
Verifica verticale, orizzontale e Split View. Distingui emulazione browser da test su iPad reale e apertura del PSD in Fresco.
Aggiorna README, configurazione senza segreti, istruzioni per il modello gratuito e limiti. Crea commit e una PR con risultati prima/dopo, verifiche e problemi rimasti; lascia merge su main e deploy alla revisione dell’utente. Non rendere pubblico il sito né caricare la foto allegata nel repository.

Inizia con poche righe su ciò che hai trovato nel codice e il modello gratuito effettivamente verificato, poi procedi al prototipo. Se il risultato resta frammentato, mostrane il limite e proponi una correzione verificabile invece di dichiarare il problema risolto.
```
