# Demo FDSDM Pre-TrainedGPT V11

Prototype web statico per test: menu iniziale, 3 mappe, 36 livelli, stanze 3D FPS/top-camera replay, timer interno da 10 minuti per livello e controlli mobile.

## Avvio locale consigliato Windows / IPv4

```powershell
cd "C:\Users\Gysgh\Desktop"
Expand-Archive ".\Demo_FDSDM_Pre-TrainedGPTV11.zip" -DestinationPath ".\Demo_FDSDM_Pre-TrainedGPTV11"
cd ".\Demo_FDSDM_Pre-TrainedGPTV11\Demo_FDSDM_Pre-TrainedGPTV11"
python -m http.server 8000 --bind 127.0.0.1
```

Apri:

```txt
http://127.0.0.1:8000
```

## Novità V11

- 5 terminali reali per livello: CORE, CONCEPTS, CONNECTIONS, ORAL, FORGE.
- START è solo un portale, non conta mai nel completamento.
- Codice future-proof: il numero terminali dipende da `LEVEL_TASKS`, quindi puoi aggiungere altri terminali senza includere START.
- Mobile Android/iPhone: controlli touch integrati, pad movimento, pulsante INTERACT, pulsante EXIT e drag sul canvas per guardare attorno.
- Mappa base completamente statica: nessuna animazione audio-reactive applicata all’immagine di sfondo.
- Restano dinamici solo asset/overlay generici: nodi, glow, ring, laser, boss aura, particelle.
- Replay finale top-camera x4 mantenuto.
- Save separato V11: `fdsdm_pretrained_v11_save`.

## Controlli desktop

```txt
WASD = muovi
Mouse = guarda attorno
E = interagisci
Q = esci dal livello
ESC = libera mouse
```

## Controlli mobile

```txt
Tap CLICK TO PLAY = entra in modalità mobile
Pad sinistro = movimento
Drag sullo schermo = camera/look
INTERACT = interagisci
EXIT = esci alla mappa
```

## Debug

Usa il bottone DEBUG o `CTRL+D`.

Cheat inclusi:

```txt
Unlock all
Complete all
Complete current
+10 min
Unlock finish portal
Reset save
```


## Novità V11
- Replay finale top-camera più leggibile: bright pass, fog disattivata solo durante il render replay, arena bounds evidenziati.
- Il replay resta reale: stesso ambiente 3D, stesso percorso registrato, countdown da 10:00.000, playback x4.
- Pensato per essere linkato da `FDSDM.html` nella cartella `Struttura`.
