import os

# Lista dei file HTML da generare
fileHtml = [
    "radiazione-corpo-nero.html",
    "effetto-fotoelettrico.html",
    "effetto-compton.html",
    "atomo-bohr.html",
    "spettri-atomici.html",
    "relazione-de-broglie.html",
    "analogia-ottica-meccanica.html",
    "esperimenti-doppia-fenditura.html",
    "onde-piane-pacchetti.html",
    "principio-sovrapposizione.html",
    "pacchetto-gaussiano.html",
    "relazione-indeterminazione.html",
    "equazione-schrodinger-ottica.html",
    "conservazione-probabilita.html",
    "densita-corrente.html",
    "equazione-continuita.html",
    "calcolo-operatoriale.html",
    "teorema-ehrenfest.html",
    "autofunzioni-autovalori.html",
    "sviluppo-serie-autofunzioni.html",
    "stati-stazionari.html",
    "misure-energia.html",
    "particella-libera.html",
    "gradino-potenziale.html",
    "barriera-potenziale.html",
    "buca-potenziale.html",
    "stati-legati-diffusione.html",
    "oscillatore-armonico.html",
    "notazione-dirac.html",
    "coordinate-impulsi.html",
    "trasformazioni-unitarie.html",
    "evoluzione-operatori.html",
    "simmetrie-leggi-conservazione.html",
    "generatori-traslazioni.html",
    "oscillatore-operatoriale.html",
    "degenerazione-osservabili.html",
    "relazioni-indeterminazione.html",
    "relazioni-commutazione.html",
    "trattazione-operatoriale.html",
    "coordinate-sferiche.html",
    "armoniche-sferiche.html",
    "rappresentazioni-matriciali.html",
    "separazione-variabili.html",
    "oscillatore-armonico-3d.html",
    "potenziali-centrali.html",
    "atomo-idrogeno.html",
    "effetto-zeeman-normale.html",
    "spinori-pauli.html",
    "spazi-prodotto.html",
    "correzioni-energia.html",
    "caso-degenere.html",
    "set-4-radiazione-fotoelettrico.html",
    "set-5-indeterminazione-normalizzazione.html",
    "set-6-operatori-autofunzioni.html",
    "set-7-parita-oscillatore.html",
    "set-7-new-multivista.html",
    "set-8-operatori-angolari.html",
    "set-9-funzioni-radiali.html",
    "set-10-momento-totale.html",
    "set-11-perturbazioni-stazionarie.html",
    "set-12-probabilita-transizione.html",
    "esame-1-oscillatore-armonico.html",
    "esame-2-oscillatore-combinato.html",
    "esame-3-particelle-degenerazione.html",
    "esame-4-buca-perturbazione-lineare.html",
    "esame-5-perturbazione-gaussiana.html",
    "esame-6-sistema-tre-livelli.html",
    "esame-7-perturbazioni-complesse.html",
    "esame-8-particella-perturbazione.html",
    "esame-9-spin-degenerazione.html",
    "effetto-compton.html",
    "equazione-schrodinger-generale.html",
    "conservazione-probabilita.html",
    "hermiticita-conservazione.html",
    "valore-aspettazione.html",
    "simmetrizzazione-prodotti.html",
    "teorema-ehrenfest.html",
    "stati-stazionari.html",
    "proprieta-autofunzioni.html",
    "indeterminazione-operatoriale.html",
    "indeterminazione-minima.html",
    "momento-lx-ly-lplus-lminus.html",
    "modello-vettoriale.html",
    "hamiltoniana-relativistica.html",
    "correzioni-hamiltoniane.html",
    "interazione-spin-orbita.html",
    "correzione-darwin.html",
    "teorema-feynman-hellmann.html",
    "perturbazioni-non-degenere.html",
    "effetto-stark.html",
    "variazione-costanti.html",
    "perturbazione-periodica.html",
    "transizioni-continuo.html",
    "vita-invariata.html"
]



# Crea una cartella per i file HTML generati
output_dir = "generated_html"
os.makedirs(output_dir, exist_ok=True)

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
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(base_html_content.format(title=title))

print(f"Generati {len(fileHtml)} file HTML nella cartella '{output_dir}'")
