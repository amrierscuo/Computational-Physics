# Pubblicazione separata Math e Phy

Questa procedura evita `git add`, checkout sporchi, bundle manuali e conflitti tra chat Math e Phy.

## Regola principale

- Una chat usa lo scope `math`, che ammette soltanto `Args/Math/`.
- Una chat usa lo scope `phy`, che ammette soltanto `Args/Phy/`.
- I file vengono modificati dentro un payload isolato, non nel worktree condiviso.
- Il publisher usa sempre l'ultimo `main` remoto come genitore.
- Se l'altro scope ha pubblicato nel frattempo, il commit viene ricostruito automaticamente sopra il nuovo `main`.
- Se è cambiato uno degli stessi file, la pubblicazione si ferma e mostra il conflitto.

## 1. Creare il payload

Per pochi file:

```powershell
python tools/scoped_publish.py snapshot `
  --scope phy `
  --output C:\percorso\payload-phy `
  --message "Improve Physics reader" `
  --path Args/Phy/MQ/esempio.html
```

Per molti file, creare un TXT con un percorso per riga:

```powershell
python tools/scoped_publish.py snapshot `
  --scope math `
  --output C:\percorso\payload-math `
  --message "Improve Math module" `
  --paths-file C:\percorso\math-paths.txt
```

Il comando scarica i blob in parallelo e crea:

```text
payload-phy/
  publish.json
  files/
    Args/Phy/...
```

Modificare soltanto i file sotto `payload-phy/files/`.

Per un file nuovo, aggiungere sia `--path` sia `--new-path` con lo stesso percorso.

## 2. Controllare

```powershell
python tools/scoped_publish.py check C:\percorso\payload-phy
```

Il controllo verifica:

- scope e percorsi;
- file realmente cambiati;
- blob di partenza;
- avanzamenti concorrenti di `main`;
- conflitti sugli stessi file.

## 3. Pubblicare

```powershell
python tools/scoped_publish.py publish C:\percorso\payload-phy
```

Il comando:

1. carica i blob in parallelo;
2. rilegge l'ultimo `main`;
3. ricostruisce il commit sopra l'ultimo genitore disponibile;
4. aggiorna `main` soltanto in fast-forward;
5. verifica che il diff remoto contenga esattamente i file del payload.

Non sono necessari `pull`, `merge`, `stash` o bundle quando Math e Phy modificano percorsi distinti.

## Convenzione per le chat Codex

Ogni chat comunica nel passaggio di consegne:

```text
scope: math oppure phy
payload: percorso assoluto
base: created_base_sha da publish.json
files: numero e prefisso
check: pending_files=..., conflicts=[]
```

Il publisher finale usa soltanto il payload indicato. Le modifiche presenti nel worktree condiviso vengono ignorate.
