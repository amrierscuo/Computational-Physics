# Aggiungere nuovi punti alla Field Map

Per aggiungere elementi appartenenti ai layer gia esistenti non devi piu modificare `map.html`, `map.css` o `map.js`.

## Procedura normale

1. Esporta i nuovi dati Wayfarer, Street View o Google Maps media in formato JSON o JSONL.
2. Copia i file nella cartella `data/inbox`.
3. Fai doppio clic su `update-map-data.cmd`.
4. Avvia il server locale e controlla `map.html`.
5. Se il risultato e corretto, esegui commit e push dei soli file dati modificati.

Lo script:

- riconosce automaticamente Wayfarer, Street View 360, Google Maps Photo e Google Maps Video;
- unisce i nuovi record con quelli gia presenti;
- aggiorna un record esistente quando trova lo stesso `sourceId` o `photoId`;
- evita duplicati;
- accetta solo contributi Wayfarer finali `Accepted` o `Appeal Accepted`;
- pubblica solo panorami Street View con stato `PUBLISHED`;
- conserva soltanto media Google Maps con `reviewStatus: "keep"`;
- mantiene nel dataset foto e video Google senza coordinate come elementi della galleria, ma non crea marker artificiali;
- controlla coordinate e campi obbligatori;
- aggiorna conteggi e data di generazione;
- crea una copia di sicurezza locale in `.map-data-backups`;
- non pubblica immagini Wayfarer prive di una decisione di privacy `keep`.

Dopo un aggiornamento riuscito i file importati restano nella cartella `data/inbox`. Puoi spostarli o eliminarli: la cartella e ignorata da Git.

## Trascinamento diretto

Puoi anche trascinare uno o piu file `.json` o `.jsonl` sopra `update-map-data.cmd`. In questo caso non serve copiarli nella cartella `inbox`.

## Controllo senza importare nulla

Dal terminale, nella cartella `S2cells`:

```powershell
node tools/update-map-data.mjs --check
```

## Sincronizzare foto e video da Google Maps Contributions

Foto e video sono due tipi POI separati, chiamati `Google Maps Photo` e `Google Maps Video`. Entrambi sono disattivati all'avvio. Street View 360 resta l'unico layer Google caricato e visibile di default.

Quando hai creato un nuovo export locale completo della scheda Contributions:

1. trascina `live-google-contributions.json` sopra `sync-google-contributions.cmd`;
2. apri `map.html` tramite il server locale;
3. carica i Google media e controlla conteggi, galleria e marker;
4. pubblica soltanto dopo il controllo.

Il sincronizzatore:

- distingue foto, video e panorami usando `mediaType`;
- esclude i panorami dal dataset media perche sono gia gestiti da Street View 360;
- conserva le decisioni in `data/google-media-exclusions.json`;
- estrae il Place ID pubblico associato a ogni contributo;
- riusa solo coordinate ufficiali gia verificate in `data/google-photo-place-pins.json`;
- lascia i Place ID non risolti nella galleria senza inventare coordinate;
- aggiorna foto, video, visualizzazioni, durata e miniature in una sola operazione.

Comando equivalente dal terminale:

```powershell
node tools/sync-google-contributions.mjs --export "C:\percorso\live-google-contributions.json"
```

## Ricostruire le vecchie fasce di review Google Maps

La procedura precedente basata sulle fasce di visualizzazioni resta disponibile per riprodurre gli export storici gia revisionati.

1. Copia nella cartella `data/google-photo-inbox` ogni dataset di fascia e il relativo file di decisioni.
2. Fai doppio clic su `update-google-photos.cmd`.
3. Controlla `map.html` in locale.
4. Se il risultato e corretto, esegui commit dei file dati aggiornati insieme a eventuali modifiche al codice.

Lo script abbina automaticamente ciascun file di decisioni al dataset indicato in `sourceDataset`, applica le esclusioni, elimina duplicati e valida i conteggi. Il file `data/google-photo-place-pins.json` collega ogni `photoId` al Place ID associato nella pagina Google Maps Contributions. Le coordinate presenti vengono dalla posizione ufficiale del Place ID, mai dai metadati della foto. Un elemento irrisolto resta disponibile nella galleria senza creare un marker artificiale.

Per sostituire il file dei pin con un checkpoint aggiornato:

```powershell
node tools/build-google-photos.mjs --place-pins data/google-photo-place-pins.json --inbox data/google-photo-inbox
```

`update-google-photos.cmd` usa automaticamente lo stesso file dei pin. L'opzione `--no-place-pins` resta disponibile soltanto per riprodurre il vecchio fallback basato su titolo e comune Wayfarer.

Un record gia revisionato puo essere aggiunto a `data/inbox` come qualunque altro POI. Deve contenere almeno:

```json
{
  "photoId": "identificatore-univoco",
  "submissionType": "Google Maps Photo",
  "title": "Nome del luogo",
  "thumbnailUrl": "https://...",
  "reviewStatus": "keep",
  "latitude": null,
  "longitude": null
}
```

Latitudine e longitudine possono essere entrambe `null`. Se sono presenti devono formare una coppia valida.

Per controllare il dataset pubblico:

```powershell
node tools/build-google-photos.mjs --check
```

## Regole per le immagini Wayfarer

Ogni record nuovo dovrebbe contenere `imageReview`.

Per una `Wayspot Submission`:

```json
"imageReview": {
  "primary": "keep",
  "support": "exclude",
  "submitted": "exclude"
}
```

Per una `Photo Submission`:

```json
"imageReview": {
  "primary": "exclude",
  "support": "exclude",
  "submitted": "keep"
}
```

Se una decisione manca, il punto viene aggiunto ma l'immagine corrispondente non viene pubblicata. Potrai reimportare lo stesso record con la decisione corretta: lo script lo aggiornera senza creare un duplicato.

## Cosa richiede ancora una modifica al codice

Questa procedura vale per:

- `Wayspot Submission`;
- `Photo Submission`;
- `Street View 360`;
- foto e video Google Maps gia revisionati.

Una categoria completamente nuova, con colore, icona, filtro o popup differenti, richiede invece una modifica una tantum all'interfaccia. Dopo aver creato il nuovo layer, anche i suoi elementi potranno essere gestiti con lo stesso sistema.
