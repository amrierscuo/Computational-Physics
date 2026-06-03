from pathlib import Path
from io import BytesIO
from PIL import Image, ImageOps
import sys

# =========================
# Configurazione
# =========================
OUTPUT_PDF = "Esercizi_Struttura_Libro.pdf"
OUTPUT_COMPRESSED_PDF = "Esercizi_Struttura_Libro_compressed.pdf"

# Parametri compressione PDF "light"
COMPRESSED_MAX_SIDE = 1600   # lato massimo in pixel
COMPRESSED_JPEG_QUALITY = 50 # 1-95
# =========================


def natural_key(path: Path):
    """
    Ordina 1.jpg, 2.jpg, 10.jpg nel modo corretto.
    """
    try:
        return int(path.stem)
    except ValueError:
        return path.stem.lower()


def load_image_for_pdf(img_path: Path) -> Image.Image:
    """
    Apre immagine, corregge orientamento EXIF, converte in RGB.
    """
    with Image.open(img_path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGB")
        else:
            im = im.copy()
    return im


def make_compressed_version(im: Image.Image) -> Image.Image:
    """
    Crea una versione compressa:
    - riduce il lato massimo
    - ricomprime in JPEG
    - riapre l'immagine compressa per salvarla nel PDF
    """
    im = im.copy()

    w, h = im.size
    max_side = max(w, h)

    if max_side > COMPRESSED_MAX_SIDE:
        scale = COMPRESSED_MAX_SIDE / max_side
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        im = im.resize(new_size, Image.LANCZOS)

    buffer = BytesIO()
    im.save(
        buffer,
        format="JPEG",
        quality=COMPRESSED_JPEG_QUALITY,
        optimize=True
    )
    buffer.seek(0)

    with Image.open(buffer) as compressed_im:
        if compressed_im.mode != "RGB":
            compressed_im = compressed_im.convert("RGB")
        else:
            compressed_im = compressed_im.copy()

    return compressed_im


def save_pdf(images, output_path: Path):
    if not images:
        raise ValueError("Nessuna immagine da salvare nel PDF.")

    first, rest = images[0], images[1:]
    first.save(
        output_path,
        save_all=True,
        append_images=rest
    )


def main():
    root = Path(__file__).resolve().parent

    image_files = sorted(
        [
            p for p in root.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg"}
        ],
        key=natural_key
    )

    if not image_files:
        print("Nessun file JPG/JPEG trovato nella cartella.")
        sys.exit(1)

    print(f"Trovate {len(image_files)} immagini.")
    print("Ordine usato:")
    for p in image_files:
        print(f" - {p.name}")

    # PDF normale
    normal_images = []
    for p in image_files:
        normal_images.append(load_image_for_pdf(p))

    output_pdf = root / OUTPUT_PDF
    save_pdf(normal_images, output_pdf)
    print(f"\nCreato: {output_pdf.name}")

    # PDF compresso
    compressed_images = []
    for p in image_files:
        original = load_image_for_pdf(p)
        compressed = make_compressed_version(original)
        compressed_images.append(compressed)
        original.close()

    output_compressed_pdf = root / OUTPUT_COMPRESSED_PDF
    save_pdf(compressed_images, output_compressed_pdf)
    print(f"Creato: {output_compressed_pdf.name}")

    # Chiusura immagini
    for im in normal_images:
        im.close()
    for im in compressed_images:
        im.close()

    print("\nFatto.")


if __name__ == "__main__":
    main()