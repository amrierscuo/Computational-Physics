import numpy as np
import scipy.integrate
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib import animation

# Definizione dei parametri per time_span
tempo_iniziale = 0
tempo_finale = 100
numero_punti_temporali = 10000

# Definizione di time_span utilizzando i parametri
time_span = np.linspace(tempo_iniziale, tempo_finale, numero_punti_temporali)

# Costanti
G = 6.67408e-11  # Costante di gravitazione universale
m_nd = 1.989e+30  # Massa del sole, kg
r_nd = 5.326e+12  # Distanza  esempio tra le stelle in Alpha Centauri, m
v_nd = 30000  # Velocità relativa della Terra intorno al sole, m/s
t_nd = 79.91 * 365 * 24 * 3600 * 0.51  # Periodo orbitale di Alpha Centauri
K1 = G * t_nd * m_nd / (r_nd**2 * v_nd)
K2 = v_nd * t_nd / r_nd

# Velocità dell'animazione
v_animazione = 1

# Masse
m1, m2, m3 = 1.989, 1.989, 1.989  # Masse senza u.m.
# Masse planetarie
m4 = m5 = m6 = 1.989e+30  # Massa solare
###############################  simil~Euler
# Segue condizioni iniziali di alpha centauri con una massa aggiunta, 2 masse orbitano verso l'infinito la terza fa il giro poi si annodano stabilmente
# r1, r2, r3 = np.array([-0.5, 0, 0]), np.array([0.5, 0, 0]), np.array([0, 1, 0])
# v1, v2, v3 = np.array([0.01, 0.01, 0]), np.array([-0.05, 0, -0.1]), np.array([0, -0.01, 0])
# Posizioni a logica simmetrica,fan 3 nodi e degli scambi poi 2 orbitano verso l'infinito e 1 isolato va verso l'infinito
# r1, r2, r3 = np.array([0.5, 0, 0]), np.array([-0.5, 0, 0]), np.array([0, -1, 0])
# v1, v2, v3 = np.array([-0.01, 0.01, 0]), np.array([0.05, 0, 0.1]), np.array([0, 0.01, 0])
# Posiziona i corpi su un piano e distribuisce le velocità in modo che il terzo corpo mantenga una posizione più centrale rispetto agli altri due, curva 2 orb + 1 isolata come gli altri 
# r1, r2, r3 = np.array([-0.5, 0, 0]), np.array([0.5, 0, 0]), np.array([0, 1, 0])
# v1, v2, v3 = np.array([0.01, 0.01, 0]), np.array([-0.02, 0, -0.04]), np.array([0, -0.01, 0])

################################ Lagrange
# Posizioni a triangolo equilatero e velocità iniziali(nulle) , si scontrano perfettamente al centro tutti e 3
# r1, v1 = np.array([1, 0, 0]), np.array([0, 0, 0])
# r2, v2 = np.array([-0.5, np.sqrt(3)/2, 0]), np.array([0, 0, 0])
# r3, v3 = np.array([-0.5, -np.sqrt(3)/2, 0]), np.array([0, 0, 0])
# Posizioni a triangolo equilatero e velocità iniziali(verso il centro), si scontrano perfettamente al centro tutti e 3
# r1, v1 = np.array([1, 0, 0]), np.array([-0.1, 0, 0])
# r2, v2 = np.array([-0.5, np.sqrt(3)/2, 0]), np.array([0, -0.1, 0])
# r3, v3 = np.array([-0.5, -np.sqrt(3)/2, 0]), np.array([0, 0.1, 0])
# Posizioni a triangolo isoscele e velocità iniziali(ortogonali) , buono fino a 3k passi poi vanno 2 in orbita verso l'infinito e uno isolato verso l'infinito
r1, v1 = np.array([1, 0, 0]), np.array([0, 0.1, 0])
r2, v2 = np.array([0, 1, 0]), np.array([0, 0, 0])
r3, v3 = np.array([0, -1, 0]), np.array([0, -0.1, 0])

def EquazioniTreCorpi(w, t, G, m1, m2, m3):
    r1, r2, r3 = w[:3], w[3:6], w[6:9]
    v1, v2, v3 = w[9:12], w[12:15], w[15:18]
    r12 = np.linalg.norm(r2 - r1)
    r13 = np.linalg.norm(r3 - r1)
    r23 = np.linalg.norm(r3 - r2)
    
    dv1bydt = K1 * m2 * (r2 - r1) / r12**3 + K1 * m3 * (r3 - r1) / r13**3
    dv2bydt = K1 * m1 * (r1 - r2) / r12**3 + K1 * m3 * (r3 - r2) / r23**3
    dv3bydt = K1 * m1 * (r1 - r3) / r13**3 + K1 * m2 * (r2 - r3) / r23**3
    dr1bydt = K2 * v1
    dr2bydt = K2 * v2
    dr3bydt = K2 * v3
    derivs = np.concatenate([dr1bydt, dr2bydt, dr3bydt, dv1bydt, dv2bydt, dv3bydt])
    return derivs

# Risoluzione delle equazioni
init_params = np.concatenate([r1, r2, r3, v1, v2, v3])
soluzione = scipy.integrate.odeint(EquazioniTreCorpi, init_params, time_span, args=(G, m1, m2, m3))

# Estrazione delle soluzioni
r1_sol = soluzione[:, :3]
r2_sol = soluzione[:, 3:6]
r3_sol = soluzione[:, 6:9]

# Preparazione dell'animazione
fig = plt.figure(figsize=(12, 12))  # Aumentato il valore della dimensione della figura
ax = fig.add_subplot(111, projection='3d')
# Impostazione angolo di vista
ax.view_init(elev=8, azim=-60, roll=0)

# Inizializzazione linee e punti per l'animazione
lines = [ax.plot([], [], [], '-', color="darkblue")[0],
         ax.plot([], [], [], '-', color="tab:red")[0],
         ax.plot([], [], [], '-', color="magenta")[0]]  # Cambiato il colore giallo in magenta
points = [ax.plot([], [], [], 'o', color="darkblue")[0],
          ax.plot([], [], [], 'o', color="tab:red")[0],
          ax.plot([], [], [], 'o', color="magenta")[0]]  

# Limiti e label del plot
dim = 10
ax.set_xlim(-dim, dim)  # Ingranditi gli assi di dim volte
ax.set_ylim(-dim, dim) 
ax.set_zlim(-dim, dim) 
ax.set_xlabel("X")
ax.set_ylabel("Y")
ax.set_zlabel("Z")
ax.set_title("Simulazione Problema dei Tre Corpi")

# Visualizzazione delle condizioni iniziali e aggiornamento delle posizioni correnti
init_text = ax.text2D(0.01, 0.99, '', transform=ax.transAxes, verticalalignment='top', fontsize=6)
pos_texts = [
    ax.text2D(0.99, 0.92, '', transform=ax.transAxes, verticalalignment='top', horizontalalignment='right', color="darkblue", fontsize=6),
    ax.text2D(0.99, 0.89, '', transform=ax.transAxes, verticalalignment='top', horizontalalignment='right', color="tab:red", fontsize=6),
    ax.text2D(0.99, 0.86, '', transform=ax.transAxes, verticalalignment='top', horizontalalignment='right', color="magenta", fontsize=6)  
]

# Testo per il numero di punti temporali
num_points_text = ax.text2D(0.01, 0.86, f'Punti temporali: {numero_punti_temporali}', transform=ax.transAxes, verticalalignment='top', fontsize=6)

# Uniamo il testo dell'intervallo con il testo delle posizioni
interval_text = ax.text2D(0.99, 0.82, f'[Velocità animazione]: {v_animazione} ms', transform=ax.transAxes, verticalalignment='top', horizontalalignment='right', fontsize=3.8)

# Aggiornamento delle posizioni
def update(num, r1_sol, r2_sol, r3_sol, lines, points, pos_texts):
    for line, point, r_sol, pos_text in zip(lines, points, [r1_sol, r2_sol, r3_sol], pos_texts):
        line.set_data(r_sol[:num+1, 0:2].T)
        line.set_3d_properties(r_sol[:num+1, 2])
        point.set_data(r_sol[num, 0:2].T)
        point.set_3d_properties(r_sol[num, 2])
        pos_text.set_text(f'Pos: {np.round(r_sol[num], 2).tolist()}')
    num_points_text.set_text(f'Punti temporali: {num+1}')  # Aggiorna il numero di punti temporali durante l'animazione
    return lines + points + [num_points_text]

# Creazione dell'animazione
ani = animation.FuncAnimation(fig, update, frames=len(time_span), fargs=(r1_sol, r2_sol, r3_sol, lines, points, pos_texts),
                              interval=v_animazione, blit=False)

plt.show()
