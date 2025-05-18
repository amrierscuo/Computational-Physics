questions = [
    "Barriera di potenziale (confronto MA-CL)",
    "Discussione termine spin-orbita nella struttura fine dell’atomo di idrogeno",
    "Momento angolare di due fermioni legati",
    "Teoria delle perturbazioni stazionarie degenere",
    "Transizioni tra livelli atomici con pulsazione di Bohr",
    "Conservazione della probabilità globale e locale",
    "Sistemi di particelle identiche",
    "Perturbazioni stazionarie",
    "Profilo generico di potenziale",
    "Osservabili compatibili",
    "Osservabili commutano se e solo se sono compatibili",
    "Step di potenziale",
    "Perturbazioni dipendenti dal tempo",
    "Principio di Heisenberg",
    "Pacchetto d’onda a indeterminazione minima",
    "Coefficienti di Clebsch–Gordan",
    "Gradino di potenziale",
    "Composizione di momenti angolari totali"
]

template = """<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>{titolo}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {{
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #faf6f6;
            color: #2c3e50;
            max-width: 700px;
            margin: 40px auto 0 auto;
            padding: 2em 1.5em 3em 1.5em;
            border-radius: 14px;
            box-shadow: 0 8px 40px rgba(90,40,20,0.13);
        }}
        h1 {{
            color: #b30000;
            font-size: 1.35em;
            margin-bottom: 1em;
            border-bottom: 2px solid #f0dddd;
            padding-bottom: 0.2em;
        }}
        .soluzione {{
            background: #fff5f5;
            border: 1.5px solid #b30000;
            border-radius: 8px;
            padding: 1.2em 1.2em 1.8em 1.2em;
            margin-top: 1.2em;
        }}
        .imgwrap {{
            text-align: center;
            margin-top: 1.5em;
        }}
        img {{
            max-width: 97%;
            margin: 0 auto;
            border-radius: 6px;
            box-shadow: 0 2px 16px rgba(140,0,0,0.13);
        }}
    </style>
</head>
<body>
    <h1>{titolo}</h1>
    <div>Qui trovi la soluzione alla domanda:<br>
    <b>{titolo}</b>
    </div>
    <div class="imgwrap">
        <img src="img/Domanda2025_{indice}.jpeg" alt="Soluzione {titolo}">
    </div>
    <div class="soluzione">
        <!-- Inserisci qui la soluzione testuale, formule, commenti, ecc... -->
        <p><i>Soluzione in fase di caricamento...</i></p>
    </div>
</body>
</html>
"""

for idx, titolo in enumerate(questions, 1):
    html_content = template.format(
        titolo=titolo,
        indice=idx
    )
    filename = f"Domanda2025_{idx}.html"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(html_content)

print("Fatto! Generati tutti gli HTML con immagini in /img/")
