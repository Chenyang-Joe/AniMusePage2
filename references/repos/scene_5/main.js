import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Same GLB pool the teaser scene draws from.
const MESH_BASE = '/data/all_animo_val/process1_textured_post2/mesh/';
const BLOB_BASE = '/data/all_animo_val/process1_textured_post1/blob/';

// Scene config
const N_ANIMALS = 10;
const SHUFFLE_SEED = 0xC0FFEE7;   // bumped if you want a different random pick
const ANIMAL_SCALE = 1.0;          // teaser uses 0.4 — we bump to 1.0 so a single
                                   // animal fills the narrow CAM_ROWS frame
const ANIM_TIME_SCALE = 0.5;       // half-speed playback (matches teaser smoothness)

// Manual overrides for specific slots (1-indexed). Leave a slot out to keep
// whatever the seeded shuffle produces. Used to swap out picks you don't like
// without re-rolling the whole list.
const PICK_OVERRIDES = {
  2:  'Meerkat_Juvenile__meerkat_juvenile__a_1c0f2ac8c214.glb',
  3:  'King_Penguin_Male__king_penguin_male__51afc65ae2d9.glb',
  10: 'Asian_Small_Clawed_Otter_Male__asian__c0909d86f1be.glb',
};

// `?record=1` → one-click MediaRecorder capture (same flow as scene_1).
// After the configured number of full loops (10 animals × mesh+blob each),
// freeze on the final blob frame and download a .webm.
const RECORD_MODE = new URLSearchParams(location.search).get('record') === '1';
const STOP_AFTER_LOOPS = 1;
let activeRecorder = null;
let loopsCompleted = 0;

// === Camera: teaser CAM_ROWS angle (top-down telephoto), but target shifted
// down to ground-level since there's no pedestal in this scene. ===
const CAM_POS = new THREE.Vector3(0, 7.6, 11.5);   // teaser had (0, 8, 11.5) above a 0.85m pedestal
const CAM_TARGET = new THREE.Vector3(0, 0.5, 0);   // approximate animal mid-body height
const CAM_FOV = 5.5;

// Animals whose authoring orientation faces away from the camera — match the
// teaser's hand-curated ROTATE_180 set so swaps look correct regardless of pick.
const ROTATE_180 = new Set([
  'Aardvark_Male__aardvark_male__animati_47a916fa2fdf.glb',
  'African_Buffalo_Male__african_buffalo_34df70925683.glb',
  'African_Wild_Dog_Juvenile__african_wi_2e6e211c1608.glb',
  'African_Wild_Dog_Juvenile__african_wi_87362698b587.glb',
  'Alpaca_Male__alpaca_male__animationmo_2dc5567efd53.glb',
  'American_Flamingo_Juvenile__american__c69cf237e5fd.glb',
  'Amur_Leopard_Juvenile__amur_leopard_j_e889236c8794.glb',
  'Babirusa_Male__babirusa_male__animati_85552738af43.glb',
  'Bactrian_Camel_Female__bactrian_camel_db6831436c54.glb',
  'Bengal_Tiger_Female__bengal_tiger_fem_85a98badff8b.glb',
  'Bengal_Tiger_Female__bengal_tiger_fem_cd9862f33806.glb',
  'Bongo_Juvenile__bongo_juvenile__anima_ce85a722f255.glb',
  'California_Sea_Lion_Juvenile__califor_79cc1a50fdb3.glb',
  'Caracal_Male__caracal_male__animation_acd067fc4282.glb',
  'Cassowary_Female__cassowary_female__a_98583a3aeea4.glb',
  'Common_Wombat_Juvenile__common_wombat_d75c42453139.glb',
  'Dingo_Female__dingo_female__animation_549f3eb6a213.glb',
  'Fennec_Fox_Female__fennec_fox_female__4558f40ab8dc.glb',
  'Giant_Anteater_Juvenile__giant_anteat_e4d63702ae71.glb',
  'Grizzly_Bear_Female__grizzly_bear_fem_11bc3ce97aa2.glb',
  'Hamadryas_Baboon_Juvenile__hamadryas__18275e2a905e.glb',
  'Hamadryas_Baboon_Male__hamadryas_babo_1da9a2c8861f.glb',
  'Honey_Badger_Female__honey_badger_mal_9b84ff3fdd83.glb',
  'Honey_Badger_Juvenile__honey_badger_j_df49ab261a6b.glb',
  'Indian_Elephant_Female__indian_elepha_64be1af510c4.glb',
  'Japanese_Macaque_Female__japanese_mac_86b28b03fc31.glb',
  'King_Penguin_Male__king_penguin_male__51afc65ae2d9.glb',
  'Nile_Lechwe_Juvenile__nile_lechwe_juv_89117a082858.glb',
  'Nine_Banded_Armadillo_Male__nine_band_8e9a3d7e9bac.glb',
  'Ocelot_Male__ocelot_male__animationmo_cc846c58bcc2.glb',
  'Pallas_Cat_Female__pallas_cat_male__a_8a71fd1a0817.glb',
  'Pallas_Cat_Male__pallas_cat_male__ani_d6e9a20566ca.glb',
  'Platypus_Male__platypus_male__animati_abc6c6f4afb4.glb',
  'Rednecked_Wallaby_Male__rednecked_wal_36a87e28b6c0.glb',
  'Sand_Cat_Female__sand_cat_male__anima_4c1488c9539c.glb',
  'Spotted_Hyena_Female__spotted_hyena_f_160db685a46d.glb',
  'White_Faced_Saki_Male__white_faced_sa_bd590e98df02.glb',
  'Wolverine_Female__wolverine_male__ani_89da20e38a0d.glb',
]);

// ============================================================
// Renderer / scene / camera
// ============================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(CAM_FOV, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.copy(CAM_POS);
camera.lookAt(CAM_TARGET);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

// ============================================================
// Lighting (simple — ambient + warm key + cool fill)
// ============================================================
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(4, 6, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 25;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.02;
key.shadow.radius = 4;
scene.add(key);

const fill = new THREE.DirectionalLight(0xc8d8e8, 0.4);
fill.position.set(-3, 2.5, -3);
scene.add(fill);

// ============================================================
// White ground plane
// ============================================================
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.92, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// Helpers
// ============================================================

// Seeded shuffle (same algorithm as scene_teaser).
function seededShuffle(arr, seed) {
  const out = arr.slice();
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function setLinearInterp(clip) {
  for (const track of clip.tracks) track.setInterpolation(THREE.InterpolateLinear);
}

const loader = new GLTFLoader();
const loadingEl = document.getElementById('loading');

/**
 * Set up one model (mesh or blob): rotate per ROTATE_180, scale, animate, then
 * find the true sequence-min Y (over `samples` animation frames) so the feet
 * sit on the floor for every frame of the loop.
 *
 * Returns { mixer, action, durationWall } — durationWall is the wall-clock
 * length of one full play-through, accounting for ANIM_TIME_SCALE.
 */
function setupModel(gltf, filename) {
  const model = gltf.scene;

  if (ROTATE_180.has(filename)) model.rotation.y = Math.PI;
  model.scale.setScalar(ANIMAL_SCALE);

  let mixer = null;
  let action = null;
  let clipDur = 0;
  if (gltf.animations && gltf.animations.length > 0) {
    const clip = gltf.animations[0];
    setLinearInterp(clip);
    clipDur = clip.duration;
    mixer = new THREE.AnimationMixer(model);
    action = mixer.clipAction(clip);
    action.timeScale = ANIM_TIME_SCALE;
    action.play();
    mixer.update(0);
  }

  // Centre on XZ at frame 0, ground using min Y across the whole sequence.
  let bbox = new THREE.Box3().setFromObject(model, true);
  const center = bbox.getCenter(new THREE.Vector3());
  let minY = bbox.min.y;
  if (action) {
    const samples = 30;
    for (let s = 1; s <= samples; s++) {
      action.time = (s / samples) * clipDur;
      mixer.update(0);
      bbox = new THREE.Box3().setFromObject(model, true);
      if (bbox.min.y < minY) minY = bbox.min.y;
    }
    action.time = 0;
    mixer.update(0);
  }
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= minY;

  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const durationWall = clipDur / ANIM_TIME_SCALE;
  return { model, mixer, action, durationWall };
}

async function loadAnimal(filename) {
  const [meshGltf, blobGltf] = await Promise.all([
    loader.loadAsync(MESH_BASE + filename),
    loader.loadAsync(BLOB_BASE + filename),
  ]);

  const mesh = setupModel(meshGltf, filename);
  const blob = setupModel(blobGltf, filename);

  // Mesh dark-albedo lift — bumped to 0.40 (teaser uses 0.15, scene_1/2 use 0.3)
  // because at close-up zoom the texture darkness reads as muddy.
  mesh.model.traverse((obj) => {
    if (obj.isMesh && obj.material && obj.material.map && !obj.material.emissiveMap) {
      obj.material.emissiveMap = obj.material.map;
      obj.material.emissive = new THREE.Color(0xffffff);
      obj.material.emissiveIntensity = 0.40;
      obj.material.needsUpdate = true;
    }
  });

  // Blob colour punch (same recipe as scene_teaser's blob styling).
  blob.model.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      obj.material = obj.material.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      obj.material.color.getHSL(hsl);
      obj.material.color.setHSL(
        hsl.h,
        Math.min(1, Math.max(0.25, hsl.s * 1.7)),
        Math.max(0.45, hsl.l),
      );
      if (obj.material.emissive) {
        obj.material.emissive.copy(obj.material.color);
        obj.material.emissiveIntensity = 0.3;
      }
      obj.material.needsUpdate = true;
    }
  });

  mesh.model.visible = false;
  blob.model.visible = false;
  scene.add(mesh.model);
  scene.add(blob.model);

  return { filename, mesh, blob };
}

// ============================================================
// Loading
// ============================================================
const animals = [];

async function loadAll() {
  loadingEl.textContent = 'FETCHING MANIFEST…';
  const res = await fetch(MESH_BASE + 'manifest.json');
  const manifest = await res.json();
  const picked = seededShuffle(manifest, SHUFFLE_SEED).slice(0, N_ANIMALS);

  // Apply manual slot overrides (1-indexed in PICK_OVERRIDES).
  for (const [slot, filename] of Object.entries(PICK_OVERRIDES)) {
    const idx = parseInt(slot, 10) - 1;
    if (idx >= 0 && idx < picked.length) {
      picked[idx] = filename;
    }
  }
  console.log('[scene_5] picked:', picked);

  for (let i = 0; i < picked.length; i++) {
    loadingEl.textContent = `LOADING ${i + 1}/${N_ANIMALS}…`;
    try {
      animals.push(await loadAnimal(picked[i]));
    } catch (err) {
      console.warn('Failed to load', picked[i], err);
    }
  }
  loadingEl.classList.add('hidden');
}

// ============================================================
// Playback state machine
//
// For each animal in turn:
//   1. play mesh once  (durationWall seconds wall time)
//   2. play blob once  (durationWall seconds wall time)
//   3. advance to next animal
// After the 10th, wrap to index 0.
// ============================================================
const clock = new THREE.Clock(false);
let currentIdx = 0;
let currentPhase = 'mesh';   // 'mesh' or 'blob'
let phaseStartT = 0;

function showOnly(idx, phase) {
  for (let i = 0; i < animals.length; i++) {
    const isCurrent = (i === idx);
    animals[i].mesh.model.visible = isCurrent && phase === 'mesh';
    animals[i].blob.model.visible = isCurrent && phase === 'blob';
  }
}

function resetPhase(animal, phase) {
  const target = (phase === 'mesh') ? animal.mesh : animal.blob;
  if (target.action) {
    target.action.time = 0;
    if (target.mixer) target.mixer.update(0);
  }
}

function tick() {
  if (!clock.running) {
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
    return;
  }

  const dt = clock.getDelta();
  const t = clock.getElapsedTime();
  const animal = animals[currentIdx];

  if (animal) {
    const phaseObj = (currentPhase === 'mesh') ? animal.mesh : animal.blob;
    if (phaseObj.mixer) phaseObj.mixer.update(dt);

    if (t - phaseStartT >= phaseObj.durationWall) {
      // End of current phase — advance state machine
      if (currentPhase === 'mesh') {
        currentPhase = 'blob';
        resetPhase(animal, 'blob');
      } else {
        // End of a blob phase. If this was the LAST animal, one loop is done.
        if (currentIdx === animals.length - 1) {
          loopsCompleted++;
          if (RECORD_MODE && loopsCompleted >= STOP_AFTER_LOOPS) {
            // Freeze on the final frame of the last blob and stop recording.
            if (animal.blob.action) {
              animal.blob.action.time = animal.blob.action.getClip().duration - 1e-3;
              if (animal.blob.mixer) animal.blob.mixer.update(0);
            }
            showOnly(currentIdx, 'blob');
            controls.update();
            renderer.render(scene, camera);
            if (activeRecorder && activeRecorder.state === 'recording') {
              activeRecorder.stop();   // triggers onstop → file download
            }
            return;   // no more rAF — demo is parked
          }
        }
        currentIdx = (currentIdx + 1) % animals.length;
        currentPhase = 'mesh';
        resetPhase(animals[currentIdx], 'mesh');
      }
      phaseStartT = t;
    }
  }

  showOnly(currentIdx, currentPhase);

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ============================================================
// Record-mode wiring (one-click flow — copied from scene_1 / scene_2)
// ============================================================
async function startTabRecording() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 60, cursor: 'never' },
    audio: false,
    preferCurrentTab: true,
  });
  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 12_000_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scene_5_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };
  recorder.start();
  return recorder;
}

const loadPromise = loadAll();

if (RECORD_MODE) {
  const btn = document.createElement('button');
  btn.textContent = 'Loading…';
  btn.disabled = true;
  Object.assign(btn.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '18px 36px',
    fontSize: '22px',
    fontWeight: '600',
    fontFamily: 'inherit',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    zIndex: 100,
    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)',
  });
  document.body.appendChild(btn);

  loadPromise.then(() => {
    btn.disabled = false;
    btn.textContent = 'Start recording';
  });

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Requesting share…';
    try {
      activeRecorder = await startTabRecording();
      btn.remove();
      clock.start();   // run the take from t = 0 once the encoder is hot
    } catch (err) {
      console.warn('Recording cancelled or failed:', err);
      btn.disabled = false;
      btn.textContent = 'Start recording';
    }
  };
} else {
  loadPromise.then(() => clock.start());
}

tick();

window.__scene = { scene, camera, controls, renderer, animals };
