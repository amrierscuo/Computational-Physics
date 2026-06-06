window.FDSDM_DATA = {
  i18n: {
    it: {
      "menu.title": "FDSDM Matter Game",
      "menu.subtitle": "Tre mappe interattive, 36 livelli e stanze 3D FPS con timer da 10 minuti.",
      "menu.start": "Avvia da Atomic",
      "menu.continue": "Continua",
      "menu.export": "Esporta save",
      "menu.import": "Importa save",
      "level.exit": "Esci alla mappa",
      "level.completeTask": "Completa terminale",
      "world.atomic.desc": "L01–L13 · atomi, radiazione, laser, multi-elettronici",
      "world.molecular.desc": "L14–L20 · moti nucleari e struttura elettronica molecolare",
      "world.crystal.desc": "L21–L36 · solidi, fononi, bande, semiconduttori",
      "panel.markDone": "Segna completato",
      "panel.enter": "Entra nel portale",
      "status.done": "completato",
      "status.todo": "da studiare",
      "status.stat": "statistical current",
      "panel.prototype": "V4: entra in una stanza 3D first-person. L01 ha contenuto demo; L02-L36 hanno logica costruibile vuota ma completa."
    },
    en: {
      "menu.title": "FDSDM Matter Game",
      "menu.subtitle": "Three interactive maps, 36 FPS-ready levels and a 10-minute timer.",
      "menu.start": "Start from Atomic",
      "menu.continue": "Continue",
      "menu.export": "Export save",
      "menu.import": "Import save",
      "level.exit": "Back to map",
      "level.completeTask": "Complete terminal",
      "world.atomic.desc": "L01–L13 · atoms, radiation, laser, multi-electron systems",
      "world.molecular.desc": "L14–L20 · nuclear motion and molecular electronic structure",
      "world.crystal.desc": "L21–L36 · solids, phonons, bands, semiconductors",
      "panel.markDone": "Mark completed",
      "panel.enter": "Enter portal",
      "status.done": "completed",
      "status.todo": "to study",
      "status.stat": "statistical current",
      "panel.prototype": "V4: enter a first-person 3D chamber. L01 has demo content; L02-L36 have complete empty build logic."
    }
  },

  audio: {
    music: { file: "assets/audio/qm_ambient_3d.mp3", meaning: "QM first-person chamber ambient loop" },
    glitch: { file: "assets/audio/glitch-transition.mp3", meaning: "glitch slice for portals, errors, collisions" },
    walk: { file: "assets/audio/walk-concrete.mp3", meaning: "movement-only walking loop for first-person rooms" },
    menu: { file: "assets/audio/library/menu-theme.mp3", meaning: "menu / world select candidate" },
    atomic: { file: "assets/audio/library/atomic-map-theme.mp3", meaning: "Atomic map loop candidate" },
    molecular: { file: "assets/audio/library/molecular-map-theme.mp3", meaning: "Molecular map loop candidate" },
    crystal: { file: "assets/audio/library/crystal-map-theme.mp3", meaning: "Crystal map loop candidate" },
    transition: { file: "assets/audio/library/transition-pulse.mp3", meaning: "future transition pulse candidate" },
    boss: { file: "assets/audio/library/boss-dark-theme.mp3", meaning: "boss / final gate candidate" }
  },
  worlds: {
    atomic: {
      id: "atomic", index: "World 01", title: "Atomic Map", map: "assets/maps/atomic-map.png",
      color: "#48b9ff", accent: "#ff5a7d", range: [1, 13]
    },
    molecular: {
      id: "molecular", index: "World 02", title: "Molecular Map", map: "assets/maps/molecular-map.png",
      color: "#34ffd4", accent: "#a56bff", range: [14, 20]
    },
    crystal: {
      id: "crystal", index: "World 03", title: "Crystal Map", map: "assets/maps/crystal-map.png",
      color: "#3dffd1", accent: "#7c5cff", range: [21, 36]
    }
  },
  lessons: [
    {id:1, world:"atomic", x:7.0, y:48.0, title:{it:"Tutorial Gate / Hydrogen Gate", en:"Tutorial Gate / Hydrogen Gate"}, date:"2026-03-03", time:"11-13", section:"Atomi idrogenoidi", tags:["Hydrogen", "orbitals"]},
    {id:2, world:"atomic", x:16.8, y:52.2, title:{it:"Orbital Path A", en:"Orbital Path A"}, date:"2026-03-05", time:"09-11", section:"Orbitali atomici", tags:["Orbitals"]},
    {id:3, world:"atomic", x:17.7, y:70.5, title:{it:"Orbital Path B", en:"Orbital Path B"}, date:"2026-03-06", time:"09-11", section:"Orbitali atomici", tags:["Orbitals"]},
    {id:4, world:"atomic", x:27.7, y:57.2, title:{it:"Spin Tower", en:"Spin Tower"}, date:"2026-03-10", time:"11-13", section:"Spin e momenti magnetici", tags:["Spin", "Zeeman"]},
    {id:5, world:"atomic", x:39.0, y:38.1, title:{it:"Radiation Gate A", en:"Radiation Gate A"}, date:"2026-03-12", time:"09-11", section:"Interazione radiazione-materia", tags:["Radiation"], stat:true},
    {id:6, world:"atomic", x:38.9, y:62.6, title:{it:"Radiation Gate B", en:"Radiation Gate B"}, date:"2026-03-12", time:"11-13", section:"Coefficienti di Einstein", tags:["Einstein", "Laser"], stat:true},
    {id:7, world:"atomic", x:49.1, y:62.0, title:{it:"Einstein Bridge", en:"Einstein Bridge"}, date:"2026-03-17", time:"11-13", section:"Coefficienti di Einstein", tags:["Einstein"]},
    {id:8, world:"atomic", x:57.0, y:61.0, title:{it:"Laser Shrine", en:"Laser Shrine"}, date:"2026-03-19", time:"09-11", section:"LASER", tags:["Laser"]},
    {id:9, world:"atomic", x:67.3, y:56.5, title:{it:"Multi-Electron Entrance", en:"Multi-Electron Entrance"}, date:"2026-03-20", time:"09-11", section:"Atomi multi-elettronici", tags:["Many-electron"]},
    {id:10, world:"atomic", x:73.5, y:68.2, title:{it:"Helium / Alkali Node", en:"Helium / Alkali Node"}, date:"2026-03-24", time:"11-13", section:"Elio e alcalini", tags:["Helium"]},
    {id:11, world:"atomic", x:74.6, y:43.8, title:{it:"Central Field Hill", en:"Central Field Hill"}, date:"2026-03-26", time:"09-11", section:"Campo centrale", tags:["Central field"]},
    {id:12, world:"atomic", x:83.0, y:76.2, title:{it:"Periodic Table Road", en:"Periodic Table Road"}, date:"2026-03-27", time:"09-11", section:"Sistema periodico", tags:["Periodic table"]},
    {id:13, world:"atomic", x:89.5, y:47.0, title:{it:"Atomic Boss", en:"Atomic Boss"}, date:"2026-03-31", time:"16:30-18:30", section:"Atomic recap", tags:["Boss", "unusual time"], boss:true},

    {id:14, world:"molecular", x:11.8, y:42.0, title:{it:"Born-Oppenheimer Bridge", en:"Born-Oppenheimer Bridge"}, date:"2026-04-09", time:"09-11", section:"Moti nucleari", tags:["Born-Oppenheimer"]},
    {id:15, world:"molecular", x:25.0, y:60.0, title:{it:"Rotation Garden", en:"Rotation Garden"}, date:"2026-04-10", time:"09-11", section:"Rotazioni", tags:["Rotations"]},
    {id:16, world:"molecular", x:40.0, y:49.0, title:{it:"Vibration Cave", en:"Vibration Cave"}, date:"2026-04-13", time:"09-11", section:"Vibrazioni", tags:["Vibrations"]},
    {id:17, world:"molecular", x:53.0, y:38.0, title:{it:"Molecular Orbital Gate", en:"Molecular Orbital Gate"}, date:"2026-04-14", time:"11-13", section:"Orbitali molecolari", tags:["MO"]},
    {id:18, world:"molecular", x:51.5, y:70.0, title:{it:"Electronic Structure Path", en:"Electronic Structure Path"}, date:"2026-04-16", time:"09-11", section:"Struttura elettronica", tags:["Electronic structure"]},
    {id:19, world:"molecular", x:70.5, y:50.0, title:{it:"Huckel / Hybridization Tower", en:"Huckel / Hybridization Tower"}, date:"2026-04-17", time:"09-11", section:"Huckel e ibridazione", tags:["Huckel", "Hybridization"]},
    {id:20, world:"molecular", x:88.2, y:53.0, title:{it:"Franck-Condon Boss", en:"Franck-Condon Boss"}, date:"2026-04-21", time:"11-13", section:"Franck-Condon", tags:["Boss", "Franck-Condon"], boss:true},

    {id:21, world:"crystal", x:4.7, y:58.6, title:{it:"Crystal Entrance", en:"Crystal Entrance"}, date:"2026-04-23", time:"09-11", section:"Solidi e cristalli", tags:["Crystal"]},
    {id:22, world:"crystal", x:11.7, y:43.0, title:{it:"Lattice Road", en:"Lattice Road"}, date:"2026-04-24", time:"09-11", section:"Reticoli", tags:["Lattice"]},
    {id:23, world:"crystal", x:16.0, y:25.0, title:{it:"Crystallography Tower", en:"Crystallography Tower"}, date:"2026-04-28", time:"11-13", section:"Cristallografia", tags:["Crystallography"]},
    {id:24, world:"crystal", x:25.5, y:39.0, title:{it:"Defect Gate", en:"Defect Gate"}, date:"2026-04-30", time:"09-11", section:"Difetti", tags:["Defects"]},
    {id:25, world:"crystal", x:30.2, y:60.5, title:{it:"Phonon Mines Entrance", en:"Phonon Mines Entrance"}, date:"2026-05-05", time:"11-13", section:"Dinamica reticolare", tags:["Phonons"], stat:true},
    {id:26, world:"crystal", x:37.0, y:40.0, title:{it:"Phonon Node A", en:"Phonon Node A"}, date:"2026-05-07", time:"09-11", section:"Fononi", tags:["Phonons"], stat:true},
    {id:27, world:"crystal", x:49.0, y:42.0, title:{it:"Phonon Node B", en:"Phonon Node B"}, date:"2026-05-07", time:"11-13", section:"Fononi", tags:["Phonons"], stat:true},
    {id:28, world:"crystal", x:34.0, y:63.0, title:{it:"Specific Heat Bridge", en:"Specific Heat Bridge"}, date:"2026-05-12", time:"11-13", section:"Calori specifici", tags:["Specific heat"], stat:true},
    {id:29, world:"crystal", x:49.8, y:80.0, title:{it:"Thermal Transport Gate", en:"Thermal Transport Gate"}, date:"2026-05-14", time:"09-11", section:"Trasporto di calore", tags:["Thermal transport"], stat:true},
    {id:30, world:"crystal", x:58.8, y:78.0, title:{it:"Thermal Boss / Transition Gate", en:"Thermal Boss / Transition Gate"}, date:"2026-05-15", time:"09-11", section:"Transizione elettronica", tags:["Thermal boss"]},
    {id:31, world:"crystal", x:58.4, y:31.2, title:{it:"Free Electron Gas Gate", en:"Free Electron Gas Gate"}, date:"2026-05-19", time:"11-13", section:"Gas elettroni liberi", tags:["Free electron gas"], stat:true},
    {id:32, world:"crystal", x:66.0, y:41.0, title:{it:"Bloch Road", en:"Bloch Road"}, date:"2026-05-21", time:"09-11", section:"Teorema di Bloch", tags:["Bloch"]},
    {id:33, world:"crystal", x:73.0, y:31.0, title:{it:"Kronig-Penney Tower", en:"Kronig-Penney Tower"}, date:"2026-05-22", time:"09-11", section:"Kronig-Penney", tags:["Kronig-Penney"]},
    {id:34, world:"crystal", x:70.0, y:60.0, title:{it:"Band Model Bridge", en:"Band Model Bridge"}, date:"2026-05-26", time:"11-13", section:"Modello a bande", tags:["Band model"]},
    {id:35, world:"crystal", x:84.0, y:64.0, title:{it:"Semiconductor Fortress", en:"Semiconductor Fortress"}, date:"2026-05-27", time:"09-11", section:"Semiconduttori", tags:["Semiconductors"]},
    {id:36, world:"crystal", x:93.0, y:31.0, title:{it:"Final Oral Gate", en:"Final Oral Gate"}, date:"2026-05-29", time:"09-11", section:"Boss finale", tags:["Final", "Boss"], boss:true}
  ]
};
