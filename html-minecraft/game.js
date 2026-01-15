const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4
};

const blockGeo = new THREE.BoxGeometry(1,1,1);
const blocks = new Map();
const meshes = new Map();

function k(x,y,z){ return `${x},${y},${z}`; }

function blockMat(type){
  const colors = {
    1:0x4CAF50,
    2:0x8B5A2B,
    3:0x888888,
    4:0xA47551
  };
  return new THREE.MeshLambertMaterial({color:colors[type]});
}

function setBlock(x,y,z,type){
  const key = k(x,y,z);

  if(type === BLOCK.AIR){
    if(meshes.has(key)) scene.remove(meshes.get(key));
    meshes.delete(key);
    blocks.delete(key);
    return;
  }

  blocks.set(key,type);

  const m = new THREE.Mesh(blockGeo, blockMat(type));
  m.position.set(x+.5,y+.5,z+.5);
  m.userData={x,y,z};
  scene.add(m);
  meshes.set(key,m);
}
