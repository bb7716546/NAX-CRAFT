// On-screen error capture (helps when "it shows only text")
const errBox = document.getElementById("errbox");
const errMsg = document.getElementById("errmsg");
function showErr(e) {
  errBox.classList.remove("hidden");
  errMsg.textContent = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
}
window.addEventListener("error", (e) => showErr(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showErr(e.reason));

const statusEl = document.getElementById("status");
statusEl.textContent = "Loading Three.js…";

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { PointerLockControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

// ---------- Config ----------
const SAVE_KEY = "naxcraft_world_v1";
const WORLD_RADIUS = 18;       // world size
const RAY_DIST = 7;            // break/place reach
const AUTOSAVE_MS = 3000;      // autosave frequency
const PLAYER_HEIGHT = 1.8;

// Block types
const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
};

// ---------- Scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(20, 40, 15);
scene.add(sun);

// Controls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
controls.getObject().position.set(0, 4, 10);

document.addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

// Input
const keys = new Set();
addEventListener("keydown", (e) => keys.add(e.code));
addEventListener("keyup", (e) => keys.delete(e.code));

// ---------- Pixel textures (generated, Minecraft-ish look) ----------
// (No Mojang files. If you upload your own texture pack PNG, I’ll swap this out.)
function makePixelTex(drawFn, size = 32) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  drawFn(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function noisyFill(g, size, base, noise = 18) {
  // base: [r,g,b]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (Math.random() * 2 - 1) * noise;
      const r = Math.max(0, Math.min(255, base[0] + n));
      const gg = Math.max(0, Math.min(255, base[1] + n));
      const b = Math.max(0, Math.min(255, base[2] + n));
      g.fillStyle = `rgb(${r|0},${gg|0},${b|0})`;
      g.fillRect(x, y, 1, 1);
    }
  }
}

const texGrassTop = makePixelTex((g, s) => noisyFill(g, s, [70, 170, 70], 22));
const texDirt     = makePixelTex((g, s) => noisyFill(g, s, [130, 85, 45], 22));
const texStone    = makePixelTex((g, s) => noisyFill(g, s, [130, 130, 130], 18));
const texWood     = makePixelTex((g, s) => {
  noisyFill(g, s, [140, 105, 65], 18);
  // simple rings
  g.globalAlpha = 0.25;
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = "rgb(90,60,35)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(s/2, s/2, 4 + i*3, 0, Math.PI*2);
    g.stroke();
  }
  g.globalAlpha = 1;
});

function makeBlockMaterial(type) {
  const side = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
  if (type === BLOCK.GRASS) {
    // top grass, sides "dirt-ish", bottom dirt
    return [
      side(texDirt), // +x
      side(texDirt), // -x
      side(texGrassTop), // +y
      side(texDirt), // -y
      side(texDirt), // +z
      side(texDirt), // -z
    ];
  }
  if (type === BLOCK.DIRT) return side(texDirt);
  if (type === BLOCK.STONE) return side(texStone);
  if (type === BLOCK.WOOD) return side(texWood);
  return side(texStone);
}

// ---------- World data ----------
const blocks = new Map();        // key -> type
const meshes = new Map();        // key -> mesh
const blockGeo = new THREE.BoxGeometry(1, 1, 1);

function key(x, y, z) { return `${x},${y},${z}`; }

function setBlock(x, y, z, type) {
  const k = key(x, y, z);

  // remove
  if (type === BLOCK.AIR) {
    blocks.delete(k);
    const m = meshes.get(k);
    if (m) scene.remove(m);
    meshes.delete(k);
    return;
  }

  // already exists
  if (blocks.get(k) === type) return;

  blocks.set(k, type);

  // update mesh
  const old = meshes.get(k);
  if (old) scene.remove(old);

  const mesh = new THREE.Mesh(blockGeo, makeBlockMaterial(type));
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData = { x, y, z };
  scene.add(mesh);
  meshes.set(k, mesh);
}

function getBlock(x, y, z) {
  return blocks.get(key(x, y, z)) ?? BLOCK.AIR;
}

function genDefaultWorld() {
  blocks.clear();
  for (const m of meshes.values()) scene.remove(m);
  meshes.clear();

  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
      setBlock(x, 0, z, BLOCK.GRASS);
      setBlock(x, -1, z, BLOCK.DIRT);
      setBlock(x, -2, z, BLOCK.STONE);
    }
  }

  // some trees
  for (let i = 0; i < 10; i++) {
    const tx = Math.floor(Math.random() * 18) - 9;
    const tz = Math.floor(Math.random() * 18) - 9;
    for (let y = 1; y <= 4; y++) setBlock(tx, y, tz, BLOCK.WOOD);
  }

  controls.getObject().position.set(0, 4, 10);
}

// ---------- Save / Load ----------
function saveWorld() {
  // store blocks as arrays for smaller JSON
  const arr = [];
  for (const [k, t] of blocks.entries()) {
    const [x, y, z] = k.split(",").map(Number);
    arr.push([x, y, z, t]);
  }
  const p = controls.getObject().position;
  const payload = {
    v: 1,
    player: [p.x, p.y, p.z],
    blocks: arr,
    ts: Date.now()
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  statusEl.textContent = `Saved. Blocks: ${arr.length}`;
}

function loadWorld() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;

  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.blocks)) return false;

  blocks.clear();
  for (const m of meshes.values()) scene.remove(m);
  meshes.clear();

  for (const item of data.blocks) {
    const [x, y, z, t] = item;
    setBlock(x, y, z, t);
  }

  if (Array.isArray(data.player)) {
    controls.getObject().position.set(data.player[0], data.player[1], data.player[2]);
  }
  statusEl.textContent = `Loaded save. Blocks: ${data.blocks.length}`;
  return true;
}

// autosave
let lastSave = 0;

// ---------- Block interaction (break/place) ----------
const raycaster = new THREE.Raycaster();
function rayTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = RAY_DIST;

  const hit = raycaster.intersectObjects([...meshes.values()], false)[0];
  if (!hit) return null;

  const { x, y, z } = hit.object.userData;
  const n = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
  return { x, y, z, nx: Math.round(n.x), ny: Math.round(n.y), nz: Math.round(n.z) };
}

function tryPlace(target, type = BLOCK.DIRT) {
  if (!target) return;

  const px = target.x + target.nx;
  const py = target.y + target.ny;
  const pz = target.z + target.nz;

  // don't place inside player
  const p = controls.getObject().position;
  const fx = Math.floor(p.x);
  const fy = Math.floor(p.y);
  const fz = Math.floor(p.z);
  const headY = Math.floor(p.y + PLAYER_HEIGHT);

  const wouldCollide =
    (px === fx && pz === fz && (py === fy || py === headY));

  if (wouldCollide) return;

  setBlock(px, py, pz, type);
}

addEventListener("mousedown", (e) => {
  if (!controls.isLocked) return;
  const t = rayTarget();

  if (e.button === 0) { // LMB break
    if (t) setBlock(t.x, t.y, t.z, BLOCK.AIR);
  } else if (e.button === 2) { // RMB place
    // place dirt by default (you can add hotbar later)
    if (t) tryPlace(t, BLOCK.DIRT);
  }
});

// ---------- Simple movement ----------
let velY = 0;
let onGround = false;

function solidAt(x, y, z) {
  return getBlock(x, y, z) !== BLOCK.AIR;
}

function resolveGround(pos) {
  // Check block directly under feet (simple)
  const bx = Math.floor(pos.x);
  const by = Math.floor(pos.y - 0.05);
  const bz = Math.floor(pos.z);

  if (solidAt(bx, by, bz)) {
    onGround = true;
    pos.y = by + 1.01;
    velY = Math.max(velY, 0);
  } else {
    onGround = false;
  }
}

const SPEED = 9;
const GRAV = 28;
const JUMP = 11;

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (controls.isLocked) {
    const obj = controls.getObject();

    // forward/right vectors from camera
    const dir = new THREE.Vector3();
    controls.getDirection(dir);
    dir.y = 0;
    dir.normalize();

    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).negate();

    let mx = 0, mz = 0;
    if (keys.has("KeyW")) { mx += dir.x; mz += dir.z; }
    if (keys.has("KeyS")) { mx -= dir.x; mz -= dir.z; }
    if (keys.has("KeyA")) { mx += right.x; mz += right.z; }
    if (keys.has("KeyD")) { mx -= right.x; mz -= right.z; }

    const len = Math.hypot(mx, mz) || 1;
    mx /= len; mz /= len;

    obj.position.x += mx * SPEED * dt;
    obj.position.z += mz * SPEED * dt;

    // gravity + jump
    velY -= GRAV * dt;
    if (keys.has("Space") && onGround) {
      velY = JUMP;
      onGround = false;
    }
    obj.position.y += velY * dt;

    resolveGround(obj.position);

    // fall reset
    if (obj.position.y < -30) {
      obj.position.set(0, 4, 10);
      velY = 0;
    }

    // autosave
    const now = performance.now();
    if (now - lastSave > AUTOSAVE_MS) {
      saveWorld();
      lastSave = now;
    }

    // status text
    const t = rayTarget();
    statusEl.textContent = t
      ? `Target: (${t.x},${t.y},${t.z})  | Blocks: ${blocks.size}`
      : `Blocks: ${blocks.size}`;
  }

  renderer.render(scene, camera);
}

function init() {
  statusEl.textContent = "Loading world…";

  const ok = loadWorld();
  if (!ok) genDefaultWorld();

  // controls: save/load/reset hotkeys
  addEventListener("keydown", (e) => {
    if (e.code === "KeyK") saveWorld();       // force save
    if (e.code === "KeyL") loadWorld();       // force load
    if (e.code === "KeyR") {                 // reset world
      localStorage.removeItem(SAVE_KEY);
      genDefaultWorld();
      saveWorld();
    }
  });

  statusEl.textContent = "Ready. Click to start.";
  tick();
}

init();

// Resize
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
