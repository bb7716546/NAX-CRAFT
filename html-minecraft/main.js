console.log("NAX-CRAFT main.js LOADED");

// THREE.JS IMPORT (CDN — REQUIRED)
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { PointerLockControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// CAMERA
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// LIGHT
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
scene.add(sun);

// CONTROLS
const controls = new PointerLockControls(camera, document.body);
camera.position.set(0, 3, 6);
scene.add(controls.getObject());

document.addEventListener("click", () => {
  controls.lock();
});

// BLOCKS
const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const grassMat = new THREE.MeshStandardMaterial({ color: 0x3cb043 });
const dirtMat  = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });

// GROUND
for (let x = -10; x <= 10; x++) {
  for (let z = -10; z <= 10; z++) {
    const grass = new THREE.Mesh(blockGeo, grassMat);
    grass.position.set(x + 0.5, 0.5, z + 0.5);
    scene.add(grass);

    const dirt = new THREE.Mesh(blockGeo, dirtMat);
    dirt.position.set(x + 0.5, -0.5, z + 0.5);
    scene.add(dirt);
  }
}

// BASIC MOVEMENT
const keys = {};
document.addEventListener("keydown", e => keys[e.code] = true);
document.addEventListener("keyup", e => keys[e.code] = false);

const velocity = new THREE.Vector3();
const speed = 8;
const gravity = 20;
let onGround = false;

function animate() {
  requestAnimationFrame(animate);

  if (controls.isLocked) {
    const dir = new THREE.Vector3();
    controls.getDirection(dir);
    dir.y = 0;
    dir.normalize();

    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));

    velocity.x = 0;
    velocity.z = 0;

    if (keys["KeyW"]) velocity.addScaledVector(dir, speed);
    if (keys["KeyS"]) velocity.addScaledVector(dir, -speed);
    if (keys["KeyA"]) velocity.addScaledVector(right, speed);
    if (keys["KeyD"]) velocity.addScaledVector(right, -speed);

    velocity.y -= gravity * 0.016;

    if (keys["Space"] && onGround) {
      velocity.y = 8;
      onGround = false;
    }

    controls.getObject().position.addScaledVector(velocity, 0.016);

    if (controls.getObject().position.y < 2) {
      controls.getObject().position.y = 2;
      velocity.y = 0;
      onGround = true;
    }
  }

  renderer.render(scene, camera);
}

animate();

// RESIZE
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
