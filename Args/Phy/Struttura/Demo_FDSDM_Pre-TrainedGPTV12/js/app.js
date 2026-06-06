import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

(() => {
  const DATA = window.FDSDM_DATA;
  const MAP_FX = {
    atomic: {
      glows:[[96,34,18,16,'rgba(255,0,111,.42)'],[53,54,12,12,'rgba(255,100,40,.32)'],[14,45,13,13,'rgba(86,214,255,.32)']],
      rings:[[27,24,1],[84,36,2],[96,26,2]],
      lasers:[[49,31,20,'18deg','#ff3e97'],[55,31,17,'-21deg','#ff3e97']]
    },
    molecular: {
      glows:[[48,31,12,12,'rgba(135,91,255,.36)'],[93,48,18,16,'rgba(255,64,167,.35)'],[62,64,14,12,'rgba(71,244,207,.24)']],
      rings:[[31,48,1],[60,32,2],[78,25,2]],
      lasers:[]
    },
    crystal: {
      glows:[[31,65,18,16,'rgba(142,66,255,.26)'],[57,78,18,14,'rgba(255,114,44,.28)'],[96,29,20,18,'rgba(87,225,255,.36)']],
      rings:[[41,39,1],[78,59,2],[96,27,2]],
      lasers:[[69,50,12,'-15deg','#64e7ff'],[74,48,10,'22deg','#b06cff']]
    }
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const LEVEL_SECONDS = 10 * 60;
  const SAVE_KEY = "fdsdm_pretrained_v12_save";
  const LEVEL_TASKS = ["core", "concepts", "links", "oral", "forge"];
  const TASK_LABELS = { core:"CORE", concepts:"CONCEPTS", links:"CONNECTIONS", oral:"ORAL", forge:"FORGE" };
  const TERMINAL_COUNT = LEVEL_TASKS.length;
  const langStore = "fdsdm_pretrained_v12_lang";

  let lang = localStorage.getItem(langStore) || "it";
  let route = "menu";
  let currentWorld = "atomic";
  let currentLesson = null;
  let selectedLesson = null;
  let levelSecondsLeft = LEVEL_SECONDS;
  let levelMsLeft = LEVEL_SECONDS * 1000;
  let levelEndAt = 0;
  let levelTimer = null;
  let activeTask = null;
  let sfxEnabled = true;
  let musicEnabled = false;
  let cameraMode = "fps";
  let levelStartedAt = 0;
  let levelElapsedMs = 0;
  let replayPath = [];
  let lastReplaySampleAt = 0;
  let replayAnimation = null;
  let replayHoldLesson = null;
  let topReplay = null;
  let musicLevels = { bass:0, mid:0, treble:0, beat:0, energy:0 };
  let musicSmooth = { bass:0, mid:0, treble:0, beat:0, energy:0 };
  let lastBeatAt = 0;

  let save = loadSave();
  let three = null;

  // ---------- Audio V6: background tracks + WebAudio SFX / walking + portal transitions ----------
  const audioPaths = DATA.audio;
  const musicTracks = {
    menu: new Audio(audioPaths.menu?.file || audioPaths.music.file),
    atomic: new Audio(audioPaths.atomic?.file || audioPaths.music.file),
    molecular: new Audio(audioPaths.molecular?.file || audioPaths.music.file),
    crystal: new Audio(audioPaths.crystal?.file || audioPaths.music.file),
    level: new Audio(audioPaths.music.file),
    boss: new Audio(audioPaths.boss?.file || audioPaths.music.file)
  };
  Object.values(musicTracks).forEach(a => {
    a.loop = true;
    a.volume = 0;
    a.preload = "auto";
    a.playsInline = true;
    a.setAttribute("playsinline", "");
    try{ a.load(); }catch{}
  });

  const audioFX = {
    ctx: null,
    buffers: {},
    loading: null,
    currentMusic: null,
    walkSrc: null,
    walkGain: null,
    lastHitAt: 0,
    activeMusicKey: "menu",
    walkActive: false,
    analyser: null,
    freq: null,
    musicSources: new WeakMap()
  };

  async function ensureAudio(){
    if(audioFX.ctx) {
      try{ await audioFX.ctx.resume(); }catch{}
      return audioFX;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioFX.ctx = Ctx ? new Ctx() : null;
    if(!audioFX.ctx) return audioFX;
    audioFX.analyser = audioFX.ctx.createAnalyser();
    audioFX.analyser.fftSize = 1024;
    audioFX.analyser.smoothingTimeConstant = .72;
    audioFX.freq = new Uint8Array(audioFX.analyser.frequencyBinCount);
    audioFX.analyser.connect(audioFX.ctx.destination);
    Object.values(musicTracks).forEach(a => {
      try{
        if(!audioFX.musicSources.has(a)){
          const src = audioFX.ctx.createMediaElementSource(a);
          src.connect(audioFX.analyser);
          audioFX.musicSources.set(a, src);
        }
      }catch(err){ /* already connected or unsupported */ }
    });
    const load = async (key, url) => {
      try{
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        audioFX.buffers[key] = await audioFX.ctx.decodeAudioData(arr);
      }catch(err){ console.warn("audio buffer failed", key, err); }
    };
    audioFX.loading = Promise.all([
      load("glitch", audioPaths.glitch.file),
      load("walk", audioPaths.walk.file)
    ]).finally(()=>{ audioFX.loading = null; });
    try{ await audioFX.ctx.resume(); }catch{}
    await audioFX.loading;
    return audioFX;
  }

  function t(key){ return DATA.i18n[lang]?.[key] || DATA.i18n.en?.[key] || DATA.i18n.it?.[key] || key; }
  function loc(v){ return typeof v === "string" ? v : (v?.[lang] || v?.en || v?.it || ""); }
  function lessonById(id){ return DATA.lessons.find(l => l.id === Number(id)); }
  function worldLessons(world){ return DATA.lessons.filter(l => l.world === world); }
  function setTerminal(txt){ $("#terminalText").textContent = txt; }


  function setLoaderProgress(title="Loading", sub="preparing assets...", pct=0){
    const k = $("#loaderKicker"), tEl = $("#loaderTitle"), sEl = $("#loaderSub"), b = $("#loaderProgressBar");
    if(k) k.textContent = "V12 PRELOAD";
    if(tEl) tEl.textContent = title;
    if(sEl) sEl.textContent = sub;
    if(b) b.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }
  function waitWithTimeout(promise, ms=2800){
    return Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]);
  }
  function preloadImage(src){
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
      if(img.decode) img.decode().then(()=>resolve(true)).catch(()=>{});
    });
  }
  function mediaReady(a){
    return new Promise(resolve => {
      if(!a) return resolve(false);
      if(a.readyState >= 2) return resolve(true);
      const done = () => { cleanup(); resolve(true); };
      const fail = () => { cleanup(); resolve(false); };
      const cleanup = () => { a.removeEventListener('canplay', done); a.removeEventListener('loadedmetadata', done); a.removeEventListener('error', fail); };
      a.addEventListener('canplay', done, {once:true});
      a.addEventListener('loadedmetadata', done, {once:true});
      a.addEventListener('error', fail, {once:true});
      try{ a.load(); }catch{}
    });
  }
  async function primeMusicElements(){
    const tracks = Object.entries(musicTracks);
    let done = 0;
    for(const [key,a] of tracks){
      setLoaderProgress('Audio cache', `preparing ${key}...`, 45 + done / Math.max(1, tracks.length) * 35);
      await waitWithTimeout(mediaReady(a), 1600);
      done++;
    }
  }
  async function preloadEssentialAssets(){
    show('#loadingScreen');
    setLoaderProgress('Loading maps', 'preloading map images...', 8);
    const maps = Object.values(DATA.worlds).map(w => w.map);
    for(let i=0;i<maps.length;i++){
      setLoaderProgress('Loading maps', `map ${i+1}/${maps.length}`, 10 + i*10);
      await preloadImage(maps[i]);
    }
    setLoaderProgress('Preparing audio', 'metadata + cache warmup...', 45);
    await waitWithTimeout(primeMusicElements(), 5000);
    setLoaderProgress('Ready', 'UI calibrated for mobile and desktop', 100);
    await new Promise(r => setTimeout(r, 260));
  }

  function playGlitchSlice(){
    if(!sfxEnabled) return;
    ensureAudio().then(() => {
      const ctx = audioFX.ctx, buf = audioFX.buffers.glitch;
      if(!ctx || !buf) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      const dur = Math.min(0.25, Math.max(0.04, buf.duration));
      const offset = Math.max(0, Math.random() * Math.max(0, buf.duration - dur));
      src.buffer = buf;
      src.playbackRate.value = 0.92 + Math.random() * 0.22;
      gain.gain.value = 0.28;
      src.connect(gain).connect(ctx.destination);
      src.start(0, offset, dur);
    });
  }

  function playSfx(kind="glitch"){
    if(!sfxEnabled) return;
    playGlitchSlice();
  }

  function setWalking(active){
    if(audioFX.walkActive === active && (active ? !!audioFX.walkSrc : !audioFX.walkSrc)) return;
    audioFX.walkActive = active;
    ensureAudio().then(() => {
      const ctx = audioFX.ctx, buf = audioFX.buffers.walk;
      if(!ctx || !buf) return;
      if(active && !audioFX.walkSrc){
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = 0.95 + Math.random() * 0.08;
        gain.gain.value = 0.0;
        src.connect(gain).connect(ctx.destination);
        src.start();
        gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.08);
        audioFX.walkSrc = src;
        audioFX.walkGain = gain;
      }else if(!active && audioFX.walkSrc){
        const src = audioFX.walkSrc, gain = audioFX.walkGain;
        audioFX.walkSrc = null; audioFX.walkGain = null;
        try{
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.10);
          setTimeout(()=>{ try{ src.stop(); }catch{} }, 130);
        }catch{ try{ src.stop(); }catch{} }
      }
    });
  }

  function playCollisionGlitch(){
    const now = performance.now();
    if(now - audioFX.lastHitAt < 220) return;
    audioFX.lastHitAt = now;
    playGlitchSlice();
  }

  function setMusicTrack(key, volume=0.22){
    audioFX.activeMusicKey = key;
    if(!musicEnabled) return;
    const next = musicTracks[key] || musicTracks.menu;
    if(audioFX.currentMusic === next && !next.paused) return;
    Object.values(musicTracks).forEach(a => {
      if(a !== next){ try{ a.pause(); a.volume = 0; }catch{} }
    });
    audioFX.currentMusic = next;
    try{ next.load(); }catch{}
    next.volume = volume;
    next.play().catch(()=>{ setTerminal("audio waiting for user gesture · tap MUSIC again if needed"); });
  }

  function updateRouteMusic(){
    if(route === "level"){
      if(currentLesson?.boss) setMusicTrack("boss", 0.24);
      else setMusicTrack("level", 0.22);
    }else if(route === "map"){
      setMusicTrack(currentWorld, 0.24);
    }else{
      setMusicTrack("menu", 0.20);
    }
  }

  function sampleMusicLevels(){
    const now = performance.now();
    if(audioFX.analyser && musicEnabled && audioFX.currentMusic && !audioFX.currentMusic.paused){
      audioFX.analyser.getByteFrequencyData(audioFX.freq);
      const avg = (a,b) => { let sum=0,n=0; for(let i=a;i<b && i<audioFX.freq.length;i++){ sum += audioFX.freq[i]; n++; } return n ? sum/(n*255) : 0; };
      const bass = avg(1,14), mid = avg(14,80), treble = avg(80,210);
      const energy = bass*.58 + mid*.28 + treble*.14;
      const beat = Math.max(0, Math.min(1, (bass - musicSmooth.bass) * 4.2 + (energy - musicLevels.energy) * 1.8));
      musicLevels = { bass, mid, treble, beat, energy };
      if(beat > .38 && now - lastBeatAt > 180){ lastBeatAt = now; document.body.classList.add('beatHit'); setTimeout(()=>document.body.classList.remove('beatHit'),100); }
    }else{
      const b = Math.sin(now*.004)*.5+.5;
      musicLevels = { bass:b*.58, mid:(Math.sin(now*.0027+1)*.5+.5)*.42, treble:(Math.sin(now*.006+3)*.5+.5)*.34, beat: Math.sin(now*.004)>0.945 ? .65 : 0, energy:b };
    }
    for(const k of Object.keys(musicSmooth)) musicSmooth[k] += (musicLevels[k] - musicSmooth[k]) * (k === 'beat' ? .32 : .13);
    document.documentElement.style.setProperty('--bass', musicSmooth.bass.toFixed(3));
    document.documentElement.style.setProperty('--mid', musicSmooth.mid.toFixed(3));
    document.documentElement.style.setProperty('--treble', musicSmooth.treble.toFixed(3));
    document.documentElement.style.setProperty('--beat', musicSmooth.beat.toFixed(3));
    document.documentElement.style.setProperty('--energy', musicSmooth.energy.toFixed(3));
    // V12: la base della mappa resta perfettamente fissa.
    // Solo hotspot, glows, rings, laser e nodi reagiscono alla musica.
    if(route === 'map'){
      document.documentElement.style.setProperty('--mapDriftX', '0px');
      document.documentElement.style.setProperty('--mapDriftY', '0px');
    }
  }

  function stopAllAudio(){
    setWalking(false);
    Object.values(musicTracks).forEach(a => { try{ a.pause(); }catch{} });
    audioFX.currentMusic = null;
  }

  function loadSave(){
    const base = { version: 12, currentWorld: "atomic", currentLesson: 1, unlocked: {1:true}, completed: {}, notes: {}, tasks: {}, debug: false };
    try{ return Object.assign(base, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); }catch{ return base; }
  }
  function persist(){ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  function isUnlocked(id){ return !!save.unlocked[id] || id === 1; }
  function isDone(id){ return !!save.completed[id]; }
  function unlockNext(id){ const next = lessonById(id + 1); if(next) save.unlocked[next.id] = true; }
  function levelTaskKey(id){ return `L${String(id).padStart(2,"0")}`; }
  function getTaskState(id){
    const k = levelTaskKey(id);
    save.tasks[k] ||= {};
    for(const task of LEVEL_TASKS) save.tasks[k][task] ||= false;
    // start/finish are portals, not scoring terminals. Old saves may contain start; it is ignored.
    return save.tasks[k];
  }
  function terminalDoneCount(id){ const s = getTaskState(id); return LEVEL_TASKS.filter(k => !!s[k]).length; }
  function allTasksDone(id){ const s = getTaskState(id); return LEVEL_TASKS.every(k => !!s[k]); }

  function applyLang(){
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
    $$('.chip[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    if(route === "map") renderMap(currentWorld);
    if(selectedLesson) showLessonPanel(selectedLesson);
    if(currentLesson) updateLevelText();
  }

  function show(id){ ["#menuScreen", "#mapScreen", "#levelScreen", "#loadingScreen"].forEach(s => $(s).classList.add("hidden")); $(id).classList.remove("hidden"); }
  function loading(title, cb){
    route = "loading"; show("#loadingScreen");
    setLoaderProgress(title, "transition sync...", 35);
    playSfx("glitch");
    setTimeout(() => { setLoaderProgress(title, "ready", 100); cb(); }, 420);
  }
  function goMenu(){ route = "menu"; destroyLevel3D(); show("#menuScreen"); setTerminal("menu online · select map or continue"); updateRouteMusic(); }
  function openWorld(world){
    currentWorld = world; save.currentWorld = world; persist();
    loading(`${DATA.worlds[world].title} transition`, () => { route = "map"; show("#mapScreen"); renderMap(world); updateRouteMusic(); });
  }

  function renderMap(world){
    const w = DATA.worlds[world];
    currentWorld = world;
    document.documentElement.style.setProperty("--accent", w.color);
    document.documentElement.style.setProperty("--accent2", w.accent);
    $("#worldIndex").textContent = w.index;
    $("#worldTitle").textContent = w.title;
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.routeWorld === world));
    const stage = $("#mapStage");
    const img = $("#mapImage");
    const layer = $("#nodeLayer");
    stage.classList.add("loading");
    layer.innerHTML = "";
    const buildNodes = () => {
      layer.innerHTML = "";
      renderMapFxLayer(layer, world);
      for(const l of worldLessons(world)){
        const b = document.createElement("button");
        b.className = "node";
        b.type = "button";
        b.textContent = `L${String(l.id).padStart(2,"0")}`;
        b.style.left = `${l.x}%`; b.style.top = `${l.y}%`;
        if(!isUnlocked(l.id)) b.classList.add("locked");
        if(isDone(l.id)) b.classList.add("done");
        if(l.boss) b.classList.add("boss");
        if(l.stat) b.classList.add("stat");
        b.addEventListener("click", () => { playSfx(); showLessonPanel(l); });
        layer.appendChild(b);
      }
      requestAnimationFrame(() => stage.classList.remove("loading"));
    };
    img.onload = buildNodes;
    img.onerror = buildNodes;
    if(!img.src.endsWith(w.map)) img.src = w.map;
    else if(img.complete) buildNodes();
    updateProgress();
    $("#sidePanel").classList.remove("open");
    setTerminal(`${w.title} · ${t(`world.${world}.desc`)}`);
  }
  function fxEl(parent, cls, style={}){
    const e = document.createElement('div');
    e.className = cls;
    Object.entries(style).forEach(([k,v]) => e.style.setProperty(k,v));
    parent.appendChild(e);
    return e;
  }
  function renderMapFxLayer(layer, world){
    const fx = MAP_FX[world] || {};
    for(const g of fx.glows || []) fxEl(layer, 'mapGlow', {'--x':g[0]+'%','--y':g[1]+'%','--w':g[2]+'%','--h':g[3]+'%','--c':g[4]});
    for(const r of fx.rings || []) fxEl(layer, 'mapRing '+(r[2]===2?'r2':''), {'--x':r[0]+'%','--y':r[1]+'%'});
    for(const l of fx.lasers || []) fxEl(layer, 'mapLaser', {'--x':l[0]+'%','--y':l[1]+'%','--w':l[2]+'%','--rot':l[3],'--c':l[4]});
  }
  function showLessonPanel(l){
    selectedLesson = l;
    const locked = !isUnlocked(l.id);
    $("#panelKicker").textContent = `${DATA.worlds[l.world].title} · L${String(l.id).padStart(2,"0")}`;
    $("#panelTitle").textContent = loc(l.title);
    $("#panelMeta").textContent = `${l.date} · ${l.time} · ${l.section}`;
    $("#panelDescription").textContent = locked ? "Locked: completa i livelli precedenti oppure usa DEBUG." : t("panel.prototype");
    $("#panelTags").innerHTML = [ ...(l.tags||[]), l.stat ? "Statistical Current" : null, l.boss ? "Boss" : null ].filter(Boolean).map(x=>`<span class="tag">${x}</span>`).join("");
    $("#enterLevelBtn").disabled = locked;
    $("#markDoneBtn").disabled = locked;
    $("#sidePanel").classList.add("open");
  }
  function updateProgress(){
    const n = DATA.lessons.filter(l => isDone(l.id)).length;
    $("#progressText").textContent = `${n}/36`;
    $("#progressBar").style.width = `${(n/36)*100}%`;
  }

  function transitionOverlay(mode, title, sub, cb, duration=1550){
    const el = $("#levelTransition");
    if(!el){ cb?.(); return; }
    const titleEl = $("#transitionTitle");
    const subEl = $("#transitionSub");
    const phaseEl = $("#transitionPhase");
    const barEl = $("#transitionBar");
    titleEl.textContent = title || "Transition";
    subEl.textContent = sub || "";
    phaseEl.textContent = mode === "out" ? "STABILIZING CORE" : "PORTAL SYNC";
    barEl.style.transition = "none";
    barEl.style.width = "0%";
    el.className = `levelTransition ${mode || "in"} show`;
    playSfx("glitch");
    // force style recalc before animating bar
    void barEl.offsetWidth;
    barEl.style.transition = `width ${Math.max(500, duration-300)}ms cubic-bezier(.22,.8,.22,1)`;
    barEl.style.width = "100%";
    setTimeout(() => {
      cb?.();
      if(mode === "out") return;
      el.classList.add("leaving");
      setTimeout(() => { el.className = "levelTransition"; }, 420);
    }, duration);
  }

  function hideTransitionOverlay(){
    const el = $("#levelTransition");
    if(el) el.className = "levelTransition";
  }

  function enterLevel(l){
    currentLesson = l;
    save.currentLesson = l.id; save.currentWorld = l.world; persist();
    loading(`L${String(l.id).padStart(2,"0")} · ${loc(l.title)}`, () => {
      route = "level"; show("#levelScreen"); updateRouteMusic();
      $("#taskPanel").classList.remove("open");
      $("#pointerOverlay").style.display = "none";
      updateLevelText();
      levelMsLeft = LEVEL_SECONDS * 1000;
      levelSecondsLeft = LEVEL_SECONDS;
      levelStartedAt = 0;
      levelElapsedMs = 0;
      replayPath = [];
      lastReplaySampleAt = 0;
      $("#levelReplay")?.classList.add("hidden");
      initLevel3D(l);
      updateTimer();
      transitionOverlay(
        "in",
        `L${String(l.id).padStart(2,"0")} · ${loc(l.title)}`,
        `${DATA.worlds[l.world].title} gate · 10:00.000 challenge ready`,
        () => {
          startTimer();
          $("#pointerOverlay").style.display = "grid";
          setTerminal(`portal stabilized · L${String(l.id).padStart(2,"0")} ready · click to play`);
        },
        1650
      );
    });
  }
  function updateLevelText(){
    if(!currentLesson) return;
    const l = currentLesson;
    const done = allTasksDone(l.id);
    const completedCount = terminalDoneCount(l.id);
    $("#levelKicker").textContent = `L${String(l.id).padStart(2,"0")} · ${DATA.worlds[l.world].title} · ${l.date} ${l.time}`;
    $("#levelTitle").textContent = loc(l.title);
    $("#levelStateLine").textContent = `FPS room · ${l.section} · ${completedCount}/${TERMINAL_COUNT} terminals · ${done?"finish portal unlocked":"finish locked"} · Q exit`;
    $("#lockTitle").textContent = `L${String(l.id).padStart(2,"0")} chamber ready`;
    updateTaskChecklist();
  }
  function formatMs(ms){
    const safe = Math.max(0, Math.floor(ms));
    const m = Math.floor(safe / 60000);
    const s = Math.floor((safe % 60000) / 1000);
    const mm = safe % 1000;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(mm).padStart(3,"0")}`;
  }
  function startTimer(){
    clearInterval(levelTimer);
    levelStartedAt = performance.now();
    levelEndAt = performance.now() + levelMsLeft;
    updateTimer();
    levelTimer = setInterval(() => {
      levelMsLeft = Math.max(0, levelEndAt - performance.now());
      levelSecondsLeft = Math.ceil(levelMsLeft / 1000);
      updateTimer();
      if(levelMsLeft <= 0){ clearInterval(levelTimer); setTerminal("timer expired · late flag active · finish still possible in demo"); }
    }, 47);
  }
  function updateTimer(){
    const label = formatMs(levelMsLeft);
    const box = $("#timerBox");
    $("#timerLabel").textContent = label;
    $("#safeClock").textContent = `SAFE ${label}`;
    $("#timerBar").style.width = `${Math.max(0, Math.min(100, (levelMsLeft/(LEVEL_SECONDS*1000))*100))}%`;
    box.classList.toggle("warning", levelMsLeft <= 60000 && levelMsLeft > 30000);
    box.classList.toggle("danger", levelMsLeft <= 30000);
  }
  function updateTaskChecklist(){
    const el = $("#taskChecklist");
    if(!el || !currentLesson) return;
    const st = getTaskState(currentLesson.id);
    const rows = LEVEL_TASKS.map(k => `<div class="taskChip ${st[k]?"done":""}"><span>${TASK_LABELS[k] || k.toUpperCase()}</span><b>${st[k]?"✓":"○"}</b></div>`);
    rows.push(`<div class="taskChip ${allTasksDone(currentLesson.id)?"done":"lockedFinish"}"><span>FINISH</span><b>${allTasksDone(currentLesson.id)?"OPEN":"LOCKED"}</b></div>`);
    el.innerHTML = rows.join("");
  }
  function exitLevel(){
    hideTransitionOverlay();
    destroyLevel3D(); clearInterval(levelTimer); $("#pointerOverlay").style.display = "none"; openWorld(currentLesson?.world || currentWorld);
  }
  function completeLevel(){
    if(!currentLesson) return;
    const lesson = currentLesson;
    const late = levelMsLeft <= 0;
    const remaining = formatMs(levelMsLeft);
    levelElapsedMs = Math.max(0, LEVEL_SECONDS * 1000 - levelMsLeft);
    save.completed[lesson.id] = { at: new Date().toISOString(), late, remaining, elapsed: formatMs(levelElapsedMs), score: scoreFromTime(levelElapsedMs, late), rank: rankFromTime(levelElapsedMs, late) };
    unlockNext(lesson.id);
    persist();
    clearInterval(levelTimer);
    setWalking(false);
    try{ three?.controls?.unlock(); }catch{}
    setTerminal(`L${String(lesson.id).padStart(2,"0")} complete · replay compiling · ${late?"late flag":"safe clear"}`);
    showReplaySummary(lesson, late, levelElapsedMs, levelMsLeft);
  }
  function rankFromTime(elapsedMs, late=false){
    if(late) return "LATE";
    const pct = elapsedMs / (LEVEL_SECONDS * 1000);
    if(pct <= .35) return "S+";
    if(pct <= .50) return "S";
    if(pct <= .65) return "A";
    if(pct <= .80) return "B";
    if(pct <= .95) return "C";
    return "D";
  }
  function scoreFromTime(elapsedMs, late=false){
    const base = Math.max(0, LEVEL_SECONDS * 1000 - elapsedMs);
    const score = Math.round(base / (LEVEL_SECONDS * 1000) * 100000) + (late ? 0 : 5000);
    return Math.max(0, score);
  }
  function showReplaySummary(lesson, late, elapsedMs, remainingMs){
    replayHoldLesson = lesson;
    const overlay = $("#levelReplay");
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden","false");
    $("#replayKicker").textContent = late ? "LATE CLEAR" : "SAFE CLEAR";
    $("#replayTitle").textContent = `L${String(lesson.id).padStart(2,"0")} COMPLETE`;
    $("#replaySub").textContent = "Broadcast top-camera playback · countdown 10:00.000 · x4 speed";
    $("#replayTime").textContent = formatMs(elapsedMs);
    $("#replayRemaining").textContent = formatMs(remainingMs);
    const rank = rankFromTime(elapsedMs, late), score = scoreFromTime(elapsedMs, late);
    $("#replayRank").textContent = rank;
    $("#replayScore").textContent = "000000";
    $("#rankBar").style.width = "0%";
    $("#replayNote").textContent = "Compiling score...";
    animateScore(score);
    initTopDownReplay();
    renderTopDownReplayAtTime(0, elapsedMs);
    const start = performance.now();
    const lastRecordedMs = replayPath.at(-1)?.t || elapsedMs;
    const playbackTotalMs = Math.max(1, Math.min(elapsedMs, lastRecordedMs));
    const replayDuration = Math.max(900, playbackTotalMs / 4); // run reale, riprodotta a velocità x4
    cancelAnimationFrame(replayAnimation);
    function loop(now){
      const realElapsed = now - start;
      const playbackMs = Math.min(playbackTotalMs, realElapsed * 4);
      renderTopDownReplayAtTime(playbackMs, playbackTotalMs);
      const countdown = Math.max(0, LEVEL_SECONDS * 1000 - playbackMs);
      const pct = Math.min(100, (playbackMs / playbackTotalMs) * 100);
      $("#replayNote").textContent = `TOP CAMERA REC · BRIGHT PASS · TIMER ${formatMs(countdown)} · PLAYBACK x4 · ${pct.toFixed(0)}%`;
      if(realElapsed < replayDuration) replayAnimation = requestAnimationFrame(loop);
      else {
        renderTopDownReplayAtTime(playbackTotalMs, playbackTotalMs);
        $("#replayNote").textContent = `Replay complete · final timer ${formatMs(Math.max(0, LEVEL_SECONDS*1000-playbackTotalMs))} · clear moment reached.`;
      }
    }
    replayAnimation = requestAnimationFrame(loop);
  }
  function animateScore(score){
    const start = performance.now();
    const barPct = Math.min(100, Math.max(0, score / 105000 * 100));
    $("#rankBar").style.width = barPct.toFixed(1) + "%";
    function tick(now){
      const p = Math.min(1, (now - start) / 1400);
      const eased = 1 - Math.pow(1-p, 3);
      $("#replayScore").textContent = String(Math.round(score * eased)).padStart(6,"0");
      if(p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function cleanupTopDownReplay(){
    if(!topReplay) return;
    try{
      if(topReplay.group && three?.scene) three.scene.remove(topReplay.group);
      topReplay.renderer?.dispose?.();
    }catch{}
    topReplay = null;
  }
  function initTopDownReplay(){
    cleanupTopDownReplay();
    const canvas = $("#replayCanvas");
    if(!canvas || !three?.scene) return null;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(360, Math.floor(rect.width * dpr));
    canvas.height = Math.max(220, Math.floor(rect.height * dpr));

    const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // V12: top replay needs broadcast-style visibility, not the darker FPS ambience.
    renderer.toneMappingExposure = 1.72;
    renderer.setClearColor(0x031225, 1);

    const aspect = canvas.width / canvas.height;
    // Fit all invisible-wall bounds (-24..24) with a small cinematic margin.
    const halfH = 28.5;
    const halfW = halfH * aspect;
    const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 180);
    cam.position.set(0, 74, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);

    const group = new THREE.Group();
    group.name = "V12_TopDownReplayOverlay";

    // Replay-only light rig: visible only in the recap renderer.
    const replayLightRig = new THREE.Group();
    replayLightRig.name = "V12_ReplayLightRig";
    replayLightRig.add(new THREE.AmbientLight(0xffffff, 1.05));
    const topLight = new THREE.DirectionalLight(0xffffff, 2.35);
    topLight.position.set(0, 60, 0);
    replayLightRig.add(topLight);
    const fillA = new THREE.PointLight(0x66eaff, 18, 80, 1.4);
    fillA.position.set(-18, 18, -18);
    replayLightRig.add(fillA);
    const fillB = new THREE.PointLight(0xffb347, 12, 70, 1.4);
    fillB.position.set(18, 16, 18);
    replayLightRig.add(fillB);
    group.add(replayLightRig);

    // Thin translucent floor overlay to make the arena bounds readable from above.
    const arena = new THREE.Mesh(
      new THREE.PlaneGeometry(48,48),
      new THREE.MeshBasicMaterial({ color:0x0b3550, transparent:true, opacity:.16, depthWrite:false, side:THREE.DoubleSide })
    );
    arena.rotation.x = -Math.PI/2;
    arena.position.y = 1.0;
    group.add(arena);

    const ghost = new THREE.Mesh(
      new THREE.SphereGeometry(0.86, 32, 16),
      new THREE.MeshBasicMaterial({ color:0xffa12b, transparent:false })
    );
    ghost.position.set(0, 1.65, 9);
    ghost.renderOrder = 990;
    group.add(ghost);

    const ghostGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeReplayGlowTexture(),
      color:0xffb347,
      transparent:true,
      opacity:.88,
      depthTest:false,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    }));
    ghostGlow.scale.set(4.2,4.2,1);
    ghostGlow.position.set(0,1.7,9);
    ghostGlow.renderOrder = 989;
    group.add(ghostGlow);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.28, 0.06, 8, 64),
      new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:.95, depthTest:false, blending:THREE.AdditiveBlending })
    );
    halo.rotation.x = Math.PI/2;
    ghost.add(halo);

    const pathMat = new THREE.LineBasicMaterial({ color:0x69ffb6, transparent:true, opacity:1.0, linewidth:2 });
    const pathGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,1.24,9), new THREE.Vector3(0,1.24,9)]);
    const pathLine = new THREE.Line(pathGeom, pathMat);
    pathLine.renderOrder = 980;
    group.add(pathLine);

    const frameMat = new THREE.LineBasicMaterial({ color:0xffb347, transparent:true, opacity:1.0 });
    const framePts = [
      new THREE.Vector3(-24,1.28,-24), new THREE.Vector3(24,1.28,-24),
      new THREE.Vector3(24,1.28,24), new THREE.Vector3(-24,1.28,24),
      new THREE.Vector3(-24,1.28,-24)
    ];
    const frame = new THREE.Line(new THREE.BufferGeometry().setFromPoints(framePts), frameMat);
    frame.renderOrder = 981;
    group.add(frame);

    const cornerMat = new THREE.MeshBasicMaterial({ color:0xffb347, transparent:true, opacity:.95, depthTest:false });
    [[-24,-24],[24,-24],[24,24],[-24,24]].forEach(([x,z])=>{
      const m = new THREE.Mesh(new THREE.BoxGeometry(.8,.18,.8), cornerMat);
      m.position.set(x,1.38,z);
      group.add(m);
    });

    three.scene.add(group);
    topReplay = { renderer, cam, group, ghost, ghostGlow, halo, pathLine, previousFog: three.scene.fog };
    return topReplay;
  }

  function makeReplayGlowTexture(){
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,"rgba(255,255,255,1)");
    g.addColorStop(.22,"rgba(255,196,92,.75)");
    g.addColorStop(1,"rgba(255,196,92,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,128,128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function renderTopDownReplay(progress=1){
    const endT = replayPath.at(-1)?.t || levelElapsedMs || 1;
    renderTopDownReplayAtTime(endT * progress, endT);
  }

  function sampleReplayPositionAt(playbackMs){
    const points = replayPath.length ? replayPath : [{x:0,z:9,t:0}];
    if(points.length === 1 || playbackMs <= points[0].t) return points[0];
    for(let i=1;i<points.length;i++){
      const a = points[i-1], b = points[i];
      if(b.t >= playbackMs){
        const k = Math.max(0, Math.min(1, (playbackMs - a.t) / Math.max(1, b.t - a.t)));
        return { x: a.x + (b.x-a.x)*k, z: a.z + (b.z-a.z)*k, t: playbackMs };
      }
    }
    return points[points.length-1];
  }

  function renderTopDownReplayAtTime(playbackMs=0, totalMs=1){
    if(!topReplay && !initTopDownReplay()){
      drawReplayCanvasByTime(playbackMs, totalMs);
      return;
    }
    const points = replayPath.length ? replayPath : [{x:0,z:9,t:0}];
    const visibleRaw = points.filter(p => p.t <= playbackMs);
    const current = sampleReplayPositionAt(playbackMs);
    visibleRaw.push(current);
    const visible = visibleRaw.map(p => new THREE.Vector3(p.x, 1.08, p.z));
    if(visible.length < 2) visible.push(visible[0].clone());
    try{
      topReplay.pathLine.geometry.dispose();
      topReplay.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(visible);
    }catch{}
    topReplay.ghost.position.set(current.x, 1.65, current.z);
    if(topReplay.ghostGlow) topReplay.ghostGlow.position.set(current.x, 1.72, current.z);
    topReplay.halo.rotation.z += 0.12;
    topReplay.halo.scale.setScalar(1 + Math.sin(performance.now()*0.012)*0.08);
    // Broadcast-replay pass: disable fog only for this render so the real room stays readable from above.
    const oldFog = three.scene.fog;
    three.scene.fog = null;
    topReplay.renderer.render(three.scene, topReplay.cam);
    three.scene.fog = oldFog;
  }

  function mapRoomToCanvas(x,z,w,h){
    return { x: w/2 + (x/24)*(w*.42), y: h/2 + (z/24)*(h*.42) };
  }
  function drawReplayCanvas(progress=1){
    const endT = replayPath.at(-1)?.t || levelElapsedMs || 1;
    drawReplayCanvasByTime(endT * progress, endT);
  }
  function drawReplayCanvasByTime(playbackMs=0, totalMs=1){
    const canvas = $("#replayCanvas"); if(!canvas) return;
    const ctx = canvas.getContext("2d"), w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "rgba(3,8,22,.86)"; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = "rgba(93,246,255,.16)"; ctx.lineWidth = 1;
    for(let i=0;i<=12;i++){ const x=i*w/12; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for(let i=0;i<=8;i++){ const y=i*h/8; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    const points = replayPath.length ? replayPath : [{x:0,z:9,t:0}];
    const visible = points.filter(p=>p.t<=playbackMs);
    const current = sampleReplayPositionAt(playbackMs);
    visible.push(current);
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(77,255,177,.85)"; ctx.shadowColor = "rgba(77,255,177,.8)"; ctx.shadowBlur = 14;
    ctx.beginPath();
    visible.forEach((p,i)=>{ const q=mapRoomToCanvas(p.x,p.z,w,h); if(i===0) ctx.moveTo(q.x,q.y); else ctx.lineTo(q.x,q.y); });
    ctx.stroke(); ctx.shadowBlur = 0;
    const lp = mapRoomToCanvas(current.x,current.z,w,h);
    ctx.fillStyle = "#ffb347"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 11 + Math.sin(performance.now()*.012)*2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.86)"; ctx.font = "bold 14px ui-monospace,Consolas"; ctx.fillText(`REC TIMER ${formatMs(Math.max(0, LEVEL_SECONDS*1000-playbackMs))} · x4`, 16, 24);
  }
  function returnToMapAfterReplay(){
    cancelAnimationFrame(replayAnimation);
    cleanupTopDownReplay();
    $("#levelReplay")?.classList.add("hidden");
    transitionOverlay("out", "RETURN TO MAP", "saving clear data · opening world map", () => exitLevel(), 1250);
  }
  function replaySameLevel(){
    const l = replayHoldLesson || currentLesson;
    cancelAnimationFrame(replayAnimation);
    cleanupTopDownReplay();
    $("#levelReplay")?.classList.add("hidden");
    destroyLevel3D(); clearInterval(levelTimer);
    if(l) enterLevel(l);
  }

  function openTask(task){
    if(task === "start"){ setTerminal("start portal · not a terminal · complete the 5 active terminals"); playSfx("glitch"); return; }
    activeTask = task;
    const l = currentLesson;
    const isDemo = l.id === 1;
    const titles = {
      start: "Start Portal", core:"Core Terminal", concepts:"Concepts Terminal", links:"Connections Terminal", oral:"Oral Trial", forge:"Summary Forge", finish:"Finish Portal"
    };
    const demo = {
      start:"Attiva la camera 3D. Il timer è già partito: esplora, completa terminali, poi torna al portale finale.",
      core:"L01 demo: definisci l'idea centrale del blocco idrogeno/orbitali. In postproduction qui entreranno i tuoi riassunti reali.",
      concepts:"L01 demo: raccogli concetti chiave: atomo di idrogeno, orbitali atomici, spin, momenti magnetici.",
      links:"L01 demo: collega questo livello agli spoiler futuri: Zeeman/Stark, campi esterni, transizioni.",
      oral:"L01 demo: prepara 2 domande orali possibili e una risposta da 60 secondi.",
      forge:"L01 demo: chiudi il Summary Core con una micro-sintesi finale."
    };
    $("#taskKicker").textContent = `L${String(l.id).padStart(2,"0")} · ${task}`;
    $("#taskTitle").textContent = titles[task] || task;
    $("#taskText").textContent = isDemo ? (demo[task] || "Demo terminal") : `Placeholder costruibile per ${loc(l.title)}. La logica è già pronta: scrivi un fragment, completa il terminale e sblocca il finish.`;
    $("#taskNote").value = save.notes[`${levelTaskKey(l.id)}:${task}`] || "";
    $("#taskPanel").classList.add("open");
    document.exitPointerLock?.();
  }
  function completeTask(){
    if(!currentLesson || !activeTask) return;
    const st = getTaskState(currentLesson.id);
    st[activeTask] = true;
    save.notes[`${levelTaskKey(currentLesson.id)}:${activeTask}`] = $("#taskNote").value;
    persist();
    $("#taskPanel").classList.remove("open");
    updateTaskChecklist();
    updateLevelObjects();
    playSfx("glitch");
    setTerminal(`${activeTask} complete · ${allTasksDone(currentLesson.id)?"finish portal unlocked":"continue"}`);
  }

  // ---------- Three.js first-person level ----------
  async function initLevel3D(l){
    destroyLevel3D();
    try{
      const mount = $("#threeMount");
      three = createThreeState(mount, l);
      $("#threeFallback").classList.add("hidden");
      $("#pointerOverlay").style.display = "grid";
      updateLevelObjects();
    }catch(err){
      console.error(err);
      $("#threeFallback").classList.remove("hidden");
      setTerminal("three.js level failed · check connection/CDN");
    }
  }
  function createThreeState(mount, l){
    mount.innerHTML = "";
    const renderer = new THREE.WebGLRenderer({ antialias:true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const world = DATA.worlds[l.world];
    scene.fog = new THREE.FogExp2(new THREE.Color(world.color).multiplyScalar(.16), 0.025);
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);
    camera.position.set(0, 1.7, 9);
    const controls = new PointerLockControls(camera, renderer.domElement);
    scene.add(controls.getObject());
    const mobileMode = window.matchMedia?.("(pointer: coarse)")?.matches || ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    let mobileActive = false;
    let touchLookActive = false;
    let lastTouchX = 0, lastTouchY = 0;
    camera.rotation.order = "YXZ";

    const texLoader = new THREE.TextureLoader();
    const groundTex = texLoader.load("assets/textures/ground.jpg"); groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(18,18);
    const metalTex = texLoader.load("assets/textures/metal.jpg"); metalTex.wrapS = metalTex.wrapT = THREE.RepeatWrapping; metalTex.repeat.set(2,2);

    const ambient = new THREE.AmbientLight(0x9bbcff, .55); scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4); dir.position.set(6,11,5); scene.add(dir);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80,80), new THREE.MeshStandardMaterial({ map: groundTex, roughness: .9 }));
    floor.rotation.x = -Math.PI/2; scene.add(floor);
    const grid = new THREE.GridHelper(80, 40, new THREE.Color(world.color), 0x183050); grid.material.transparent=true; grid.material.opacity=.42; scene.add(grid);

    // V12: invisible-wall bounds are also readable in monitor/replay as faint holographic borders.
    const wallFrameMat = new THREE.MeshBasicMaterial({ color:0xffb347, transparent:true, opacity:.075, side:THREE.DoubleSide });
    const wallLineMat = new THREE.LineBasicMaterial({ color:0xffb347, transparent:true, opacity:.72 });
    function addWallPlane(x,z,rotY,w=48){
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), wallFrameMat.clone());
      wall.position.set(x, 1.6, z); wall.rotation.y = rotY; scene.add(wall);
    }
    addWallPlane(0, -24, 0); addWallPlane(0, 24, 0); addWallPlane(-24, 0, Math.PI/2); addWallPlane(24, 0, Math.PI/2);
    const boundPts = [new THREE.Vector3(-24,.04,-24),new THREE.Vector3(24,.04,-24),new THREE.Vector3(24,.04,24),new THREE.Vector3(-24,.04,24),new THREE.Vector3(-24,.04,-24)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(boundPts), wallLineMat));

    const room = new THREE.Group(); scene.add(room);
    const objects = [];
    const interactables = [];
    const colliders = [];
    const zaps = [];
    let nearestObj = null;
    const playerBeacon = new THREE.Mesh(new THREE.SphereGeometry(.18,16,12), new THREE.MeshBasicMaterial({ color:0xffb347 }));
    playerBeacon.position.set(0,2.35,0);
    scene.add(playerBeacon);
    const color = new THREE.Color(world.color);
    const accent = new THREE.Color(world.accent);

    function addCollider(group, radius=1.25, kind="object"){
      colliders.push({ group, radius, kind });
    }
    function flashHit(){
      const el = $("#hitFlash");
      if(!el) return;
      el.classList.add("show");
      setTimeout(()=>el.classList.remove("show"), 95);
    }
    function spawnZap(x,z,c=0xff4d7e){
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(.55,.035,8,48),
        new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.95, blending:THREE.AdditiveBlending })
      );
      ring.position.set(x, .18, z);
      ring.rotation.x = Math.PI/2;
      scene.add(ring);
      zaps.push({ mesh:ring, age:0 });
    }
    function setInteractionHint(text, mode=""){
      const el = $("#interactionHint");
      if(!el) return;
      el.textContent = text;
      el.className = `interactionHint glass ${mode}`.trim();
    }
    function taskDone(task){
      return !!getTaskState(currentLesson.id)[task];
    }
    function taskDisplay(task){
      const names = {start:"START PORTAL", core:"CORE", concepts:"CONCEPTS", links:"CONNECTIONS", oral:"ORAL", forge:"FORGE", finish:"FINISH"};
      return names[task] || task.toUpperCase();
    }

    function glowSprite(c){
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      const g = ctx.createRadialGradient(64,64,0,64,64,64);
      g.addColorStop(0,"rgba(255,255,255,1)"); g.addColorStop(.18,"rgba(255,255,255,.6)"); g.addColorStop(1,"rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map:tex, color:c, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false });
      const sp = new THREE.Sprite(mat); sp.scale.set(5,5,1); return sp;
    }
    function makeLabel(text){
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(3,7,25,.82)"; ctx.roundRect(12,18,488,92,22); ctx.fill();
      ctx.strokeStyle = "rgba(160,240,255,.7)"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "white"; ctx.font = "bold 42px system-ui"; ctx.textAlign = "center"; ctx.textBaseline="middle";
      ctx.fillText(text,256,64);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map:tex, transparent:true });
      const sp = new THREE.Sprite(mat); sp.scale.set(4.2,1.05,1); return sp;
    }
    function terminal(task, x, z, c){
      const group = new THREE.Group(); group.position.set(x,0,z); group.userData.task = task;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.9,1.1,.35,32), new THREE.MeshStandardMaterial({ map: metalTex, color:0x333744, metalness:.7, roughness:.32 })); base.position.y=.18; group.add(base);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.38,.48,1.8,32), new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:.45, metalness:.15, roughness:.28 })); pillar.position.y=1.1; group.add(pillar);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(.5,32,16), new THREE.MeshStandardMaterial({ color:0xffffff, emissive:c, emissiveIntensity:1.2, roughness:.1 })); orb.position.y=2.25; group.add(orb);
      const light = new THREE.PointLight(c, 3.5, 12, 2); light.position.set(0,2.35,0); group.add(light);
      const sp = glowSprite(c); sp.position.y=2.35; group.add(sp);
      const lab = makeLabel(task.toUpperCase()); lab.position.y=3.25; group.add(lab);
      room.add(group); interactables.push(group); addCollider(group, 1.55, task); objects.push({group, orb, sp, task, label:lab, baseColor:new THREE.Color(c)}); return group;
    }
    function portal(task, x, z, c){
      const group = new THREE.Group(); group.position.set(x,0,z); group.userData.task = task;
      const torus = new THREE.Mesh(new THREE.TorusGeometry(1.35,.13,16,96), new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:.9, metalness:.25, roughness:.16 })); torus.position.y=1.65; torus.rotation.y=Math.PI/2; group.add(torus);
      const core = new THREE.Mesh(new THREE.CircleGeometry(1.05,64), new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:.35, side:THREE.DoubleSide })); core.position.y=1.65; core.rotation.y=Math.PI/2; group.add(core);
      const light = new THREE.PointLight(c, 5.5, 15, 2); light.position.set(0,1.65,0); group.add(light);
      const lab = makeLabel(task === "finish" ? "FINISH" : "START"); lab.position.y=3.15; group.add(lab);
      room.add(group); interactables.push(group); addCollider(group, 1.9, task); objects.push({group, orb:torus, sp:core, task, label:lab, baseColor:new THREE.Color(c)}); return group;
    }

    portal("start", 0, 12, color);
    terminal("core", -8, 5, color);
    terminal("concepts", 8, 5, accent);
    terminal("links", -8, -4, 0x58ffd1);
    terminal("oral", 8, -4, 0xffd866);
    terminal("forge", 0, -8, 0xff5cc8);
    portal("finish", 0, -15, 0x4dffb1);

    // low-poly landmarks: rings, crystals, pillars
    for(let i=0;i<18;i++){
      const a = i/18*Math.PI*2; const r = 15 + (i%3)*3;
      const h = 1.2 + (i%5)*.45;
      const m = new THREE.Mesh(new THREE.ConeGeometry(.45 + (i%2)*.25, h, 5), new THREE.MeshStandardMaterial({ color:i%2?world.color:world.accent, emissive:i%2?world.color:world.accent, emissiveIntensity:.18, roughness:.28 }));
      m.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r);
      room.add(m); addCollider(m, .75 + (i%2)*.18, "crystal"); objects.push({group:m, orb:m, task:null});
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7,.045,8,128), new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:.55 })); ring.position.y=.05; ring.rotation.x=Math.PI/2; room.add(ring); objects.push({group:ring, orb:ring});

    const keys = {};
    function bindHoldButton(id, code){
      const el = $(id); if(!el) return;
      const on = e => { e.preventDefault(); keys[code] = true; mobileActive = true; ensureAudio(); };
      const off = e => { e?.preventDefault?.(); keys[code] = false; };
      el.onpointerdown = on; el.onpointerup = off; el.onpointercancel = off; el.onpointerleave = off;
    }
    bindHoldButton("#mobileForward", "KeyW");
    bindHoldButton("#mobileBack", "KeyS");
    bindHoldButton("#mobileLeft", "KeyA");
    bindHoldButton("#mobileRight", "KeyD");
    const mi = $("#mobileInteract"); if(mi) mi.onclick = e => { e.preventDefault(); mobileActive = true; interactNearest(); };
    const mq = $("#mobileExit"); if(mq) mq.onclick = e => { e.preventDefault(); exitLevel(); };
    function down(e){ keys[e.code]=true; if(e.code === "KeyE") interactNearest(); if(e.code === "KeyQ") exitLevel(); }
    function up(e){ keys[e.code]=false; }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    function getNearest(){
      const pos = controls.getObject().position; let best=null, dmin=3.35;
      for(const obj of interactables){
        const d = pos.distanceTo(obj.position);
        if(d < dmin){ best = obj; dmin = d; }
      }
      return best ? { obj:best, dist:dmin } : null;
    }
    function interactNearest(){
      const near = getNearest();
      if(near){
        const task = near.obj.userData.task;
        if(task === "finish"){
          if(allTasksDone(currentLesson.id)){ completeLevel(); }
          else { setTerminal("finish locked · complete all 5 terminals first"); setInteractionHint(`FINISH locked · ${terminalDoneCount(currentLesson.id)}/${TERMINAL_COUNT} terminals`, "locked"); }
          playSfx();
        } else {
          openTask(task);
        }
      } else {
        setTerminal("nessun terminale vicino · avvicinati e premi E");
        setInteractionHint("Nessun terminale vicino · avvicinati · Q esci", "");
      }
    }
    function lock(){
      if(mobileMode){
        mobileActive = true;
        $("#pointerOverlay").style.display = "none";
        ensureAudio();
        setTerminal("mobile chamber active · left pad move · drag screen look · E/Interact");
      }else{
        controls.lock();
      }
    }
    const lockBtn = $("#lockBtn"); lockBtn.onclick = lock;
    controls.addEventListener("lock",()=>{ $("#pointerOverlay").style.display = "none"; ensureAudio(); });
    controls.addEventListener("unlock",()=>{ if(!mobileActive) $("#pointerOverlay").style.display = "grid"; setWalking(false); });

    if(mobileMode){
      renderer.domElement.addEventListener("pointerdown", e => {
        if(e.pointerType === "mouse") return;
        touchLookActive = true; lastTouchX = e.clientX; lastTouchY = e.clientY;
        try{ renderer.domElement.setPointerCapture(e.pointerId); }catch{}
      });
      renderer.domElement.addEventListener("pointermove", e => {
        if(!touchLookActive || !mobileActive) return;
        const dx = e.clientX - lastTouchX, dy = e.clientY - lastTouchY;
        lastTouchX = e.clientX; lastTouchY = e.clientY;
        camera.rotation.y -= dx * 0.0042;
        camera.rotation.x = Math.max(-1.25, Math.min(1.25, camera.rotation.x - dy * 0.0032));
      });
      renderer.domElement.addEventListener("pointerup", () => touchLookActive = false);
      renderer.domElement.addEventListener("pointercancel", () => touchLookActive = false);
    }

    function maybeSampleReplayPath(pos){
      if(route !== "level") return;
      const now = performance.now();
      if(!levelStartedAt) return;
      if(now - lastReplaySampleAt > 180){
        lastReplaySampleAt = now;
        replayPath.push({ x:pos.x, z:pos.z, t: now - levelStartedAt });
        if(replayPath.length > 2400) replayPath.shift();
      }
    }
    function drawRadar(pos){
      const c = $("#radarCanvas"); if(!c) return;
      const ctx = c.getContext("2d"), w=c.width, h=c.height;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = "rgba(3,8,22,.80)"; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = "rgba(255,164,61,.14)"; ctx.lineWidth = 1;
      for(let i=0;i<=6;i++){ ctx.beginPath(); ctx.moveTo(i*w/6,0); ctx.lineTo(i*w/6,h); ctx.stroke(); }
      for(let i=0;i<=4;i++){ ctx.beginPath(); ctx.moveTo(0,i*h/4); ctx.lineTo(w,i*h/4); ctx.stroke(); }
      ctx.strokeStyle = "rgba(77,255,177,.65)"; ctx.lineWidth = 2; ctx.beginPath();
      const pts = replayPath.slice(-120);
      pts.forEach((p,i)=>{ const q=mapRoomToCanvas(p.x,p.z,w,h); if(i===0) ctx.moveTo(q.x,q.y); else ctx.lineTo(q.x,q.y); });
      ctx.stroke();
      const q = mapRoomToCanvas(pos.x,pos.z,w,h);
      ctx.fillStyle = "#ffb347"; ctx.beginPath(); ctx.arc(q.x,q.y,6,0,Math.PI*2); ctx.fill();
    }
    const clock = new THREE.Clock();
    let raf = null;
    function animate(){
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), .05);
      const obj = controls.getObject();
      playerBeacon.position.set(obj.position.x, 2.35, obj.position.z);
      maybeSampleReplayPath(obj.position);
      drawRadar(obj.position);
      const speed = keys.ShiftLeft ? 10 : 6;
      if(controls.isLocked || mobileActive){
        const moving = !!(keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD);
        const beforeX = obj.position.x, beforeZ = obj.position.z;
        if(keys.KeyW) controls.moveForward(speed*dt);
        if(keys.KeyS) controls.moveForward(-speed*dt);
        if(keys.KeyA) controls.moveRight(-speed*dt);
        if(keys.KeyD) controls.moveRight(speed*dt);

        let collided = false;
        const clampedX = Math.max(-24, Math.min(24, obj.position.x));
        const clampedZ = Math.max(-24, Math.min(24, obj.position.z));
        if(obj.position.x !== clampedX || obj.position.z !== clampedZ){ collided = true; obj.position.x = clampedX; obj.position.z = clampedZ; }
        for(const c of colliders){
          const dx = obj.position.x - c.group.position.x;
          const dz = obj.position.z - c.group.position.z;
          const dist = Math.hypot(dx,dz);
          const minDist = c.radius + .42;
          if(dist < minDist && dist > .0001){
            const nx = dx / dist, nz = dz / dist;
            obj.position.x = c.group.position.x + nx * minDist;
            obj.position.z = c.group.position.z + nz * minDist;
            collided = true;
          }
        }
        if(collided && moving){ playCollisionGlitch(); flashHit(); spawnZap(obj.position.x, obj.position.z); setInteractionHint("ZAP · collisione oggetto", "collision"); }
        obj.position.y = 1.7;
        setWalking(moving && !collided);
      } else {
        setWalking(false);
      }
      const time = performance.now()*.001;
      const near = getNearest();
      if((controls.isLocked || mobileActive) && near){
        const task = near.obj.userData.task;
        const done = task !== "finish" && taskDone(task);
        if(task === "finish" && !allTasksDone(currentLesson.id)) setInteractionHint(`E · FINISH LOCKED · ${terminalDoneCount(currentLesson.id)}/${TERMINAL_COUNT}`, "locked");
        else setInteractionHint(`E · ${taskDisplay(task)} ${done ? "✓ COMPLETATO" : "○ DA COMPLETARE"}`, done ? "ready" : "");
      }else if(controls.isLocked || mobileActive){
        setInteractionHint("WASD muovi · E interagisci · Q esci dal livello", "");
      }
      for(let zi=zaps.length-1; zi>=0; zi--){
        const z = zaps[zi]; z.age += dt;
        z.mesh.scale.setScalar(1 + z.age*6);
        z.mesh.material.opacity = Math.max(0, 1 - z.age*4);
        if(z.age > .28){ scene.remove(z.mesh); zaps.splice(zi,1); }
      }
      objects.forEach((o,i)=>{
        if(o.orb){ o.orb.rotation.y += dt*(.6+i*.015); o.orb.rotation.x += dt*.25; }
        if(o.sp && o.sp.material){ o.sp.material.opacity = .55 + .25*Math.sin(time*2+i); }
        if(o.task && o.group){ o.group.position.y = Math.sin(time*1.8+i)*.05; }
      });
      renderer.render(scene,camera);
    }
    animate();
    function resize(){ renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
    window.addEventListener("resize", resize);
    return { renderer, scene, camera, controls, objects, interactables, raf, resize, down, up, mount };
  }
  function updateLevelObjects(){
    if(!three || !currentLesson) return;
    const st = getTaskState(currentLesson.id);
    for(const o of three.objects){
      if(!o.task || !o.group) continue;
      if(st[o.task]) o.group.traverse(ch => { if(ch.material?.emissive) ch.material.emissiveIntensity = 1.4; });
      if(o.task === "finish"){
        const ok = allTasksDone(currentLesson.id);
        o.group.visible = true;
        o.group.traverse(ch => { if(ch.material){ ch.material.opacity = ok ? (ch.material.opacity||1) : .25; ch.material.transparent = !ok || ch.material.transparent; } });
      }
    }
    updateLevelText();
  }
  function destroyLevel3D(){
    cleanupTopDownReplay();
    if(!three) return;
    cancelAnimationFrame(three.raf);
    window.removeEventListener("resize", three.resize);
    window.removeEventListener("keydown", three.down);
    window.removeEventListener("keyup", three.up);
    try{ three.controls.unlock(); }catch{}
    ["#mobileForward","#mobileBack","#mobileLeft","#mobileRight"].forEach(id=>{ const el=$(id); if(el){ el.onpointerdown=el.onpointerup=el.onpointercancel=el.onpointerleave=null; }});
    const mi=$("#mobileInteract"); if(mi) mi.onclick=null; const mq=$("#mobileExit"); if(mq) mq.onclick=null;
    try{ three.renderer.dispose(); three.mount.innerHTML = ""; }catch{}
    setWalking(false);
    three = null;
  }

  // ---------- FX Canvas ----------
  function initFX(){
    const c = $("#fxCanvas"), ctx = c.getContext("2d");
    let w,h,pts=[];
    function resize(){ w=c.width=innerWidth; h=c.height=innerHeight; pts=Array.from({length:80},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*2+0.5,v:Math.random()*0.6+0.2})); }
    resize(); addEventListener("resize", resize);
    function tick(){
      sampleMusicLevels();
      ctx.clearRect(0,0,w,h);
      ctx.globalCompositeOperation = "lighter";
      pts.forEach(p=>{
        p.y-=p.v*(1+musicSmooth.mid*2.2); if(p.y<0)p.y=h;
        const r = p.r*(1+musicSmooth.beat*1.8);
        ctx.fillStyle = p.r>1.6 ? `rgba(255,92,200,${.28+musicSmooth.treble*.35})` : `rgba(110,240,255,${.34+musicSmooth.mid*.28})`;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(performance.now()*.001+p.r)*8*musicSmooth.bass,p.y,r,0,Math.PI*2); ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";
      requestAnimationFrame(tick);
    }
    tick();
  }

  function bind(){
    $$("[data-lang]").forEach(b => b.onclick = () => { lang=b.dataset.lang; localStorage.setItem(langStore, lang); applyLang(); });
    $("#homeBtn").onclick = goMenu;
    $("#startBtn").onclick = () => openWorld("atomic");
    $("#continueBtn").onclick = () => openWorld(save.currentWorld || "atomic");
    $$("[data-open-world]").forEach(b => b.onclick = () => openWorld(b.dataset.openWorld));
    $$("[data-route-world]").forEach(b => b.onclick = () => openWorld(b.dataset.routeWorld));
    $("#mapStage").onmousemove = (e) => { const r=e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--mx", `${((e.clientX-r.left)/r.width)*100}%`); e.currentTarget.style.setProperty("--my", `${((e.clientY-r.top)/r.height)*100}%`); };
    $("#closePanel").onclick = () => $("#sidePanel").classList.remove("open");
    $("#enterLevelBtn").onclick = () => selectedLesson && enterLevel(selectedLesson);
    $("#markDoneBtn").onclick = () => { if(selectedLesson){ save.completed[selectedLesson.id] = {at:new Date().toISOString(), quick:true}; unlockNext(selectedLesson.id); persist(); renderMap(selectedLesson.world); } };
    $("#exitLevelBtn").onclick = exitLevel;
    $("#replayMapBtn").onclick = returnToMapAfterReplay;
    $("#replayAgainBtn").onclick = replaySameLevel;
    $("#closeTask").onclick = () => $("#taskPanel").classList.remove("open");
    $("#completeTaskBtn").onclick = completeTask;
    $("#cameraToggleBtn").onclick = () => { cameraMode = cameraMode === "fps" ? "top" : "fps"; $("#cameraToggleBtn").textContent = `CAMERA: ${cameraMode.toUpperCase()}`; setTerminal("camera toggle placeholder · top-down monitor/replay online · mobile controls active in V12"); };
    $("#exportBtn").onclick = () => { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(save,null,2)],{type:"application/json"})); a.download="fdsdm-save-v12.json"; a.click(); };
    $("#importInput").onchange = async e => { const f=e.target.files[0]; if(!f) return; save = JSON.parse(await f.text()); persist(); updateProgress(); setTerminal("save imported"); };
    $("#debugBtn").onclick = () => $("#debugPanel").classList.toggle("hidden");
    addEventListener("keydown", e => { if(e.ctrlKey && e.code === "KeyD"){ e.preventDefault(); $("#debugPanel").classList.toggle("hidden"); } });
    $("#cheatUnlockAll").onclick = () => { DATA.lessons.forEach(l=>save.unlocked[l.id]=true); persist(); route==="map"&&renderMap(currentWorld); setTerminal("cheat · all levels unlocked"); };
    $("#cheatCompleteAll").onclick = () => { DATA.lessons.forEach(l=>{ save.unlocked[l.id]=true; save.completed[l.id]={at:new Date().toISOString(), cheat:true}; }); persist(); route==="map"&&renderMap(currentWorld); setTerminal("cheat · all levels completed"); };
    $("#cheatCompleteCurrent").onclick = () => currentLesson && completeLevel();
    $("#cheatAddTime").onclick = () => { levelMsLeft += LEVEL_SECONDS * 1000; if(route === "level") levelEndAt = performance.now() + levelMsLeft; levelSecondsLeft = Math.ceil(levelMsLeft/1000); updateTimer(); setTerminal("cheat · +10 minutes"); };
    $("#cheatSkipTasks").onclick = () => { if(currentLesson){ const s=getTaskState(currentLesson.id); LEVEL_TASKS.forEach(k=>s[k]=true); persist(); updateLevelObjects(); setTerminal("cheat · 5 terminals completed · finish portal unlocked"); } };
    $("#cheatReset").onclick = () => { localStorage.removeItem(SAVE_KEY); save=loadSave(); renderMap(currentWorld); setTerminal("save reset"); };
    $("#sfxBtn").onclick = () => { sfxEnabled=!sfxEnabled; $("#sfxBtn").textContent=sfxEnabled?"SFX":"SFX OFF"; };
    $("#musicBtn").onclick = async () => {
      musicEnabled=!musicEnabled;
      if(musicEnabled){
        $("#musicBtn").textContent="MUSIC...";
        await ensureAudio();
        await waitWithTimeout(primeMusicElements(), 2500);
        updateRouteMusic();
        $("#musicBtn").textContent="MUSIC ON";
      } else {
        stopAllAudio();
        $("#musicBtn").textContent="MUSIC";
      }
    };
  }
  async function boot(){ bind(); initFX(); applyLang(); await preloadEssentialAssets(); goMenu(); }
  boot();
})();
