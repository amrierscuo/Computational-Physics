# Prime Root Lab

A static visual laboratory for studying prime square-root approximations through scaled integer squares, geometric residue patterns, and explicitly labeled gravitational-wave teaching analogies.

## Data archive

`data/prime-roots.txt` is the single source of prime data. It uses NDJSON with one JSON record per line. Each record preserves its version, prime number, timestamp, metrics, stopping rule, decompositions, products and comparisons.

The distributed archive exceeds 52 MB and contains only complete consecutive mathematical records. The formula archive initially requests at most 1,000 records through HTTP byte ranges. The user can then load additional blocks from 1% to 25%, or explicitly load the complete archive. All visible metrics update from the loaded subset. `data/timestamp-groups.txt` groups records by their real millisecond timestamp.

## Pages

- `index.html` is the formula archive and TXT editor/export interface.
- `geometry.html` animates A-D classes and shows distributions, transitions, the Lemke Oliver-Soundararajan comparison and primes per decade.
- `gw.html` is a declared 2D teaching analogy with a synthetic CBC carrier, interferometer, STFT, relative PSD/ASD, whitening, noise, glitches, audio, and an optional synchronized GW250114 reference video.
- `search.html` rebuilds the ODW 4.1-4.3 search logic in JavaScript: colored noise, Welch PSD, whitening, matched filtering, H1-L1-V1 network coincidence, banded χ², reweighted SNR and empirical background.

The GW pages do not claim that prime deviations are gravitational-wave measurements or that the browser simulation is an LVK search.

## Local use

Run a static server in the project directory, for example:

```text
python -m http.server 8000
```

Then open `http://localhost:8000`.

All page and asset links are relative, so the project also works from a GitHub Pages subdirectory.

## Updating the prime archive

The browser can read a TXT file but cannot overwrite a published GitHub Pages asset. The archive page can calculate the next full record in memory and export the updated NDJSON. Replace `data/prime-roots.txt` with the exported file before publishing.

To regenerate the dataset up to the configured threshold, run `node tools/generate-dataset.mjs` from the project directory.

## Mathematical rule

The decomposition uses only blocks based on 10, 5, 2 and 1 at different scales. After at least three decimal places, the formula continues while the next digit is greater than or equal to 5 and stops when it is less than 5.

## Reference video

`media/Animation_GW250114-1080p.mp4` appears only with the exact 54.166667-second synchronization preset. It is sourced from LIGO Lab and an SXS numerical simulation visualized by H. Pfeiffer, A. Buonanno and K. Mitman. The page links to the official source and states that the video duration is cinematic rather than the physical duration of the merger.
