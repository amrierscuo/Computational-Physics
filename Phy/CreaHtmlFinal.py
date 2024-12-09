import os

# Lista dei file HTML da generare
fileHtml = [
    "effetto-zeeman-normale.html",
    "campo-b-uniforme.html",
    "esperimento-stern-gerlach.html",
    "spinori-pauli.html",
    "spazi-prodotto.html",
    "indistinguibilita.html",
    "postulato-simmetrizzazione.html",
    "determinante-slater.html",
    "principio-esclusione-pauli.html",
    "coefficenti-clebsch-gordan.html",
    "somma-spin-due-particelle.html",
    "momento-angolare-orbitale-spin.html",
    "perturbazioni-non-degenere.html",
    "correzioni-autovalori.html",
    "correzioni-stati.html",
    "perturbazioni-degenere.html",
    "rimozione-degenerazione.html",
    "effetti-relativistici.html",
    "correzioni-primo-ordine.html",
    "teorema-feynman-hellmann.html",
    "notazione-spettroscopica.html",
    "probabilita-transizione.html",
    "perturbazione-costante-periodica.html",
    "emissione-assorbimento-risonante.html",
    "transizioni-al-continuo.html",
    "regola-oro-fermi.html",
    "vita-media-larghezza.html"
]

# Crea una cartella per i file HTML generati
output_dir = "generated_html"
os.makedirs(output_dir, exist_ok=True)

# Contenuto base per ogni file HTML
base_html_content = """<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f9f9f9;
            color: #333;
        }}
        h1 {{
            color: #3498db;
        }}
        p {{
            background: #fff;
            padding: 15px;
            border-left: 4px solid #3498db;
            border-radius: 3px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }}
        footer {{
            margin-top: 20px;
            font-size: 0.9em;
            text-align: center;
            color: #888;
        }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    <p>Questo argomento è ancora in lavorazione. Aggiungerò presto contenuti specifici e dettagli approfonditi per {title}. Grazie per la pazienza!</p>
    <footer>
        Generato automaticamente - {title}
    </footer>
</body>
</html>
"""

# Genera i file HTML
for file_name in fileHtml:
    title = file_name.replace(".html", "").replace("-", " ").capitalize()
    file_path = os.path.join(output_dir, file_name)
    if not os.path.exists(file_path):  # Crea solo se il file non esiste
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(base_html_content.format(title=title))

print(f"Generati {len(fileHtml)} file HTML nella cartella '{output_dir}'")
