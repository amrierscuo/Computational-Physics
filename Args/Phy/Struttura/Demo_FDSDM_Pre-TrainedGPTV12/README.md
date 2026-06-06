# Demo_FDSDM_Pre-TrainedGPTV12

Versione demo per test FDSDM Matter Game.

## Avvio locale IPv4

```powershell
cd "C:\Users\Gysgh\Desktop\Computational-Physics\Args\Phy\Struttura\Demo_FDSDM_Pre-TrainedGPTV12"
python -m http.server 8000 --bind 127.0.0.1
```

Apri:

```txt
http://127.0.0.1:8000
```

## Novità V12

- Loader iniziale con barra di caricamento per mappe e audio.
- Mappe e nodi vengono mostrati insieme: i nodi non appaiono prima dell'immagine.
- Mappe responsive su mobile: l'immagine e gli hotspot stanno nello stesso contenitore scalabile/scrollabile, quindi restano agganciati anche con zoom/dezoom.
- L'immagine base della mappa resta statica; le animazioni restano solo sugli overlay/asset generici.
- Audio pre-caricato meglio per ridurre il ritardo di partenza.
- Musica livello alleggerita: usa una traccia più piccola, mentre `qm_ambient_3d.mp3` resta archiviata negli asset.
- Layout mobile corretto: topbar, mappe, pad, interaction hint, checklist e footer più leggibili su Android/iPhone.
- Replay top-camera x4 e timer livello da 10 minuti mantenuti.
