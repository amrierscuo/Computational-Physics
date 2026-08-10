# Aggiungere nuovi punti alla Field Map

Per aggiungere elementi appartenenti ai layer gia esistenti non devi piu modificare `map.html`, `map.css` o `map.js`.

## Procedura normale

1. Esporta i nuovi dati Wayfarer o Street View in formato JSON o JSONL.
2. Copia i file nella cartella `data/inbox`.
3. Fai doppio clic su `update-map-data.cmd`.
4. Avvia il server locale e controlla `map.html`.
5. Se il risultato e corretto, esegui commit e push dei soli file dati modificati.

Lo script:

- riconosce automaticamente Wayfarer e Street View 360;
- unisce i nuovi record con quelli gia presenti;
- aggiorna un record esistente quando trova lo stesso `sourceId` o `photoId`;
- evita duplicati;
- accetta solo contributi Wayfarer finali `Accepted` o `Appeal Accepted`;
- pubblica solo panorami Street View con stato `PUBLISHED`;
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

## Aggiornare le foto Google Maps normali

Le foto Google normali hanno una procedura separata perche il dataset pubblico viene costruito soltanto dopo la review.

1. Copia nella cartella `data/google-photo-inbox` ogni dataset di fascia e il relativo file di decisioni.
2. Fai doppio clic su `update-google-photos.cmd`.
3. Controlla `map.html` in locale.
4. Se il risultato e corretto, esegui commit del solo `data/google-photos.json` insieme a eventuali modifiche al codice.

Lo script abbina automaticamente ciascun file di decisioni al dataset indicato in `sourceDataset`, applica le esclusioni, elimina duplicati e valida i conteggi. Le coordinate non vengono inventate: una foto viene posizionata sulla mappa soltanto quando titolo e comune coincidono con un Wayspot accettato. Le altre foto restano disponibili nella galleria.

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
