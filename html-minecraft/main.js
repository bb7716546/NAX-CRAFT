import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { PointerLockControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

const statusEl = document.getElementById("status");

// Crosshair
const crosshair = document.createElement("div");
crosshair.className = "crosshair";
document.body.appendChild(crosshair);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky-ish

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(10, 20, 10);
scene.add(dir);

// Controls (FPS)
const controls = new PointerLockControls(camera, document.body);
camera.position.set(0, 3, 8);

document.addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

controls.addEventListener("lock", () => (statusEl.textContent = "Mouse locked ✅"));
controls.addEventListener("unlock", () => (statusEl.textContent = "Mouse unlocked ❌"));

scene.add(controls.getObject());

// Simple physics-ish movement
const keys = new Set();
document.addEventListener("keydown", (e) => keys.add(e.code));
document.addEventListener("keyup", (e) => keys.delete(e.code));

let velocity = new THREE.Vector3();
let onGround = false;
const gravity = 25;
const walkSpeed = 10;
const jumpSpeed = 10;

// Voxel world storage
// Key format: "x,y,z" => blockType (1 = dirt, 2 = grass, etc)
const blocks = new Map();

function k(x, y, z) {
  return `${x},${y},${z}`;
}

// Block mesh instancing (simple: one mesh per block for starter)
const blockGeo = new THREE.BoxGeometry(1, 1, 1);

const matDirt = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
const matGrass = new THREE.MeshStandardMaterial({ color: 0x3cb043 });
const matStone = new THREE.MeshStandardMaterial({ color: 0x808080 });

function matFor(type) {
  if (type === 2) return matGrass;
  if (type === 3) return matStone;
  return matDirt;
}

const blockMeshes = new Map(); // key => mesh

function addBlock(x, y, z, type = 1) {
  const key = k(x, y, z);
  if (blocks.has(key)) return;

  blocks.set(key, type);

  const mesh = new THREE.Mesh(blockGeo, matFor(type));
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.userData = { x, y, z };
  scene.add(mesh);

  blockMeshes.set(key, mesh);
}

function removeBlock(x, y, z) {
  const key = k(x, y, z);
  const mesh = blockMeshes.get(key);
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose(); // safe because each mesh shares geo? (we used shared geo)
    // NOTE: we shared geometry; don’t dispose it per-block in a real project.
  }
  blockMeshes.delete(key);
  blocks.delete(key);
}

// World gen (flat-ish)
function genWorld() {
  const size = 20;
  for (let x = -size; x <= size; x++) {
    for (let z = -size; z <= size; z++) {
      addBlock(x, 0, z, 2);      // grass top
      addBlock(x, -1, z, 1);     // dirt
      addBlock(x, -2, z, 3);     // stone
    }
  }

  // a few pillars
  for (let i = 0; i < 12; i++) {
    const px = Math.floor((Math.random() * 12) - 6);
    const pz = Math.floor((Math.random() * 12) - 6);
    const h = 1 + Math.floor(Math.random() * 5);
    for (let y = 1; y <= h; y++) addBlock(px, y, pz, 3);
  }
}
genWorld();

// Raycast for block interactions
const raycaster = new THREE.Raycaster();
const hitNormal = new THREE.Vector3();

function getTargetBlock(maxDist = 6) {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  raycaster.far = maxDist;

  const meshes = Array.from(blockMeshes.values());
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;

  const hit = hits[0];
  hitNormal.copy(hit.face?.normal ?? new THREE.Vector3(0, 1, 0));

  const obj = hit.object;
  const { x, y, z } = obj.userData;
  return { x, y, z, normal: hitNormal.clone() };
}

function placeNextTo(target) {
  if (!target) return;
  const nx = target.x + Math.round(target.normal.x);
  const ny = target.y + Math.round(target.normal.y);
  const nz = target.z + Math.round(target.normal.z);

  // prevent placing inside player head-ish
  const p = controls.getObject().position;
  const px = Math.floor(p.x);
  const py = Math.floor(p.y);
  const pz = Math.floor(p.z);

  if (nx === px && nz === pz && (ny === py || ny === py + 1)) return;

  addBlock(nx, ny, nz, 1);
}

// Mouse actions
document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("mousedown", (e) => {
  if (!controls.isLocked) return;

  const target = getTargetBlock();
  if (e.button === 0) {
    // LMB break
    if (target) removeBlock(target.x, target.y, target.z);
  } else if (e.button === 2) {
    // RMB place
    placeNextTo(target);
  }
});

// Super simple collision with ground (starter)
function isSolidAt(x, y, z) {
  return blocks.has(k(x, y, z));
}

// Very rough capsule-ish collision for player
function resolvePlayerCollisions(pos) {
  // Player feet at pos.y, body height ~1.8
  const r = 0.3;
  const height = 1.8;

  // sample a few points around player in block grid
  const samples = [
    [0, 0], [r, 0], [-r, 0], [0, r], [0, -r],
    [r, r], [r, -r], [-r, r], [-r, -r],
  ];

  // ground check
  onGround = false;
  for (const [dx, dz] of samples) {
    const bx = Math.floor(pos.x + dx);
    const bz = Math.floor(pos.z + dz);
    const byBelow = Math.floor(pos.y - 0.01);

    if (isSolidAt(bx, byBelow, bz)) {
      onGround = true;
      pos.y = byBelow + 1; // stand on top
      velocity.y = Math.max(velocity.y, 0);
      break;
    }
  }

  // head bump
  for (const [dx, dz] of samples) {
    const bx = Math.floor(pos.x + dx);
    const bz = Math.floor(pos.z + dz);
    const byHead = Math.floor(pos.y + height);

    if (isSolidAt(bx, byHead, bz)) {
      // push down slightly
      pos.y = byHead - height;
      velocity.y = Math.min(velocity.y, 0);
      break;
    }
  }
}

// Animation loop
let last = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (controls.isLocked) {
    // movement input
    const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);

    const wish = new THREE.Vector3(strafe, 0, forward).normalize();

    // convert wish vector to camera space
    const dir = new THREE.Vector3();
    controls.getDirection(dir); // camera forward
    const forwardVec = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const rightVec = new THREE.Vector3().crossVectors(forwardVec, new THREE.Vector3(0, 1, 0)).normalize().negate();

    const move = new THREE.Vector3()
      .addScaledVector(forwardVec, wish.z)
      .addScaledVector(rightVec, wish.x)
      .normalize();

    velocity.x = move.x * w*
