
  (function(){
    "use strict";

    // =========================
    // Data (TIMELINE from tree)
    // =========================

    function r(a,b){
      const out = [];
      for(let i=a;i<=b;i++) out.push(i);
      return out;
    }


    const PDF_URL = 'Meccanica Quantistica.pdf'; // rinomina pure (es: mq.pdf) e aggiorna qui
    const PDF_LAST_PAGE = 77;

    // Indice (come nel PDF)
    const PDF_TOC = [
      { num:'0', title:"LIMITI DELLA FISICA CLASSICA", page:2 },
      { num:'1', title:"MECCANICA ONDULATORIA", page:5 },
      { num:'1.1', title:"Pacchetto d'onda", page:7 },
      { num:'1.2', title:"Equazione di Schroedinger", page:9 },
      { num:'1.2b', title:"Valori di aspettazione", page:12 },
      { num:'1.3', title:"Schroedinger in sistemi conservativi", page:15 },
      { num:'1.4', title:"Problemi unidimensionali", page:18 },
      { num:'2', title:"FORMALISMO MATEMATICO", page:29 },
      { num:'2.1', title:"Trasformazioni Unitarie", page:31 },
      { num:'2.2', title:"Oscillatore armonico rivisitato", page:33 },
      { num:'2.3', title:"Postulati della Meccanica Quantistica", page:35 },
      { num:'2.4', title:"Osservabili compatibili", page:38 },
      { num:'3', title:"MOMENTO ANGOLARE", page:40 },
      { num:'3.1', title:"Armoniche Sferiche", page:42 },
      { num:'3.2', title:"Momento angolare totale", page:44 },
      { num:'3.3', title:"Simmetrie e leggi di conservazione", page:47 },
      { num:'3.4', title:"Prodotto diretto", page:49 },
      { num:'3.5', title:"Potenziale centrale", page:51 },
      { num:'4', title:"SPIN", page:54 },
      { num:'4.1', title:"Rappresentazioni matriciali", page:56 },
      { num:'4.2', title:"Composizione dei momenti angolari", page:59 },
      { num:'4.3', title:"Particelle identiche", page:62 },
      { num:'5', title:"TEORIA DELLE PERTURBAZIONI", page:64 },
      { num:'5.1', title:"Struttura fine dell'atomo di H", page:67 },
      { num:'5.2', title:"Perturbazioni dipendenti dal tempo", page:72 },
      { num:'5.2b', title:"Relazione tempo-energia", page:75 }
    ];

    // TIMELINE generata dall'indice: ogni voce -> range pagine fino alla prossima voce
    const TIMELINE = PDF_TOC.map((it, idx) => {
      const start = it.page;
      const end = (PDF_TOC[idx+1] ? (PDF_TOC[idx+1].page - 1) : PDF_LAST_PAGE);
      const chapter = parseInt(String(it.num).split('.')[0], 10);
      const part = (chapter <= 2) ? 'P1' : 'P2';
      const safe = String(it.num).replace(/[^a-z0-9]+/ig, '-');
      return {
        id: `mq-${safe}`,
        part,
        key: it.num,
        title: `${it.num} - ${it.title}`,
        subtitle: '',
        path: `Meccanica Quantistica (PDF) - ${it.num} - ${it.title}`,
        pages: `${start}-${end}`,
        files: r(start, end), // qui "files" = numeri pagina PDF
      };
    });

    // -----------------------------
    // PDF.js helpers (render PDF page -> <img src="blob:...">)
    // -----------------------------
    const PDFJS_VERSION = '3.11.174';
    const PDFJS_WORKER_SRC = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

    const THUMB_SCALE = 0.32;   // thumbnails
    const VIEW_SCALE  = 2.00;   // viewer (qualita' alta, ma 1 pagina alla volta)

    // Placeholder 1x1 (evita glitch mentre la pagina PDF viene renderizzata)
    const TINY_BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

    function getPdfjs(){
      const lib = window.pdfjsLib;
      if(!lib){
        throw new Error('pdfjsLib non caricato: includi pdf.min.js prima di game_ale.js');
      }
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      return lib;
    }

    let PDF_DOC_PROMISE = null;

    function getPdfDoc(){
      if(!PDF_DOC_PROMISE){
        const lib = getPdfjs();
        const url = encodeURI(PDF_URL);
        PDF_DOC_PROMISE = lib.getDocument(url).promise;
      }
      return PDF_DOC_PROMISE;
    }

    const IMG_CACHE = new Map();
    const IMG_CACHE_MAX = 120;

    function cachePut(key, url){
      IMG_CACHE.set(key, url);
      if(IMG_CACHE.size <= IMG_CACHE_MAX) return;
      const firstKey = IMG_CACHE.keys().next().value;
      const firstUrl = IMG_CACHE.get(firstKey);
      if(firstUrl && typeof firstUrl === 'string' && firstUrl.startsWith('blob:')){
        try{ URL.revokeObjectURL(firstUrl); }catch(e){}
      }
      IMG_CACHE.delete(firstKey);
    }

    function quantizeScale(s){
      // per cache migliore (evita 2.00000001 ecc.)
      return Math.round(s * 100) / 100;
    }

    async function pdfPageToImgUrl(pageNum, scale){
      const sc = quantizeScale(scale);
      const key = `p${pageNum}@${sc}`;
      if(IMG_CACHE.has(key)) return IMG_CACHE.get(key);

      const doc = await getPdfDoc();
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: sc });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha:false });

      canvas.width  = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise((resolve)=> canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if(!blob){
        const dataUrl = canvas.toDataURL('image/png');
        cachePut(key, dataUrl);
        return dataUrl;
      }

      const url = URL.createObjectURL(blob);
      cachePut(key, url);
      return url;
    }

    // thumbnails lazy-load
    let thumbReqId = 0;
    async function loadThumbImage(imgEl){
      if(!imgEl || imgEl.dataset.loaded === '1') return;
      const page = parseInt(imgEl.dataset.page || '0', 10);
      if(!page) return;

      imgEl.dataset.loaded = '1';
      const req = String(++thumbReqId);
      imgEl.dataset.req = req;

      try{
        const scale = parseFloat(imgEl.dataset.scale || String(THUMB_SCALE));
        const url = await pdfPageToImgUrl(page, scale);
        if(imgEl.isConnected && imgEl.dataset.req === req){
          imgEl.src = url;
        }
      }catch(err){
        // lascia placeholder
      }
    }



    const TOTAL_BLOCKS = TIMELINE.length;

    // =========================
    // Glossary (minimal but useful)
    // =========================

    const GLOSSARY = [
      { term:'Ehrenfest', desc:'Relazione tra evoluzione quantistica e valori medi (ponte con la classica).', see:['p1-06'] },
      { term:'Continuità', desc:'Equazione di continuità e densità/corrente di probabilità.', see:['p1-04'] },
      { term:'Indeterminazione', desc:'ΔxΔp e limiti di misura. Collegato a commutatori.', see:['p1-15','p1-16'] },
      { term:'Barriera/Step', desc:'Riflessione/trasmissione in 1D e analogie ottiche.', see:['p1-09'] },
      { term:'Operatori', desc:'Notazione operatoriale, matrici e postulati.', see:['p1-12','p1-13'] },
      { term:'Osservabili compatibili', desc:'Commutazione, misure simultanee e base comune.', see:['p1-14a'] },
      { term:'Momento angolare', desc:'Operatori L, armoniche sferiche, base |l,m⟩.', see:['p1-17a','p1-17b'] },
      { term:'Coulomb / Kummer', desc:'Soluzione del problema idrogenoide e funzioni speciali.', see:['p1-20b'] },
      { term:'Stern-Gerlach', desc:'Quantizzazione dello spin e misura discreta.', see:['p1-21b'] },
      { term:'Particelle identiche', desc:'Simmetrizzazione (bosoni/fermioni), stati multipli.', see:['p2-24'] },
      { term:'Perturbazioni staz.', desc:'Degeneri e non degeneri.', see:['p2-25a','p2-25b'] },
      { term:'TPDT', desc:'Perturbazioni dipendenti dal tempo, transizioni e casi limite.', see:['p2-28a','p2-28b','p2-28c'] },
    ];

    // =========================
    // Tracks / Jukebox
    // =========================

    const TRACKS = [
      { id:'t1', label:'I) Quantum Warmup',    file:'audio/music-201745.mp3', unlockBlocks: 2,  requiresEgg:false },
      { id:'t2', label:'II) Symmetry Engine',  file:'audio/music-423648.mp3', unlockBlocks: 8,  requiresEgg:false },
      { id:'t3', label:'III) Operator Groove', file:'audio/music-417477.mp3', unlockBlocks: 16, requiresEgg:false },
      { id:'t4', label:'IV) The Hidden Eigenbeat', file:'audio/music-467173.mp3', unlockBlocks: 24, requiresEgg:false },
      // Easter egg: sbloccabile solo dopo le prime 4 + egg
      { id:'t5', label:'V) Wavepacket Ride (Easter Egg)', file:'audio/music-bounce-on-it-184234.mp3', unlockBlocks: 999, requiresEgg:true },
      // Boss reward (si sblocca dopo aver completato TUTTE le DIM della bossfight)
      // Nota: nel pacchetto zip includiamo un placeholder; puoi sostituirlo con il tuo file reale.
      { id:'t6', label:'VI) Classical Pack (Endgame)', file:'audio/classical-pack-v1.mp3', unlockBlocks: 999, requiresEgg:false, requiresBoss:true },
      { id:'tb', label:'Bossfight Theme', file:'audio/1BF-haween-bgmeinherjar-421376_NJNZJFZh.mp3', unlockBlocks: 999, requiresEgg:false, requiresBossAccess:true, hidden:true }
    ];


    // =========================
    // Bossfight DIM list (solo testo; soluzioni opzionali come IMMAGINI, non incluse)
    // =========================
    const BOSS_DIMS = [
      {
        id: 0,
        part: 1,
        title: 'DIM 0 (Base)',
        plain: 'DIM 0 (Base): Postulati + Risoluzione TDSE/TISE: 1. Equazione di Schrodinger e Principio di Sovrapposizione, 2. Misura e Collasso della Funzione d\'Onda, 3. Probabilita del risultato di una misura (Regola di Born), 4. Valor Medio di un\'Osservabile, 5. Simmetrizzazione dei Prodotti, 6. Riduzione del Pacchetto d\'Onda (Collasso della Funzione d\'Onda)',
        html: String.raw`<b>DIM 0 (Base):</b> Postulati + Risoluzione TDSE/TISE: 1. Equazione di Schrodinger e Principio di Sovrapposizione, 2. Misura e Collasso della Funzione d&rsquo;Onda, 3. Probabilita del risultato di una misura (Regola di Born), 4. Valor Medio di un&rsquo;Osservabile, 5. Simmetrizzazione dei Prodotti, 6. Riduzione del Pacchetto d&rsquo;Onda (Collasso della Funzione d&rsquo;Onda)`,
      },
      {
        id: 1,
        part: 1,
        title: 'DIM 1',
        plain: 'DIM 1: [Conservazione Globale e "Locale" della Probabilita] (Hermiticita di H + [Equazione di Continuita]) (fino a j⃗ e Gauss-Green)',
        html: String.raw`<b>DIM 1:</b> <span class="br">[Conservazione Globale e &quot;Locale&quot; della Probabilita]</span> <em>(Hermiticita di \(H\) + <span class="br">[Equazione di Continuita]</span>) (fino a \(\vec{j}\) e Gauss-Green)</em>`,
      },
      {
        id: 2,
        part: 1,
        title: 'DIM 2',
        plain: 'DIM 2: [Indeterminazione di Heisenberg] (da commutatori): (ΔA)^2(ΔB)^2 >= 1/4 |<[A,B]>|^2, con A=x, B=p. Identificazione dell\'indeterminazione minima (uguaglianza) e commento sul pacchetto d\'onda gaussiano (stato a minima indeterminazione).',
        html: String.raw`<b>DIM 2:</b> <span class="br">[Indeterminazione di Heisenberg]</span> <em>(da commutatori)</em>: \((\Delta A)^2(\Delta B)^2 \ge \frac{1}{4}\,|\langle [A,B]\rangle|^2\), con \(A=x\), \(B=p\). Identificazione dell&rsquo;indeterminazione minima <em>(uguaglianza)</em> e commento sul pacchetto d&rsquo;onda gaussiano (stato a minima indeterminazione).`,
      },
      {
        id: 3,
        part: 1,
        title: 'DIM 3',
        plain: 'DIM 3: [Compatibili] <=> [A,B] = 0 ([Commutano]) (Non-deg + Deg)',
        html: String.raw`<b>DIM 3:</b> <span class="br">[Compatibili]</span> &lt;=&gt; \([A,B]=0\) (<span class="br">[Commutano]</span>) (Non-deg + Deg)`,
      },
      {
        id: 4,
        part: 1,
        title: 'DIM 4',
        plain: 'DIM 4: Valori di Aspettazione e [Th. di Ehrenfest] + d<x>/dt, d<p>/dt + Evoluzione temporale degli operatori (Schrodinger/Heisenberg/Interaction) + Simmetrie e conservazione (generatori di traslazioni/rotazioni)',
        html: String.raw`<b>DIM 4:</b> Valori di Aspettazione e <span class="br">[Th. di Ehrenfest]</span> + \(\frac{d\langle x\rangle}{dt}\), \(\frac{d\langle p\rangle}{dt}\) + Evoluzione temporale degli operatori (Schrodinger/Heisenberg/Interaction) + Simmetrie e conservazione (generatori di traslazioni/rotazioni)`,
      },
      {
        id: 5,
        part: 1,
        title: 'DIM 5',
        plain: 'DIM 5: Considerazioni Fisiche (Energetiche e Potenziale) + Profilo Generico del Potenziale / [Particella Libera] (autofunzioni di p-hat) + Confronto QM/CL + Step/[Gradino] + [Barriera] + [Buca (finite/infinite)]: Forme ψ, Bordi, R, T via Corrente + Analogia Ottica + [Parita] + Stati legati vs diffusione',
        html: String.raw`<b>DIM 5:</b> Considerazioni Fisiche <em>(Energetiche e Potenziale)</em> + Profilo Generico del Potenziale / <span class="br">[Particella Libera]</span> (autofunzioni di \(\hat p\)) + Confronto QM/CL + Step/<span class="br">[Gradino]</span> + <span class="br">[Barriera]</span> + <span class="br">[Buca (finite/infinite)]</span>: Forme \(\psi\), Bordi, \(R\), \(T\) via Corrente + Analogia Ottica + <span class="br">[Parita]</span> + Stati legati vs diffusione`,
      },
      {
        id: 6,
        part: 1,
        title: 'DIM 6',
        plain: 'DIM 6: Considerazioni Fisiche (Energetiche e Potenziale) + Confronto QM/CL + [OA Operationale]: a, a†, N, Spettro, Ladder',
        html: String.raw`<b>DIM 6:</b> Considerazioni Fisiche <em>(Energetiche e Potenziale)</em> + Confronto QM/CL + <span class="br">[OA Operationale]</span>: \(a, a^\dagger, N\), Spettro, Ladder`,
      },

      {
        id: 7,
        part: 2,
        title: 'DIM 7',
        plain: 'DIM 7: Perturbazioni [Stazionarie] - [Non-deg] E^(1), |ψ^(1)>, E^(2) + [Deg] (Secolare + Diagonalizzazione in S_n)',
        html: String.raw`<b>DIM 7:</b> Perturbazioni <span class="br">[Stazionarie]</span> - <span class="br">[Non-deg]</span> \(E^{(1)},\ |\psi^{(1)}\rangle,\ E^{(2)}\) + <span class="br">[Deg]</span> (Secolare + Diagonalizzazione in \(S_n\))`,
      },
      {
        id: 8,
        part: 2,
        title: 'DIM 8',
        plain: 'DIM 8: [Composizione Momenti Angolari (generici)] J = J1 + J2: ICOC, CG, Ladder + Esempio Fermioni 1/2 + 1/2: Tripletto/Singoloetto (costruzione con J_-)',
        html: String.raw`<b>DIM 8:</b> <span class="br">[Composizione Momenti Angolari (generici)]</span> \(J = J_1 + J_2\): ICOC, CG, Ladder + Esempio Fermioni \(\tfrac12 + \tfrac12\): Tripletto/Singoloetto (costruzione con \(J_-\))`,
      },
      {
        id: 9,
        part: 2,
        title: 'DIM 9',
        plain: 'DIM 9: [Particelle Identiche] (N particelle interagenti): P_ij, Autovalori ±1, [P, H] = 0, Simmetrico/Antisimmetrico, Pauli/Slater + Regola Singoletto/Tripletto <-> ℓ Pari/Dispari (Scambio => (-1)^ℓ)',
        html: String.raw`<b>DIM 9:</b> <span class="br">[Particelle Identiche]</span> <em>(N particelle interagenti)</em>: \(P_{ij}\), Autovalori \(\pm 1\), \([P,H]=0\), Simmetrico/Antisimmetrico, Pauli/Slater + Regola Singoletto/Tripletto &lt;-&gt; \(\ell\) Pari/Dispari (Scambio =&gt; \((-1)^{\ell}\))`,
      },
      {
        id: 10,
        part: 2,
        title: 'DIM 10',
        plain: 'DIM 10: [Th. di Hellmann-Feynman] + Notazione spettroscopica: dE_n/dλ = <n|∂H/∂λ|n>',
        html: String.raw`<b>DIM 10:</b> <span class="br">[Th. di Hellmann-Feynman]</span> + Notazione spettroscopica: \(\frac{dE_n}{d\lambda} = \langle n\,|\,\frac{\partial H}{\partial \lambda}\,|\,n\rangle\)`,
      },
      {
        id: 11,
        part: 2,
        title: 'DIM 11',
        plain: 'DIM 11: Correzioni Relativistiche: H_MV, H_D, [Spin-Orbita] H_SO (completo) + struttura fine dell\'idrogeno',
        html: String.raw`<b>DIM 11:</b> Correzioni Relativistiche: \(H_{MV}\), \(H_D\), <span class="br">[Spin-Orbita]</span> \(H_{SO}\) (completo) + struttura fine dell&rsquo;idrogeno`,
      },
      {
        id: 12,
        part: 2,
        title: 'DIM 12',
        plain: 'DIM 12: [TDPT] - Variazione delle Costanti -> c_n(t); Transizioni (Risonanza -> emissione e assorbimento risonante + identificazione della [Pulsazione di Bohr]) => Perturbazione Costante e [Periodica]; Passaggio al [Continuo] fino alla [Regola d\'Oro di Fermi]; τ e Γ',
        html: `<b>DIM 12:</b> <span class="br">[TDPT]</span> - Variazione delle Costanti -&gt; \(c_n(t)\); <em>Transizioni (Risonanza -&gt; emissione e assorbimento risonante + identificazione della <span class="br">[Pulsazione di Bohr]</span>)</em> =&gt; Perturbazione Costante e <span class="br">[Periodica]</span>; Passaggio al <span class="br">[Continuo]</span> fino alla <span class="br">[Regola d&rsquo;Oro di Fermi]</span>; \(\tau\) e \(\Gamma\)`,
      },

      {
        id: 13,
        part: 3,
        title: 'DIM 13',
        plain: 'DIM 13: Spin: Zeeman (normale), Interazione con campo EM (campo B uniforme), Spin 1/2 (spinori di Pauli), Esperimento di Stern-Gerlach + Stark',
        html: `<b>DIM 13:</b> Spin: Zeeman (normale), Interazione con campo EM (campo \(B\) uniforme), Spin \(\tfrac12\) (spinori di Pauli), Esperimento di Stern-Gerlach + Stark`,
      },
      {
        id: 14,
        part: 3,
        title: 'DIM 14',
        plain: 'DIM 14: Eq. di Schrodinger in 3D: separazione variabili + OA 3D + Particella Libera 3D',
        html: `<b>DIM 14:</b> Eq. di Schrodinger in 3D: separazione variabili + OA 3D + Particella Libera 3D`,
      },
      {
        id: 15,
        part: 3,
        title: 'DIM 15',
        plain: 'DIM 15: Regressioni Matematiche fino a [->] Momenti Angolari: commutatori, coordinate sferiche, armoniche sferiche, rappresentazioni matriciali + generatori di rotazioni/traslazioni; passaggio fisico + matematico a [Spin]',
        html: `<b>DIM 15:</b> Regressioni Matematiche fino a <span class="br">[->]</span> Momenti Angolari: commutatori, coordinate sferiche, armoniche sferiche, rappresentazioni matriciali + generatori di rotazioni/traslazioni; passaggio fisico + matematico a <span class="br">[Spin]</span>`,
      },
      {
        id: 16,
        part: 3,
        title: 'DIM 16',
        plain: 'DIM 16: Potenziali centrali; Atomo di idrogeno (Coulombiano): soluzione (radiale) con Kummer/Laplace',
        html: `<b>DIM 16:</b> Potenziali centrali; Atomo di idrogeno (Coulombiano): soluzione (radiale) con Kummer/Laplace`,
      },
      {
        id: 17,
        part: 3,
        title: 'DIM 17',
        plain: 'DIM 17: Buche di Potenziale: pareti finite e infinite (richiami a stati legati/diffusione, parita)',
        html: `<b>DIM 17:</b> Buche di Potenziale: pareti finite e infinite (richiami a stati legati/diffusione, parita)`,
      },
      {
        id: 18,
        part: 3,
        title: 'DIM 18',
        plain: 'DIM 18: Limiti della classica + Esperimenti: Corpo Nero (BB), Effetto Fotoelettrico, [Compton (metodo covariante)] (risoluzione completa + significato fisico), Atomo di Bohr, spettri atomici, Doppia Fenditura, esperimento con elettroni, analogia ottica-meccanica',
        html: `<b>DIM 18:</b> Limiti della classica + Esperimenti: Corpo Nero (BB), Effetto Fotoelettrico, <span class="br">[Compton (metodo covariante)]</span> (risoluzione completa + significato fisico), Atomo di Bohr, spettri atomici, Doppia Fenditura, esperimento con elettroni, analogia ottica-meccanica`,
      },
    ];




    // =========================
    // State
    // =========================

    const STORAGE_KEY = 'mq_game_ale_pdf_v1';
    const STORAGE_KEY_FALLBACK = 'mq_game_tree_jukebox_v2';

    const DEFAULT_STATE = {
      v: 3,
      completed: {},   // { blockId: true }
      maxSeen: {},     // { blockId: maxIndex }
      coins: { silver: 0, gold: 0 },
      achievements: {},
      jukeboxUnlocked: false,
      eggFound: false,
      bossUnlockedOnce: false,
      boss: { done: {} },
      // Sblocca la traccia finale (Classical Pack) quando completi tutte le DIM della bossfight.
      bossRewardUnlocked: false,
      lastPlayed: null,
      steps: 0,
      lastToastAt: 0,
      sfxOn: true,
    };

    function loadState(){
      try{
        const raw = localStorage.getItem(STORAGE_KEY);
        if(!raw) return structuredClone(DEFAULT_STATE);
        const s = JSON.parse(raw);
        return { ...structuredClone(DEFAULT_STATE), ...s, coins: { ...structuredClone(DEFAULT_STATE.coins), ...(s.coins||{}) } };
      }catch(e){
        return structuredClone(DEFAULT_STATE);
      }
    }
    function saveState(){
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
    }

    let state = loadState();

    // =========================
    // DOM
    // =========================

    const $ = (q, el=document) => el.querySelector(q);
    const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

    const listP1 = $('#listP1');
    const listP2 = $('#listP2');

    const statDone = $('#statDone');
    const statTotal = $('#statTotal');
    const statTracks = $('#statTracks');
    const statBoss = $('#statBoss');
    const statPct = $('#statPct');
    const progressFill = $('#progressFill');

    const p1DoneEl = $('#p1Done');
    const p1TotalEl = $('#p1Total');
    const p2DoneEl = $('#p2Done');
    const p2TotalEl = $('#p2Total');

    const wallGrid = $('#wallGrid');

    const btnExpandAll = $('#btnExpandAll');
    const btnCollapseAll = $('#btnCollapseAll');
    const btnReset = $('#btnReset');
    const btnMainIndex = $('#btnMainIndex');

    const btnGlossario = $('#btnGlossario');
    const btnAchievements = $('#btnAchievements');
    const btnJukebox = $('#btnJukebox');
    const jukeboxDot = $('#jukeboxDot');
    const btnWallet = $('#btnWallet');
    const btnSfx = $('#btnSfx');
    const sfxIcon = $('#sfxIcon');

    const btnBoss = $('#btnBoss');
    const bossDot = $('#bossDot');

    const viewerModal = $('#viewerModal');
    const vTitle = $('#vTitle');
    const vPath = $('#vPath');
    const vThumbList = $('#vThumbList');
    const vImg = $('#vImg');
    const vCap = $('#vCap');
    const vIdx = $('#vIdx');
    const vTot = $('#vTot');
    const vPrev = $('#vPrev');
    const vNext = $('#vNext');
    const vClose = $('#vClose');
    const vZoom = $('#vZoom');
    const vMark = $('#vMark');
    const vReward = $('#vReward');
    const vHint = $('#vHint');

    const zoomModal = $('#zoomModal');
    const zImg = $('#zImg');
    const zClose = $('#zClose');

    const glossModal = $('#glossModal');
    const glossList = $('#glossList');
    const glossSearch = $('#glossSearch');
    const glossClose = $('#glossClose');

    const achModal = $('#achModal');
    const achList = $('#achList');
    const achClose = $('#achClose');

    const walletModal = $('#walletModal');
    const walletClose = $('#walletClose');
    const btnConvert = $('#btnConvert');
    const convertHint = $('#convertHint');

    const jukeboxModal = $('#jukeboxModal');
    const trackList = $('#trackList');
    const jbClose = $('#jbClose');
    const jbStop = $('#jbStop');
    const nowPlaying = $('#nowPlaying');
    const eggPanel = $('#eggPanel');
    const btnKonami = $('#btnKonami');

    const toastEl = $('#toastEl');
    const toastTitle = $('#toastTitle');
    const toastMsg = $('#toastMsg');
    const toastClose = $('#toastClose');

    const fab = $('#fab');
    const btnToTop = $('#btnToTop');
    const btnToBottom = $('#btnToBottom');
    const btnMainIndexFooter = $('#btnMainIndexFooter');
    const btnCompleteAll = $('#btnCompleteAll');
    const btnBossFooter = $('#btnBossFooter');

    const brandHome = $('#brandHome');

    const bossIntro = $('#bossIntro');
    const bossChipWall = $('#bossChipWall');

    // Boss modal elements
    const bossModal = $('#bossModal');
    const bossClose = $('#bossClose');
    const bossList = $('#bossList');
    const bossHPFill = $('#bossHPFill');
    const bossHPText = $('#bossHPText');
    const bossHintText = $('#bossHintText');
    const bossRandomBtn = $('#bossRandomBtn');
    const bossResetBtn = $('#bossResetBtn');
    const bossBackHome = $('#bossBackHome');
    const bossScrollTop = $('#bossScrollTop');

    const bossChallenge = $('#bossChallenge');
    const challengeTitle = $('#challengeTitle');
    const challengeText = $('#challengeText');
    const challengeClose = $('#challengeClose');
    const challengeStartBtn = $('#challengeStartBtn');
    const challengeTimer = $('#challengeTimer');
    const challengeDoneBtn = $('#challengeDoneBtn');


    // Coin HUD
    const silverBtn = $('#silverBtn');
    const goldBtn = $('#goldBtn');
    const silverCoin = $('#silverCoin');
    const goldCoin = $('#goldCoin');
    const silverBurst = $('#silverBurst');
    const goldBurst = $('#goldBurst');
    const silverCountEl = $('#silverCount');
    const goldCountEl = $('#goldCount');

    // Audio
    const audio = $('#audio');

    // Bossfight music (auto-play on enter; toggle inside Bossfight)
    // Riusa un file gia presente nel progetto (traccia IV). Puoi cambiarlo se vuoi.
    const BOSS_MUSIC_FILE = 'audio/1BF-haween-bgmeinherjar-421376_NJNZJFZh.mp3';
    const BOSS_MUSIC_LABEL = 'Bossfight Theme';
    let bossMusicBtn = null;

    // Viewer state
    let currentBlock = null;
    let currentIndex = 0;

    // =========================
    // Helpers
    // =========================

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

    function toastShow(title, msg){
      toastTitle.textContent = title;
      toastMsg.textContent = msg;
      toastEl.classList.add('show');
      state.lastToastAt = Date.now();
      saveState();
    }
    function toastHide(){ toastEl.classList.remove('show'); }

    // v2-compat: allow calling toast('msg')
    function toast(msg, title=''){
      const m = (msg ?? '').toString();
      const t = (title && String(title).trim()) ? String(title).trim() : 'MQ Quest';
      toastShow(t, m);
    }


    function openModal(el){ el.classList.add('show'); }
    function closeModal(el){ el.classList.remove('show'); }

    // Blocca / sblocca lo scroll della pagina (utile per modal lunghi su Desktop).
    // Nota: lo scroll interno ai contenuti del modal continua a funzionare.
    function setPageScrollLocked(on){
      const flag = !!on;
      document.documentElement.classList.toggle('modal-lock', flag);
      document.body.classList.toggle('modal-lock', flag);
    }

    function humanLabel(f){
      // PDF pages: numero -> "p.X"
      if(typeof f === 'number') return `p.${f}`;
      if(typeof f === 'string' && /^\d+$/.test(f)) return `p.${Number(f)}`;

      // fallback (se mai riusi anche immagini)
      const s = String(f || '');
      const m = s.match(/^(\d+)(?:_.*)?\.(jpg|png|webp)$/i);
      if(m) return `p.${m[1]}`;
      return s;
    }


    // =========================
    // MathJax helper (LaTeX in bossfight)
    // =========================
    function typesetMath(rootEl){
      const MJ = window.MathJax;
      if(!MJ || typeof MJ.typesetPromise !== 'function') return;
      // typesetPromise expects elements array; guard to avoid throwing in older versions
      try{
        MJ.typesetPromise([rootEl]).catch(()=>{});
      }catch(e){
        // ignore
      }
    }

    function blockReward(block){
      const n = block.files.length;
      const silver = 6 + Math.ceil(n/3); // silver easy
      // gold mostly through milestones; small random via drop chance
      return { silver, gold: 0 };
    }

    // =========================
    // Coin system
    // =========================

    const GOLD_DROP_CHANCE_PER_SILVER = 0.03;
    const CONVERT_COST_SILVER = 100;

    function spin(coinEl, gold=false){
      if(reducedMotion) return;
      coinEl.classList.remove('coin-spin','coin-spin-gold');
      void coinEl.offsetWidth;
      coinEl.classList.add(gold ? 'coin-spin-gold' : 'coin-spin');
    }

    function burst(burstEl){
      if(reducedMotion) return;
      burstEl.innerHTML = '';
      const n = 14;
      for(let i=0;i<n;i++){
        const p = document.createElement('span');
        const angle = (Math.PI*2) * (i/n);
        const radius = 26 + Math.random()*18;
        const dx = Math.cos(angle)*radius;
        const dy = Math.sin(angle)*radius;
        p.style.setProperty('--dx', dx.toFixed(1)+'px');
        p.style.setProperty('--dy', dy.toFixed(1)+'px');
        p.style.animationDelay = (Math.random()*70)+'ms';
        burstEl.appendChild(p);
      }
    }

    function refreshCoins(){
      silverCountEl.textContent = state.coins.silver;
      goldCountEl.textContent = state.coins.gold;
      const canConvert = state.coins.silver >= CONVERT_COST_SILVER;
      btnConvert.disabled = !canConvert;
      convertHint.textContent = canConvert ? 'Pronto.' : `Ti mancano ${Math.max(0, CONVERT_COST_SILVER - state.coins.silver)} Silver.`;
    }


    // =========================
    // SFX (UI click sounds)
    // =========================
    let _sfxCtx = null;
    function _ensureSfx(){
      if(!state.sfxOn) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      if(!_sfxCtx) _sfxCtx = new AC();
      if(_sfxCtx.state === 'suspended') _sfxCtx.resume();
      return _sfxCtx;
    }
    function _beep(freq=660, dur=0.03, type='square', gain=0.035){
      const ctx = _ensureSfx();
      if(!ctx) return;
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
    function sfxClick(){ _beep(740, 0.028, 'square', 0.03); }
    function sfxConfirm(){ _beep(520, 0.03, 'sine', 0.03); _beep(780, 0.03, 'sine', 0.03); }
    function sfxSuccess(){ _beep(880, 0.03, 'sine', 0.035); setTimeout(()=>_beep(1170,0.04,'sine',0.03),45); }

    // Auto-click SFX on most UI controls (best-effort)
    document.addEventListener('click', (e)=>{
      const t = e.target;
      if(!t) return;
      // avoid double-sfx for audio controls or slider drags
      if(t.closest('.jukebox-controls')) return;
      if(t.closest('summary')){ sfxClick(); return; }
      if(t.closest('button') || t.closest('a') || t.closest('.pill') || t.closest('.chip') || t.closest('.block-card')){
        sfxClick();
      }
    }, true);

    // Compatibility aliases (v2/v3)
    function updateCoins(){ refreshCoins(); }
    function unlockTrack(trackId){
      // Tracks are normally derived from progress; this helper is used for boss unlock.
      if(trackId === 't6'){
        state.bossRewardUnlocked = true;
        saveState();
        renderJukebox();
        toastShow('Jukebox', 'Track finale sbloccata: Classical Pack');
        return;
      }
      // Generic: just re-render + toastEl
      renderJukebox();
      const tr = TRACKS.find(t=>t.id===trackId);
      if(tr) toast(`Track sbloccata: ${tr.label}`);
    }

    function earnSilver(amount, reason=''){
      const n = Math.max(0, Math.floor(amount||0));
      if(!n) return { silver:0, gold:0 };
      let goldDrops = 0;
      for(let i=0;i<n;i++) if(Math.random() < GOLD_DROP_CHANCE_PER_SILVER) goldDrops++;

      state.coins.silver += n;
      if(goldDrops>0) state.coins.gold += goldDrops;
      saveState();

      spin(silverCoin,false);
      burst(silverBurst);
      if(goldDrops>0){ spin(goldCoin,true); burst(goldBurst); }
      refreshCoins();

      if(reason){
        if(goldDrops>0) toastShow('QC + reward', `${reason} · +${n} Silver · +${goldDrops} Gold (drop raro)`);
        else toastShow('QC + reward', `${reason} · +${n} Silver`);
      }
      return { silver:n, gold:goldDrops };
    }

    function earnGold(amount, reason=''){
      const n = Math.max(0, Math.floor(amount||0));
      if(!n) return;
      state.coins.gold += n;
      saveState();
      spin(goldCoin,true);
      burst(goldBurst);
      refreshCoins();
      if(reason) toastShow('QC Gold', `${reason} · +${n} Gold`);
    }

    function convertSilverToGold(){
      if(state.coins.silver < CONVERT_COST_SILVER) return;
      state.coins.silver -= CONVERT_COST_SILVER;
      state.coins.gold += 1;
      saveState();
      spin(goldCoin,true);
      burst(goldBurst);
      refreshCoins();
      toastShow('Conversione', `-100 Silver → +1 Gold`);
      renderAll();
    }

    // =========================
    // Achievements
    // =========================

    const ACH = [
      { id:'firstBlock', title:'Primo blocco', desc:'Completa 1 blocco.', check: s => completedCount(s) >= 1, reward: () => ({silver: 20, gold:0}) },
      { id:'eight', title:'8 blocchi', desc:'Arriva a 8 blocchi completati.', check: s => completedCount(s) >= 8, reward: () => ({silver: 40, gold:1}) },
      { id:'p1done', title:'P1 clear', desc:'Completa tutti i blocchi di P1', check: s => p1Done(s) >= p1Total(), reward: () => ({silver: 60, gold:5}) },
      { id:'p2done', title:'P2 clear', desc:'Completa tutti i blocchi di P2', check: s => p2Done(s) >= p2Total(), reward: () => ({silver: 60, gold:5}) },
      { id:'fullclear', title:'Full clear', desc:'Completa tutti i blocchi (P1+P2).', check: s => completedCount(s) >= TOTAL_BLOCKS, reward: () => ({silver: 100, gold:5}) },
      { id:'egg', title:'Easter egg', desc:'Trova la traccia segreta.', check: s => !!s.eggFound, reward: () => ({silver: 25, gold:2}) },
    ];

    function grantAchievement(id){
      if(state.achievements[id]) return;
      const a = ACH.find(x=>x.id===id);
      if(!a) return;
      state.achievements[id] = { at: Date.now() };
      saveState();
      const r = a.reward();
      if(r.silver) earnSilver(r.silver, `Achievement: ${a.title}`);
      if(r.gold) earnGold(r.gold, `Achievement: ${a.title}`);
    }

    function checkAchievements(){
      for(const a of ACH){
        if(!state.achievements[a.id] && a.check(state)){
          grantAchievement(a.id);
        }
      }
    }

    // =========================
    // Progress helpers
    // =========================

    function completedCount(s=state){ return Object.keys(s.completed).length; }

    function p1Total(){ return TIMELINE.filter(b=>b.part==='P1').length; }
    function p2Total(){ return TIMELINE.filter(b=>b.part==='P2').length; }

    function p1Done(s=state){
      const p1Ids = new Set(TIMELINE.filter(b=>b.part==='P1').map(b=>b.id));
      return Object.keys(s.completed).filter(id=>p1Ids.has(id)).length;
    }
    function p2Done(s=state){
      const p2Ids = new Set(TIMELINE.filter(b=>b.part==='P2').map(b=>b.id));
      return Object.keys(s.completed).filter(id=>p2Ids.has(id)).length;
    }

    function isBlockDone(id){ return !!state.completed[id]; }

    function unlockJukeboxIfNeeded(){
      if(state.jukeboxUnlocked) return;
      if(completedCount() >= 1){
        state.jukeboxUnlocked = true;
        saveState();
        toastShow('Sblocco', 'Hai sbloccato il Jukebox 🎧');
      }
    }

    function trackUnlocked(track){
      if(track.requiresBossAccess) return canEnterBoss() || !!state.bossUnlockedOnce;
      if(track.requiresBoss) return !!state.bossRewardUnlocked;
      if(track.requiresEgg){
        const baseUnlocked = TRACKS.filter(t=>!t.requiresEgg && !t.requiresBoss && !t.requiresBossAccess && !t.hidden).every(t=>trackUnlocked(t));
        return baseUnlocked && !!state.eggFound;
      }
      return completedCount() >= track.unlockBlocks;
    }

    function unlockedTracksCount(){
      return TRACKS.filter(trackUnlocked).length;
    }

    function canEnterBoss(){
      const allDone = completedCount() >= TOTAL_BLOCKS;
      const hasGold = state.coins.gold >= 15;
      return allDone && (state.bossUnlockedOnce || hasGold);
    }

    // =========================
    // Rendering
    // =========================

    function makeBlockCard(block){
      const done = isBlockDone(block.id);
      const reward = blockReward(block);
            const hasSplit = block.files.some(f => (typeof f === 'string') && /_p[12]t0?[12]\.jpg$/i.test(f));

      const el = document.createElement('details');
      el.className = 'block';
      el.dataset.blockId = block.id;
      el.innerHTML = `
        <summary class="block-sum">
          <span class="pill ${done?'done':''}"><span class="chk"></span><span>${block.key}</span><small>${block.pages}</small></span>
          <span class="btitle">
            <strong>${escapeHtml(block.title)}</strong>
            <span>${escapeHtml(block.subtitle || '-')}</span>
          </span>
          <span class="bmeta">
            <span class="chip"><b>${block.files.length}</b><span>pg</span></span>
            <span class="chip"><b>+${reward.silver}</b><span>Silver</span></span>
            ${hasSplit ? '<span class="chip" title="Contiene pagine divise in 2">½</span>' : ''}
            <span class="chip" style="${done?'border-color:rgba(57,217,138,.45);background:rgba(57,217,138,.10);':''}">
              <b>${done ? 'DONE' : 'TODO'}</b>
            </span>
          </span>
        </summary>
        <div class="block-body">
          <div class="block-actions">
            <div class="left">
              <button class="btn" data-action="open" title="Apri viewer (prima pagina)"><span class="dot"></span><span>Apri viewer</span></button>
              <button class="btn" data-action="mark" title="Segna completato"><span class="dot ok"></span><span>Completa</span></button>
            </div>
            <div class="muted">${escapeHtml(block.path)}</div>
          </div>
          <div class="thumbs" data-thumbs="${block.id}"></div>
          <div class="muted"><em>Tip:</em> clicca una miniatura per aprire la pagina in grande. Arrivando all’ultima pagina si completa automaticamente.</div>
        </div>
      `;

      // On open: lazy-generate thumbnails once
      el.addEventListener('toggle', ()=>{
        if(!el.open) return;
        const box = el.querySelector(`[data-thumbs="${block.id}"]`);
        if(box && !box.dataset.ready){
          box.dataset.ready = '1';
          buildThumbnails(block, box);
        }
      });

      // Buttons
      el.addEventListener('click', (ev)=>{
        const btn = ev.target.closest('button');
        if(!btn) return;
        const act = btn.dataset.action;
        if(act==='open'){
          ev.preventDefault();
          openViewer(block.id, 0);
        }
        if(act==='mark'){
          ev.preventDefault();
          markBlockDone(block.id, btn);
        }
      });

      return el;
    }

    function buildThumbnails(block, container){
      // Caricamento "a batch" + lazy reale: evita freeze con immagini molto grandi
      const files = block.files;
      const total = files.length;

      const isMobile = window.matchMedia && window.matchMedia('(max-width: 620px)').matches;
      const batchSize = isMobile ? 4 : 6;

      const TINY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

      // IntersectionObserver globale: assegna la src vera solo quando entra in viewport
      if(!window.__thumbIO){
        window.__thumbIO = new IntersectionObserver((entries, obs)=>{
          for(const e of entries){
            if(!e.isIntersecting) continue;
            const img = e.target;
            loadThumbImage(img);
            obs.unobserve(img);
          }
        }, { root: null, rootMargin: '160px', threshold: 0.01 });
      }
      const io = window.__thumbIO;

      let loaded = 0;
      container.innerHTML = '';

      function createThumb(i){
        const file = files[i];

        const t = document.createElement('div');
        t.className = 'thumb';
        t.tabIndex = 0;
        t.dataset.blockId = block.id;
        t.dataset.index = String(i);

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = humanLabel(file);
        img.src = TINY;
        img.dataset.page = String(file);
        img.dataset.scale = String(THUMB_SCALE);
        img.dataset.loaded = '0';
        img.setAttribute('fetchpriority','low');
        io.observe(img);

        const cap = document.createElement('div');
        cap.className = 'cap';
        cap.textContent = humanLabel(file);

        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = `${i+1}/${files.length}`;

        t.appendChild(img);
        t.appendChild(cap);
        t.appendChild(badge);

        t.addEventListener('click', ()=> openViewer(block.id, i));
        t.addEventListener('keydown', (e)=>{
          if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openViewer(block.id, i); }
        });

        container.appendChild(t);
      }

      function createMoreTile(){
        const remaining = total - loaded;
        if(remaining <= 0) return null;

        const t = document.createElement('div');
        t.className = 'thumb more';
        t.tabIndex = 0;
        t.setAttribute('role','button');
        t.setAttribute('aria-label', `Carica altre miniature (restanti ${remaining})`);
        t.innerHTML = `<div class="moretxt"><b>+${remaining}</b><small>Carica altre</small></div>`;

        const doLoad = ()=>{
          t.remove();
          loadNextBatch();
        };
        t.addEventListener('click', doLoad);
        t.addEventListener('keydown', (e)=>{
          if(e.key==='Enter' || e.key===' '){ e.preventDefault(); doLoad(); }
        });

        return t;
      }

      function refreshMoreTile(){
        const existing = container.querySelector('.thumb.more');
        if(existing) existing.remove();
        const more = createMoreTile();
        if(more) container.appendChild(more);
      }

      function loadNextBatch(){
        const end = Math.min(total, loaded + batchSize);

        // Micro-chunk per frame: non blocca il thread UI
        const chunk = 2;
        function step(){
          const until = Math.min(end, loaded + chunk);
          for(let i = loaded; i < until; i++){
            createThumb(i);
          }
          loaded = until;

          if(loaded < end){
            requestAnimationFrame(step);
          } else {
            refreshMoreTile();
          }
        }
        requestAnimationFrame(step);
      }

      loadNextBatch();
    }

    function renderLists(){
      listP1.innerHTML = '';
      listP2.innerHTML = '';

      const p1 = TIMELINE.filter(b=>b.part==='P1');
      const p2 = TIMELINE.filter(b=>b.part==='P2');

      for(const b of p1) listP1.appendChild(makeBlockCard(b));
      for(const b of p2) listP2.appendChild(makeBlockCard(b));

      p1TotalEl.textContent = String(p1.length);
      p2TotalEl.textContent = String(p2.length);
    }

    function renderWall(){
      wallGrid.innerHTML = '';
      for(const b of TIMELINE){
        const t = document.createElement('div');
        t.className = 'tile' + (isBlockDone(b.id) ? ' done' : '');
        t.title = `${b.key} - ${b.title}`;
        t.innerHTML = `${escapeHtml(b.key)}<br/><small>${escapeHtml(b.pages)}</small>`;
        t.addEventListener('click', ()=>{
          // open/expand block and scroll to it
          const det = document.querySelector(`details.block[data-block-id="${b.id}"]`);
          if(det){
            det.open = true;
            det.scrollIntoView({behavior:'smooth', block:'center'});
            setTimeout(()=> openViewer(b.id, 0), 240);
          }else{
            openViewer(b.id, 0);
          }
        });
        wallGrid.appendChild(t);
      }
    }

    function renderStats(){
      statTotal.textContent = String(TOTAL_BLOCKS);

      const done = completedCount();
      statDone.textContent = String(done);

      const pct = TOTAL_BLOCKS ? Math.round((done/TOTAL_BLOCKS)*100) : 0;
      statPct.textContent = pct + '%';
      progressFill.style.width = pct + '%';

      p1DoneEl.textContent = String(p1Done());
      p2DoneEl.textContent = String(p2Done());

      const unlocked = unlockedTracksCount();
      statTracks.textContent = `${unlocked}/${TRACKS.length}`;

      const bossReady = canEnterBoss();
      statBoss.textContent = bossReady ? '⚔️' : '🔒';
      bossDot.className = 'dot ' + (bossReady ? 'ok' : '');

      // Jukebox button visibility
      if(state.jukeboxUnlocked){
        btnJukebox.style.display = '';
        const anyNew = TRACKS.some(t => trackUnlocked(t) && state.lastPlayed !== t.id);
        jukeboxDot.className = 'dot ' + (anyNew ? 'ok' : '');
      }else{
        btnJukebox.style.display = 'none';
      }

      refreshCoins();
    }

    function renderGlossary(){
      const q = (glossSearch.value || '').trim().toLowerCase();
      glossList.innerHTML = '';

      const items = GLOSSARY.filter(g => !q || g.term.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q));

      for(const g of items){
        const li = document.createElement('div');
        li.className = 'li';
        const blocks = (g.see||[]).map(id => TIMELINE.find(b=>b.id===id)).filter(Boolean);
        li.innerHTML = `
          <strong>${escapeHtml(g.term)}</strong>
          <p>${escapeHtml(g.desc)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${blocks.map(b=>`<button class="btn" data-open="${b.id}"><span class="dot"></span><span>${escapeHtml(b.key)} · ${escapeHtml(b.title)}</span></button>`).join('')}
          </div>
        `;
        li.addEventListener('click', (e)=>{
          const btn = e.target.closest('button[data-open]');
          if(!btn) return;
          const id = btn.getAttribute('data-open');
          closeModal(glossModal);
          const det = document.querySelector(`details.block[data-block-id="${id}"]`);
          if(det){
            det.open = true;
            det.scrollIntoView({behavior:'smooth', block:'start'});
            setTimeout(()=> openViewer(id, 0), 250);
          }else{
            openViewer(id, 0);
          }
        });
        glossList.appendChild(li);
      }
    }

    function renderAchievements(){
      achList.innerHTML = '';
      for(const a of ACH){
        const got = !!state.achievements[a.id];
        const li = document.createElement('div');
        li.className = 'li';
        const reward = a.reward();
        li.innerHTML = `
          <strong>${got ? '✅' : '⬜'} ${escapeHtml(a.title)}</strong>
          <p>${escapeHtml(a.desc)}</p>
          <p class="muted">Reward: +${reward.silver} Silver · +${reward.gold} Gold</p>
        `;
        achList.appendChild(li);
      }
    }

    function renderJukebox(){
      trackList.innerHTML = '';
      const done = completedCount();

      const baseUnlocked = TRACKS.filter(t=>!t.requiresEgg && !t.requiresBoss && !t.requiresBossAccess && !t.hidden).every(t=>trackUnlocked(t));
      eggPanel.style.display = baseUnlocked && !state.eggFound ? '' : 'none';

      for(const t of TRACKS.filter(t=>!t.hidden)){
        const unlocked = trackUnlocked(t);
        const row = document.createElement('div');
        row.className = 'track';
        const req = t.requiresBoss ? 'bossfight' : (t.requiresEgg ? 'easter egg' : `≥ ${t.unlockBlocks} blocchi`);
        row.innerHTML = `
          <div class="left">
            <strong>${escapeHtml(t.label)}</strong>
            <div class="tmeta">Sblocco: ${escapeHtml(req)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="lock ${unlocked?'on':''}"><span class="ic"></span><span>${unlocked ? 'sbloccata' : 'bloccata'}</span></span>
            <button class="btn" ${unlocked?'':'disabled'} data-play="${t.id}"><span class="dot"></span><span>Play</span></button>
          </div>
        `;
        row.querySelector('button[data-play]')?.addEventListener('click', ()=>{
          playTrack(t.id);
          state.lastPlayed = t.id;
          saveState();
          renderStats();
        });
        trackList.appendChild(row);
      }

      nowPlaying.textContent = audio && !audio.paused && audio.dataset.track ? audio.dataset.track : '-';
    }

    function renderAll(){
      renderStats();
      renderWall();
      renderGlossary();
      renderAchievements();
      renderJukebox();
    }

    // =========================
    // Viewer
    // =========================

    function openViewer(blockId, idx){
      const block = TIMELINE.find(b=>b.id===blockId);
      if(!block) return;
      currentBlock = block;
      currentIndex = clamp(idx, 0, block.files.length-1);

      vTitle.textContent = `${block.key} · ${block.title}`;
      vPath.textContent = block.path;
      vTot.textContent = String(block.files.length);

      // Build side list (mini, but in viewer)
      vThumbList.innerHTML = '';
      for(let i=0;i<block.files.length;i++){
        const f = block.files[i];
        const li = document.createElement('div');
        li.className = 'li';
        li.style.cursor = 'pointer';
        li.innerHTML = `<strong>${humanLabel(f)}</strong><p>${i+1}/${block.files.length}</p>`;
        li.addEventListener('click', ()=> setViewerIndex(i));
        vThumbList.appendChild(li);
      }

      vReward.textContent = `Completa il blocco per ottenere +${blockReward(block).silver} Silver (più eventuale drop Gold).`;
      vHint.textContent = isBlockDone(block.id)
        ? 'Blocco già completato. Puoi comunque rivedere le pagine.'
        : 'Completa arrivando all’ultima pagina o premendo ✓.';

      openModal(viewerModal);
      setViewerIndex(currentIndex);
    }

    let viewerReqId = 0;

    function setViewerIndex(i){
      if(!currentBlock) return;
      const files = currentBlock.files || [];
      currentIndex = Math.max(0, Math.min(i, files.length - 1));

      const pageNum = files[currentIndex];
      vIdx.textContent = String(currentIndex + 1);
      vCap.textContent = humanLabel(pageNum);

      // placeholder mentre renderizza
      vImg.src = TINY_BLANK;

      const req = String(++viewerReqId);
      vImg.dataset.req = req;

      pdfPageToImgUrl(Number(pageNum), VIEW_SCALE)
        .then((url)=>{
          if(vImg.isConnected && vImg.dataset.req === req){
            vImg.src = url;
          }
        })
        .catch(()=>{ /* placeholder */ });
    }


    // =========================
    // Completing blocks
    // =========================

    function markBlockDone(blockId, sourceEl){
      const already = isBlockDone(blockId);
      if(already){
        toastShow('OK', 'Blocco già segnato come completato.');
        return;
      }
      state.completed[blockId] = true;
      state.steps++;
      saveState();

      const block = TIMELINE.find(b=>b.id===blockId);
      const reward = block ? blockReward(block) : {silver: 10, gold:0};
      earnSilver(reward.silver, `${block ? block.key : 'Blocco'} completato`);

      // unlock features
      unlockJukeboxIfNeeded();

      // milestone gold (guarantee 15 total on full completion)
      // - P1 complete
      if(p1Done() === p1Total()){
        earnGold(5, 'Milestone: P1 completato');
      }
      // - P2 complete
      if(p2Done() === p2Total()){
        earnGold(5, 'Milestone: P2 completato');
      }
      // - full clear
      if(completedCount() === TOTAL_BLOCKS){
        earnGold(5, 'Milestone: Full clear');
      }

      checkAchievements();

      renderStats();
      renderWall();

      // update card UI quick
      const det = document.querySelector(`details.block[data-block-id="${blockId}"]`);
      if(det){
        const pill = det.querySelector('.pill');
        pill?.classList.add('done');
        const chk = pill?.querySelector('.chk');
        if(chk) chk.style.background = 'var(--ok)';
        const todo = det.querySelector('.bmeta .chip:last-child b');
        if(todo) todo.textContent = 'DONE';
        const lastChip = det.querySelector('.bmeta .chip:last-child');
        if(lastChip){
          lastChip.style.borderColor = 'rgba(57,217,138,.45)';
          lastChip.style.background = 'rgba(57,217,138,.10)';
        }
      }

      // prompt for boss readiness
      if(canEnterBoss() && !state.bossUnlockedOnce){
        toastShow('Bossfight pronta', 'Hai completato il programma. Se hai 15 Gold, puoi entrare nella simulazione orale.');
      }

      renderJukebox();
    }

    // =========================
    // Bossfight
function renderBossIntro(){
  // Popola la griglia “showoff” con i blocchi completati.
  // La sezione e' gia' nel DOM (index.html); qui aggiorniamo solo il contenuto.
  const wall = $('#bossChipWall');
  if(!wall) return;

  wall.innerHTML = '';

  // Mostriamo tutti i blocchi della timeline (P1+P2) compattati.
  // Anche se l'utente puo' richiamare la bossfight piu' volte, ricostruiamo sempre.
  for(let i=0;i<TIMELINE.length;i++){
    const b = TIMELINE[i];
    const chip = document.createElement('div');
    chip.className = 'mini';
    if(state.completed && state.completed[b.id]) chip.classList.add('done');
    chip.textContent = b.key || b.id;
    chip.style.animationDelay = (i * 0.03).toFixed(2) + 's';
    wall.appendChild(chip);
  }
}

    // =========================

    
    // Boss modal helpers
    function ensureBossState(){
      if(!state.boss || typeof state.boss !== 'object') state.boss = { done: {} };
      if(!state.boss.done || typeof state.boss.done !== 'object') state.boss.done = {};
    }

    const BOSS_PART_TITLES = {
      1: 'Parte 1 (Obbligatori)',
      2: 'Parte 2 (Obbligatori)',
      3: 'Parte 3 (Extra-Impegnative e Rare)',
    };

    function bossRequiredDims(){
      // Di default: Parte 1 + Parte 2 sono obbligatorie; Parte 3 è extra.
      return BOSS_DIMS.filter(d => d.part !== 3);
    }

    function bossRequiredDoneCount(){
      ensureBossState();
      const req = bossRequiredDims();
      return req.reduce((acc, d) => acc + (state.boss.done[d.id] ? 1 : 0), 0);
    }

    function bossUpdateHP(){
      if(!bossHPFill || !bossHPText) return;
      ensureBossState();
      const req = bossRequiredDims();
      const done = bossRequiredDoneCount();
      const total = req.length || 1;
      const pct = Math.round((done / total) * 100);
      bossHPFill.style.width = pct + '%';
      const remaining = Math.max(0, req.length - done);
      bossHPText.textContent = `Obbligatori: ${done}/${req.length} · Mancano: ${remaining}`;
      const allDone = BOSS_DIMS.every(d => !!state.boss.done[d.id]);
      if(bossHintText){
        if(allDone){
          bossHintText.textContent = '🏁 Tutte le DIM completate. Ricompensa sbloccata.';
        } else if(remaining === 0){
          bossHintText.textContent = '✅ Obbligatori completati. Completa anche gli extra per sbloccare la traccia VI.';
        } else {
          bossHintText.textContent = 'Completa gli obbligatori per “battere” la bossfight.';
        }
      }

      // Ricompensa finale: quando spunti TUTTE le DIM (incluse le Extra), sblocchi la traccia VI.
      if(allDone && !state.bossRewardUnlocked){
        unlockTrack('t6');
        tryPlayTrack('t6', true);
      }
    }

    function bossRenderList(){
      if(!bossList) return;
      ensureBossState();

      bossList.innerHTML = '';
      const parts = [1,2,3];
      for(const p of parts){
        const wrap = document.createElement('div');
        wrap.className = 'boss-part';
        const h = document.createElement('h4');
        h.textContent = BOSS_PART_TITLES[p] || ('Parte ' + p);
        wrap.appendChild(h);

        const dims = BOSS_DIMS.filter(d => d.part === p);
        for(const d of dims){
          const item = document.createElement('div');
          item.className = 'dim-item';
          if(d.required) item.dataset.required = '1';
          item.dataset.dim = String(d.id);

          const left = document.createElement('div');
          left.className = 'dim-left';

          const checkWrap = document.createElement('label');
          checkWrap.className = 'dim-check';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = !!state.boss.done[d.id];
          cb.addEventListener('change', () => {
            ensureBossState();
            state.boss.done[d.id] = cb.checked;
            saveState();
            bossUpdateHP();
            if(cb.checked){
              toastShow('Bossfight', `Segnata: DIM ${d.id}`);
            }
          });
          checkWrap.appendChild(cb);

          const txt = document.createElement('div');
          txt.className = 'dim-text';
          // NOTE: user asked “solo testo”; l’HTML qui serve solo per corsivo/simboli.
          txt.innerHTML = d.html;

          left.appendChild(checkWrap);
          left.appendChild(txt);

          const actions = document.createElement('div');
          actions.className = 'dim-actions';

          const practice = document.createElement('button');
          practice.className = 'btn sm';
          practice.textContent = 'Allenati';
          practice.addEventListener('click', () => openChallenge(d.id));
          actions.appendChild(practice);

          // Soluzioni (opzionale): immagini che aggiungerai tu.
          // Convenzione consigliata: boss/solbf{ID}_1.jpg, boss/solbf{ID}_2.jpg, ...
          const det = document.createElement('details');
          det.className = 'spoiler';
          const sum = document.createElement('summary');
          sum.textContent = 'Soluzioni (opzionale)';
          det.appendChild(sum);

          const body = document.createElement('div');
          body.className = 'spoiler-body';
          const base = `boss/solbf${d.id}`;

          // Soluzioni - thumbnails leggere (come block-body): batch + lazy reale
          const hint = document.createElement('div');
          hint.className = 'muted small';
          hint.innerHTML = `Metti le immagini in <code>${base}_1.jpg</code> ... <code>${base}_6.jpg</code> (nella cartella <code>boss/</code>). Se non ci sono ancora, nessun problema.`;
          body.appendChild(hint);

          const grid = document.createElement('div');
          grid.className = 'sol-grid';

          const TINY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
          const maxImgs = 6;
          const batch = 2;

          if(!window.__thumbIO){
            window.__thumbIO = new IntersectionObserver((entries, obs)=>{
              for(const e of entries){
                if(!e.isIntersecting) continue;
                const img = e.target;
                if(img.dataset.page){
              loadThumbImage(img);
            } else {
              const src = img.dataset.src;
              if(src){
                img.src = src;
                img.removeAttribute('data-src');
              }
            }
                obs.unobserve(img);
              }
            }, { root: null, rootMargin: '160px', threshold: 0.01 });
          }
          const io = window.__thumbIO;

          let shown = 0;

          function makeSolThumb(k){
            const wrap = document.createElement('div');
            wrap.className = 'sol-thumb';
            wrap.tabIndex = 0;

            const img = document.createElement('img');
            img.className = 'sol-img';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = `Soluzione DIM ${d.id} (${k})`;
            img.src = TINY;
            img.dataset.src = `${base}_${k}.jpg`;
            img.setAttribute('fetchpriority','low');
            io.observe(img);

            img.onerror = () => { wrap.remove(); refreshMore(); };

            const badge = document.createElement('div');
            badge.className = 'sol-badge';
            badge.textContent = String(k);

            wrap.appendChild(img);
            wrap.appendChild(badge);

            const openFull = ()=>{
              const src = img.dataset.src || img.src;
              if(src && src !== TINY) window.open(src, '_blank', 'noopener');
            };
            wrap.addEventListener('click', openFull);
            wrap.addEventListener('keydown', (e)=>{
              if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openFull(); }
            });

            grid.appendChild(wrap);
          }

          function makeMoreTile(remaining){
            const t = document.createElement('div');
            t.className = 'sol-more';
            t.tabIndex = 0;
            t.setAttribute('role','button');
            t.innerHTML = `<div class="moretxt"><b>+${remaining}</b><small>Carica altre</small></div>`;

            const doLoad = ()=>{
              t.remove();
              loadNext();
            };
            t.addEventListener('click', doLoad);
            t.addEventListener('keydown', (e)=>{
              if(e.key==='Enter' || e.key===' '){ e.preventDefault(); doLoad(); }
            });
            grid.appendChild(t);
          }

          function refreshMore(){
            const oldMore = grid.querySelector('.sol-more');
            if(oldMore) oldMore.remove();
            const remaining = maxImgs - shown;
            if(remaining > 0){
              makeMoreTile(remaining);
            }
          }

          function loadNext(){
            const target = Math.min(maxImgs, shown + batch);
            const chunk = 1;
            function step(){
              const until = Math.min(target, shown + chunk);
              for(let k = shown + 1; k <= until; k++){
                makeSolThumb(k);
              }
              shown = until;
              if(shown < target){
                requestAnimationFrame(step);
              } else {
                refreshMore();
              }
            }
            requestAnimationFrame(step);
          }

          body.appendChild(grid);
          loadNext();det.appendChild(body);
          actions.appendChild(det);

          item.appendChild(left);
          item.appendChild(actions);
          wrap.appendChild(item);
        }

        bossList.appendChild(wrap);
      }

      bossUpdateHP();
      // Render LaTeX (MathJax) if available
      typesetMath(bossList);
    }

    // Random challenge (timer + self-check)
    let challengeActiveId = null;
    let challengeRemaining = 90;
    let challengeInterval = null;

    function fmtTime(s){
      const mm = String(Math.floor(s/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      return `${mm}:${ss}`;
    }

    function challengeSetTime(seconds){
      challengeRemaining = Math.max(0, seconds|0);
      if(challengeTimer) challengeTimer.textContent = fmtTime(challengeRemaining);
    }

    function challengeStop(){
      if(challengeInterval){ clearInterval(challengeInterval); challengeInterval = null; }
      if(challengeStartBtn) challengeStartBtn.textContent = 'Avvia timer';
    }

    function challengeStart(){
      if(challengeInterval) return;
      if(challengeRemaining <= 0) challengeSetTime(90);
      if(challengeStartBtn) challengeStartBtn.textContent = 'Pausa';
      challengeInterval = setInterval(() => {
        challengeRemaining -= 1;
        if(challengeTimer) challengeTimer.textContent = fmtTime(challengeRemaining);
        if(challengeRemaining <= 0){
          challengeStop();
          toastShow('Timer', 'Tempo! Se hai finito, premi “Ho risposto”.');
        }
      }, 1000);
    }

    function challengeToggle(){
      if(challengeInterval){
        challengeStop();
      }else{
        challengeStart();
      }
    }

    function openChallenge(dimId){
      const d = BOSS_DIMS.find(x => x.id === dimId);
      if(!d) return;
      challengeActiveId = dimId;
      if(challengeTitle) challengeTitle.textContent = `Sfida · DIM ${d.id}`;
      if(challengeText) challengeText.innerHTML = d.html;
      if(challengeText) typesetMath(challengeText);
      challengeSetTime(90);
      challengeStop();
      if(bossChallenge) bossChallenge.hidden = false;
      // scroll into view inside modal
      try{ bossModal.querySelector('.modal-card').scrollTo({ top: 0, behavior: 'smooth' }); }catch(e){}
    }

    function pickRandomDim(){
      const req = bossRequiredDims();
      const remaining = req.filter(d => !state.boss?.done?.[d.id]);
      const pool = remaining.length ? remaining : req;
      return pool[Math.floor(Math.random()*pool.length)];
    }

    function openRandomChallenge(){
      ensureBossState();
      const d = pickRandomDim();
      if(!d){ toastShow('Bossfight', 'Nessuna DIM disponibile.'); return; }
      openChallenge(d.id);
      // auto-start timer
      challengeStart();
    }

    function markChallengeDone(){
      if(challengeActiveId === null) return;
      ensureBossState();
      state.boss.done[challengeActiveId] = true;
      saveState();
      bossRenderList(); // refresh checks & HP
      toastShow('Bossfight', `✅ Completata: DIM ${challengeActiveId}`);
    }

    function bossOpenModal(){
      bossRenderList();
      setPageScrollLocked(true);
      openModal(bossModal);
      ensureBossMusicBtn();
      updateBossMusicBtn();
      // ensure top inside modal
      try{ bossModal.querySelector('.modal-card').scrollTop = 0; }catch(e){}
    }

    function bossCloseModal(){
      closeModal(bossModal);
      setPageScrollLocked(false);
      // stop timer
      challengeStop();
      if(bossChallenge) bossChallenge.hidden = true;

      // revert theme (and stop boss music if it's currently playing)
      document.body.classList.remove('ice-mode');
      stopBossMusic();
    }


    function startBossfight(){
      const allDone = completedCount() === TOTAL_BLOCKS;
      if(!allDone){
        toastShow('Bossfight', 'Prima completa tutti i blocchi (P1 + P2).');
        return;
      }

      // Ticket: 15 monete d'oro (una sola volta)
      if(!state.bossUnlockedOnce){
        if(state.coins.gold < 15){
          toastShow('Bossfight', 'Servono 15 monete d’oro (le ottieni completando il programma).');
          return;
        }
        state.coins.gold -= 15;
        state.bossUnlockedOnce = true;
        saveState();
        updateCoins();
      }

      // Entrata arena: avviamo la musica della Bossfight (auto).
      // Nota: viene chiamata dentro il click, cosi autoplay e' molto piu probabile.
      playBossMusic();


      // Ice theme
      document.body.classList.add('ice-mode');

      // Showoff rapido (chip wall) + poi apri bossfight
      bossIntro.classList.add('show');
      renderBossIntro();
      setTimeout(()=>{
        bossIntro.classList.remove('show');
        bossOpenModal();
      }, 950);
    }


    // =========================
    // Audio
    // =========================

    function playTrack(id, opts={}){
      const track = TRACKS.find(t=>t.id===id);
      // se stavi usando la musica boss, passando a una traccia jukebox la disattiviamo
      try{ audio.dataset.bossMusic = '0'; }catch(e){}
      if(!track) return;

      const unlocked = trackUnlocked(track) || opts.force;
      if(!unlocked){
        toastShow('Jukebox', 'Traccia ancora bloccata.');
        return;
      }

      try{
        audio.pause();
        audio.currentTime = 0;
      }catch(e){}

      audio.src = track.file;
      audio.dataset.track = track.label;
      audio.dataset.trackId = track.id;
      const playPromise = audio.play();
      if(playPromise && typeof playPromise.then==='function'){
        playPromise.then(()=>{
          if(opts.showToast!==false) toastShow('🎧 Now playing', track.label);
          nowPlaying.textContent = track.label;
        }).catch(()=>{
          // Autoplay blocked or missing file
          if(opts.showToast!==false) toastShow('Audio', 'Impossibile avviare (autoplay bloccato o file mancante).');
        });
      }else{
        if(opts.showToast!==false) toastShow('🎧 Now playing', track.label);
      }
    }

    
    // =========================
    // Bossfight music controls
    // =========================

    function updateBossMusicBtn(){
      if(!bossMusicBtn) return;
      const on = audio && audio.dataset.bossMusic === '1' && !audio.paused;
      bossMusicBtn.innerHTML = on
        ? '<span class="dot ok"></span><span>Musica: ON</span>'
        : '<span class="dot"></span><span>Musica: OFF</span>';
    }

    function ensureBossMusicBtn(){
      if(bossMusicBtn) return;
      if(!bossClose) return;
      const host = bossClose.parentElement || (bossModal ? bossModal.querySelector('.modal-head') : null) || (bossModal ? bossModal.querySelector('.modal-card') : null) || bossModal;
      if(!host) return;

      const btn = document.createElement('button');
      btn.id = 'bossMusicBtn';
      btn.className = 'btn sm';
      btn.title = 'Avvia/Ferma la musica della Bossfight';
      btn.style.marginRight = '8px';
      btn.addEventListener('click', ()=>{
        if(audio && audio.dataset.bossMusic === '1' && !audio.paused) stopBossMusic();
        else playBossMusic();
      });

      host.insertBefore(btn, bossClose);
      bossMusicBtn = btn;
      updateBossMusicBtn();
    }

    function playBossMusic(){
      if(!audio) return;
      ensureBossMusicBtn();

      audio.dataset.bossMusic = '1';
      audio.dataset.trackId = 'boss';
      audio.dataset.track = BOSS_MUSIC_LABEL;

      try{ audio.pause(); audio.currentTime = 0; }catch(e){}
      audio.src = BOSS_MUSIC_FILE;

      const p = audio.play();
      if(p && typeof p.then === 'function'){
        p.then(()=>{
          nowPlaying.textContent = BOSS_MUSIC_LABEL;
          updateBossMusicBtn();
        }).catch(()=>{
          updateBossMusicBtn();
          toastShow('Audio', 'Autoplay bloccato: premi "Musica" nella Bossfight per avviare.');
        });
      }else{
        nowPlaying.textContent = BOSS_MUSIC_LABEL;
        updateBossMusicBtn();
      }
    }

    function stopBossMusic(){
      if(!audio) return;
      if(audio.dataset.bossMusic === '1'){
        try{ audio.pause(); }catch(e){}
        try{ audio.currentTime = 0; }catch(e){}
        audio.dataset.bossMusic = '0';
        if(audio.dataset.trackId === 'boss') audio.dataset.trackId = '';
        if(audio.dataset.track === BOSS_MUSIC_LABEL) audio.dataset.track = '';
        nowPlaying.textContent = '-';
      }
      updateBossMusicBtn();
    }

function stopAudio(){
      try{ audio.pause(); }catch(e){}
      try{ audio.currentTime = 0; }catch(e){}
      // Se era musica boss, spegniamo il flag (cosi non interferisce con altre tracce)
      try{ audio.dataset.bossMusic = '0'; }catch(e){}
      nowPlaying.textContent = '-';
    }

    // aggiorna pulsante musica boss quando finisce
    try{ audio.addEventListener('ended', ()=>{ updateBossMusicBtn(); }); }catch(e){}

    // =========================
    // Easter egg
    // =========================

    const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let keyBuf = [];

    function enableEgg(reason=''){
      if(state.eggFound) return;
      state.eggFound = true;
      saveState();
      toastShow('Easter egg найден', `Hai trovato l’easter egg! ${reason ? '· '+reason : ''}`);
      checkAchievements();
      renderJukebox();
      renderStats();
    }

    // click 7 times in 2 seconds on silver coin
    let clickTimes = [];
    silverBtn.addEventListener('click', ()=>{
      const t = Date.now();
      clickTimes.push(t);
      clickTimes = clickTimes.filter(x => t - x < 2000);
      if(clickTimes.length >= 7){
        enableEgg('ψ×7');
        clickTimes = [];
      }
    });

    document.addEventListener('keydown', (e)=>{
      const k = e.key;
      if(k==='Escape' && bossModal && bossModal.classList.contains('show')){ bossCloseModal(); return; }
      keyBuf.push(k);
      keyBuf = keyBuf.slice(-KONAMI.length);
      const ok = keyBuf.every((x, i) => {
        const target = KONAMI[i];
        if(target.length === 1) return String(x).toLowerCase() === target;
        return x === target;
      });
      if(ok){
        enableEgg('Konami');
        keyBuf = [];
      }

      // Viewer shortcuts
      if(viewerModal.classList.contains('show')){
        if(k === 'Escape'){ closeModal(viewerModal); }
        if(k === 'ArrowLeft'){ setViewerIndex(currentIndex-1); }
        if(k === 'ArrowRight'){ setViewerIndex(currentIndex+1); }
      }
      if(zoomModal.classList.contains('show') && k === 'Escape') closeModal(zoomModal);
      if(glossModal.classList.contains('show') && k === 'Escape') closeModal(glossModal);
      if(achModal.classList.contains('show') && k === 'Escape') closeModal(achModal);
      if(walletModal.classList.contains('show') && k === 'Escape') closeModal(walletModal);
      if(jukeboxModal.classList.contains('show') && k === 'Escape') closeModal(jukeboxModal);
    });

    // =========================
    // Events
    // =========================

    function escapeHtml(s){
      return String(s).replace(/[&<>\"']/g, (c)=>({
        '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'
      }[c] || c));
    }

    btnExpandAll.addEventListener('click', ()=>{
      $$('details.block').forEach(d=> d.open = true);
      toastShow('Indice', 'Tutti i blocchi espansi.');
    });
    btnCollapseAll.addEventListener('click', ()=>{
      $$('details.block').forEach(d=> d.open = false);
      toastShow('Indice', 'Tutti i blocchi chiusi.');
    });

    btnReset.addEventListener('click', ()=>{
      const ok = confirm('Reset totale progressi? (solo sul browser: localStorage)');
      if(!ok) return;
      localStorage.removeItem(STORAGE_KEY);
      if(typeof STORAGE_KEY_FALLBACK !== 'undefined') localStorage.removeItem(STORAGE_KEY_FALLBACK);
      state = loadState();
      toastShow('Reset', 'Progressi resettati.');
      location.reload();
    });

    function confirmLeaveIndex(){
      const ok = confirm('Vuoi tornare all’indice principale?');
      if(ok){
        window.location.href = 'https://amrierscuo.github.io/Computational-Physics/Args/Phy/Phy.html';
      }
    }

    btnMainIndex.addEventListener('click', confirmLeaveIndex);

    brandHome.addEventListener('click', ()=>{
      window.scrollTo({ top:0, behavior:'smooth' });
    });

    btnToTop.addEventListener('click', ()=> window.scrollTo({ top:0, behavior:'smooth' }));

    window.addEventListener('scroll', ()=>{
      const y = window.scrollY || document.documentElement.scrollTop;
      btnToTop.style.display = y > 600 ? '' : 'none';
    }, { passive:true });

    // Viewer controls
    vPrev.addEventListener('click', ()=> setViewerIndex(currentIndex-1));
    vNext.addEventListener('click', ()=> setViewerIndex(currentIndex+1));
    vClose.addEventListener('click', ()=> closeModal(viewerModal));

    let zoomReqId = 0;
    vZoom.addEventListener('click', ()=>{
      if(!currentBlock) return;
      const files = currentBlock.files || [];
      const pageNum = files[currentIndex];
      if(!pageNum) return;

      // Renderizza di nuovo a scala piu' alta: zoom molto piu nitido rispetto al semplice resize.
      zImg.src = TINY_BLANK;
      openModal(zoomModal);

      const req = String(++zoomReqId);
      zImg.dataset.req = req;

      const ZOOM_SCALE = Math.max(VIEW_SCALE, 3.0);
      pdfPageToImgUrl(Number(pageNum), ZOOM_SCALE)
        .then((url)=>{
          if(zImg.isConnected && zoomModal.classList.contains('show') && zImg.dataset.req === req){
            zImg.src = url;
          }
        })
        .catch(()=>{ /* placeholder */ });
    });
    zClose.addEventListener('click', ()=> closeModal(zoomModal));

    vMark.addEventListener('click', ()=>{
      if(!currentBlock) return;
      markBlockDone(currentBlock.id, vMark);
    });

    // Glossary
    btnGlossario.addEventListener('click', ()=>{ renderGlossary(); openModal(glossModal); glossSearch.focus(); });
    glossClose.addEventListener('click', ()=> closeModal(glossModal));
    glossSearch.addEventListener('input', renderGlossary);

    // Achievements
    btnAchievements.addEventListener('click', ()=>{ renderAchievements(); openModal(achModal); });
    achClose.addEventListener('click', ()=> closeModal(achModal));

    // Wallet
    btnWallet.addEventListener('click', ()=>{ refreshCoins(); openModal(walletModal); });
    walletClose.addEventListener('click', ()=> closeModal(walletModal));
    btnConvert.addEventListener('click', convertSilverToGold);

    // Jukebox
    btnJukebox.addEventListener('click', ()=>{ renderJukebox(); openModal(jukeboxModal); });
    jbClose.addEventListener('click', ()=> closeModal(jukeboxModal));
    jbStop.addEventListener('click', stopAudio);

    btnKonami.addEventListener('click', ()=>{
      toastShow('Hint', '↑↑↓↓←→←→BA  (oppure ψ×7 sulla moneta Silver)');
    });

    // Boss
    btnBoss.addEventListener('click', startBossfight);

    // Boss modal events
    if(bossModal){
      bossModal.addEventListener('click', (e)=>{ if(e.target === bossModal) bossCloseModal(); });
    }
    if(bossClose) bossClose.addEventListener('click', bossCloseModal);
    if(bossBackHome) bossBackHome.addEventListener('click', () => {
      const ok = confirm('Vuoi tornare al menu principale?');
      if(ok) bossCloseModal();
    });
    if(bossScrollTop) bossScrollTop.addEventListener('click', () => {
      try{ bossModal.querySelector('.modal-card').scrollTo({ top:0, behavior:'smooth' }); }catch(e){}
    });
    if(bossRandomBtn) bossRandomBtn.addEventListener('click', openRandomChallenge);
    if(bossResetBtn) bossResetBtn.addEventListener('click', () => {
      const ok = confirm('Reset bossfight: vuoi togliere tutti i check delle DIM? (Non tocca i blocchi P1/P2)');
      if(!ok) return;
      ensureBossState();
      state.boss.done = {};
      saveState();
      bossRenderList();
      toastShow('Bossfight', 'Reset completato.');
    });

    if(challengeClose) challengeClose.addEventListener('click', () => {
      challengeStop();
      if(bossChallenge) bossChallenge.hidden = true;
    });
    if(challengeStartBtn) challengeStartBtn.addEventListener('click', challengeToggle);
    if(challengeDoneBtn) challengeDoneBtn.addEventListener('click', () => {
      markChallengeDone();
    });


    // Toast
    toastClose.addEventListener('click', toastHide);
    toastEl.addEventListener('click', (e)=>{
      if(e.target === toastEl) toastHide();
    });

    // Coin clicks: little feedback
    goldBtn.addEventListener('click', ()=> spin(goldCoin,true));

    // =========================
    // Boot
    // =========================

    function boot(){
      renderLists();
      renderAll();

      // unlock jukebox if already eligible (coming back)
      unlockJukeboxIfNeeded();
      checkAchievements();
      renderStats();

      // viewer modal click outside to close
      viewerModal.addEventListener('click', (e)=>{ if(e.target === viewerModal) closeModal(viewerModal); });
      zoomModal.addEventListener('click', (e)=>{ if(e.target === zoomModal) closeModal(zoomModal); });
      glossModal.addEventListener('click', (e)=>{ if(e.target === glossModal) closeModal(glossModal); });
      achModal.addEventListener('click', (e)=>{ if(e.target === achModal) closeModal(achModal); });
      walletModal.addEventListener('click', (e)=>{ if(e.target === walletModal) closeModal(walletModal); });
      jukeboxModal.addEventListener('click', (e)=>{ if(e.target === jukeboxModal) closeModal(jukeboxModal); });
    }


    // --- Extra UI controls (SFX • Footer • Scroll Down) ---
    function syncSfxBtn(){
      if(!btnSfx || !sfxIcon) return;
      sfxIcon.textContent = state.sfxOn ? '🔊' : '🔇';
      btnSfx.setAttribute('aria-pressed', state.sfxOn ? 'true' : 'false');
    }
    syncSfxBtn();

    if(btnSfx){
      btnSfx.addEventListener('click', ()=>{
        state.sfxOn = !state.sfxOn;
        saveState();
        syncSfxBtn();
        toast(state.sfxOn ? 'SFX: ON' : 'SFX: OFF');
      });
    }

    if(btnMainIndexFooter){
      btnMainIndexFooter.addEventListener('click', ()=> confirmLeaveIndex());
    }
    if(btnBossFooter){
      btnBossFooter.addEventListener('click', ()=> startBossfight());
    }

    function completeAllForBoss(){
      for(const b of TIMELINE){ state.completed[b.id] = true; }
      state.coins.gold = Math.max(state.coins.gold || 0, 15);
      state.coins.silver = Math.max(state.coins.silver || 0, 200);
      saveState();
      renderAll();
      refreshCoins();
      unlockJukeboxIfNeeded();
      checkAchievements();
      renderStats();
    }

    if(btnCompleteAll){
      btnCompleteAll.addEventListener('click', ()=>{
        const ok = confirm(`Segnare TUTTO come completato e saltare alla Bossfight?

(Usalo per test o se vuoi andare diretto alla simulazione orale.)`);
        if(!ok) return;
        completeAllForBoss();
        toast('✔ Programma marcato come completato');
        startBossfight();
      });
    }

    if(btnToBottom){
      btnToBottom.addEventListener('click', ()=>{
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      });
    }

    // show/hide floating buttons
    window.addEventListener('scroll', ()=>{
      const y = window.scrollY || document.documentElement.scrollTop;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      if(btnToTop) btnToTop.style.display = y>600 ? '' : 'none';
      if(btnToBottom) btnToBottom.style.display = (max - y) > 600 ? '' : 'none';
    }, {passive:true});

    boot();

  })();
  