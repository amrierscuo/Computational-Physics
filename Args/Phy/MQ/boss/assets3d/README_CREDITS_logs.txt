ASSETS 3D (procedurali)
- skybox_clouds_sun_4096x2048.jpg : sky equirettangolare con nuvole e sole
- tex_ground_2048.jpg : texture terreno tileable
- tex_metal_2048.jpg : texture metallo tileable

Creati apposta per il progetto MQ. Uso libero.

====================================================================
COORDINATE COUNTING (RINGS + GRID) — recap con offset lampioni = pi/16
====================================================================

[0] HEADER — LOGICA GENERAZIONE ENVIRONMENT 3D (come è costruito)
-----------------------------------------------------------------
Questo environment 3D è costruito con 3 “famiglie” di posizionamenti:

A) RING (anello) di pilastri + cubi glow decorativi
   - N = 16 elementi
   - R = 24 (raggio)
   - passo angolare = 2*pi/N = 2*pi/16 = pi/8 (22.5°)
   - formula:
       ang = (i/16)*2*pi + offset_pillar   (qui offset_pillar = 0)
       x   = cos(ang)*R
       z   = sin(ang)*R
   - Y (altezza) è separata: non entra nel conteggio angolare

B) RING (anello) di lampioni (con luce reale PointLight)
   - N = 8 elementi
   - R = 18
   - passo angolare = 2*pi/8 = pi/4 (45°)
   - formula:
       ang = (i/8)*2*pi + offset_lamp
       x   = cos(ang)*R
       z   = sin(ang)*R
   - TU hai messo: offset_lamp = pi/16 (11.25°)

C) GRID (griglia) di blocchi DIM 1..18 (6x3)
   - cols = 6, rows = 3, spacing = 6.0
   - startX = -(cols-1)*spacing/2 = -15
   - startZ = -(rows-1)*spacing/2 = -6
   - per i=0..17 (dim = i+1):
       col = i % cols
       row = floor(i/cols)
       x = startX + col*spacing
       z = startZ + row*spacing

Coordinate system (Three.js standard):
  - X: destra/sinistra
  - Y: su/giu
  - Z: avanti/indietro
  - suolo = piano XZ

-----------------------------------------------------------------
[1] PERCHÉ PRIMA SEMBRAVANO “SOVRAPPOSTI” (collinearità radiale)
-----------------------------------------------------------------
Pilastri/cubi: ang_p(i) = i*(pi/8)        (i=0..15)
Lampioni:      ang_l(k) = k*(pi/4)+offset (k=0..7)

SE offset = pi/8 (vecchio):
  ang_l(k) = k*(pi/4)+pi/8
           = (2k+1)*pi/8
=> coincidono ESATTAMENTE con gli angoli dispari del ring a 16:
   i = 1,3,5,7,9,11,13,15

Quindi non erano nello stesso punto (R diversi),
ma erano sulla STESSA DIREZIONE (stesso angolo),
e da dentro l’area sembravano “uno dietro l’altro”.

SE offset = pi/16 (attuale):
  ang_l(k) = k*(pi/4)+pi/16 = (4k+1)*pi/16
=> NON è multiplo di pi/8, quindi non coincide mai con ang_p(i)
   (si sposta di ±11.25° dalle direzioni dei pilastri).

-----------------------------------------------------------------
[2] LAMPIONI — RICALCOLO COORDINATE CON offset = pi/16, R=18, N=8
-----------------------------------------------------------------
Formula:
  ang = (i/8)*2*pi + pi/16 = i*(pi/4) + pi/16
  x = cos(ang)*18
  z = sin(ang)*18

L0: ang=0.196350 rad ( 11.25°)  x= 17.654  z=  3.512
L1: ang=0.981748 rad ( 56.25°)  x= 10.000  z= 14.966
L2: ang=1.767146 rad (101.25°)  x=-3.512  z= 17.654
L3: ang=2.552544 rad (146.25°)  x=-14.966  z= 10.000
L4: ang=3.337942 rad (191.25°)  x=-17.654  z= -3.512
L5: ang=4.123340 rad (236.25°)  x=-10.000  z=-14.966
L6: ang=4.908739 rad (281.25°)  x=  3.512  z=-17.654
L7: ang=5.694137 rad (326.25°)  x= 14.966  z=-10.000

-----------------------------------------------------------------
[3] “CUBI” SUI PILASTRI — COORDINATE (ring N=16, R=24, offset=0)
-----------------------------------------------------------------
Formula:
  ang = (i/16)*2*pi = i*(pi/8)
  x = cos(ang)*24
  z = sin(ang)*24

C00: ang=0.000000 rad (  0.00°)  x= 24.000  z=  0.000
C01: ang=0.392699 rad ( 22.50°)  x= 22.173  z=  9.184
C02: ang=0.785398 rad ( 45.00°)  x= 16.971  z= 16.971
C03: ang=1.178097 rad ( 67.50°)  x=  9.184  z= 22.173
C04: ang=1.570796 rad ( 90.00°)  x=  0.000  z= 24.000
C05: ang=1.963495 rad (112.50°)  x= -9.184  z= 22.173
C06: ang=2.356194 rad (135.00°)  x=-16.971  z= 16.971
C07: ang=2.748894 rad (157.50°)  x=-22.173  z=  9.184
C08: ang=3.141593 rad (180.00°)  x=-24.000  z=  0.000
C09: ang=3.534292 rad (202.50°)  x=-22.173  z= -9.184
C10: ang=3.926991 rad (225.00°)  x=-16.971  z=-16.971
C11: ang=4.319690 rad (247.50°)  x= -9.184  z=-22.173
C12: ang=4.712389 rad (270.00°)  x=  0.000  z=-24.000
C13: ang=5.105088 rad (292.50°)  x=  9.184  z=-22.173
C14: ang=5.497787 rad (315.00°)  x= 16.971  z=-16.971
C15: ang=5.890486 rad (337.50°)  x= 22.173  z= -9.184

NOTA “collinearità vecchia” (offset lamp=pi/8):
- i pilastri collineari ai lampioni erano gli INDICI DISPARI:
  C01, C03, C05, C07, C09, C11, C13, C15

-----------------------------------------------------------------
[4] BLOCCHI DIM (GRID 6x3) — COORDINATE XZ (DIM 1..18)
-----------------------------------------------------------------
Parametri:
  cols=6 rows=3 spacing=6
  startX=-15 startZ=-6

DIM01: row=0 col=0  x=-15.000  z= -6.000
DIM02: row=0 col=1  x= -9.000  z= -6.000
DIM03: row=0 col=2  x= -3.000  z= -6.000
DIM04: row=0 col=3  x=  3.000  z= -6.000
DIM05: row=0 col=4  x=  9.000  z= -6.000
DIM06: row=0 col=5  x= 15.000  z= -6.000

DIM07: row=1 col=0  x=-15.000  z=  0.000
DIM08: row=1 col=1  x= -9.000  z=  0.000
DIM09: row=1 col=2  x= -3.000  z=  0.000
DIM10: row=1 col=3  x=  3.000  z=  0.000
DIM11: row=1 col=4  x=  9.000  z=  0.000
DIM12: row=1 col=5  x= 15.000  z=  0.000

DIM13: row=2 col=0  x=-15.000  z=  6.000
DIM14: row=2 col=1  x= -9.000  z=  6.000
DIM15: row=2 col=2  x= -3.000  z=  6.000
DIM16: row=2 col=3  x=  3.000  z=  6.000
DIM17: row=2 col=4  x=  9.000  z=  6.000
DIM18: row=2 col=5  x= 15.000  z=  6.000

I 4 corner della GRID (se ti servono):
  DIM01 (-15,-6), DIM06 (15,-6), DIM13 (-15,6), DIM18 (15,6)

-----------------------------------------------------------------
[5] DOVE METTERE “DIM 0” SENZA COLLISIONI (manca nel mondo)
-----------------------------------------------------------------
Contesto: nel codice DIM 0 è in inventario (BOSS_DIMS include id=0),
ma NON è tra i blocchi world (DIM_BLOCKS è 1..18).
Quindi “manca” come oggetto fisico.

Regola per ZERO collisioni:
  - NON aggiungere DIM0 in colliders[] (collision list)
  - puoi comunque renderizzarlo e renderlo selezionabile via raycast

3 posizioni consigliate (libere e pulite):
A) Centro scena, FLOATING (consigliato)
   - XZ = (0,0) (tra i blocchi centrali), Y alto per non “tagliare” visivamente
   - es: pos = (0, 6.8, 0)  (stile “bonus orbitale”)
   - collisioni: nessuna se NON lo metti nei colliders

B) Inner ring “vuoto” tra grid e lampioni
   - scegli R~12 e un angolo non usato da grid
   - es: pos = (12, 2.0, 0) oppure (0, 2.0, 12)
   - collisioni: nessuna se NON lo metti nei colliders

C) Sopra un pilastro (solo label/sprite)
   - aggancia un label sprite “DIM0” sopra un punto già decorativo
   - collisioni: nessuna (sprite non colliderebbe)

NOTA PRATICA:
- Se vuoi DIM0 cliccabile ma non collidibile:
  -> aggiungilo a blocks[] (per raycast / focus / interazione)
  -> NON aggiungerlo a colliders[].

-----------------------------------------------------------------
[6] OFFLINE (senza internet) — come farlo funzionare in caso
-----------------------------------------------------------------
Questo file usa librerie da CDN (Three.js, KaTeX). Per OFFLINE:

1) Scarica localmente:
   - three.min.js
   - katex.min.css + katex.min.js (+ auto-render se usato)
2) Metti tutto in una cartella tipo:
   /vendor/three.min.js
   /vendor/katex/...
3) Cambia gli <script src="https://..."> e <link href="https://...">
   in percorsi relativi locali (./vendor/...).

4) Avvia SEMPRE un server locale (consigliato):
   - python -m http.server
   Motivo: file:// può bloccare fetch/texture/audio per CORS.

Le coordinate (ring/grid) sono indipendenti dal caricamento asset:
- puoi sviluppare la geometria anche se texture/audio non caricano.

====================================================================
END
====================================================================
