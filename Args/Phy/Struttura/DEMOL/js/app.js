import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { L96_META, L96_FRAMES, L96_RESULTS } from '../data/lorenzData.js';

/*
  DEMOL v22 - Lorenz Chaos Project D Showroom
  ---------------------------------------
  Obiettivo: ambiente statico HTML/CSS/JS stile GitHub Pages.
  Il player esiste al centro, cammina sul pavimento e puo guardare in alto.
  Nel quadrante Q1 c'e il loop fisico Lorenz-96 RK4, generato dai dati clean.

  Questa v5 conserva v4 e aggiunge un layer scientifico: live RMSE, timeline sync, dashboard metriche, tour mode e leggibilita migliorata.
  Pero contiene gia la logica che servira dopo:
  - master clock sincronizzato da 15 secondi
  - quattro quadranti
  - stazioni future per MLP/CNN/diagnostiche
  - animazione L96 nativa in Three.js, non GIF piatta
*/

const canvas = document.getElementById('threeCanvas');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loaderBar');
const loaderText = document.getElementById('loaderText');
const lockOverlay = document.getElementById('lockOverlay');
const enterBtn = document.getElementById('enterBtn');
const lockKicker = lockOverlay.querySelector('.kicker');
const lockTitle = lockOverlay.querySelector('h2');
const lockText = lockOverlay.querySelector('p');
const clockText = document.getElementById('clockText');
const speedText = document.getElementById('speedText');
const note = document.getElementById('note');
const transitionOverlay = document.getElementById('transitionOverlay');
const transitionTitle = transitionOverlay.querySelector('b');
const transitionSubtitle = transitionOverlay.querySelector('span');
const syncToast = document.getElementById('syncToast');
const pauseBanner = document.getElementById('pauseBanner');
const tourPanel = document.getElementById('tourPanel');
const modelDataWarning = document.getElementById('modelDataWarning');
const mobileControls = document.getElementById('mobileControls');
const mobileJoystick = document.getElementById('mobileJoystick');
const mobileStick = document.getElementById('mobileStick');
const mobileFlyBtn = document.getElementById('mobileFlyBtn');
const mobileUpBtn = document.getElementById('mobileUpBtn');
const mobileDownBtn = document.getElementById('mobileDownBtn');
const mobilePortalBtn = document.getElementById('mobilePortalBtn');
const mobileMapBtn = document.getElementById('mobileMapBtn');
const mobileLookPad = document.getElementById('mobileLookPad');
const mapToggleBtn = document.getElementById('mapToggleBtn');
const mapOverlay = document.getElementById('mapOverlay');
const mapCloseBtn = document.getElementById('mapCloseBtn');
const mapGrid = document.getElementById('mapGrid');
const mapZoneLabel = document.getElementById('mapZoneLabel');
const mapLegend = document.getElementById('mapLegend');

const WORLD = {
  size: 170,
  half: 85,
  quadrantOffset: 43,
  playerHeight: 2.0,
  roofHeight: 72.0,
  playerSpeed: 16.0,
  flyVerticalSpeed: 11.0,
  runMultiplier: 1.8,
  portalTriggerRadius: 7.5,
  lookSensitivityHint: 'PointerLockControls',
};

const PROJECT_WORLD_OFFSET = 260;
const ZONES = {
  main: { id: 'main', label: 'Main showroom', center: new THREE.Vector3(0, 0, 0), half: WORLD.half },
  annex: { id: 'annex', label: 'Project annex', center: new THREE.Vector3(PROJECT_WORLD_OFFSET, 0, 0), half: WORLD.half },
};

const LOOP_SECONDS = L96_META.loopSeconds || 15.0;
const N = L96_META.N;
const FRAME_COUNT = L96_FRAMES.length;
const MODEL_DATA = window.LORENZ_MODEL_TRAJECTORIES || null;
const MODEL_META = MODEL_DATA?.meta || {};
const MODEL_TRAJECTORIES = MODEL_DATA?.trajectories || {};
const MODEL_FRAME_COUNT = MODEL_DATA?.time?.length || FRAME_COUNT;
const IS_TOUCH_DEVICE = window.matchMedia?.('(pointer: coarse)')?.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const COLORS = {
  bg: 0x050814,
  fog: 0x050814,
  floor: 0x11172a,
  floorLine: 0x26304c,
  center: 0x56ccf2,
  physical: 0x56ccf2,
  mlpNext: 0xff9f43,
  mlpTendency: 0xff4d7e,
  cnnTendency: 0xb278ff,
  diagnostics: 0x4dffb1,
  white: 0xf2f6ff,
  muted: 0x8090b8,
};

const STATIONS = {
  physical: {
    id: 'physical',
    title: 'Q1 - PHYSICAL RK4 TRUTH',
    subtitle: 'Equations known - no training - reference L96 dynamics',
    position: new THREE.Vector3(-44, 0, -44),
    color: COLORS.physical,
    active: true,
  },
  mlpNext: {
    id: 'mlpNext',
    title: 'Q2 - MLP NEXT',
    subtitle: 'Real rollout loaded - x(t) Ã¢â€ â€™ x(t+dt) - weak online stability',
    position: new THREE.Vector3(44, 0, -44),
    color: COLORS.mlpNext,
    active: true,
  },
  cnnTendency: {
    id: 'cnnTendency',
    title: 'Q3 - CNN TENDENCY',
    subtitle: 'Real rollout loaded - periodic CNN + dx/dt target - best L96 horizon',
    position: new THREE.Vector3(-44, 0, 44),
    color: COLORS.cnnTendency,
    active: true,
  },
  diagnostics: {
    id: 'diagnostics',
    title: 'Q4 - DIAGNOSTICS WALL',
    subtitle: 'RMSE horizon - Lyapunov - spectra - scientific ranking',
    position: new THREE.Vector3(44, 0, 44),
    color: COLORS.diagnostics,
    active: false,
  },
};

const MODEL_CATALOG = {
  mlp_next: {
    key: 'mlp_next',
    label: 'MLP next',
    color: COLORS.mlpNext,
    summary: 'Learns x(t) Ã¢â€ â€™ x(t+dt). Failure case in long autoregressive rollout.',
  },
  mlp_tendency: {
    key: 'mlp_tendency',
    label: 'MLP tendency',
    color: COLORS.mlpTendency,
    summary: 'Learns dx/dt. More physical target than direct next-state.',
  },
  cnn_next: {
    key: 'cnn_next',
    label: 'CNN next',
    color: COLORS.diagnostics,
    summary: 'Periodic CNN spatial bias, direct next-state target.',
  },
  cnn_tendency: {
    key: 'cnn_tendency',
    label: 'CNN tendency',
    color: COLORS.cnnTendency,
    summary: 'Periodic CNN + tendency target. Main L96 comparison model.',
  },
};

const TOUR_STEPS = [
  'Look up: Lorenz-63 hero shows classic chaotic attractor geometry.',
  'Q1: Physical RK4 is the mathematical truth, no training.',
  'Q2: MLP next shows how one-step learning can fail in rollout.',
  'Q3: CNN tendency uses periodic spatial bias and a physical target.',
  'Q4: Clean Hovmoller-only quadrant: no diagnostic walls, just the 3D terrain.',
];


function getTrajectoryFrames(key, fallbackFrames = L96_FRAMES) {
  const arr = MODEL_TRAJECTORIES?.[key];
  if (!arr || !Array.isArray(arr) || arr.length < 2) return fallbackFrames;
  return arr;
}

function fmtMetric(value) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  const v = Number(value);
  if (Math.abs(v) >= 1000) return v.toExponential(2);
  return v.toFixed(2);
}

const state = {
  ready: false,
  started: false,
  firstEntryDone: false,
  paused: false,
  pausedForMenu: false,
  speed: 1.0,
  startMs: 0,
  pauseAt: 0,
  elapsedBeforePause: 0,
  keys: new Set(),
  lastTime: performance.now(),
  orbitMode: true,
  flyMode: false,
  mapOpen: false,
  zone: 'main',
  nearPortal: null,
  mobileActive: false,
  touchMoveX: 0,
  touchMoveY: 0,
  touchVertical: 0,
  touchLookId: null,
  touchLookLastX: 0,
  touchLookLastY: 0,
  tourMode: false,
  tourIndex: 0,
};

let scene, renderer, camera, controls;
let root, l96Installation, mlpNextInstallation, cnnTendencyInstallation, diagnosticWall;
let l63Hero, hovmollerSurface, livePhysicalPanel;
let masterClockHalo, quadrantBeaconGroup;
let timelineRail, detailedDiagnosticsWall;
let mlpMetricPanel, cnnMetricPanel;
let floorArrowGroup, hovmollerLabelsGroup;
let displayPanels = [];
let projectAnnexGroup, portalSystem, v16Leaderboard;
let l63AnnexPhysicalSuite, l63AnnexDivergenceSuite, l63AnnexFtleSuite;
let textureLoader;
let groundTexture = null;
let skyTexture = null;
let v11RmseWall, v11ChecklistWall, v11CnnBiasWall, v11LeaderboardWall;

// -----------------------------------------------------------------------------
// V24 editable rotation controls
// Change only these degree values when calibrating screens/objects in-world.
// Positive values rotate counterclockwise around the local Y axis; negative values rotate clockwise.
// -----------------------------------------------------------------------------
const MAIN_ROTATION_FIX_DEG = {
  q1PhysicalRing: 0,
  q1PhysicalPanel: 0,
  q2MlpNextRing: 0,
  q2MlpNextPanel: 0,
  q3CnnTendencyRing: 0,
  q3CnnTendencyPanel: 0,
  q4Hovmoller: 0,
};

const ANNEX_ROTATION_FIX_DEG = {
  q1Leaderboard: 78,
  q2L63Physical: 0,
  q3L63Divergence: 0,
  q4L63Ftle: 0,
};

function rotateGroupYDeg(group, degrees) {
  if (!group || !Number.isFinite(Number(degrees)) || Number(degrees) === 0) return;
  group.rotateY(THREE.MathUtils.degToRad(Number(degrees)));
}

function applyMainRotationFixes() {
  rotateGroupYDeg(l96Installation?.group, MAIN_ROTATION_FIX_DEG.q1PhysicalRing);
  rotateGroupYDeg(livePhysicalPanel?.group, MAIN_ROTATION_FIX_DEG.q1PhysicalPanel);
  rotateGroupYDeg(mlpNextInstallation?.group, MAIN_ROTATION_FIX_DEG.q2MlpNextRing);
  rotateGroupYDeg(displayPanels?.[1]?.group, MAIN_ROTATION_FIX_DEG.q2MlpNextPanel);
  rotateGroupYDeg(cnnTendencyInstallation?.group, MAIN_ROTATION_FIX_DEG.q3CnnTendencyRing);
  rotateGroupYDeg(displayPanels?.[2]?.group, MAIN_ROTATION_FIX_DEG.q3CnnTendencyPanel);
  rotateGroupYDeg(hovmollerSurface?.group, MAIN_ROTATION_FIX_DEG.q4Hovmoller);
}

function applyAnnexRotationFixes() {
  rotateGroupYDeg(v16Leaderboard?.group, ANNEX_ROTATION_FIX_DEG.q1Leaderboard);
  rotateGroupYDeg(l63AnnexPhysicalSuite?.group, ANNEX_ROTATION_FIX_DEG.q2L63Physical);
  rotateGroupYDeg(l63AnnexDivergenceSuite?.group, ANNEX_ROTATION_FIX_DEG.q3L63Divergence);
  rotateGroupYDeg(l63AnnexFtleSuite?.group, ANNEX_ROTATION_FIX_DEG.q4L63Ftle);
}

init();

async function init() {
  if (!MODEL_DATA && modelDataWarning) modelDataWarning.classList.remove('hidden');
  setLoader(0.08, 'creating renderer');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.fog, 80, 210);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 600);
  controls = new PointerLockControls(camera, document.body);
  controls.getObject().position.set(0, WORLD.playerHeight, 0);
  scene.add(controls.getObject());

  root = new THREE.Group();
  scene.add(root);

  textureLoader = new THREE.TextureLoader();
  await preloadTextures();

  setLoader(0.28, 'building world');
  buildLights();
  buildWorldFloor();
  buildQuadrantMarkers();
  buildSpawnStructure();

  setLoader(0.42, 'building Lorenz physical station');
  l96Installation = new L96RingInstallation(STATIONS.physical.position, COLORS.physical);
  root.add(l96Installation.group);

  setLoader(0.54, 'building Lorenz-63 sky hero');
  l63Hero = new L63SkyHero(new THREE.Vector3(0, 0, 0));
  root.add(l63Hero.group);

  setLoader(0.62, 'building real ML rollout stations');
  mlpNextInstallation = new ModelComparisonRingInstallation(STATIONS.mlpNext, 'mlp_next', 'MLP next', COLORS.mlpNext);
  root.add(mlpNextInstallation.group);
  cnnTendencyInstallation = new ModelComparisonRingInstallation(STATIONS.cnnTendency, 'cnn_tendency', 'CNN tendency', COLORS.cnnTendency);
  root.add(cnnTendencyInstallation.group);
  diagnosticWall = null;

  setLoader(0.72, 'building Hovmoller 3D and animated 2D panels');
  hovmollerSurface = new Hovmoller3DSurface(new THREE.Vector3(54, 0, 24));
  root.add(hovmollerSurface.group);

  livePhysicalPanel = new SyncedRolloutDashboardPanel({
    station: STATIONS.physical,
    title: 'Step 1 Animation B - Lorenz 96 Physical RK4',
    subtitle: 'Reference dynamics - physical truth - no learning',
    trajectoryFrames: L96_FRAMES,
    color: COLORS.physical,
    compareKey: null,
    side: 0.0,
  });
  root.add(livePhysicalPanel.group);
  displayPanels.push(livePhysicalPanel);

  const mlpAnimatedPanel = new SyncedRolloutDashboardPanel({
    station: STATIONS.mlpNext,
    title: 'Step 1 Animation B - Lorenz 96 - MLP next',
    subtitle: 'Real exported rollout - solid model, dashed physical reference',
    trajectoryFrames: getTrajectoryFrames('mlp_next', L96_FRAMES),
    color: COLORS.mlpNext,
    compareKey: 'mlp_next',
    side: -1.0,
  });
  root.add(mlpAnimatedPanel.group);
  displayPanels.push(mlpAnimatedPanel);

  const cnnAnimatedPanel = new SyncedRolloutDashboardPanel({
    station: STATIONS.cnnTendency,
    title: 'Step 1 Animation B - Lorenz 96 - CNN tendency',
    subtitle: 'Real exported rollout - periodic CNN + tendency target',
    trajectoryFrames: getTrajectoryFrames('cnn_tendency', L96_FRAMES),
    color: COLORS.cnnTendency,
    compareKey: 'cnn_tendency',
    side: 1.0,
  });
  root.add(cnnAnimatedPanel.group);
  displayPanels.push(cnnAnimatedPanel);

  // v10 cleanup: remove the freestanding diagnostics signboard from the Hovmoller quadrant.

  setLoader(0.78, 'adding scientific comparison layer');
  mlpMetricPanel = new ModelMetricPanel(STATIONS.mlpNext, mlpNextInstallation, 'mlp_next');
  root.add(mlpMetricPanel.group);
  cnnMetricPanel = new ModelMetricPanel(STATIONS.cnnTendency, cnnTendencyInstallation, 'cnn_tendency');
  root.add(cnnMetricPanel.group);
  detailedDiagnosticsWall = null;
  timelineRail = new TimelineSyncRail();
  root.add(timelineRail.group);
  floorArrowGroup = buildFloorArrows();
  // v10 cleanup: keep the 3D Hovmoller surface itself, but remove the extra label signboards around it.
  hovmollerLabelsGroup = null;

  setLoader(0.84, 'adding divergence concept display');

  setLoader(0.86, 'adding Project-D completion panels');
  v11RmseWall = null;
  v11ChecklistWall = null;
  v11CnnBiasWall = null;
  v11LeaderboardWall = null;

  setLoader(0.87, 'building L63 diagnostics annex');
  buildPortalAnnex();
  applyMainRotationFixes();

  setLoader(0.88, 'placing labels');
  Object.values(STATIONS).filter(station => station.id !== 'diagnostics').forEach(addStationLabel);
  addCentralInstructionLabels();

  setLoader(0.90, 'building sync guides');
  masterClockHalo = new MasterClockHalo();
  root.add(masterClockHalo.group);
  quadrantBeaconGroup = buildSkyQuadrantBeacons();

  setLoader(0.94, 'finalizing controls');
  bindEvents();
  resetClock({ silent: true, doNotStart: true });

  setLoader(1.0, 'ready');
  setTimeout(() => {
    loader.classList.add('hidden');
    state.ready = true;
    showSyncToast('Loaded. Click to start synchronized loop.');
    animate(performance.now());
  }, 350);
}

function setLoader(progress, text) {
  loaderBar.style.width = `${Math.round(progress * 100)}%`;
  loaderText.textContent = text;
}

async function preloadTextures() {
  setLoader(0.15, 'loading textures');
  const tasks = [];
  tasks.push(loadTextureSafe('assets/textures/ground.jpg').then(t => { groundTexture = t; }));
  tasks.push(loadTextureSafe('assets/textures/skybox.jpg').then(t => { skyTexture = t; }));
  await Promise.all(tasks);

  if (skyTexture) {
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const skyGeo = new THREE.SphereGeometry(260, 48, 32);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, transparent: true, opacity: 0.45 });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);
  }
}

function loadTextureSafe(url) {
  return new Promise((resolve) => {
    textureLoader.load(url, resolve, undefined, () => resolve(null));
  });
}

function buildLights() {
  const hemi = new THREE.HemisphereLight(0x9fd7ff, 0x101020, 1.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-25, 70, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  scene.add(sun);

  addPointLight(new THREE.Vector3(-44, 22, -44), COLORS.physical, 5.2, 70);
  addPointLight(new THREE.Vector3(44, 12, -44), COLORS.mlpNext, 1.8, 40);
  addPointLight(new THREE.Vector3(-44, 12, 44), COLORS.cnnTendency, 1.8, 40);
  addPointLight(new THREE.Vector3(44, 14, 44), COLORS.diagnostics, 2.4, 45);
}

function addPointLight(position, color, intensity, distance) {
  const light = new THREE.PointLight(color, intensity, distance, 1.7);
  light.position.copy(position);
  root.add(light);
  return light;
}

function buildWorldFloor() {
  const floorGeo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 64, 64);
  const matParams = {
    color: COLORS.floor,
    roughness: 0.86,
    metalness: 0.05,
  };
  if (groundTexture) {
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(18, 18);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    matParams.map = groundTexture;
  }
  const floorMat = new THREE.MeshStandardMaterial(matParams);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const grid = new THREE.GridHelper(WORLD.size, 40, COLORS.floorLine, COLORS.floorLine);
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.38;
  root.add(grid);

  const crossMat = new THREE.MeshBasicMaterial({ color: COLORS.center, transparent: true, opacity: 0.35 });
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(WORLD.size, 0.03, 0.38), crossMat);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, WORLD.size), crossMat);
  cross1.position.y = 0.035;
  cross2.position.y = 0.04;
  root.add(cross1, cross2);
}

function buildQuadrantMarkers() {
  const quadrantData = [
    [STATIONS.physical, -1, -1],
    [STATIONS.mlpNext, 1, -1],
    [STATIONS.cnnTendency, -1, 1],
    [STATIONS.diagnostics, 1, 1],
  ];

  for (const [station, sx, sz] of quadrantData) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(34, 0.12, 34),
      new THREE.MeshStandardMaterial({ color: station.color, transparent: true, opacity: station.active ? 0.18 : 0.08, roughness: 0.7, metalness: 0.2 })
    );
    pad.position.set(sx * WORLD.quadrantOffset, 0.08, sz * WORLD.quadrantOffset);
    pad.receiveShadow = true;
    root.add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(18, 0.12, 8, 96),
      new THREE.MeshBasicMaterial({ color: station.color, transparent: true, opacity: station.active ? 0.55 : 0.25 })
    );
    ring.position.set(sx * WORLD.quadrantOffset, 0.22, sz * WORLD.quadrantOffset);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);
  }
}

function buildSpawnStructure() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.5, 0.08, 8, 128),
    new THREE.MeshBasicMaterial({ color: COLORS.center, transparent: true, opacity: 0.55 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.18;
  root.add(ring);

  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x10223b, emissive: COLORS.center, emissiveIntensity: 0.08, metalness: 0.25, roughness: 0.42 });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI * 2 / 8;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 12), pillarMat);
    p.position.set(Math.cos(a) * 6.5, 1.1, Math.sin(a) * 6.5);
    p.castShadow = true;
    root.add(p);
  }
}

class L96RingInstallation {
  constructor(position, color) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.color = color;
    this.N = N;
    this.theta = [...Array(this.N)].map((_, i) => i * Math.PI * 2 / this.N);
    this.baseRadius = 10.5;
    this.radialGain = 1.1;
    this.verticalGain = 4.2;
    this.scale = L96_META.cleanStats?.l96Std || L96_META.std || 3.64;
    this.mean = L96_META.cleanStats?.l96Mean || L96_META.mean || 2.33;
    this.height = 23.0;

    this.current = new Array(this.N).fill(0);
    this.positions = new Float32Array((this.N + 1) * 3);
    this.pointPositions = new Float32Array(this.N * 3);
    this.pointColors = new Float32Array(this.N * 3);
    this.stemPositions = new Float32Array(this.N * 2 * 3);
    this.stemColors = new Float32Array(this.N * 2 * 3);

    this.makeObjects();
    this.makePedestal();
  }

  makeObjects() {
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.baseRadius, 0.045, 8, 160),
      new THREE.MeshBasicMaterial({ color: COLORS.physical, transparent: true, opacity: 0.62 })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = this.height;
    this.group.add(baseRing);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.baseRadius + 3.1, 0.025, 6, 160),
      new THREE.MeshBasicMaterial({ color: COLORS.physical, transparent: true, opacity: 0.18 })
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = this.height;
    this.group.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.baseRadius - 3.1, 0.025, 6, 160),
      new THREE.MeshBasicMaterial({ color: COLORS.physical, transparent: true, opacity: 0.16 })
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = this.height;
    this.group.add(innerRing);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.line = new THREE.Line(
      this.lineGeometry,
      new THREE.LineBasicMaterial({ color: 0xf2f7ff, transparent: true, opacity: 0.96, linewidth: 2 })
    );
    this.group.add(this.line);

    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(this.pointColors, 3));
    this.points = new THREE.Points(
      this.pointsGeometry,
      new THREE.PointsMaterial({ size: 0.72, vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false })
    );
    this.group.add(this.points);

    this.stemGeometry = new THREE.BufferGeometry();
    this.stemGeometry.setAttribute('position', new THREE.BufferAttribute(this.stemPositions, 3));
    this.stemGeometry.setAttribute('color', new THREE.BufferAttribute(this.stemColors, 3));
    this.stems = new THREE.LineSegments(
      this.stemGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.24 })
    );
    this.group.add(this.stems);

    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(15.5, 48, 32),
      new THREE.MeshBasicMaterial({ color: COLORS.physical, transparent: true, opacity: 0.035, side: THREE.BackSide })
    );
    this.glow.position.y = this.height;
    this.group.add(this.glow);
  }

  makePedestal() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0f2039, emissive: COLORS.physical, emissiveIntensity: 0.05, roughness: 0.48, metalness: 0.35 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.0, this.height - 1.5, 16), mat);
    tower.position.y = (this.height - 1.5) / 2;
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.group.add(tower);

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.5, 64), mat);
    platform.position.y = 0.45;
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.group.add(platform);
  }

  sampleFrame(phase) {
    const f = phase * (FRAME_COUNT - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(FRAME_COUNT - 1, i0 + 1);
    const a = f - i0;
    const out = this.current;
    const A = L96_FRAMES[i0];
    const B = L96_FRAMES[i1];
    for (let i = 0; i < this.N; i++) out[i] = A[i] * (1 - a) + B[i] * a;
    return out;
  }

  mapPoint(value, i) {
    const s = (value - this.mean) / this.scale;
    const r = this.baseRadius + this.radialGain * s;
    const y = this.height + this.verticalGain * s;
    const a = this.theta[i];
    return [Math.cos(a) * r, y, Math.sin(a) * r, s];
  }

  colorFromValue(value) {
    const t = THREE.MathUtils.clamp((value + 8) / 22, 0, 1);
    const c1 = new THREE.Color(0x3455ff);
    const c2 = new THREE.Color(0x56ccf2);
    const c3 = new THREE.Color(0xffd166);
    const c4 = new THREE.Color(0xff4d7e);
    const c = new THREE.Color();
    if (t < 0.35) c.copy(c1).lerp(c2, t / 0.35);
    else if (t < 0.72) c.copy(c2).lerp(c3, (t - 0.35) / 0.37);
    else c.copy(c3).lerp(c4, (t - 0.72) / 0.28);
    return c;
  }

  update(masterPhase, timeSeconds) {
    const frame = this.sampleFrame(masterPhase);
    let maxVal = -Infinity;
    let minVal = Infinity;
    let maxIdx = 0;
    let minIdx = 0;

    for (let i = 0; i < this.N; i++) {
      const value = frame[i];
      if (value > maxVal) { maxVal = value; maxIdx = i; }
      if (value < minVal) { minVal = value; minIdx = i; }
      const [x, y, z] = this.mapPoint(value, i);
      this.pointPositions[i * 3 + 0] = x;
      this.pointPositions[i * 3 + 1] = y;
      this.pointPositions[i * 3 + 2] = z;
      this.positions[i * 3 + 0] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;

      const color = this.colorFromValue(value);
      this.pointColors[i * 3 + 0] = color.r;
      this.pointColors[i * 3 + 1] = color.g;
      this.pointColors[i * 3 + 2] = color.b;

      const a = this.theta[i];
      const bx = Math.cos(a) * this.baseRadius;
      const bz = Math.sin(a) * this.baseRadius;
      const si = i * 6;
      this.stemPositions[si + 0] = bx;
      this.stemPositions[si + 1] = this.height;
      this.stemPositions[si + 2] = bz;
      this.stemPositions[si + 3] = x;
      this.stemPositions[si + 4] = y;
      this.stemPositions[si + 5] = z;
      this.stemColors[si + 0] = 0.34; this.stemColors[si + 1] = 0.80; this.stemColors[si + 2] = 0.95;
      this.stemColors[si + 3] = color.r; this.stemColors[si + 4] = color.g; this.stemColors[si + 5] = color.b;
    }

    this.positions[this.N * 3 + 0] = this.positions[0];
    this.positions[this.N * 3 + 1] = this.positions[1];
    this.positions[this.N * 3 + 2] = this.positions[2];

    this.lineGeometry.attributes.position.needsUpdate = true;
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.pointsGeometry.attributes.color.needsUpdate = true;
    this.stemGeometry.attributes.position.needsUpdate = true;
    this.stemGeometry.attributes.color.needsUpdate = true;

    this.group.rotation.y = Math.sin(timeSeconds * 0.22) * 0.08;
    this.glow.scale.setScalar(1.0 + 0.035 * Math.sin(timeSeconds * 2.0));
  }
}


class ModelComparisonRingInstallation {
  constructor(station, trajectoryKey, label, color) {
    this.group = new THREE.Group();
    this.group.position.copy(station.position);
    this.trajectoryKey = trajectoryKey;
    this.label = label;
    this.color = color;
    this.frames = getTrajectoryFrames(trajectoryKey, L96_FRAMES);
    this.physicalFrames = getTrajectoryFrames('physical', L96_FRAMES);
    this.frameCount = Math.min(this.frames.length, this.physicalFrames.length);
    this.N = N;
    this.theta = [...Array(this.N)].map((_, i) => i * Math.PI * 2 / this.N);
    this.baseRadius = 9.6;
    this.radialGain = trajectoryKey === 'mlp_next' ? 0.72 : 0.96;
    this.verticalGain = trajectoryKey === 'mlp_next' ? 2.55 : 3.45;
    this.scale = L96_META.cleanStats?.l96Std || 3.64;
    this.mean = L96_META.cleanStats?.l96Mean || 2.33;
    this.height = 17.0;
    this.clamp = trajectoryKey === 'mlp_next' ? 7.5 : 4.5;
    this.positions = new Float32Array((this.N + 1) * 3);
    this.pointPositions = new Float32Array(this.N * 3);
    this.pointColors = new Float32Array(this.N * 3);
    this.ghostPositions = new Float32Array((this.N + 1) * 3);
    this.errorPositions = new Float32Array(this.N * 2 * 3);
    this.current = new Array(this.N).fill(0);
    this.currentPhysical = new Array(this.N).fill(0);
    this.lastRmse = 0;
    this.lastMeanAbsError = 0;
    this.lastMaxAbsError = 0;
    this.makeObjects(station);
    this.makePedestal(station);
  }

  makeObjects(station) {
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.baseRadius, 0.045, 8, 160),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.54 })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = this.height;
    this.group.add(baseRing);

    const ghostRing = new THREE.Mesh(
      new THREE.TorusGeometry(this.baseRadius + 1.7, 0.025, 6, 160),
      new THREE.MeshBasicMaterial({ color: COLORS.physical, transparent: true, opacity: 0.25 })
    );
    ghostRing.rotation.x = Math.PI / 2;
    ghostRing.position.y = this.height;
    this.group.add(ghostRing);

    this.ghostGeometry = new THREE.BufferGeometry();
    this.ghostGeometry.setAttribute('position', new THREE.BufferAttribute(this.ghostPositions, 3));
    this.ghostLine = new THREE.Line(
      this.ghostGeometry,
      new THREE.LineBasicMaterial({ color: COLORS.physical, transparent: true, opacity: 0.38 })
    );
    this.group.add(this.ghostLine);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.line = new THREE.Line(
      this.lineGeometry,
      new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0.96 })
    );
    this.group.add(this.line);

    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointsGeometry.setAttribute('color', new THREE.BufferAttribute(this.pointColors, 3));
    this.points = new THREE.Points(
      this.pointsGeometry,
      new THREE.PointsMaterial({ size: trajectoryPointSize(this.trajectoryKey), vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false })
    );
    this.group.add(this.points);

    this.errorGeometry = new THREE.BufferGeometry();
    this.errorGeometry.setAttribute('position', new THREE.BufferAttribute(this.errorPositions, 3));
    this.errorLines = new THREE.LineSegments(
      this.errorGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: this.trajectoryKey === 'mlp_next' ? 0.22 : 0.14 })
    );
    this.group.add(this.errorLines);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(13.5, 48, 24),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.035, side: THREE.BackSide })
    );
    glow.position.y = this.height;
    this.group.add(glow);
    this.glow = glow;

    const finalRmse = MODEL_META.rmse_15s_export_window?.[this.trajectoryKey]?.final;
    const labelText = `REAL ROLLOUT COMPARISON\nmodel color vs blue physical ghost - live RMSE panel below`;
    addTextPlane(this.group, labelText, new THREE.Vector3(0, 29.0, -11.5), 15.0, 1.8, {
      color: '#ffffff',
      font: 34,
      bg: this.trajectoryKey === 'mlp_next' ? 'rgba(50,20,4,.48)' : 'rgba(30,12,58,.48)',
    });
  }

  makePedestal(station) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x121a31, emissive: this.color, emissiveIntensity: 0.045, roughness: 0.50, metalness: 0.32, transparent: true, opacity: 0.92 });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.5, 64), mat);
    platform.position.y = 0.45;
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.group.add(platform);

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.55, this.height - 1.8, 16), mat);
    tower.position.y = (this.height - 1.8) / 2;
    tower.castShadow = true;
    this.group.add(tower);
  }

  sampleFrames(frames, phase, out) {
    const f = phase * (this.frameCount - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(this.frameCount - 1, i0 + 1);
    const a = f - i0;
    const A = frames[i0];
    const B = frames[i1];
    for (let i = 0; i < this.N; i++) out[i] = A[i] * (1 - a) + B[i] * a;
    return out;
  }

  mapValue(value, i, ghost = false) {
    let s = (value - this.mean) / this.scale;
    s = THREE.MathUtils.clamp(s, -this.clamp, this.clamp);
    const r = this.baseRadius + this.radialGain * s + (ghost ? 1.7 : 0.0);
    const y = this.height + this.verticalGain * s;
    const a = this.theta[i];
    return [Math.cos(a) * r, y, Math.sin(a) * r, s];
  }

  colorFromState(value, physicalValue) {
    const err = Math.abs(value - physicalValue);
    const t = THREE.MathUtils.clamp(err / (this.trajectoryKey === 'mlp_next' ? 80 : 8), 0, 1);
    const base = new THREE.Color(this.color);
    const hot = new THREE.Color(0xffffff);
    return base.lerp(hot, t * 0.62);
  }

  update(phase, elapsed) {
    const frame = this.sampleFrames(this.frames, phase, this.current);
    const physical = this.sampleFrames(this.physicalFrames, phase, this.currentPhysical);
    let errSum = 0;
    let errSqSum = 0;
    let errMax = 0;

    for (let i = 0; i < this.N; i++) {
      const value = frame[i];
      const phys = physical[i];
      const [x, y, z] = this.mapValue(value, i, false);
      const [gx, gy, gz] = this.mapValue(phys, i, true);
      const absErr = Math.abs(value - phys);
      errSum += absErr;
      errSqSum += absErr * absErr;
      if (absErr > errMax) errMax = absErr;

      this.positions[i * 3 + 0] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      this.pointPositions[i * 3 + 0] = x;
      this.pointPositions[i * 3 + 1] = y;
      this.pointPositions[i * 3 + 2] = z;
      this.ghostPositions[i * 3 + 0] = gx;
      this.ghostPositions[i * 3 + 1] = gy;
      this.ghostPositions[i * 3 + 2] = gz;

      const c = this.colorFromState(value, phys);
      this.pointColors[i * 3 + 0] = c.r;
      this.pointColors[i * 3 + 1] = c.g;
      this.pointColors[i * 3 + 2] = c.b;

      const si = i * 6;
      this.errorPositions[si + 0] = gx;
      this.errorPositions[si + 1] = gy;
      this.errorPositions[si + 2] = gz;
      this.errorPositions[si + 3] = x;
      this.errorPositions[si + 4] = y;
      this.errorPositions[si + 5] = z;
    }

    this.positions[this.N * 3 + 0] = this.positions[0];
    this.positions[this.N * 3 + 1] = this.positions[1];
    this.positions[this.N * 3 + 2] = this.positions[2];
    this.ghostPositions[this.N * 3 + 0] = this.ghostPositions[0];
    this.ghostPositions[this.N * 3 + 1] = this.ghostPositions[1];
    this.ghostPositions[this.N * 3 + 2] = this.ghostPositions[2];

    this.lineGeometry.attributes.position.needsUpdate = true;
    this.ghostGeometry.attributes.position.needsUpdate = true;
    this.pointsGeometry.attributes.position.needsUpdate = true;
    this.pointsGeometry.attributes.color.needsUpdate = true;
    this.errorGeometry.attributes.position.needsUpdate = true;

    const errMean = errSum / this.N;
    this.lastMeanAbsError = errMean;
    this.lastRmse = Math.sqrt(errSqSum / this.N);
    this.lastMaxAbsError = errMax;
    if (this.errorLines?.material) {
      const denom = this.trajectoryKey === 'mlp_next' ? 120 : 12;
      this.errorLines.material.opacity = THREE.MathUtils.clamp(0.08 + this.lastRmse / denom, 0.10, this.trajectoryKey === 'mlp_next' ? 0.55 : 0.38);
    }
    this.glow.scale.setScalar(1.0 + 0.012 * errMean + 0.025 * Math.sin(elapsed * 2.0));
    this.group.rotation.y = Math.sin(elapsed * 0.20) * 0.075;
  }
}

function trajectoryPointSize(key) {
  return key === 'mlp_next' ? 0.82 : 0.72;
}


function buildFutureStation(station) {
  const group = new THREE.Group();
  group.position.copy(station.position);
  root.add(group);

  const mat = new THREE.MeshStandardMaterial({ color: station.color, transparent: true, opacity: 0.14, roughness: 0.55, metalness: 0.25 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(7.0, 7.6, 0.48, 64), mat);
  platform.position.y = 0.45;
  platform.castShadow = true;
  platform.receiveShadow = true;
  group.add(platform);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 11.0, 16), mat);
  tower.position.y = 5.75;
  tower.castShadow = true;
  group.add(tower);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.0, 0.08, 8, 128), new THREE.MeshBasicMaterial({ color: station.color, transparent: true, opacity: 0.28 }));
  ring.position.y = 12.0;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const placeholder = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 2), new THREE.MeshBasicMaterial({ color: station.color, wireframe: true, transparent: true, opacity: 0.45 }));
  placeholder.position.y = 15;
  placeholder.userData.spin = true;
  group.add(placeholder);
}

function buildDiagnosticsWall(station) {
  const group = new THREE.Group();
  group.position.copy(station.position);
  group.rotation.y = -Math.PI * 0.75;
  root.add(group);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 0.5), new THREE.MeshStandardMaterial({ color: 0x0d1830, emissive: station.color, emissiveIntensity: 0.04, roughness: 0.5, metalness: 0.22 }));
  wall.position.y = 7;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  addTextPlane(group, 'L96 clean run diagnostics', new THREE.Vector3(0, 12.4, -0.35), 5.6, 1.0, { color: '#eaf2ff', bg: 'rgba(0,0,0,0)' });
  addTextPlane(group, 'Prediction horizon: MLP next 0.12 - CNN tendency 2.33', new THREE.Vector3(0, 10.9, -0.36), 7.6, 0.85, { color: '#bdeeff', bg: 'rgba(0,0,0,0)' });
  addTextPlane(group, 'ÃŽÂ»1 reference 1.68 - CNN next 1.81 - tendency Ã¢â€°Ë†1.51', new THREE.Vector3(0, 9.7, -0.36), 7.6, 0.85, { color: '#d9ffc9', bg: 'rgba(0,0,0,0)' });

  buildMiniBars(group, new THREE.Vector3(-7.4, 3.0, -0.45));
  return group;
}

function buildMiniBars(parent, origin) {
  const values = [
    ['MLP next', L96_RESULTS.mlp_next.horizon, COLORS.mlpNext],
    ['MLP tend', L96_RESULTS.mlp_tendency.horizon, COLORS.mlpTendency],
    ['CNN next', L96_RESULTS.cnn_next.horizon, COLORS.diagnostics],
    ['CNN tend', L96_RESULTS.cnn_tendency.horizon, COLORS.cnnTendency],
  ];
  const maxV = 2.5;
  values.forEach((row, i) => {
    const [label, value, color] = row;
    const h = 0.55 + 5.2 * (value / maxV);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.35, h, 0.42), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86 }));
    bar.position.set(origin.x + i * 4.4, origin.y + h / 2, origin.z);
    parent.add(bar);
    addTextPlane(parent, `${label}\n${value.toFixed(2)} t.u.`, new THREE.Vector3(origin.x + i * 4.4, origin.y - 0.6, origin.z - 0.05), 2.8, 1.05, { color: '#eaf2ff', font: 34 });
  });
}

function addStationLabel(station) {
  const p = station.position.clone();
  addTextPlane(root, station.title, new THREE.Vector3(p.x, 3.5, p.z + 12), 12.0, 1.25, { color: '#ffffff', bg: station.active ? 'rgba(30,100,140,.34)' : 'rgba(20,20,28,.42)' });
  addTextPlane(root, station.subtitle, new THREE.Vector3(p.x, 2.25, p.z + 12), 13.0, 1.0, { color: '#cdd8ee', font: 32, bg: 'rgba(0,0,0,.18)' });
}

function addCentralInstructionLabels() {
  addTextPlane(root, 'Spawn center - guarda in alto verso Q1', new THREE.Vector3(0, 4.2, -9), 11.0, 1.1, { color: '#eaf2ff', bg: 'rgba(0,0,0,.25)' });
  addTextPlane(root, 'Loop unico 15s: in futuro sincronizzera GIF/grafici e modelli ML', new THREE.Vector3(0, 3.0, -9), 13.0, 0.9, { color: '#aeeeff', font: 30, bg: 'rgba(0,0,0,.16)' });
}

function addTextPlane(parent, text, position, width = 6, height = 1, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = opts.bg === undefined ? 'rgba(0,0,0,0.44)' : opts.bg;
  if (bg !== 'none') {
    roundRect(ctx, 16, 20, canvas.width - 32, canvas.height - 40, 38, bg);
  }
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${opts.font || 42}px Inter, Segoe UI, Arial`;
  const lines = String(text).split('\n');
  const lineHeight = opts.lineHeight || 54;
  lines.forEach((line, idx) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (idx - (lines.length - 1) / 2) * lineHeight));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.position.copy(position);
  mesh.userData.billboard = true;
  parent.add(mesh);
  return mesh;
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}


// -----------------------------------------------------------------------------
// V2 scientific additions: Lorenz-63 hero, Hovmoller 3D, and 2D display panels
// -----------------------------------------------------------------------------

function l96ColorFromValue(value) {
  const t = THREE.MathUtils.clamp((value + 8) / 22, 0, 1);
  const c1 = new THREE.Color(0x213dff);
  const c2 = new THREE.Color(0x56ccf2);
  const c3 = new THREE.Color(0xffd166);
  const c4 = new THREE.Color(0xff4d7e);
  const c = new THREE.Color();
  if (t < 0.35) c.copy(c1).lerp(c2, t / 0.35);
  else if (t < 0.72) c.copy(c2).lerp(c3, (t - 0.35) / 0.37);
  else c.copy(c3).lerp(c4, (t - 0.72) / 0.28);
  return c;
}

function lorenz63Rhs(p) {
  const sigma = 10.0;
  const rho = 28.0;
  const beta = 8.0 / 3.0;
  return new THREE.Vector3(
    sigma * (p.y - p.x),
    p.x * (rho - p.z) - p.y,
    p.x * p.y - beta * p.z,
  );
}

function rk4Lorenz63Step(p, dt) {
  const k1 = lorenz63Rhs(p);
  const k2 = lorenz63Rhs(p.clone().addScaledVector(k1, 0.5 * dt));
  const k3 = lorenz63Rhs(p.clone().addScaledVector(k2, 0.5 * dt));
  const k4 = lorenz63Rhs(p.clone().addScaledVector(k3, dt));
  return p.clone()
    .addScaledVector(k1, dt / 6)
    .addScaledVector(k2, dt / 3)
    .addScaledVector(k3, dt / 3)
    .addScaledVector(k4, dt / 6);
}

function generateLorenz63Path() {
  const dt = 0.006;
  const spinup = 1200;
  const kept = 2800;
  let p = new THREE.Vector3(1.0, 1.0, 1.0);
  const out = [];
  for (let i = 0; i < spinup + kept; i++) {
    p = rk4Lorenz63Step(p, dt);
    if (i >= spinup) {
      // Map Lorenz-63 physical coordinates into showroom coordinates.
      // Three.js vertical axis is Y, so physical z becomes showroom Y.
      out.push(new THREE.Vector3(
        p.x * 0.42,
        (p.z - 25.0) * 0.34,
        p.y * 0.42,
      ));
    }
  }
  return out;
}

class L63SkyHero {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.baseHeight = 42.0;
    this.path = generateLorenz63Path();
    this.count = this.path.length;
    this.trailCount = 260;
    this.trailPositions = new Float32Array(this.trailCount * 3);
    this.makeObjects();
  }

  makeObjects() {
    const title = addTextPlane(
      this.group,
      'Lorenz-63 classic chaotic attractor\nÃÆ’=10 - ÃÂ=28 - ÃŽÂ²=8/3 - loop synced',
      new THREE.Vector3(0, this.baseHeight + 13.2, -15.5),
      18.0,
      2.2,
      { color: '#ffffff', font: 38, bg: 'rgba(10,16,34,.52)' }
    );
    title.userData.billboard = true;

    const allPositions = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const p = this.path[i];
      allPositions[i * 3 + 0] = p.x;
      allPositions[i * 3 + 1] = this.baseHeight + p.y;
      allPositions[i * 3 + 2] = p.z;
    }

    const attractorGeometry = new THREE.BufferGeometry();
    attractorGeometry.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));

    this.ghostLine = new THREE.Line(
      attractorGeometry,
      new THREE.LineBasicMaterial({ color: 0x56ccf2, transparent: true, opacity: 0.24 })
    );
    this.group.add(this.ghostLine);

    this.ghostPoints = new THREE.Points(
      attractorGeometry,
      new THREE.PointsMaterial({ color: 0xff5cc8, size: 0.075, transparent: true, opacity: 0.20, depthWrite: false })
    );
    this.group.add(this.ghostPoints);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailLine = new THREE.Line(
      this.trailGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })
    );
    this.group.add(this.trailLine);

    this.particle = new THREE.Mesh(
      new THREE.SphereGeometry(0.58, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6a3 })
    );
    this.group.add(this.particle);

    this.particleGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.65, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xff5cc8, transparent: true, opacity: 0.18, depthWrite: false })
    );
    this.group.add(this.particleGlow);

    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(13.5, 0.035, 8, 180),
      new THREE.MeshBasicMaterial({ color: 0x56ccf2, transparent: true, opacity: 0.25 })
    );
    halo1.rotation.x = Math.PI / 2;
    halo1.position.y = this.baseHeight;
    this.group.add(halo1);

    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(18.5, 0.025, 8, 180),
      new THREE.MeshBasicMaterial({ color: 0xff5cc8, transparent: true, opacity: 0.16 })
    );
    halo2.rotation.x = Math.PI / 2;
    halo2.position.y = this.baseHeight;
    this.group.add(halo2);

    const light = new THREE.PointLight(0xff5cc8, 3.4, 70, 1.6);
    light.position.set(0, this.baseHeight + 5, 0);
    this.group.add(light);
  }

  getPathPoint(index) {
    const i = ((index % this.count) + this.count) % this.count;
    return this.path[i];
  }

  update(phase, elapsed) {
    const f = phase * this.count;
    const i = Math.floor(f) % this.count;
    const p = this.getPathPoint(i);

    this.particle.position.set(p.x, this.baseHeight + p.y, p.z);
    this.particleGlow.position.copy(this.particle.position);
    this.particleGlow.scale.setScalar(1.0 + 0.18 * Math.sin(elapsed * 5.0));

    for (let j = 0; j < this.trailCount; j++) {
      const idx = i - (this.trailCount - 1 - j);
      const q = this.getPathPoint(idx);
      this.trailPositions[j * 3 + 0] = q.x;
      this.trailPositions[j * 3 + 1] = this.baseHeight + q.y;
      this.trailPositions[j * 3 + 2] = q.z;
    }
    this.trailGeometry.attributes.position.needsUpdate = true;

    this.group.rotation.y = 0.18 * Math.sin(elapsed * 0.11);
  }
}

class Hovmoller3DSurface {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = -Math.PI * 0.25;
    this.rows = 70;
    this.cols = N;
    this.width = 31.0;
    this.depth = 26.0;
    this.height = 3.8;
    this.mean = L96_META.cleanStats?.l96Mean || 2.33;
    this.std = L96_META.cleanStats?.l96Std || 3.64;
    this.positions = new Float32Array(this.rows * this.cols * 3);
    this.colors = new Float32Array(this.rows * this.cols * 3);
    this.makeObjects();
  }

  makeObjects() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const indices = [];
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const a = r * this.cols + c;
        const b = a + 1;
        const d = (r + 1) * this.cols + c;
        const e = d + 1;
        indices.push(a, d, b, b, d, e);
      }
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.geometry = geometry;

    this.surface = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.94 })
    );
    this.surface.position.y = 7.2;
    this.group.add(this.surface);

    this.wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10 })
    );
    this.wire.position.y = 7.22;
    this.group.add(this.wire);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(this.width + 2, 0.45, this.depth + 2),
      new THREE.MeshStandardMaterial({ color: 0x10192f, roughness: 0.5, metalness: 0.35, emissive: 0x4dffb1, emissiveIntensity: 0.025 })
    );
    base.position.y = 0.65;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x18284a, roughness: 0.55, metalness: 0.35 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7.1, 10), poleMat);
        pole.position.set(sx * (this.width / 2 + 0.6), 3.75, sz * (this.depth / 2 + 0.6));
        pole.castShadow = true;
        this.group.add(pole);
      }
    }

    addTextPlane(
      this.group,
      'L96 Hovmoller 3D terrain\nlocation x time x state amplitude',
      new THREE.Vector3(0, 13.8, -this.depth / 2 - 2.8),
      14.5,
      2.0,
      { color: '#eafff7', font: 36, bg: 'rgba(4,18,16,.46)' }
    );

    // V3: visible master-time cursor on the terrain table.
    // It makes the 15s sync idea readable in-world.
    this.cursor = new THREE.Mesh(
      new THREE.BoxGeometry(this.width + 1.25, 0.10, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false })
    );
    this.cursor.position.set(0, 7.38, -this.depth / 2);
    this.group.add(this.cursor);

    this.cursorGlow = new THREE.Mesh(
      new THREE.BoxGeometry(this.width + 1.7, 0.14, 0.48),
      new THREE.MeshBasicMaterial({ color: 0x4dffb1, transparent: true, opacity: 0.16, depthWrite: false })
    );
    this.cursorGlow.position.copy(this.cursor.position);
    this.group.add(this.cursorGlow);
  }

  sampleL96(frameFloat, col) {
    const total = L96_FRAMES.length;
    const f = ((frameFloat % total) + total) % total;
    const i0 = Math.floor(f);
    const i1 = (i0 + 1) % total;
    const a = f - i0;
    return L96_FRAMES[i0][col] * (1 - a) + L96_FRAMES[i1][col] * a;
  }

  update(phase, elapsed) {
    const total = L96_FRAMES.length;
    const frameBase = phase * total;
    let idx = 0;
    for (let r = 0; r < this.rows; r++) {
      const rowTime = r / (this.rows - 1);
      const frameFloat = frameBase + rowTime * total;
      for (let c = 0; c < this.cols; c++) {
        const x = (c / (this.cols - 1) - 0.5) * this.width;
        const z = (rowTime - 0.5) * this.depth;
        const value = this.sampleL96(frameFloat, c);
        const s = (value - this.mean) / this.std;
        const y = this.height * s;
        this.positions[idx * 3 + 0] = x;
        this.positions[idx * 3 + 1] = y;
        this.positions[idx * 3 + 2] = z;
        const color = l96ColorFromValue(value);
        this.colors[idx * 3 + 0] = color.r;
        this.colors[idx * 3 + 1] = color.g;
        this.colors[idx * 3 + 2] = color.b;
        idx++;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
    if (this.cursor) {
      const zCursor = (phase - 0.5) * this.depth;
      this.cursor.position.z = zCursor;
      this.cursorGlow.position.z = zCursor;
      this.cursor.material.opacity = 0.62 + 0.18 * Math.sin(elapsed * 5.0);
    }
    this.wire.geometry.dispose();
    this.wire.geometry = new THREE.WireframeGeometry(this.geometry);
    this.group.position.y = 0.2 + 0.10 * Math.sin(elapsed * 0.7);
  }
}

class LiveL96DisplayPanel {
  constructor(station) {
    this.group = new THREE.Group();
    this.station = station;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.makeObjects();
  }

  makeObjects() {
    const center = new THREE.Vector3(0, 0, 0);
    const dir = center.clone().sub(this.station.position).normalize();
    const pos = this.station.position.clone().addScaledVector(dir, 20);
    this.group.position.set(pos.x, 0, pos.z);
    this.group.lookAt(new THREE.Vector3(0, 0, 0));

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 9),
      new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide })
    );
    screen.position.y = 5.2;
    this.group.add(screen);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(16.6, 9.6, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x07101f, roughness: 0.5, metalness: 0.35, emissive: this.station.color, emissiveIntensity: 0.03 })
    );
    back.position.set(0, 5.2, -0.18);
    back.castShadow = true;
    this.group.add(back);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x12213e, roughness: 0.45, metalness: 0.45 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 10), legMat);
      leg.position.set(side * 5.8, 2.05, -0.25);
      leg.castShadow = true;
      this.group.add(leg);
    }
  }

  sampleFrame(phase) {
    const f = phase * (FRAME_COUNT - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(FRAME_COUNT - 1, i0 + 1);
    const a = f - i0;
    const A = L96_FRAMES[i0];
    const B = L96_FRAMES[i1];
    const out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = A[i] * (1 - a) + B[i] * a;
    return out;
  }

  update(phase, elapsed) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const frame = this.sampleFrame(phase);
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#081225');
    grad.addColorStop(1, '#111c35');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#56ccf2';
    ctx.font = '900 42px Inter, Segoe UI, Arial';
    ctx.fillText('Q1 - L96 physical RK4 live 2D display', 50, 70);
    ctx.fillStyle = '#dbe8ff';
    ctx.font = '700 26px Inter, Segoe UI, Arial';
    ctx.fillText(`N=40, F=8, dt=0.01 - synced t=${(phase * LOOP_SECONDS).toFixed(2)} / 15s`, 50, 110);

    const left = 70, top = 165, width = 1120, height = 410;
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, width, height);
    for (let k = 0; k <= 4; k++) {
      const y = top + height * k / 4;
      ctx.beginPath();
      ctx.moveTo(left, y); ctx.lineTo(left + width, y);
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.stroke();
    }

    const minVal = -8, maxVal = 13.5;
    ctx.beginPath();
    frame.forEach((v, i) => {
      const x = left + width * i / (N - 1);
      const y = top + height * (1 - (v - minVal) / (maxVal - minVal));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#56ccf2';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;

    for (let i = 0; i < N; i += 5) {
      const x = left + width * i / (N - 1);
      ctx.fillStyle = 'rgba(222,235,255,.82)';
      ctx.font = '700 20px Inter, Segoe UI, Arial';
      ctx.fillText(String(i), x - 8, top + height + 34);
    }

    ctx.fillStyle = '#a9b8d4';
    ctx.font = '700 22px Inter, Segoe UI, Arial';
    ctx.fillText(`mean=${mean(frame).toFixed(2)}  std=${std(frame).toFixed(2)}  min=${Math.min(...frame).toFixed(2)}  max=${Math.max(...frame).toFixed(2)}`, 50, 650);
    this.texture.needsUpdate = true;
  }
}



function quantileFromSorted(sorted, q) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const i0 = Math.floor(idx), i1 = Math.min(sorted.length - 1, i0 + 1);
  const a = idx - i0;
  return sorted[i0] * (1 - a) + sorted[i1] * a;
}

function computeRobustRange(frames) {
  const values = [];
  for (const frame of frames) for (const v of frame) values.push(Number(v) || 0);
  values.sort((a, b) => a - b);
  const q02 = quantileFromSorted(values, 0.02);
  const q98 = quantileFromSorted(values, 0.98);
  const lo = Math.min(q02, -8.0);
  const hi = Math.max(q98, 8.0);
  return [lo, hi];
}

function mixColor(a, b, t) {
  return a + (b - a) * t;
}

function valueToCSS(value, lo, hi, alpha = 1.0) {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
  let r, g, b;
  if (t < 0.5) {
    const u = t / 0.5;
    r = mixColor(53, 244, u);
    g = mixColor(94, 245, u);
    b = mixColor(196, 248, u);
  } else {
    const u = (t - 0.5) / 0.5;
    r = mixColor(244, 179, u);
    g = mixColor(245, 34, u);
    b = mixColor(248, 34, u);
  }
  return `rgba(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)},${alpha})`;
}

class SyncedRolloutDashboardPanel {
  constructor(options) {
    this.group = new THREE.Group();
    this.station = options.station;
    this.title = options.title;
    this.subtitle = options.subtitle || '';
    this.trajectoryFrames = options.trajectoryFrames || L96_FRAMES;
    this.referenceFrames = L96_FRAMES;
    this.compareKey = options.compareKey || null;
    this.color = options.color || COLORS.physical;
    this.side = options.side || 0.0;
    this.targetChannels = [0, 10, 20, 30];
    this.channelColors = ['#56ccf2', '#ff9f43', '#4dffb1', '#ff4d7e'];
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.totalFrames = Math.min(this.trajectoryFrames.length, this.referenceFrames.length);
    this.valueRange = computeRobustRange(this.trajectoryFrames);
    this.lastHover = 0;
    this.makeObjects();
  }

  makeObjects() {
    const center = new THREE.Vector3(0, 0, 0);
    const dir = center.clone().sub(this.station.position).normalize();
    const sideVec = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const pos = this.station.position.clone().addScaledVector(dir, 20).addScaledVector(sideVec, this.side * 4.8);
    this.group.position.set(pos.x, 0, pos.z);
    this.group.lookAt(new THREE.Vector3(0, 4.5, 0));

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 9.6),
      new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide })
    );
    screen.position.y = 5.5;
    this.group.add(screen);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 10.2, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x07101f, roughness: 0.5, metalness: 0.35, emissive: this.color, emissiveIntensity: 0.03 })
    );
    back.position.set(0, 5.5, -0.18);
    back.castShadow = true;
    this.group.add(back);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x12213e, roughness: 0.45, metalness: 0.45 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.7, 10), legMat);
      leg.position.set(side * 6.2, 2.25, -0.25);
      leg.castShadow = true;
      this.group.add(leg);
    }
  }

  drawPanelFrame(ctx, x, y, w, h, title) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#e8f1ff';
    ctx.font = '700 24px Inter, Segoe UI, Arial';
    ctx.fillText(title, x + 18, y - 14);
  }

  drawHovmoller(ctx, x, y, w, h, revealIdx) {
    this.drawPanelFrame(ctx, x, y, w, h, 'Progressive Hovmoller reveal');
    const frames = this.trajectoryFrames;
    const rows = this.totalFrames;
    const cols = N;
    const rowH = h / rows;
    const colW = w / cols;
    const [lo, hi] = this.valueRange;
    for (let i = 0; i < rows; i++) {
      const row = frames[i];
      const alpha = i <= revealIdx ? 0.95 : 0.15;
      const yy = y + h - (i + 1) * rowH;
      for (let j = 0; j < cols; j++) {
        ctx.fillStyle = valueToCSS(row[j], lo, hi, alpha);
        ctx.fillRect(x + j * colW, yy, colW + 0.75, rowH + 0.75);
      }
    }
    const cursorY = y + h - (revealIdx + 0.5) * rowH;
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, cursorY);
    ctx.lineTo(x + w, cursorY);
    ctx.stroke();
    for (let c = 0; c <= 4; c++) {
      const xx = x + c * w / 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + h);
      ctx.stroke();
      const label = c === 4 ? '40' : String(1 + c * 10);
      ctx.fillStyle = '#b7c8e4';
      ctx.font = '700 18px Inter, Segoe UI, Arial';
      ctx.fillText(label, xx + 2, y + h + 22);
    }
    for (let r = 0; r <= 3; r++) {
      const yy = y + h - r * h / 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      const timeVal = (r / 3) * LOOP_SECONDS;
      ctx.fillStyle = '#b7c8e4';
      ctx.font = '700 18px Inter, Segoe UI, Arial';
      ctx.fillText(timeVal.toFixed(1), x - 38, yy + 6);
    }
    ctx.save();
    ctx.translate(x - 58, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#c9d7ef';
    ctx.font = '700 20px Inter, Segoe UI, Arial';
    ctx.fillText('Time (UM)', 0, 0);
    ctx.restore();
    ctx.fillStyle = '#c9d7ef';
    ctx.font = '700 20px Inter, Segoe UI, Arial';
    ctx.fillText('Spatial grid index', x + w / 2 - 70, y + h + 46);
  }

  drawSignalPlot(ctx, x, y, w, h, revealIdx) {
    this.drawPanelFrame(ctx, x, y, w, h, 'Selected grid-point signals');
    const maxT = LOOP_SECONDS;
    const model = this.trajectoryFrames;
    const truth = this.referenceFrames;
    const [lo, hi] = this.valueRange;
    const toX = (i) => x + (i / (this.totalFrames - 1)) * w;
    const toY = (v) => y + h * (1 - (v - lo) / (hi - lo || 1));
    for (let k = 0; k <= 4; k++) {
      const xx = x + k * w / 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke();
      ctx.fillStyle = '#b7c8e4';
      ctx.font = '700 18px Inter, Segoe UI, Arial';
      ctx.fillText((k * maxT / 4).toFixed(1), xx + 2, y + h + 22);
    }
    for (let k = 0; k <= 4; k++) {
      const yy = y + k * h / 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.beginPath();
      ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      const val = hi - (hi - lo) * k / 4;
      ctx.fillStyle = '#b7c8e4';
      ctx.font = '700 18px Inter, Segoe UI, Arial';
      ctx.fillText(val.toFixed(1), x - 54, yy + 6);
    }

    this.targetChannels.forEach((ch, idx) => {
      if (this.compareKey) {
        ctx.beginPath();
        for (let i = 0; i < truth.length; i++) {
          const px = toX(i), py = toY(truth[i][ch]);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(180,205,255,0.42)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 2.0;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      for (let i = 0; i <= revealIdx; i++) {
        const px = toX(i), py = toY(model[i][ch]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = this.channelColors[idx];
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const px = toX(revealIdx), py = toY(model[revealIdx][ch]);
      ctx.fillStyle = this.channelColors[idx];
      ctx.beginPath();
      ctx.arc(px, py, 4.2, 0, Math.PI * 2); ctx.fill();
    });

    let lx = x + 12, ly = y + h - 58;
    this.targetChannels.forEach((ch, idx) => {
      ctx.fillStyle = this.channelColors[idx];
      ctx.fillRect(lx, ly + idx * 22, 18, 3);
      ctx.fillStyle = '#dbe7ff';
      ctx.font = '700 16px Inter, Segoe UI, Arial';
      const base = `x${ch + 1}`;
      const suffix = this.compareKey ? ' solid model / dashed physical' : ' physical';
      ctx.fillText(base + suffix, lx + 26, ly + 6 + idx * 22);
    });
    ctx.fillStyle = '#c9d7ef';
    ctx.font = '700 20px Inter, Segoe UI, Arial';
    ctx.fillText('Time (UM)', x + w / 2 - 48, y + h + 46);
    ctx.save();
    ctx.translate(x - 72, y + h / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('State magnitude', 0, 0);
    ctx.restore();
  }

  update(phase, elapsed) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const revealIdx = Math.min(this.totalFrames - 1, Math.floor(phase * (this.totalFrames - 1)));
    const frame = this.trajectoryFrames[revealIdx];
    const refFrame = this.referenceFrames[revealIdx];
    let liveRmse = 0;
    if (this.compareKey) {
      let s = 0;
      for (let i = 0; i < N; i++) { const d = frame[i] - refFrame[i]; s += d * d; }
      liveRmse = Math.sqrt(s / N);
    }

    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#081225');
    grad.addColorStop(1, '#111c35');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 40px Inter, Segoe UI, Arial';
    ctx.fillText(this.title, 42, 62);
    ctx.fillStyle = '#dce8ff';
    ctx.font = '700 22px Inter, Segoe UI, Arial';
    ctx.fillText(this.subtitle, 44, 94);
    ctx.fillStyle = '#a9b8d4';
    ctx.font = '800 22px Inter, Segoe UI, Arial';
    ctx.fillText(`t = ${(phase * LOOP_SECONDS).toFixed(2)} / ${LOOP_SECONDS.toFixed(0)} s - frame ${revealIdx + 1}/${this.totalFrames}`, 44, 124);
    if (this.compareKey) {
      ctx.fillStyle = '#f7e4c4';
      ctx.fillText(`live RMSE vs physical = ${fmtMetric(liveRmse)} - 15 s final RMSE Ã¢â€°Ë† ${fmtMetric(MODEL_META.rmse_15s_export_window?.[this.compareKey]?.final)}`, 44, 152);
    } else {
      ctx.fillStyle = '#d7f7ff';
      ctx.fillText('Physical truth reference - no learned approximation', 44, 152);
    }

    this.drawHovmoller(ctx, 48, 186, 520, 450, revealIdx);
    this.drawSignalPlot(ctx, 632, 186, 600, 450, revealIdx);

    ctx.fillStyle = '#cddaf1';
    ctx.font = '700 18px Inter, Segoe UI, Arial';
    const phaseNote = this.compareKey ? 'solid model = current station - dashed lines = physical truth' : '2D scientific display synchronized with the 3D loop in this quadrant';
    ctx.fillText(phaseNote, 48, 678);
    ctx.textAlign = 'right';
    ctx.fillText(`mean=${mean(frame).toFixed(2)} - std=${std(frame).toFixed(2)} - min=${Math.min(...frame).toFixed(2)} - max=${Math.max(...frame).toFixed(2)}`, 1234, 678);
    ctx.textAlign = 'left';

    this.texture.needsUpdate = true;
  }
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr) { const m = mean(arr); return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length); }

function buildStaticDisplayPanel(station, title, lines, options = {}) {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#081225';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 46px Inter, Segoe UI, Arial';
  ctx.fillText(title, 52, 80);
  ctx.fillStyle = station.color === COLORS.mlpNext ? '#ffcd91' : station.color === COLORS.cnnTendency ? '#dec5ff' : '#bfffe7';
  ctx.fillRect(52, 115, 470, 8);
  ctx.fillStyle = '#dce8ff';
  ctx.font = '800 32px Inter, Segoe UI, Arial';
  lines.forEach((line, i) => ctx.fillText('- ' + line, 70, 185 + i * 72));
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const center = new THREE.Vector3(0, 0, 0);
  const dir = center.clone().sub(station.position).normalize();
  const pos = options.customPosition || station.position.clone().addScaledVector(dir, 20);
  group.position.set(pos.x, 0, pos.z);
  group.lookAt(options.lookTarget || new THREE.Vector3(0, 0, 0));

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 9),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  );
  screen.position.y = 5.2;
  group.add(screen);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(16.6, 9.6, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x07101f, roughness: 0.5, metalness: 0.35, emissive: station.color, emissiveIntensity: 0.03 })
  );
  back.position.set(0, 5.2, -0.18);
  back.castShadow = true;
  group.add(back);

  root.add(group);
  return group;
}



// -----------------------------------------------------------------------------
// V21 additions: lightweight Lorenz-63 diagnostics wing for the annex
// -----------------------------------------------------------------------------
function generateLorenz63PhysicalSeries() {
  const dt = 0.01;
  const spinup = 1400;
  const kept = 1500;
  let p = new THREE.Vector3(1.0, 1.0, 1.0);
  const raw = [];
  const show = [];
  for (let i = 0; i < spinup + kept; i++) {
    p = rk4Lorenz63Step(p, dt);
    if (i >= spinup) {
      raw.push(p.clone());
      show.push(new THREE.Vector3(p.x * 0.32, (p.z - 25.0) * 0.28, p.y * 0.32));
    }
  }
  return { raw, show, dt };
}

function generateLorenz63PerturbedSeries(baseRaw) {
  // Visual perturbation series: same physical model, slightly shifted phase/offset for clean divergence teaching.
  // It is intentionally used as a nearby-trajectory diagnostic, not as an ML emulator.
  const out = [];
  const n = baseRaw.length;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + Math.floor(3 + 0.035 * i));
    const q = baseRaw[j];
    const growth = Math.min(1.0, i / (n * 0.72));
    out.push(new THREE.Vector3(
      q.x * 0.32 + 0.04 * Math.sin(i * 0.09) * growth,
      (q.z - 25.0) * 0.28 + 0.03 * Math.cos(i * 0.07) * growth,
      q.y * 0.32 - 0.04 * Math.sin(i * 0.06) * growth,
    ));
  }
  return out;
}

function makeLineFromPath(path, color, opacity=0.8, yOffset=8.0) {
  const pos = new Float32Array(path.length * 3);
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    pos[i*3+0] = p.x; pos[i*3+1] = yOffset + p.y; pos[i*3+2] = p.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function makePanelCanvasMesh(width, height, canvasW=1400, canvasH=900) {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  return { canvas, ctx, texture, mesh };
}

function addScreenFrame(parent, width, height, y=7.0, z=-0.2, color=0x07101f, emissive=0x56ccf2) {
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.8, height + 0.8, 0.42),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.34, emissive, emissiveIntensity: 0.045 })
  );
  frame.position.set(0, y, z - 0.24);
  parent.add(frame);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x11213a, roughness: 0.5, metalness: 0.35 });
  [-width*0.38, width*0.38].forEach(x => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, y, 10), legMat);
    leg.position.set(x, y/2, z - 0.35);
    parent.add(leg);
  });
}

function drawPanelBg(ctx, w, h, title, subtitle) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#050b16');
  grad.addColorStop(0.6, '#0b172b');
  grad.addColorStop(1, '#061a16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 58px Inter, Segoe UI, Arial';
  ctx.fillText(title, 60, 80);
  ctx.fillStyle = '#bfffe6';
  ctx.font = '800 26px Inter, Segoe UI, Arial';
  ctx.fillText(subtitle, 60, 122);
}

class L63AnnexPhysicalSuite {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.series = generateLorenz63PhysicalSeries();
    this.path = this.series.show;
    this.count = this.path.length;
    this.trailCount = 170;
    this.trailPositions = new Float32Array(this.trailCount * 3);
    this.makeObjects();
  }

  makeObjects() {
    const title = addTextPlane(this.group, 'Q2 - L63 physical RK4 run\nstate trajectory + data-generation display', new THREE.Vector3(0, 17.3, -9.5), 18, 2.0, { color: '#ffffff', font: 34, bg: 'rgba(8,13,28,.50)' });
    title.userData.billboard = false;

    const line = makeLineFromPath(this.path, 0x56ccf2, 0.35, 8.0);
    this.group.add(line);
    const ptsGeo = line.geometry.clone();
    this.group.add(new THREE.Points(ptsGeo, new THREE.PointsMaterial({ color: 0xff5cc8, size: 0.055, transparent: true, opacity: 0.22, depthWrite: false })));

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailLine = new THREE.Line(this.trailGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    this.group.add(this.trailLine);
    this.particle = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 12), new THREE.MeshBasicMaterial({ color: 0xfff6a3 }));
    this.group.add(this.particle);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), new THREE.MeshBasicMaterial({ color: 0xff5cc8, transparent: true, opacity: 0.18, depthWrite: false }));
    this.group.add(this.glow);

    const panelGroup = makeFacingScreenGroup(new THREE.Vector3(14, 0, 2), new THREE.Vector3(0, 6, 0));
    panelGroup.scale.setScalar(0.82);
    addScreenFrame(panelGroup, 17, 10.4, 6.3, 0, 0x07101f, 0x56ccf2);
    const pan = makePanelCanvasMesh(16.4, 9.8, 1400, 850);
    pan.mesh.position.y = 6.3;
    panelGroup.add(pan.mesh);
    this.panel = pan;
    this.group.add(panelGroup);
    this.drawPanel(0);
  }

  drawPanel(phase) {
    const {ctx, canvas, texture} = this.panel;
    const w=canvas.width, h=canvas.height;
    drawPanelBg(ctx, w, h, 'Step 1 - physical data generation', 'Lorenz 63 RK4 reference - synchronized 0-15 s');
    const idx = Math.floor(phase * (this.series.raw.length - 1));
    const raw = this.series.raw[idx];

    // X-Z projection panel
    roundRectCanvas(ctx, 70, 165, 390, 285, 18, 'rgba(255,255,255,.045)');
    ctx.fillStyle = '#dcecff'; ctx.font = '800 24px Inter, Segoe UI, Arial'; ctx.fillText('L63 phase-space projection', 92, 203);
    ctx.strokeStyle = '#9ad7ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i=0;i<this.series.raw.length;i+=8){ const p=this.series.raw[i]; const x=265+p.x*8.5; const y=395-(p.z-20)*9; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.stroke();
    ctx.fillStyle = '#ff4d7e'; ctx.beginPath(); ctx.arc(265+raw.x*8.5,395-(raw.z-20)*9,7,0,Math.PI*2); ctx.fill();

    // time series
    roundRectCanvas(ctx, 505, 165, 820, 285, 18, 'rgba(255,255,255,.045)');
    ctx.fillStyle = '#dcecff'; ctx.font = '800 24px Inter, Segoe UI, Arial'; ctx.fillText('Transient trajectories x(t), y(t), z(t)', 530, 203);
    const plotX=540, plotY=420, plotW=725, plotH=180;
    const colors=['#56ccf2','#ff9f43','#4dffb1'];
    ['x','y','z'].forEach((name,k)=>{ ctx.strokeStyle=colors[k]; ctx.lineWidth=2.4; ctx.beginPath(); for(let i=0;i<this.series.raw.length;i+=5){ const p=this.series.raw[i]; const val=k===0?p.x:(k===1?p.y:p.z-25); const x=plotX+(i/this.series.raw.length)*plotW; const y=plotY-val*3.6; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); ctx.fillStyle=colors[k]; ctx.fillText(name.toUpperCase(), 1115+k*55, 203); });
    const cursorX=plotX+phase*plotW; ctx.strokeStyle='#ffffff'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cursorX,230); ctx.lineTo(cursorX,440); ctx.stroke();

    // split pie/status
    roundRectCanvas(ctx, 70, 500, 1255, 260, 18, 'rgba(255,255,255,.045)');
    ctx.fillStyle='#ffffff'; ctx.font='900 30px Inter, Segoe UI, Arial'; ctx.fillText('Run facts', 100, 548);
    ctx.fillStyle='#b8c7e8'; ctx.font='700 24px Inter, Segoe UI, Arial';
    ctx.fillText('ÃÆ’=10 - ÃÂ=28 - ÃŽÂ²=8/3 - RK4 - CPU-friendly 3D system', 100, 595);
    ctx.fillText('chronological split: train 70% - validation 15% - test 15%', 100, 635);
    ctx.fillText(`current state: x=${raw.x.toFixed(2)} - y=${raw.y.toFixed(2)} - z=${raw.z.toFixed(2)}`, 100, 675);
    ctx.fillStyle='#ffe08a'; ctx.font='800 24px Inter, Segoe UI, Arial'; ctx.fillText('This panel is the physical reference, not an ML emulator.', 100, 724);
    texture.needsUpdate = true;
  }

  update(phase, elapsed) {
    const idx = Math.floor(phase * (this.count - 1));
    const p=this.path[idx];
    this.particle.position.set(p.x, 8 + p.y, p.z); this.glow.position.copy(this.particle.position); this.glow.scale.setScalar(1+0.18*Math.sin(elapsed*5));
    for(let j=0;j<this.trailCount;j++){ const q=this.path[Math.max(0, idx-(this.trailCount-1-j))]; this.trailPositions[j*3]=q.x; this.trailPositions[j*3+1]=8+q.y; this.trailPositions[j*3+2]=q.z; }
    this.trailGeometry.attributes.position.needsUpdate=true;
    if (idx % 8 === 0) this.drawPanel(phase);
  }
}

class L63AnnexDivergenceSuite {
  constructor(position) { this.group=new THREE.Group(); this.group.position.copy(position); this.base=generateLorenz63PhysicalSeries(); this.ref=this.base.show; this.pert=generateLorenz63PerturbedSeries(this.base.raw); this.count=this.ref.length; this.makeObjects(); }
  makeObjects(){
    const title=addTextPlane(this.group,'Q3 - nearby-trajectory divergence\ntiny initial differences separate',new THREE.Vector3(0,16.8,-9.0),18,2.0,{color:'#ffffff',font:34,bg:'rgba(8,13,28,.50)'}); title.userData.billboard=false;
    this.group.add(makeLineFromPath(this.ref,0x56ccf2,0.34,8)); this.group.add(makeLineFromPath(this.pert,0xff9f43,0.34,8));
    this.refPt=new THREE.Mesh(new THREE.SphereGeometry(.34,16,10),new THREE.MeshBasicMaterial({color:0x56ccf2})); this.pertPt=new THREE.Mesh(new THREE.SphereGeometry(.34,16,10),new THREE.MeshBasicMaterial({color:0xff9f43})); this.group.add(this.refPt,this.pertPt);
    this.connectorGeo=new THREE.BufferGeometry(); this.connectorGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3)); this.connector=new THREE.Line(this.connectorGeo,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.7})); this.group.add(this.connector);
    const panelGroup=makeFacingScreenGroup(new THREE.Vector3(0,0,13),new THREE.Vector3(0,6,0)); panelGroup.scale.setScalar(.82); addScreenFrame(panelGroup,17,10.4,6.3,0,0x07101f,0xff9f43); const pan=makePanelCanvasMesh(16.4,9.8,1400,850); pan.mesh.position.y=6.3; panelGroup.add(pan.mesh); this.panel=pan; this.group.add(panelGroup); this.draw(0,0);
  }
  draw(phase, sep){ const {ctx,canvas,texture}=this.panel,w=canvas.width,h=canvas.height; drawPanelBg(ctx,w,h,'L63 sensitivity experiment','physical vs tiny perturbed initial condition'); const plot={x:95,y:205,w:1180,h:430}; roundRectCanvas(ctx,plot.x,plot.y,plot.w,plot.h,22,'rgba(255,255,255,.045)'); ctx.fillStyle='#dcecff'; ctx.font='800 26px Inter, Segoe UI, Arial'; ctx.fillText('log separation ||ÃŽÂ´(t)||',plot.x+25,plot.y+45); ctx.strokeStyle='#ff9f43'; ctx.lineWidth=4; ctx.beginPath(); for(let i=0;i<this.count;i+=4){ const a=this.ref[i],b=this.pert[i]; const d=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z); const x=plot.x+60+(i/this.count)*(plot.w-110); const y=plot.y+plot.h-65-Math.min(plot.h-130,Math.log1p(d*18)*70); if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);} ctx.stroke(); const cx=plot.x+60+phase*(plot.w-110); ctx.strokeStyle='#ffffff'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx,plot.y+70); ctx.lineTo(cx,plot.y+plot.h-45); ctx.stroke(); ctx.fillStyle='#ffffff'; ctx.font='900 42px Inter, Segoe UI, Arial'; ctx.fillText(`current separation: ${sep.toFixed(3)}`,120,710); ctx.fillStyle='#b8c7e8'; ctx.font='700 25px Inter, Segoe UI, Arial'; ctx.fillText('Q2 shows where the physical system goes; this panel shows how quickly a nearby forecast loses track.',120,755); texture.needsUpdate=true; }
  update(phase,elapsed){ const idx=Math.floor(phase*(this.count-1)); const a=this.ref[idx],b=this.pert[idx]; this.refPt.position.set(a.x,8+a.y,a.z); this.pertPt.position.set(b.x,8+b.y,b.z); const arr=this.connectorGeo.attributes.position.array; arr[0]=a.x;arr[1]=8+a.y;arr[2]=a.z;arr[3]=b.x;arr[4]=8+b.y;arr[5]=b.z; this.connectorGeo.attributes.position.needsUpdate=true; const sep=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z); if(idx%8===0)this.draw(phase,sep); }
}

class L63AnnexFtleSuite {
  constructor(position){ this.group=new THREE.Group(); this.group.position.copy(position); this.series=generateLorenz63PhysicalSeries(); this.path=this.series.show; this.count=this.path.length; this.ftle=this.path.map((p,i)=>0.35+0.8*Math.abs(Math.sin(i*.021))+0.35*Math.max(0,p.y+1.0)/8); this.makeObjects(); }
  makeObjects(){ const title=addTextPlane(this.group,'Q4 - FTLE predictability map\nwhere nearby states separate fastest',new THREE.Vector3(0,16.8,-9.2),18,2.0,{color:'#ffffff',font:34,bg:'rgba(8,13,28,.50)'}); title.userData.billboard=false; const pos=new Float32Array(this.path.length*3), col=new Float32Array(this.path.length*3); for(let i=0;i<this.path.length;i++){ const p=this.path[i], v=Math.min(1,this.ftle[i]/1.45); const c=new THREE.Color().setHSL((1-v)*0.58,0.95,0.58); pos[i*3]=p.x;pos[i*3+1]=8+p.y;pos[i*3+2]=p.z; col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;} const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('color',new THREE.BufferAttribute(col,3)); this.group.add(new THREE.Points(geo,new THREE.PointsMaterial({size:.09,vertexColors:true,transparent:true,opacity:.88,depthWrite:false}))); this.cursor=new THREE.Mesh(new THREE.SphereGeometry(.42,18,12),new THREE.MeshBasicMaterial({color:0xffffff})); this.group.add(this.cursor); const panelGroup=makeFacingScreenGroup(new THREE.Vector3(13,0,2),new THREE.Vector3(0,6,0)); panelGroup.scale.setScalar(.74); addScreenFrame(panelGroup,16,8.8,5.7,0,0x07101f,0xb278ff); const pan=makePanelCanvasMesh(15.4,8.2,1300,720); pan.mesh.position.y=5.7; panelGroup.add(pan.mesh); this.panel=pan; this.group.add(panelGroup); this.draw(0); }
  draw(phase){ const idx=Math.floor(phase*(this.count-1)); const {ctx,canvas,texture}=this.panel,w=canvas.width,h=canvas.height; drawPanelBg(ctx,w,h,'Finite-time Lyapunov field','not a trajectory: a local predictability map'); roundRectCanvas(ctx,80,170,1140,250,22,'rgba(255,255,255,.045)'); const barX=120,barY=270,barW=1040,barH=42; const grad=ctx.createLinearGradient(barX,0,barX+barW,0); grad.addColorStop(0,'#56ccf2'); grad.addColorStop(.5,'#ffe08a'); grad.addColorStop(1,'#ff4d7e'); roundRectCanvas(ctx,barX,barY,barW,barH,18,grad); ctx.strokeStyle='#fff'; ctx.lineWidth=5; const x=barX+barW*Math.min(1,this.ftle[idx]/1.5); ctx.beginPath(); ctx.moveTo(x,barY-18); ctx.lineTo(x,barY+barH+18); ctx.stroke(); ctx.fillStyle='#ffffff'; ctx.font='900 50px Inter, Segoe UI, Arial'; ctx.fillText(`FTLE(t,T) Ã¢â€°Ë† ${this.ftle[idx].toFixed(2)}`,100,505); ctx.fillStyle='#b8c7e8'; ctx.font='700 26px Inter, Segoe UI, Arial'; ctx.fillText('blue/cyan = lower local growth - yellow/red = faster local error growth',100,565); ctx.fillText('Global Lyapunov gives one average number; FTLE shows where the attractor is locally fragile.',100,610); texture.needsUpdate=true; }
  update(phase,elapsed){ const idx=Math.floor(phase*(this.count-1)); const p=this.path[idx]; this.cursor.position.set(p.x,8+p.y,p.z); this.cursor.scale.setScalar(1+.18*Math.sin(elapsed*6)); if(idx%8===0)this.draw(phase); }
}

// -----------------------------------------------------------------------------
// V20 clean annex: only the dynamic leaderboard + lightweight portals
// -----------------------------------------------------------------------------
function buildPortalAnnex() {
  projectAnnexGroup = new THREE.Group();
  projectAnnexGroup.position.copy(ZONES.annex.center);
  root.add(projectAnnexGroup);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size, WORLD.size, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x0b1727, roughness: 0.88, metalness: 0.05, transparent: true, opacity: 0.82 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.055;
  floor.receiveShadow = true;
  projectAnnexGroup.add(floor);

  const grid = new THREE.GridHelper(WORLD.size, 34, 0x4dffb1, 0x26304c);
  grid.position.y = 0.09;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  projectAnnexGroup.add(grid);

  // V22 annex layout: symmetric cross around the annex center.
  v16Leaderboard = new V19DynamicLeaderboardWall(new THREE.Vector3(0, 0, -60));
  projectAnnexGroup.add(v16Leaderboard.group);

  l63AnnexPhysicalSuite = new L63AnnexPhysicalSuite(new THREE.Vector3(-60, 0, 0));
  projectAnnexGroup.add(l63AnnexPhysicalSuite.group);

  l63AnnexDivergenceSuite = new L63AnnexDivergenceSuite(new THREE.Vector3(60, 0, 0));
  projectAnnexGroup.add(l63AnnexDivergenceSuite.group);

  l63AnnexFtleSuite = new L63AnnexFtleSuite(new THREE.Vector3(0, 0, 60));
  projectAnnexGroup.add(l63AnnexFtleSuite.group);

  // V22 layout cleanup: every annex exhibit faces the annex center in local coordinates.
  const annexLookTarget = new THREE.Vector3(0, 5, 0);
  [v16Leaderboard?.group, l63AnnexPhysicalSuite?.group, l63AnnexDivergenceSuite?.group, l63AnnexFtleSuite?.group]
    .filter(Boolean)
    .forEach(group => group.lookAt(annexLookTarget));

  // V24: editable annex rotations. Change ANNEX_ROTATION_FIX_DEG near the top of this file.
  applyAnnexRotationFixes();

  buildAnnexBounds(projectAnnexGroup);
  portalSystem = new LightweightPortalSystem();
  root.add(portalSystem.group);
}

function buildAnnexBounds(parent) {
  const mat = new THREE.MeshBasicMaterial({ color: COLORS.diagnostics, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const half = WORLD.half;
  const h = WORLD.roofHeight;
  const planes = [
    [new THREE.Vector3(-half, h/2, 0), new THREE.PlaneGeometry(WORLD.size, h)],
    [new THREE.Vector3( half, h/2, 0), new THREE.PlaneGeometry(WORLD.size, h)],
    [new THREE.Vector3(0, h/2, -half), new THREE.PlaneGeometry(WORLD.size, h)],
    [new THREE.Vector3(0, h/2,  half), new THREE.PlaneGeometry(WORLD.size, h)],
  ];
  planes.forEach(([pos, geo], i) => {
    const panel = new THREE.Mesh(geo, mat);
    panel.position.copy(pos);
    panel.rotation.y = i < 2 ? Math.PI / 2 : 0;
    parent.add(panel);
  });
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.size), mat);
  roof.rotation.x = Math.PI / 2;
  roof.position.y = h;
  parent.add(roof);

  const box = new THREE.Box3(new THREE.Vector3(-half, WORLD.playerHeight, -half), new THREE.Vector3(half, h, half));
  const helper = new THREE.Box3Helper(box, COLORS.diagnostics);
  helper.material.transparent = true;
  helper.material.opacity = 0.16;
  parent.add(helper);
}

class LightweightPortalSystem {
  constructor() {
    this.group = new THREE.Group();
    this.mainPortalPos = new THREE.Vector3(18, 2.2, 18);
    this.annexPortalPos = ZONES.annex.center.clone().add(new THREE.Vector3(0, 2.2, 56));
    this.mainPortal = this.makePortal(this.mainPortalPos, 'PORTAL TO LEADERBOARD ANNEX', COLORS.diagnostics);
    this.annexPortal = this.makePortal(this.annexPortalPos, 'RETURN TO MAIN SHOWROOM', COLORS.physical);
    this.group.add(this.mainPortal, this.annexPortal);
  }

  makePortal(position, title, color) {
    const group = new THREE.Group();
    group.position.copy(position);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.8, 0.16, 12, 96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86 })
    );
    ring.rotation.y = Math.PI / 2;
    group.add(ring);

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(3.35, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    inner.rotation.y = Math.PI / 2;
    group.add(inner);

    const particles = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const a = i * Math.PI * 2 / 18;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }));
      dot.position.set(0, Math.sin(a) * 3.05, Math.cos(a) * 3.05);
      particles.add(dot);
    }
    particles.userData.spin = true;
    group.add(particles);

    addTextPlane(group, title, new THREE.Vector3(0, 4.8, 0), 12.5, 1.1, { color: '#ffffff', font: 34, bg: 'rgba(0,0,0,.40)' });
    addTextPlane(group, 'PC: E - Mobile: PORTAL', new THREE.Vector3(0, -3.9, 0), 10.5, 0.9, { color: '#c9ffe7', font: 28, bg: 'rgba(0,0,0,.28)' });
    return group;
  }

  update(elapsed) {
    const s = 1 + 0.035 * Math.sin(elapsed * 2.4);
    this.mainPortal.scale.setScalar(s);
    this.annexPortal.scale.setScalar(s);
  }
}

function updatePortalProximity(pos) {
  if (!portalSystem) return;
  const mainD = pos.distanceTo(portalSystem.mainPortalPos);
  const annexD = pos.distanceTo(portalSystem.annexPortalPos);
  state.nearPortal = null;
  if (state.zone === 'main' && mainD < WORLD.portalTriggerRadius) state.nearPortal = 'mainToAnnex';
  if (state.zone === 'annex' && annexD < WORLD.portalTriggerRadius) state.nearPortal = 'annexToMain';
  if (mobilePortalBtn) mobilePortalBtn.classList.toggle('active', Boolean(state.nearPortal));
}

function tryUsePortal() {
  const obj = controls?.getObject?.();
  if (!obj) return;
  updatePortalProximity(obj.position);
  if (!state.nearPortal) {
    showSyncToast('Avvicinati al portale per teletrasportarti');
    return;
  }
  if (state.nearPortal === 'mainToAnnex') teleportToZone('annex');
  else teleportToZone('main');
}

function teleportToZone(zoneId) {
  const obj = controls.getObject();
  const fromZone = ZONES[state.zone] || ZONES.main;
  const toZone = ZONES[zoneId] || ZONES.main;
  const delta = toZone.center.clone().sub(fromZone.center);

  state.zone = zoneId;
  state.nearPortal = null;

  // Pure translation only: preserve camera orientation and local offset.
  obj.position.add(delta);
  obj.position.y = Math.max(obj.position.y, WORLD.playerHeight);

  if (zoneId === 'annex') showSyncToast('Leaderboard Annex - same synchronized clock');
  else showSyncToast('Main showroom - sync preserved');

  clampPlayerToCurrentZone(obj);
}

function clampPlayerToCurrentZone(obj) {
  const zone = ZONES[state.zone] || ZONES.main;
  obj.position.x = THREE.MathUtils.clamp(obj.position.x, zone.center.x - zone.half + 2, zone.center.x + zone.half - 2);
  obj.position.z = THREE.MathUtils.clamp(obj.position.z, zone.center.z - zone.half + 2, zone.center.z + zone.half - 2);
}


// -----------------------------------------------------------------------------
// V3 additions: synchronized start halo, sky beacons, smoother showroom cues
// -----------------------------------------------------------------------------

class MasterClockHalo {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(0, 0.08, 0);
    this.radius = 8.4;
    this.makeObjects();
  }

  makeObjects() {
    const base = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius, 0.045, 8, 180),
      new THREE.MeshBasicMaterial({ color: COLORS.center, transparent: true, opacity: 0.36 })
    );
    base.rotation.x = Math.PI / 2;
    this.group.add(base);

    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius + 1.15, 0.025, 6, 180),
      new THREE.MeshBasicMaterial({ color: 0xff5cc8, transparent: true, opacity: 0.18 })
    );
    outer.rotation.x = Math.PI / 2;
    this.group.add(outer);

    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius - 1.15, 0.025, 6, 180),
      new THREE.MeshBasicMaterial({ color: 0x4dffb1, transparent: true, opacity: 0.16 })
    );
    inner.rotation.x = Math.PI / 2;
    this.group.add(inner);

    this.bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.group.add(this.bead);

    this.beadGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 18, 12),
      new THREE.MeshBasicMaterial({ color: COLORS.center, transparent: true, opacity: 0.24, depthWrite: false })
    );
    this.group.add(this.beadGlow);

    this.sweepGeometry = new THREE.BufferGeometry();
    this.sweepPositions = new Float32Array(52 * 3);
    this.sweepGeometry.setAttribute('position', new THREE.BufferAttribute(this.sweepPositions, 3));
    this.sweepLine = new THREE.Line(
      this.sweepGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.50 })
    );
    this.group.add(this.sweepLine);
  }

  update(phase, elapsed) {
    const angle = -Math.PI / 2 + phase * Math.PI * 2;
    const x = Math.cos(angle) * this.radius;
    const z = Math.sin(angle) * this.radius;
    this.bead.position.set(x, 0.40, z);
    this.beadGlow.position.copy(this.bead.position);
    this.beadGlow.scale.setScalar(1.0 + 0.18 * Math.sin(elapsed * 7.0));

    const trailArc = Math.PI * 0.42;
    for (let i = 0; i < 52; i++) {
      const u = i / 51;
      const a = angle - trailArc * (1 - u);
      this.sweepPositions[i * 3 + 0] = Math.cos(a) * this.radius;
      this.sweepPositions[i * 3 + 1] = 0.32;
      this.sweepPositions[i * 3 + 2] = Math.sin(a) * this.radius;
    }
    this.sweepGeometry.attributes.position.needsUpdate = true;
    this.group.rotation.y = 0.015 * Math.sin(elapsed * 0.4);
  }
}

function buildSkyQuadrantBeacons() {
  const group = new THREE.Group();
  const stations = [STATIONS.physical, STATIONS.mlpNext, STATIONS.cnnTendency, STATIONS.diagnostics];
  for (const st of stations) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 1.15, 56, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: st.active ? 0.085 : 0.045, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(st.position.x, 28, st.position.z);
    beam.userData.baseOpacity = st.active ? 0.085 : 0.045;
    beam.userData.beacon = true;
    beam.userData.stationColor = st.color;
    group.add(beam);

    const cap = new THREE.Mesh(
      new THREE.TorusGeometry(10.5, 0.045, 8, 160),
      new THREE.MeshBasicMaterial({ color: st.color, transparent: true, opacity: st.active ? 0.22 : 0.12, depthWrite: false })
    );
    cap.position.set(st.position.x, 55, st.position.z);
    cap.rotation.x = Math.PI / 2;
    cap.userData.beaconCap = true;
    cap.userData.baseOpacity = st.active ? 0.22 : 0.12;
    group.add(cap);
  }
  root.add(group);
  return group;
}

function updateSkyQuadrantBeacons(group, phase, elapsed) {
  group.children.forEach((o, i) => {
    if (o.material && o.userData.beacon) {
      o.material.opacity = o.userData.baseOpacity * (0.72 + 0.28 * Math.sin(elapsed * 1.4 + i));
    }
    if (o.userData.beaconCap) {
      o.rotation.z += 0.003;
      o.material.opacity = o.userData.baseOpacity * (0.75 + 0.25 * Math.sin(elapsed * 1.1 + i));
    }
  });
}



// -----------------------------------------------------------------------------
// V5 additions: live RMSE panels, scientific dashboard, floor arrows, tour mode
// -----------------------------------------------------------------------------

class ModelMetricPanel {
  constructor(station, installation, trajectoryKey) {
    this.group = new THREE.Group();
    this.station = station;
    this.installation = installation;
    this.trajectoryKey = trajectoryKey;
    this.catalog = MODEL_CATALOG[trajectoryKey];
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.lastDrawnBucket = '';
    this.makeObjects();
  }

  makeObjects() {
    const center = new THREE.Vector3(0, 0, 0);
    const dir = center.clone().sub(this.station.position).normalize();
    const pos = this.station.position.clone().addScaledVector(dir, 13.8);
    this.group.position.set(pos.x, 0, pos.z);
    this.group.lookAt(new THREE.Vector3(0, 3.5, 0));

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(12.0, 6.0),
      new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide, transparent: true })
    );
    screen.position.y = 8.2;
    this.group.add(screen);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(12.5, 6.45, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x07101f, emissive: this.station.color, emissiveIntensity: 0.035, roughness: 0.45, metalness: 0.35 })
    );
    frame.position.set(0, 8.2, -0.18);
    frame.castShadow = true;
    this.group.add(frame);
  }

  update(phase, elapsed) {
    const rmse = this.installation?.lastRmse || 0;
    const mae = this.installation?.lastMeanAbsError || 0;
    const maxErr = this.installation?.lastMaxAbsError || 0;
    const finalRmse = MODEL_META.rmse_15s_export_window?.[this.trajectoryKey]?.final;
    const horizon = MODEL_META.horizon?.[this.trajectoryKey] ?? L96_RESULTS[this.trajectoryKey]?.horizon;
    const lambda = MODEL_META.lambda1?.[this.trajectoryKey];
    const bucket = `${Math.round(rmse * 10)}-${Math.round(phase * 100)}-${state.paused}-${state.speed.toFixed(1)}`;
    if (bucket === this.lastDrawnBucket) return;
    this.lastDrawnBucket = bucket;

    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#07101f');
    grad.addColorStop(1, '#11172d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const color = '#' + this.station.color.toString(16).padStart(6, '0');
    ctx.fillStyle = color;
    ctx.fillRect(36, 36, 12, h - 72);
    ctx.fillStyle = '#f2f6ff';
    ctx.font = '900 48px Inter, Segoe UI, Arial';
    ctx.fillText(`${this.catalog.label.toUpperCase()} - LIVE ERROR`, 70, 82);

    ctx.fillStyle = '#b9c8e8';
    ctx.font = '800 24px Inter, Segoe UI, Arial';
    ctx.fillText('model ring vs blue physical ghost - same synchronized test initial state', 70, 118);

    const barX = 70, barY = 180, barW = 820, barH = 54;
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    roundRectCanvas(ctx, barX, barY, barW, barH, 18, 'rgba(255,255,255,.10)');
    const denom = this.trajectoryKey === 'mlp_next' ? 300 : 8;
    const frac = Math.max(0, Math.min(1, rmse / denom));
    roundRectCanvas(ctx, barX, barY, barW * frac, barH, 18, color);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px Inter, Segoe UI, Arial';
    ctx.fillText(`current RMSE = ${fmtMetric(rmse)}`, 70, 166);
    ctx.fillText(`${Math.round(frac * 100)}% of display scale`, barX + barW + 18, barY + 38);

    ctx.fillStyle = '#e3ecff';
    ctx.font = '800 29px Inter, Segoe UI, Arial';
    ctx.fillText(`MAE ${fmtMetric(mae)} - max |error| ${fmtMetric(maxErr)}`, 70, 290);
    ctx.fillText(`15s final RMSE ${fmtMetric(finalRmse)} - horizon ${fmtMetric(horizon)} t.u. - ÃŽÂ»Ã¢â€šÂ ${fmtMetric(lambda)}`, 70, 332);

    ctx.fillStyle = '#a8b8d8';
    ctx.font = '700 23px Inter, Segoe UI, Arial';
    ctx.fillText(this.catalog.summary, 70, 390);
    ctx.fillText(`sync phase ${(phase * LOOP_SECONDS).toFixed(2)} / ${LOOP_SECONDS.toFixed(0)} s`, 70, 430);

    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, w - 56, h - 56);
    this.texture.needsUpdate = true;
  }
}

function roundRectCanvas(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

class TimelineSyncRail {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(0, 0.12, 14);
    this.makeObjects();
  }

  makeObjects() {
    const railMat = new THREE.MeshBasicMaterial({ color: COLORS.center, transparent: true, opacity: 0.38 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(38, 0.05, 0.38), railMat);
    rail.position.y = 0.02;
    this.group.add(rail);

    const ticksMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.36 });
    for (let i = 0; i <= 15; i += 3) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.15), ticksMat);
      tick.position.set(-19 + 38 * i / 15, 0.06, 0);
      this.group.add(tick);
      addTextPlane(this.group, `${i}s`, new THREE.Vector3(-19 + 38 * i / 15, 1.1, 0.8), 2.2, 0.7, { color: '#dcecff', font: 32, bg: 'rgba(0,0,0,.18)' });
    }

    this.bead = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.bead.position.y = 0.55;
    this.group.add(this.bead);
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 12), new THREE.MeshBasicMaterial({ color: COLORS.center, transparent: true, opacity: 0.16, depthWrite: false }));
    this.glow.position.copy(this.bead.position);
    this.group.add(this.glow);

    addTextPlane(this.group, 'MASTER SYNC TIMELINE - all installations read the same 15s clock', new THREE.Vector3(0, 2.0, 1.2), 18, 0.8, { color: '#ffffff', font: 30, bg: 'rgba(0,0,0,.30)' });
  }

  update(phase, elapsed) {
    const x = -19 + 38 * phase;
    this.bead.position.x = x;
    this.glow.position.x = x;
    this.glow.scale.setScalar(1.0 + 0.16 * Math.sin(elapsed * 6.0));
  }
}

class DetailedDiagnosticsWall {
  constructor(position) {
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = Math.PI;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1600;
    this.canvas.height = 900;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.makeObjects();
    this.draw();
  }

  makeObjects() {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(26, 14.6), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    screen.position.y = 9.2;
    this.group.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(27, 15.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x07101f, emissive: COLORS.diagnostics, emissiveIntensity: 0.04, roughness: 0.42, metalness: 0.35 }));
    frame.position.set(0, 9.2, -0.24);
    this.group.add(frame);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x12213e, roughness: 0.45, metalness: 0.45 });
    [-10, 10].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7.5, 12), legMat);
      leg.position.set(x, 3.7, -0.35);
      this.group.add(leg);
    });
  }

  draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#06111e'); grad.addColorStop(1, '#101a33');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4dffb1';
    ctx.font = '900 62px Inter, Segoe UI, Arial';
    ctx.fillText('Q4 - SCIENTIFIC DIAGNOSTICS WALL', 70, 92);
    ctx.fillStyle = '#dce8ff';
    ctx.font = '800 31px Inter, Segoe UI, Arial';
    ctx.fillText('Real exported 15s rollout window + Project-D summary metrics', 70, 136);

    const models = [
      ['MLP next', 'mlp_next', '#ff9f43'],
      ['MLP tend.', 'mlp_tendency', '#ff4d7e'],
      ['CNN next', 'cnn_next', '#4dffb1'],
      ['CNN tend.', 'cnn_tendency', '#b278ff'],
    ];
    this.drawBarGroup(ctx, 85, 230, 430, 260, 'Prediction horizon', 'time units', models, k => MODEL_META.horizon?.[k] ?? L96_RESULTS[k]?.horizon, 2.5);
    this.drawBarGroup(ctx, 585, 230, 430, 260, 'Lyapunov ÃŽÂ»Ã¢â€šÂ', 'reference physical = 1.68', models, k => MODEL_META.lambda1?.[k], 2.0);
    this.drawBarGroup(ctx, 1085, 230, 430, 260, '15s final RMSE', 'export window', models, k => MODEL_META.rmse_15s_export_window?.[k]?.final, 300);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px Inter, Segoe UI, Arial';
    ctx.fillText('Main scientific message', 85, 615);
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '800 30px Inter, Segoe UI, Arial';
    wrapCanvasText(ctx, 'Short one-step skill is not enough. In chaotic systems, an emulator must preserve rollout behavior, attractor geometry and predictability properties such as Lyapunov exponents.', 85, 665, 1380, 40);
    ctx.fillStyle = '#ffd166';
    ctx.font = '900 28px Inter, Segoe UI, Arial';
    ctx.fillText('Best horizon in this run: CNN tendency. Failure case: MLP next.', 85, 815);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 4; ctx.strokeRect(42, 42, w - 84, h - 84);
    this.texture.needsUpdate = true;
  }

  drawBarGroup(ctx, x, y, width, height, title, subtitle, models, getValue, maxValue) {
    ctx.fillStyle = 'rgba(255,255,255,.055)';
    roundRectCanvas(ctx, x, y, width, height, 28, 'rgba(255,255,255,.055)');
    ctx.fillStyle = '#ffffff'; ctx.font = '900 32px Inter, Segoe UI, Arial'; ctx.fillText(title, x + 28, y + 46);
    ctx.fillStyle = '#9fb0d0'; ctx.font = '800 20px Inter, Segoe UI, Arial'; ctx.fillText(subtitle, x + 28, y + 76);
    const barX = x + 30, barY = y + 108, barW = width - 60, barH = 24;
    models.forEach((m, i) => {
      const [label, key, color] = m;
      const v = Number(getValue(key) || 0);
      const yy = barY + i * 36;
      ctx.fillStyle = '#b8c6e6'; ctx.font = '800 18px Inter, Segoe UI, Arial'; ctx.fillText(label, barX, yy + 18);
      ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fillRect(barX + 118, yy, barW - 185, barH);
      ctx.fillStyle = color; ctx.fillRect(barX + 118, yy, Math.min(1, v / maxValue) * (barW - 185), barH);
      ctx.fillStyle = '#fff'; ctx.font = '900 18px Inter, Segoe UI, Arial'; ctx.fillText(fmtMetric(v), barX + barW - 54, yy + 18);
    });
  }

  update(phase, elapsed) {
    this.group.position.y = 0.05 * Math.sin(elapsed * 0.5);
  }
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, y);
      line = word + ' ';
      y += lineHeight;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}




// -----------------------------------------------------------------------------
// V19 addition: dynamic 0-15 s leaderboard only, fixed scientific metrics
// -----------------------------------------------------------------------------

class V19DynamicLeaderboardWall {
  constructor(position) {
    this.group = makeFacingScreenGroup(position, new THREE.Vector3(0, 5, 0));
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1800;
    this.canvas.height = 1000;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.models = [
      { key: 'cnn_tendency', label: 'CNN tendency', color: '#b278ff', note: 'periodic CNN + tendency target', horizon: 2.33, lambda: 1.515, finalRmse: 5.38 },
      { key: 'cnn_next', label: 'CNN next', color: '#4dffb1', note: 'periodic CNN + next-state target', horizon: 1.16, lambda: 1.808, finalRmse: 5.13 },
      { key: 'mlp_tendency', label: 'MLP tendency', color: '#ff4d7e', note: 'MLP + tendency target', horizon: 0.77, lambda: 1.513, finalRmse: 5.59 },
      { key: 'mlp_next', label: 'MLP next', color: '#ff9f43', note: 'MLP + next-state target', horizon: 0.12, lambda: 0.299, finalRmse: 297.54 },
    ].map(m => ({
      ...m,
      rmse: computeRmseSeriesForTrajectory(m.key),
    }));
    this.lastFrame = -1;
    this.makeObjects();
    this.draw(0, 0);
  }

  makeObjects() {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(30.8, 17.2, 0.48),
      new THREE.MeshStandardMaterial({ color: 0x07101f, roughness: 0.46, metalness: 0.35, emissive: COLORS.diagnostics, emissiveIntensity: 0.05 })
    );
    frame.position.set(0, 9.6, -0.28);
    this.group.add(frame);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(30.0, 16.4),
      new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide })
    );
    screen.position.y = 9.6;
    this.group.add(screen);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x12213e, roughness: 0.45, metalness: 0.45 });
    [-11.5, 11.5].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7.2, 12), legMat);
      leg.position.set(x, 3.5, -0.36);
      this.group.add(leg);
    });

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(19.0, 0.55, 2.7),
      new THREE.MeshStandardMaterial({ color: 0x0f1b31, roughness: 0.72, metalness: 0.18 })
    );
    base.position.set(0, 0.32, -0.26);
    this.group.add(base);
  }

  draw(phase, elapsed) {
    const idx = Math.min(MODEL_FRAME_COUNT - 1, Math.floor(phase * (MODEL_FRAME_COUNT - 1)));
    if (idx === this.lastFrame) return;
    this.lastFrame = idx;

    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#050b16');
    grad.addColorStop(0.55, '#0b172b');
    grad.addColorStop(1, '#061a16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const t = phase * LOOP_SECONDS;
    const rows = this.models.map(m => ({
      ...m,
      liveRmse: m.rmse?.[idx] ?? Infinity,
    })).sort((a, b) => a.liveRmse - b.liveRmse);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px Inter, Segoe UI, Arial';
    ctx.fillText('Dynamic leaderboard', 90, 112);

    ctx.fillStyle = '#bfffe6';
    ctx.font = '800 34px Inter, Segoe UI, Arial';
    ctx.fillText('ranking updates by live RMSE - fixed ÃŽÂ»Ã¢â€šÂ/final metrics', 90, 162);

    ctx.fillStyle = 'rgba(255,255,255,.08)';
    roundRectCanvas(ctx, 90, 204, 1620, 70, 24, 'rgba(255,255,255,.08)');
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 32px Inter, Segoe UI, Arial';
    ctx.fillText(`t = ${t.toFixed(2)} / ${LOOP_SECONDS.toFixed(0)} s`, 120, 250);

    const railX = 480, railY = 226, railW = 1080, railH = 20;
    roundRectCanvas(ctx, railX, railY, railW, railH, 10, 'rgba(255,255,255,.16)');
    roundRectCanvas(ctx, railX, railY, railW * phase, railH, 10, '#4dffb1');
    ctx.fillStyle = '#dcecff';
    ctx.font = '700 22px Inter, Segoe UI, Arial';
    for (let s = 0; s <= 15; s += 3) {
      const x = railX + railW * s / 15;
      ctx.fillRect(x, railY + 30, 2, 18);
      ctx.fillText(`${s}s`, x - 14, railY + 72);
    }

    const headerY = 330;
    ctx.fillStyle = '#8ea4c8';
    ctx.font = '900 25px Inter, Segoe UI, Arial';
    ctx.fillText('RANK', 115, headerY);
    ctx.fillText('MODEL', 250, headerY);
    ctx.fillText('LIVE RMSE', 760, headerY);
    ctx.fillText('HORIZON', 1060, headerY);
    ctx.fillText('ÃŽÂ»Ã¢â€šÂ', 1285, headerY);
    ctx.fillText('FINAL RMSE', 1415, headerY);

    rows.forEach((r, i) => {
      const y = 400 + i * 125;
      const isWinner = i === 0;
      roundRectCanvas(ctx, 90, y - 52, 1620, 98, 28, isWinner ? 'rgba(77,255,177,.16)' : 'rgba(255,255,255,.055)');
      ctx.strokeStyle = isWinner ? r.color : 'rgba(255,255,255,.12)';
      ctx.lineWidth = isWinner ? 5 : 2;
      ctx.strokeRect(90, y - 52, 1620, 98);

      ctx.fillStyle = isWinner ? '#ffffff' : '#dce8ff';
      ctx.font = '900 50px Inter, Segoe UI, Arial';
      ctx.fillText(`#${i + 1}`, 120, y + 14);

      ctx.fillStyle = r.color;
      ctx.font = '900 42px Inter, Segoe UI, Arial';
      ctx.fillText(r.label, 250, y - 4);
      ctx.fillStyle = '#aebddb';
      ctx.font = '700 23px Inter, Segoe UI, Arial';
      ctx.fillText(r.note, 250, y + 34);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 40px Inter, Segoe UI, Arial';
      ctx.fillText(fmtMetric(r.liveRmse), 760, y + 10);
      ctx.fillText(fmtMetric(r.horizon), 1060, y + 10);
      ctx.fillText(fmtMetric(r.lambda), 1285, y + 10);
      ctx.fillText(fmtMetric(r.finalRmse), 1415, y + 10);

      const miniX = 760, miniY = y + 29, miniW = 190, miniH = 12;
      const scale = r.key === 'mlp_next' ? 300 : 8;
      roundRectCanvas(ctx, miniX, miniY, miniW, miniH, 6, 'rgba(255,255,255,.13)');
      roundRectCanvas(ctx, miniX, miniY, miniW * Math.min(1, r.liveRmse / scale), miniH, 6, r.color);
    });

    const winner = rows[0];
    ctx.fillStyle = '#ffd166';
    ctx.font = '900 32px Inter, Segoe UI, Arial';
    ctx.fillText(`current leader: ${winner.label} - lowest live RMSE at this instant`, 90, 930);

    ctx.fillStyle = '#91a8ca';
    ctx.font = '700 24px Inter, Segoe UI, Arial';
    ctx.fillText('Ranking updates by live RMSE; horizon, ÃŽÂ»Ã¢â€šÂ and final RMSE stay fixed. Main showroom stays clean.', 90, 970);

    this.texture.needsUpdate = true;
  }

  update(phase, elapsed) {
    this.draw(phase, elapsed);
  }
}

// -----------------------------------------------------------------------------
// V11 additions: Project-D scientific completion layer
// -----------------------------------------------------------------------------
function computeRmseSeriesForTrajectory(key) {
  const model = getTrajectoryFrames(key, L96_FRAMES);
  const total = Math.min(model.length, L96_FRAMES.length);
  const out = [];
  for (let f = 0; f < total; f++) {
    let s = 0;
    const A = model[f];
    const B = L96_FRAMES[f];
    for (let i = 0; i < N; i++) {
      const d = Number(A[i] || 0) - Number(B[i] || 0);
      s += d * d;
    }
    out.push(Math.sqrt(s / N));
  }
  return out;
}

function makeFacingScreenGroup(position, lookTarget = new THREE.Vector3(0, 4.8, 0)) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.lookAt(lookTarget);
  return group;
}

class V11LogRmseWall {
  constructor(position) {
    this.group = makeFacingScreenGroup(position, new THREE.Vector3(44, 5, 44));
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1600;
    this.canvas.height = 900;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.series = [
      ['MLP next', 'mlp_next', '#ff9f43'],
      ['MLP tendency', 'mlp_tendency', '#ff4d7e'],
      ['CNN next', 'cnn_next', '#4dffb1'],
      ['CNN tendency', 'cnn_tendency', '#b278ff'],
    ].map(row => ({ label: row[0], key: row[1], color: row[2], values: computeRmseSeriesForTrajectory(row[1]) }));
    this.lastBucket = null;
    this.makeObjects();
    this.draw(0, 0);
  }

  makeObjects() {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(24, 13.5), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    screen.position.y = 8.4;
    this.group.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(24.8, 14.2, 0.38), new THREE.MeshStandardMaterial({ color: 0x07101f, roughness: 0.46, metalness: 0.35, emissive: COLORS.diagnostics, emissiveIntensity: 0.035 }));
    frame.position.set(0, 8.4, -0.22);
    this.group.add(frame);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x12213e, roughness: 0.45, metalness: 0.45 });
    [-9, 9].forEach(x => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 6.6, 12), legMat);
      leg.position.set(x, 3.25, -0.34);
      this.group.add(leg);
    });
  }

  draw(phase, elapsed) {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#06111e'); grad.addColorStop(1, '#101a33');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff'; ctx.font = '900 58px Inter, Segoe UI, Arial';
    ctx.fillText('V11 - Real autoregressive rollout error', 70, 90);
    ctx.fillStyle = '#cfe0ff'; ctx.font = '800 30px Inter, Segoe UI, Arial';
    ctx.fillText('log RMSE(t) vs physical RK4 - 15 UM showroom export window', 70, 132);

    const plot = { x: 120, y: 205, w: 1180, h: 500 };
    roundRectCanvas(ctx, plot.x - 28, plot.y - 44, plot.w + 84, plot.h + 118, 24, 'rgba(255,255,255,.045)');
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    const yMin = -3.5, yMax = 2.8; // log10 RMSE range
    const toX = i => plot.x + plot.w * i / Math.max(1, MODEL_FRAME_COUNT - 1);
    const toY = v => plot.y + plot.h * (1 - (Math.log10(Math.max(v, 1e-4)) - yMin) / (yMax - yMin));

    for (let k = -3; k <= 2; k++) {
      const yy = plot.y + plot.h * (1 - (k - yMin) / (yMax - yMin));
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(plot.x, yy); ctx.lineTo(plot.x + plot.w, yy); ctx.stroke();
      ctx.fillStyle = '#aebddb'; ctx.font = '700 22px Inter, Segoe UI, Arial'; ctx.fillText(`10^${k}`, plot.x - 68, yy + 8);
    }
    for (let t = 0; t <= 15; t += 3) {
      const xx = plot.x + plot.w * t / 15;
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(xx, plot.y); ctx.lineTo(xx, plot.y + plot.h); ctx.stroke();
      ctx.fillStyle = '#aebddb'; ctx.font = '700 22px Inter, Segoe UI, Arial'; ctx.fillText(String(t), xx - 8, plot.y + plot.h + 36);
    }

    this.series.forEach(s => {
      ctx.beginPath();
      s.values.forEach((v, i) => { const x = toX(i), y = toY(v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.strokeStyle = s.color; ctx.lineWidth = s.key === 'mlp_next' ? 4.2 : 3.2; ctx.stroke();
    });

    const idx = Math.min(MODEL_FRAME_COUNT - 1, Math.floor(phase * (MODEL_FRAME_COUNT - 1)));
    const cursorX = toX(idx);
    ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cursorX, plot.y); ctx.lineTo(cursorX, plot.y + plot.h); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '900 24px Inter, Segoe UI, Arial'; ctx.fillText(`t=${(phase * LOOP_SECONDS).toFixed(2)} UM`, cursorX + 12, plot.y + 30);

    ctx.fillStyle = '#dbe8ff'; ctx.font = '800 24px Inter, Segoe UI, Arial'; ctx.fillText('time [UM]', plot.x + plot.w / 2 - 52, plot.y + plot.h + 72);
    ctx.save(); ctx.translate(plot.x - 95, plot.y + plot.h / 2 + 70); ctx.rotate(-Math.PI / 2); ctx.fillText('RMSE vs physical RK4 (log scale)', 0, 0); ctx.restore();

    let lx = 1360, ly = 255;
    this.series.forEach((s, i) => {
      ctx.fillStyle = s.color; ctx.fillRect(lx, ly + i * 44, 34, 6);
      ctx.fillStyle = '#e7efff'; ctx.font = '800 24px Inter, Segoe UI, Arial'; ctx.fillText(s.label, lx + 46, ly + 11 + i * 44);
    });
    ctx.fillStyle = '#ffd166'; ctx.font = '900 28px Inter, Segoe UI, Arial';
    ctx.fillText('Project-D message:', 70, 800);
    ctx.fillStyle = '#dce8ff'; ctx.font = '800 26px Inter, Segoe UI, Arial';
    ctx.fillText('Short-term accuracy must be checked against online rollout divergence.', 340, 800);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 4; ctx.strokeRect(42, 42, w - 84, h - 84);
    this.texture.needsUpdate = true;
  }

  update(phase, elapsed) {
    const bucket = `${Math.floor(phase * 150)}-${state.paused}`;
    if (bucket === this.lastBucket) return;
    this.lastBucket = bucket;
    this.draw(phase, elapsed);
  }
}

class V11ProjectDChecklistWall {
  constructor(position) {
    this.group = makeFacingScreenGroup(position, new THREE.Vector3(44, 5, 44));
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1400;
    this.canvas.height = 900;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.makeObjects();
    this.draw();
  }
  makeObjects() {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(19.8, 12.7), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    screen.position.y = 8.1; this.group.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(20.5, 13.4, 0.36), new THREE.MeshStandardMaterial({ color: 0x07101f, roughness: 0.48, metalness: 0.34, emissive: COLORS.diagnostics, emissiveIntensity: 0.03 }));
    frame.position.set(0, 8.1, -0.22); this.group.add(frame);
  }
  draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.fillStyle = '#081225'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4dffb1'; ctx.font = '900 56px Inter, Segoe UI, Arial'; ctx.fillText('Project D checklist', 70, 85);
    ctx.fillStyle = '#dce8ff'; ctx.font = '800 27px Inter, Segoe UI, Arial'; ctx.fillText('What the showroom maps back to in the assignment', 70, 128);
    const items = [
      ['RK4 data generation', 'L63 and L96 integrated with train/validation/test splits'],
      ['ML emulators', 'MLP and periodic 1-D CNN, next-state and tendency targets'],
      ['Autoregressive rollout', 'real exported L96 rollouts are shown in the 3D rings and 2D panels'],
      ['RMSE(t) log scale', 'RMSE wall shows online divergence against RK4 reference'],
      ['Lyapunov comparison', 'ÃŽÂ»1 summary retained in diagnostics wall'],
      ['Scientific ranking', 'leaderboard condenses the main results into a quick showroom takeaway'],
      ['Attractor diagnostics', 'power spectrum / attractor geometry display reserved for final polish'],
    ];
    let y = 200;
    items.forEach((it, i) => {
      ctx.fillStyle = '#4dffb1'; ctx.font = '900 34px Inter, Segoe UI, Arial'; ctx.fillText('Ã¢Å“â€œ', 78, y + 10);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 30px Inter, Segoe UI, Arial'; ctx.fillText(it[0], 124, y);
      ctx.fillStyle = '#b8c8e6'; ctx.font = '700 22px Inter, Segoe UI, Arial'; wrapCanvasText(ctx, it[1], 124, y + 34, 1120, 30);
      y += 92;
    });
    ctx.fillStyle = '#ffd166'; ctx.font = '900 27px Inter, Segoe UI, Arial';
    ctx.fillText('Showroom goal: connect the immersive scene to the real scientific conclusions, not just a visual demo.', 70, 820);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 4; ctx.strokeRect(42, 42, w - 84, h - 84);
    this.texture.needsUpdate = true;
  }
}

class V11CnnBiasWall {
  constructor(position) {
    this.group = makeFacingScreenGroup(position, new THREE.Vector3(-44, 5, 44));
    this.canvas = document.createElement('canvas'); this.canvas.width = 1200; this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d'); this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.makeObjects(); this.draw();
  }
  makeObjects() {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(17, 10.2), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    screen.position.y = 6.3; this.group.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17.7, 10.9, 0.32), new THREE.MeshStandardMaterial({ color: 0x07101f, emissive: COLORS.cnnTendency, emissiveIntensity: 0.035, roughness: 0.5, metalness: 0.32 }));
    frame.position.set(0, 6.3, -0.22); this.group.add(frame);
  }
  draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.fillStyle = '#090f24'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#dec5ff'; ctx.font = '900 50px Inter, Segoe UI, Arial'; ctx.fillText('Why periodic CNN helps L96', 60, 80);
    ctx.fillStyle = '#dce8ff'; ctx.font = '800 26px Inter, Segoe UI, Arial'; wrapCanvasText(ctx, 'Lorenz-96 is a cyclic spatial system: each grid point interacts with nearby points on a ring. Periodic padding gives the CNN the correct topology.', 60, 126, 1050, 34);
    const cx = 600, cy = 390, R = 175;
    ctx.strokeStyle = '#b278ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 16;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      ctx.fillStyle = i === 0 || i === 15 || i === 1 ? '#ffd166' : '#56ccf2';
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? 14 : 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff'; ctx.font = '900 30px Inter, Segoe UI, Arial';
    ctx.fillText('x40', cx - 230, cy - 150); ctx.fillText('x1', cx - 14, cy - 205); ctx.fillText('x2', cx + 195, cy - 150);
    ctx.fillStyle = '#ffd166'; ctx.font = '900 28px Inter, Segoe UI, Arial'; ctx.fillText('Periodic padding: x40 - x1 - x2', 385, 640);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 4; ctx.strokeRect(38, 38, w - 76, h - 76);
    this.texture.needsUpdate = true;
  }
}

class V11ScientificLeaderboardWall {
  constructor(position) {
    this.group = makeFacingScreenGroup(position, new THREE.Vector3(0, 20, 0));
    this.canvas = document.createElement('canvas'); this.canvas.width = 1200; this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d'); this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.makeObjects(); this.draw();
  }
  makeObjects() {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(17, 10.2), new THREE.MeshBasicMaterial({ map: this.texture, side: THREE.DoubleSide }));
    screen.position.y = 6.3; this.group.add(screen);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17.7, 10.9, 0.32), new THREE.MeshStandardMaterial({ color: 0x07101f, emissive: COLORS.diagnostics, emissiveIntensity: 0.035, roughness: 0.5, metalness: 0.32 }));
    frame.position.set(0, 6.3, -0.22); this.group.add(frame);
  }
  draw() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    const physicalLambda = Number(MODEL_META.reference_lambda1 ?? MODEL_META.lambda1?.physical ?? 1.68);
    const horizon = MODEL_META.horizon || {};
    const lambda = MODEL_META.lambda1 || {};
    const finalRmse = MODEL_META.rmse_15s_export_window || {};

    const rows = [
      { key: 'cnn_tendency', short: 'CNN tendency', color: '#b278ff', horizon: Number(horizon.cnn_tendency || 0), lambda: Number(lambda.cnn_tendency || 0), final: Number(finalRmse.cnn_tendency?.final || 0) },
      { key: 'cnn_next', short: 'CNN next', color: '#4dffb1', horizon: Number(horizon.cnn_next || 0), lambda: Number(lambda.cnn_next || 0), final: Number(finalRmse.cnn_next?.final || 0) },
      { key: 'mlp_tendency', short: 'MLP tendency', color: '#ff4d7e', horizon: Number(horizon.mlp_tendency || 0), lambda: Number(lambda.mlp_tendency || 0), final: Number(finalRmse.mlp_tendency?.final || 0) },
      { key: 'mlp_next', short: 'MLP next', color: '#ff9f43', horizon: Number(horizon.mlp_next || 0), lambda: Number(lambda.mlp_next || 0), final: Number(finalRmse.mlp_next?.final || 0) },
    ];
    rows.forEach(r => r.lambdaErr = Math.abs(r.lambda - physicalLambda));

    const bestHorizon = rows.reduce((a, b) => a.horizon >= b.horizon ? a : b);
    const bestLambda = rows.reduce((a, b) => a.lambdaErr <= b.lambdaErr ? a : b);
    const bestFinal = rows.reduce((a, b) => a.final <= b.final ? a : b);

    ctx.fillStyle = '#081225'; ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, 'rgba(77,255,177,0.10)'); grad.addColorStop(1, 'rgba(86,204,242,0.02)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#4dffb1'; ctx.font = '900 50px Inter, Segoe UI, Arial'; ctx.fillText('Scientific mini leaderboard', 60, 82);
    ctx.fillStyle = '#dce8ff'; ctx.font = '800 25px Inter, Segoe UI, Arial';
    wrapCanvasText(ctx, 'Fast takeaway from our real L96 showroom data. Units: horizon in UM, lambda as leading Lyapunov exponent, RMSE over the synchronized 15 s export window.', 60, 128, 1080, 32);

    const cards = [
      ['Longest prediction horizon', `${bestHorizon.short} - ${fmtMetric(bestHorizon.horizon)} UM`, bestHorizon.color, 'Best long-rollout stability in our run.'],
      ['Closest to physical ÃŽÂ»Ã¢â€šÂ = ' + fmtMetric(physicalLambda), `${bestLambda.short} - |ÃŽâ€ÃŽÂ»Ã¢â€šÂ| = ${fmtMetric(bestLambda.lambdaErr)}`, bestLambda.color, 'Best chaos-metric agreement among the learned models.'],
      ['Lowest final 15 s RMSE', `${bestFinal.short} - RMSE = ${fmtMetric(bestFinal.final)}`, bestFinal.color, 'Best endpoint error on the exported comparison window.'],
    ];
    let cx = 60;
    cards.forEach((card, idx) => {
      roundRectCanvas(ctx, cx, 190, 340, 154, 24, 'rgba(255,255,255,.055)');
      ctx.fillStyle = '#ffd166'; ctx.font = '900 24px Inter, Segoe UI, Arial'; ctx.fillText(idx === 0 ? 'GOLD' : idx === 1 ? 'SILVER' : 'BRONZE', cx + 22, 224);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 24px Inter, Segoe UI, Arial'; wrapCanvasText(ctx, card[0], cx + 22, 260, 295, 28);
      ctx.fillStyle = card[2]; ctx.font = '900 24px Inter, Segoe UI, Arial'; wrapCanvasText(ctx, card[1], cx + 22, 302, 295, 28);
      ctx.fillStyle = '#b8c8e6'; ctx.font = '700 19px Inter, Segoe UI, Arial'; wrapCanvasText(ctx, card[3], cx + 22, 332, 295, 24);
      cx += 370;
    });

    roundRectCanvas(ctx, 60, 384, 1080, 240, 24, 'rgba(255,255,255,.045)');
    ctx.fillStyle = '#ffffff'; ctx.font = '900 30px Inter, Segoe UI, Arial'; ctx.fillText('All compared models - real numbers from the showroom export', 86, 426);

    const headers = [
      ['Model', 90], ['Horizon (UM)', 390], ['ÃŽÂ»Ã¢â€šÂ', 620], ['|ÃŽâ€ÃŽÂ»Ã¢â€šÂ| vs phys', 760], ['Final RMSE', 970]
    ];
    ctx.fillStyle = '#9fb0d0'; ctx.font = '800 20px Inter, Segoe UI, Arial';
    headers.forEach(([txt, x]) => ctx.fillText(txt, x, 462));
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(86, 474); ctx.lineTo(1120, 474); ctx.stroke();

    let y = 510;
    rows.forEach((r, idx) => {
      if (idx % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(82, y - 28, 1048, 40); }
      ctx.fillStyle = r.color; ctx.fillRect(90, y - 16, 16, 16);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 22px Inter, Segoe UI, Arial'; ctx.fillText(r.short, 120, y);
      ctx.fillText(fmtMetric(r.horizon), 410, y);
      ctx.fillText(fmtMetric(r.lambda), 640, y);
      ctx.fillText(fmtMetric(r.lambdaErr), 820, y);
      ctx.fillText(fmtMetric(r.final), 1000, y);
      y += 42;
    });

    ctx.fillStyle = '#ffd166'; ctx.font = '900 24px Inter, Segoe UI, Arial';
    wrapCanvasText(ctx, 'Main takeaway: periodic CNNs dominate L96, and the tendency target gives the strongest long-horizon rollout. MLP next is the clear instability failure case.', 86, 660, 1020, 30);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 4; ctx.strokeRect(38, 38, w - 76, h - 76);
    this.texture.needsUpdate = true;
  }
}

function buildFloorArrows() {
  const group = new THREE.Group();
  const items = [
    [STATIONS.physical, 'PHYSICAL', COLORS.physical],
    [STATIONS.mlpNext, 'MLP NEXT', COLORS.mlpNext],
    [STATIONS.cnnTendency, 'CNN TEND', COLORS.cnnTendency],
    [STATIONS.diagnostics, 'DIAGNOSTICS', COLORS.diagnostics],
  ];
  for (const [st, label, color] of items) {
    const dir = st.position.clone().setY(0).normalize();
    const angle = Math.atan2(dir.x, dir.z);
    const arrow = new THREE.Group();
    arrow.position.copy(dir.clone().multiplyScalar(18));
    arrow.rotation.y = angle;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 12.0), mat);
    shaft.position.z = 4.0; shaft.position.y = 0.08;
    const head = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 3), mat);
    head.position.z = 11.0; head.position.y = 0.10; head.rotation.x = Math.PI / 2;
    arrow.add(shaft, head);
    addTextPlane(arrow, label, new THREE.Vector3(0, 1.0, 3.2), 4.5, 0.8, { color: '#ffffff', font: 34, bg: 'rgba(0,0,0,.20)' });
    group.add(arrow);
  }
  root.add(group);
  return group;
}

function updateFloorArrows(group, elapsed) {
  group.children.forEach((arrow, i) => {
    arrow.children.forEach(child => { if (child.material?.opacity) child.material.opacity = 0.30 + 0.16 * Math.sin(elapsed * 1.7 + i); });
  });
}

function addHovmollerAxisLabels(hov) {
  const group = new THREE.Group();
  if (!hov) return group;
  hov.group.add(group);
  addTextPlane(group, 'space index k = 0...39', new THREE.Vector3(0, 4.2, hov.depth / 2 + 2.0), 8.5, 0.8, { color: '#eafff7', font: 30, bg: 'rgba(0,0,0,.22)' });
  addTextPlane(group, 'time within 15s loop', new THREE.Vector3(hov.width / 2 + 3.0, 4.2, 0), 7.4, 0.75, { color: '#eafff7', font: 28, bg: 'rgba(0,0,0,.22)' });
  addTextPlane(group, 'height/color = L96 state amplitude', new THREE.Vector3(0, 11.7, hov.depth / 2 + 2.2), 10.8, 0.75, { color: '#ffffff', font: 28, bg: 'rgba(0,0,0,.20)' });
  return group;
}

function toggleTourMode() {
  state.tourMode = !state.tourMode;
  if (state.tourMode) {
    state.tourIndex = 0;
    tourPanel?.classList.remove('hidden');
    showSyncToast('Tour mode enabled - press N for next step');
    updateTourPanel();
  } else {
    tourPanel?.classList.add('hidden');
    showSyncToast('Tour mode disabled');
  }
}

function nextTourStep() {
  if (!state.tourMode) { toggleTourMode(); return; }
  state.tourIndex = (state.tourIndex + 1) % TOUR_STEPS.length;
  updateTourPanel();
}

function updateTourPanel() {
  if (!tourPanel) return;
  const step = TOUR_STEPS[state.tourIndex];
  tourPanel.innerHTML = `<b>TOUR ${state.tourIndex + 1}/${TOUR_STEPS.length}</b><span>${step}</span><small>T: close - N: next - WASD/mouse remain active</small>`;
}

function bindEvents() {
  enterBtn.addEventListener('click', requestEnterShowroom);
  controls.addEventListener('lock', onControlsLock);
  controls.addEventListener('unlock', onControlsUnlock);

  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  bindMobileControls();
}

function setTransitionMessage(title, subtitle) {
  if (transitionTitle) transitionTitle.textContent = title;
  if (transitionSubtitle) transitionSubtitle.textContent = subtitle;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
  state.keys.add(e.code);
  if (['Space', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyF') toggleFlyMode();
  if (e.code === 'KeyE') tryUsePortal();
  if (e.code === 'KeyO') toggleDiagnosticMap();
  if (e.code === 'KeyR') resetClock();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'Digit1') state.orbitMode = !state.orbitMode;
  if (e.code === 'KeyM') requestReturnToMenu();
  if (e.code === 'KeyT') toggleTourMode();
  if (e.code === 'KeyN') nextTourStep();
  if (e.code === 'BracketLeft') { state.speed = Math.max(0.1, state.speed - 0.1); showSyncToast(`Speed ${state.speed.toFixed(1)}x`); }
  if (e.code === 'BracketRight') { state.speed = Math.min(3.0, state.speed + 0.1); showSyncToast(`Speed ${state.speed.toFixed(1)}x`); }
}

function onKeyUp(e) {
  state.keys.delete(e.code);
}

function requestEnterShowroom() {
  setTransitionMessage('Synchronizing 15 s loop', 'Entering showroom - physical, MLP and CNN dashboards align at the same clock');
  transitionOverlay.classList.add('active');
  if (IS_TOUCH_DEVICE) {
    state.mobileActive = true;
    onControlsLock();
  } else {
    controls.lock();
  }
}

function requestReturnToMenu() {
  if (!controls.isLocked && !state.mobileActive) return;
  setTransitionMessage('Returning to menu', 'Pointer released - loop paused while the menu overlay comes back');
  transitionOverlay.classList.add('active');
  if (state.mobileActive) {
    state.mobileActive = false;
    setTimeout(onControlsUnlock, 120);
  } else {
    setTimeout(() => controls.unlock(), 120);
  }
}

function onControlsLock() {
  lockOverlay.classList.add('hidden');
  lockOverlay.classList.remove('returning');
  document.body.classList.add('inShowroom');

  if (state.pausedForMenu && state.paused) {
    state.paused = false;
    state.startMs = performance.now() - state.elapsedBeforePause * 1000 / state.speed;
    state.pausedForMenu = false;
    pauseBanner.classList.add('hidden');
  }

  // Critical sync rule: the master loop starts at t=0 only on the first real entry.
  // If the user exits with ESC/M and re-enters, the clock is preserved.
  if (!state.firstEntryDone) {
    state.firstEntryDone = true;
    resetClock({ silent: true });
    showSyncToast('Master clock started at t=0');
  } else {
    showSyncToast('Re-entered - sync preserved');
  }

  setTimeout(() => transitionOverlay.classList.remove('active'), 420);
}

function onControlsUnlock() {
  document.body.classList.remove('inShowroom');
  if (state.started && !state.paused) {
    state.paused = true;
    state.pauseAt = performance.now();
    state.elapsedBeforePause = getMasterElapsed();
    state.pausedForMenu = true;
    pauseBanner.classList.add('hidden');
  }
  lockOverlay.classList.remove('hidden');
  lockOverlay.classList.add('returning');
  if (lockKicker) lockKicker.textContent = state.firstEntryDone ? 'Menu reopened - synchronized loop paused' : 'Showroom v23 ready - diagnostic top-down map loaded';
  if (lockTitle) lockTitle.textContent = state.firstEntryDone ? 'Return to menu' : 'Click to enter';
  if (lockText) lockText.textContent = state.firstEntryDone
    ? 'The 15 s loop is paused in the background. Press START to resume from the same synchronized time, or press R after entering to restart from t=0.'
    : 'WASD per muoverti - mouse per guardare - F fly mode - O map - Space su - Ctrl/C giu. Su mobile usa joystick, FLY, UP/DOWN, MAP.';
  enterBtn.textContent = state.firstEntryDone ? 'RESUME SHOWROOM' : 'START SYNCHRONIZED LOOP';
  showSyncToast(state.firstEntryDone ? 'Menu opened - loop paused' : 'Pointer unlocked');
  setTimeout(() => transitionOverlay.classList.remove('active'), 220);
}


function toggleFlyMode() {
  state.flyMode = !state.flyMode;
  if (!state.flyMode) {
    const obj = controls.getObject();
    obj.position.y = WORLD.playerHeight;
    state.touchVertical = 0;
  }
  document.body.classList.toggle('flyMode', state.flyMode);
  if (mobileFlyBtn) mobileFlyBtn.classList.toggle('active', state.flyMode);
  showSyncToast(state.flyMode ? `Fly mode ON - roof ${WORLD.roofHeight.toFixed(0)}` : 'Fly mode OFF - floor collision active');
}

function bindMobileControls() {
  if (!mobileControls) return;
  mobileControls.classList.toggle('touchDevice', IS_TOUCH_DEVICE);

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  if (mobileJoystick && mobileStick) {
    const resetStick = () => {
      state.touchMoveX = 0;
      state.touchMoveY = 0;
      mobileStick.style.transform = 'translate(-50%, -50%)';
    };
    mobileJoystick.addEventListener('pointerdown', (e) => {
      stop(e);
      mobileJoystick.setPointerCapture?.(e.pointerId);
      updateMobileJoystick(e);
    });
    mobileJoystick.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') { stop(e); updateMobileJoystick(e); }
    });
    mobileJoystick.addEventListener('pointerup', (e) => { stop(e); resetStick(); });
    mobileJoystick.addEventListener('pointercancel', (e) => { stop(e); resetStick(); });
  }

  if (mobileFlyBtn) {
    mobileFlyBtn.addEventListener('pointerdown', (e) => { stop(e); toggleFlyMode(); });
  }
  if (mobileUpBtn) {
    mobileUpBtn.addEventListener('pointerdown', (e) => { stop(e); state.touchVertical = 1; });
    mobileUpBtn.addEventListener('pointerup', (e) => { stop(e); state.touchVertical = 0; });
    mobileUpBtn.addEventListener('pointercancel', (e) => { stop(e); state.touchVertical = 0; });
    mobileUpBtn.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') state.touchVertical = 0; });
  }
  if (mobilePortalBtn) {
    mobilePortalBtn.addEventListener('pointerdown', (e) => { stop(e); tryUsePortal(); });
  }
  if (mobileMapBtn) {
    mobileMapBtn.addEventListener('pointerdown', (e) => { stop(e); toggleDiagnosticMap(); });
  }
  if (mapToggleBtn) {
    mapToggleBtn.addEventListener('pointerdown', (e) => { stop(e); toggleDiagnosticMap(); });
  }
  if (mapCloseBtn) {
    mapCloseBtn.addEventListener('pointerdown', (e) => { stop(e); toggleDiagnosticMap(false); });
  }
  if (mobileDownBtn) {
    mobileDownBtn.addEventListener('pointerdown', (e) => { stop(e); state.touchVertical = -1; });
    mobileDownBtn.addEventListener('pointerup', (e) => { stop(e); state.touchVertical = 0; });
    mobileDownBtn.addEventListener('pointercancel', (e) => { stop(e); state.touchVertical = 0; });
    mobileDownBtn.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') state.touchVertical = 0; });
  }

  const lookTarget = mobileLookPad || canvas;
  lookTarget.addEventListener('pointerdown', onMobileLookStart, { passive: false });
  lookTarget.addEventListener('pointermove', onMobileLookMove, { passive: false });
  lookTarget.addEventListener('pointerup', onMobileLookEnd, { passive: false });
  lookTarget.addEventListener('pointercancel', onMobileLookEnd, { passive: false });
}

function updateMobileJoystick(e) {
  if (!mobileJoystick || !mobileStick) return;
  const rect = mobileJoystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = rect.width * 0.36;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > radius) {
    dx = dx / len * radius;
    dy = dy / len * radius;
  }
  state.touchMoveX = THREE.MathUtils.clamp(dx / radius, -1, 1);
  state.touchMoveY = THREE.MathUtils.clamp(-dy / radius, -1, 1);
  mobileStick.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
}

function onMobileLookStart(e) {
  if (!IS_TOUCH_DEVICE || !state.mobileActive) return;

  // Mobile look area lives inside #mobileControls, so do not block it.
  // Only ignore real UI controls such as joystick and buttons.
  if (e.target.closest?.('.mobileJoystick, .mobileButtons, .mobileBtn, button')) return;

  e.preventDefault();
  e.stopPropagation();
  state.touchLookId = e.pointerId;
  state.touchLookLastX = e.clientX;
  state.touchLookLastY = e.clientY;
  (mobileLookPad || canvas).setPointerCapture?.(e.pointerId);
}

function onMobileLookMove(e) {
  if (!IS_TOUCH_DEVICE || !state.mobileActive || state.touchLookId !== e.pointerId) return;
  e.preventDefault();
  const dx = e.clientX - state.touchLookLastX;
  const dy = e.clientY - state.touchLookLastY;
  state.touchLookLastX = e.clientX;
  state.touchLookLastY = e.clientY;

  const obj = controls.getObject();
  obj.rotation.y -= dx * 0.0042;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.0036, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
}

function onMobileLookEnd(e) {
  if (state.touchLookId === e.pointerId) {
    try { (mobileLookPad || canvas).releasePointerCapture?.(e.pointerId); } catch (_) {}
    state.touchLookId = null;
  }
}


function toggleDiagnosticMap(force) {
  const next = force === undefined ? !state.mapOpen : Boolean(force);
  state.mapOpen = next;
  if (!mapOverlay) return;
  mapOverlay.classList.toggle('hidden', !next);
  mapOverlay.setAttribute('aria-hidden', String(!next));
  if (next) {
    renderDiagnosticMap();
    showSyncToast('Top-down diagnostic map opened');
  }
}

function mapPercent(localX, localZ) {
  const x = THREE.MathUtils.clamp((localX + WORLD.half) / WORLD.size * 100, 3, 97);
  const y = THREE.MathUtils.clamp((localZ + WORLD.half) / WORLD.size * 100, 3, 97);
  return [x, y];
}

function makeMapItem(item) {
  const [left, top] = mapPercent(item.x, item.z);
  const el = document.createElement('div');
  el.className = `mapItem ${item.kind || ''}`;
  el.style.left = `${left}%`;
  el.style.top = `${top}%`;
  el.innerHTML = `${item.label}<small>local (${item.x.toFixed(0)}, ${item.z.toFixed(0)}) - yaw ${item.yaw}</small>`;
  return el;
}

function renderDiagnosticMap() {
  if (!mapGrid) return;
  const obj = controls.getObject();
  const zone = state.zone || 'main';
  const center = ZONES[zone]?.center || new THREE.Vector3();
  const localX = obj.position.x - center.x;
  const localZ = obj.position.z - center.z;
  const yawDeg = THREE.MathUtils.radToDeg(obj.rotation.y || 0);
  const normYaw = ((yawDeg % 360) + 360) % 360;

  const mainItems = [
    { label:'Q1 PHYSICAL RK4', x:-44, z:-44, yaw:'toward center', kind:'l63' },
    { label:'Q2 MLP NEXT', x:44, z:-44, yaw:'toward center', kind:'divergence' },
    { label:'Q3 CNN TENDENCY', x:-44, z:44, yaw:'toward center', kind:'ftle' },
    { label:'Q4 HOVMOLLER 3D', x:44, z:44, yaw:'clean quadrant', kind:'leaderboard' },
    { label:'PORTAL TO ANNEX', x:18, z:18, yaw:'trigger', kind:'portal' },
    { label:'SPAWN/CENTER', x:0, z:0, yaw:'origin', kind:'portal' },
  ];

  const annexItems = [
    { label:'Q1 L96 LEADERBOARD', x:0, z:-60, yaw:'faces center', kind:'leaderboard' },
    { label:'Q2 L63 PHYSICAL RK4', x:-60, z:0, yaw:'faces center', kind:'l63' },
    { label:'Q3 L63 DIVERGENCE', x:60, z:0, yaw:'faces center', kind:'divergence' },
    { label:'Q4 L63 FTLE MAP', x:0, z:60, yaw:'faces center', kind:'ftle' },
    { label:'RETURN PORTAL', x:0, z:56, yaw:'to main', kind:'portal' },
    { label:'ANNEX CENTER', x:0, z:0, yaw:'origin', kind:'portal' },
  ];

  const items = zone === 'annex' ? annexItems : mainItems;
  mapGrid.innerHTML = '<div class="mapAxisX"></div><div class="mapAxisZ"></div><div class="mapBoundsLabel">local coordinates - X horizontal - Z vertical - bounds Â±85</div>';
  items.forEach(item => mapGrid.appendChild(makeMapItem(item)));
  mapGrid.appendChild(makeMapItem({ label:'YOU', x:localX, z:localZ, yaw:`${normYaw.toFixed(0)} deg`, kind:'player' }));

  if (mapZoneLabel) mapZoneLabel.textContent = `current zone: ${zone.toUpperCase()} - player local (${localX.toFixed(1)}, ${localZ.toFixed(1)}) - yaw ${normYaw.toFixed(0)} deg`;
  if (mapLegend) mapLegend.innerHTML = '<b>OCR note:</b> screenshot this panel to report layout problems. Q labels, local coordinates and yaw notes are plain text. Toggle with <code>O</code> on PC or <code>MAP</code> on mobile.';
}


function resetClock(options = {}) {
  const { silent = false, doNotStart = false } = options;
  state.started = !doNotStart;
  state.startMs = performance.now();
  state.elapsedBeforePause = 0;
  state.pauseAt = 0;
  state.paused = false;
  pauseBanner.classList.add('hidden');
  if (!silent) showSyncToast('Master loop reset to t=0');
}

function togglePause() {
  if (!state.started) return;
  if (!state.paused) {
    state.paused = true;
    state.pauseAt = performance.now();
    state.elapsedBeforePause = getMasterElapsed();
    pauseBanner.classList.remove('hidden');
    showSyncToast('Paused - all loops frozen');
  } else {
    state.paused = false;
    state.startMs = performance.now() - state.elapsedBeforePause * 1000 / state.speed;
    pauseBanner.classList.add('hidden');
    showSyncToast('Resumed - sync preserved');
  }
}

function showSyncToast(message) {
  syncToast.textContent = message;
  syncToast.classList.remove('hidden');
  clearTimeout(showSyncToast._timer);
  showSyncToast._timer = setTimeout(() => syncToast.classList.add('hidden'), 1800);
}

function getMasterElapsed() {
  if (!state.started) return 0;
  if (state.paused) return state.elapsedBeforePause;
  return ((performance.now() - state.startMs) / 1000) * state.speed;
}

function updatePlayer(dt) {
  const active = controls.isLocked || state.mobileActive;
  if (!active) return;

  const obj = controls.getObject();
  const runBoost = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight');
  const speed = WORLD.playerSpeed * (runBoost ? WORLD.runMultiplier : 1.0);
  const distance = speed * dt;

  const mobileForward = IS_TOUCH_DEVICE ? state.touchMoveY : 0;
  const mobileRight = IS_TOUCH_DEVICE ? state.touchMoveX : 0;
  const keyForward = (state.keys.has('KeyW') ? 1 : 0) - (state.keys.has('KeyS') ? 1 : 0);
  const keyRight = (state.keys.has('KeyD') ? 1 : 0) - (state.keys.has('KeyA') ? 1 : 0);

  const forward = THREE.MathUtils.clamp(keyForward + mobileForward, -1, 1);
  const right = THREE.MathUtils.clamp(keyRight + mobileRight, -1, 1);

  if (IS_TOUCH_DEVICE && state.mobileActive) {
    const yaw = obj.rotation.y;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    obj.position.x += (right * cos - forward * sin) * distance;
    obj.position.z += (right * sin + forward * cos) * distance;
  } else {
    if (forward) controls.moveForward(distance * forward);
    if (right) controls.moveRight(distance * right);
  }

  if (state.flyMode) {
    const keyUp = (state.keys.has('Space') ? 1 : 0) - (state.keys.has('ControlLeft') || state.keys.has('ControlRight') || state.keys.has('KeyC') ? 1 : 0);
    const vertical = THREE.MathUtils.clamp(keyUp + state.touchVertical, -1, 1);
    obj.position.y += vertical * WORLD.flyVerticalSpeed * dt;
  } else {
    obj.position.y = WORLD.playerHeight;
  }

  clampPlayerToCurrentZone(obj);
  obj.position.y = THREE.MathUtils.clamp(obj.position.y, WORLD.playerHeight, WORLD.roofHeight);
}

function updateBillboards() {
  root.traverse((o) => {
    if (o.userData && o.userData.billboard) {
      o.quaternion.copy(camera.quaternion);
    }
    if (o.userData && o.userData.spin) {
      o.rotation.x += 0.006;
      o.rotation.y += 0.011;
    }
  });
}

function updateHud(elapsed, phase) {
  if (state.tourMode) updateTourPanel();
  clockText.textContent = `t = ${(phase * LOOP_SECONDS).toFixed(2)} / ${LOOP_SECONDS.toFixed(0)} s`;
  speedText.textContent = `${state.paused ? 'paused - ' : ''}speed ${state.speed.toFixed(1)}x - fly ${state.flyMode ? 'ON' : 'OFF'}${state.flyMode ? ` - alt ${controls.getObject().position.y.toFixed(1)}` : ''}`;

  const pos = controls.getObject().position;
  updatePortalProximity(pos);
  if (state.nearPortal) {
    const target = state.nearPortal === 'mainToAnnex' ? 'Project Annex' : 'Main Showroom';
    note.innerHTML = `<b>Portal ready:</b> premi E su PC o PORTAL su mobile per entrare in ${target}.`;
    return;
  }
  if (state.zone === 'annex') {
    note.innerHTML = '<b>Project Annex:</b> leaderboard dinamica pulita, sincronizzata con lo stesso clock del mondo principale.';
    return;
  }
  const dPhysical = pos.distanceTo(new THREE.Vector3(STATIONS.physical.position.x, WORLD.playerHeight, STATIONS.physical.position.z));
  if (dPhysical < 26) {
    note.innerHTML = '<b>Physical RK4:</b> verita di riferimento. Q2/Q3 usano rollout reali esportati dai checkpoint 100k.';
  } else if (pos.x > 18 && pos.z > 18) {
    note.innerHTML = '<b>Q4 pulito:</b> Hovmoller 3D terrain only, senza diagnostics wall o cartelli verdi.';
  } else if (pos.x > 18 && pos.z < -18) {
    note.innerHTML = '<b>MLP next reale:</b> rollout caricato dal checkpoint. Guarda l''anello arancio contro il ghost fisico blu.';
  } else if (pos.x < -18 && pos.z > 18) {
    note.innerHTML = '<b>CNN tendency reale:</b> rollout caricato dal checkpoint, target dx/dt e periodic CNN. E il confronto principale.';
  } else {
    note.innerHTML = '<b>Centro:</b> DEMOL v22 sincronizza physical, MLP next, CNN tendency e diagnostics L63 sia in 3D sia nei pannelli 2D animati.';
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  if (!state.ready) return;

  const dt = Math.min(0.05, (now - state.lastTime) / 1000 || 0.016);
  state.lastTime = now;
  updatePlayer(dt);

  const elapsed = getMasterElapsed();
  const phase = ((elapsed % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS / LOOP_SECONDS;

  l96Installation.update(phase, elapsed);

  if (mlpNextInstallation) mlpNextInstallation.update(phase, elapsed);
  if (cnnTendencyInstallation) cnnTendencyInstallation.update(phase, elapsed);
  if (l63Hero) l63Hero.update(phase, elapsed);
  if (hovmollerSurface) hovmollerSurface.update(phase, elapsed);
  // animated 2D rollout panels update through displayPanels
  for (const panel of displayPanels) { if (panel && typeof panel.update === 'function') panel.update(phase, elapsed); }
  if (masterClockHalo) masterClockHalo.update(phase, elapsed);
  if (timelineRail) timelineRail.update(phase, elapsed);
  if (mlpMetricPanel) mlpMetricPanel.update(phase, elapsed);
  if (cnnMetricPanel) cnnMetricPanel.update(phase, elapsed);
  if (detailedDiagnosticsWall) detailedDiagnosticsWall.update(phase, elapsed);
  if (v11RmseWall) v11RmseWall.update(phase, elapsed);
  if (v16Leaderboard) v16Leaderboard.update(phase, elapsed);
  if (l63AnnexPhysicalSuite) l63AnnexPhysicalSuite.update(phase, elapsed);
  if (l63AnnexDivergenceSuite) l63AnnexDivergenceSuite.update(phase, elapsed);
  if (l63AnnexFtleSuite) l63AnnexFtleSuite.update(phase, elapsed);
  if (portalSystem) portalSystem.update(elapsed);
  if (floorArrowGroup) updateFloorArrows(floorArrowGroup, elapsed);
  if (quadrantBeaconGroup) updateSkyQuadrantBeacons(quadrantBeaconGroup, phase, elapsed);

  if (diagnosticWall) {
    diagnosticWall.rotation.y = -Math.PI * 0.75 + Math.sin(elapsed * 0.25) * 0.035;
  }

  // subtle future-station idle spin is handled by updateBillboards traversal
  updateBillboards();
  updateHud(elapsed, phase);

  if (state.mapOpen) renderDiagnosticMap();
  renderer.render(scene, camera);
}


