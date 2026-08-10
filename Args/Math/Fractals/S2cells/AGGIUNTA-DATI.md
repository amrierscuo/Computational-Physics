# Aggiungere nuovi punti alla Field Map

Per aggiungere elementi appartenenti ai layer gia esistenti non devi piu modificare `map.html`, `map.css` o `map.js`.

## Procedura normale

1. Esporta i nuovi dati Wayfarer, Street View o Google Maps Photo in formato JSON o JSONL.
2. Copia i file nella cartella `data/inbox`.
3. Fai doppio clic su `update-map-data.cmd`.
4. Avvia il server locale e controlla `map.html`.
5. Se il risultato e corretto, esegui commit e push dei soli file dati modificati.

Lo script:

- riconosce automaticamente Wayfarer, Street View 360 e Google Maps Photo;
- unisce i nuovi record con quelli gia presenti;
- aggiorna un record esistente quando trova lo stesso `sourceId` o `photoId`;
- evita duplicati;
- accetta solo contributi Wayfarer finali `Accepted` o `Appeal Accepted`;
- pubblica solo panorami Street View con stato `PUBLISHED`;
- conserva soltanto foto Google Maps con `reviewStatus: "keep"`;
- mantiene nel dataset le foto Google senza coordinate come elementi della galleria, ma non crea marker artificiali;
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

## Preparare e aggiornare le foto Google Maps normali

Le foto Google normali sono un tipo POI separato chiamato `Google Maps Photo`. La prima costruzione del dataset pubblico richiede una review; dopo la review, il file ottenuto puo essere importato anche con la procedura normale insieme agli altri tipi.

1. Copia nella cartella `data/google-photo-inbox` ogni dataset di fascia e il relativo file di decisioni.
2. Fai doppio clic su `update-google-photos.cmd`.
3. Controlla `map.html` in locale.
4. Se il risultato e corretto, esegui commit del solo `data/google-photos.json` insieme a eventuali modifiche al codice.

Lo script abbina automaticamente ciascun file di decisioni al dataset indicato in `sourceDataset`, applica le esclusioni, elimina duplicati e valida i conteggi. Il file `data/google-photo-place-pins.json` collega ogni `photoId` al Place ID associato nella pagina Google Maps Contributions. Le coordinate vengono dalla posizione ufficiale restituita da Places API (New), mai dai metadati della foto. Se Google dichiara il Place ID scaduto o non valido, la foto resta disponibile nella galleria senza creare un marker artificiale.

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
- foto Google Maps normali gia revisionate.

Una categoria completamente nuova, con colore, icona, filtro o popup differenti, richiede invece una modifica una tantum all'interfaccia. Dopo aver creato il nuovo layer, anche i suoi elementi potranno essere gestiti con lo stesso sistema.
