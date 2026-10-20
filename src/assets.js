// Loads every model once and hands out clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const LIST = {
  // characters (rigged, T-pose)
  alp: 'chars/peasant_1.glb', bars: 'chars/peasant_5.glb', kacin: 'chars/peasant_3.glb',
  koylu2: 'chars/peasant_2.glb', koylu4: 'chars/peasant_4.glb', koylu6: 'chars/peasant_6.glb',
  asker1: 'chars/city_dwellers_1.glb', kutlu: 'chars/king.glb', tomris: 'chars/rich_citizens_2.glb', asker2: 'chars/rich_citizens_1.glb', yuzbasi: 'chars/rich_citizens_3.glb',
  // weapons / gear
  hammer: 'weapons/hammer_1.glb', gokcekic: 'weapons/hammer_12.glb', hammer10: 'weapons/hammer_10.glb',
  helmet1: 'weapons/helmet1.glb', helmet2: 'weapons/helmet2.glb', helmet3: 'weapons/helmet3.glb',
  sword: 'weapons/sword.glb', shortsword: 'weapons/shortsword.glb', shoulderpads: 'weapons/shoulderpads.glb',
  house15: 'town/house_15.glb', house03: 'town/house_03.glb', house04: 'town/house_04.glb',
  palisade: 'castle/wall-narrow-wood.glb', tower: 'castle/tower-square.glb', towerRoof: 'castle/tower-hexagon-roof.glb', banner: 'castle/flag-banner-long.glb', ship2: 'ships/destroyer_02.glb', cwall: 'castle/wall.glb', cwallCorner: 'castle/wall-corner.glb', cgate: 'castle/gate.glb',
  treeL: 'trees/tree-large.glb', treeS: 'trees/tree-small.glb', treeLog: 'trees/tree-log.glb', rocksL: 'trees/rocks-large.glb', rocksS: 'trees/rocks-small.glb',
  // horses (animated)
  horse1: 'horses/horse-01.glb', horse2: 'horses/horse-02.glb', horse4: 'horses/horse-04.glb',
  // yurts
  yurt_beyaz: 'yurts/yurt_beyaz.glb', yurt_kahve: 'yurts/yurt_kahve.glb', yurt_kucuk: 'yurts/yurt_kucuk.glb', otag: 'yurts/otag_kagan.glb',
  // props
  well: 'props/well.glb', hay1: 'props/haystack_01.glb', hay2: 'props/haystack_02.glb', hay3: 'props/haystack_03.glb',
  barrel: 'props/barrel.glb', barrel_broken: 'props/barrel_broken.glb', chest: 'props/chest.glb', firewood: 'props/firewood.glb',
  clothesline: 'props/clothesline.glb', bucket: 'props/bucket.glb', trough: 'props/trough.glb', stump: 'props/stump.glb',
  bench: 'props/bench.glb', box: 'props/box.glb', pot1: 'props/pot_01.glb', pot2: 'props/pot_02.glb', rake: 'props/rake.glb',
  scythe: 'props/scythe.glb', fork: 'props/fork.glb', axe: 'props/axe.glb', signpost: 'props/signpost_01.glb',
  basin: 'props/basin.glb', canopy: 'props/canopy.glb',
  // sky ship
  ship: 'ships/destroyer_01.glb',
};

export class Assets {
  constructor(base = 'assets/') { this.base = base; this.g = {}; }

  async load(onProgress) {
    const loader = new GLTFLoader();
    const keys = Object.keys(LIST);
    let done = 0;
    // On claude.ai artifacts .glb is not a served type, so the build ships each
    // model as base64 text (name.glb.txt) and we decode it here.
    const fetchModel = async path => {
      if (!window.ASSET_B64) return loader.loadAsync(path);
      const txt = await (await fetch(path + '.txt')).text();
      const bin = atob(txt.trim()), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return loader.parseAsync(u8.buffer, path.slice(0, path.lastIndexOf('/') + 1));
    };
    await Promise.all(keys.map(k => fetchModel(this.base + LIST[k]).then(g => {
      this.g[k] = g;
      g.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 4; }
            if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.3);
          }
        }
      });
      onProgress && onProgress(++done / keys.length, k);
    })));
  }

  // houses ship without their texture; they all share one small atlas
  applyTownAtlas() {
    const tex = new THREE.TextureLoader().load(this.base + 'town/atlas.png');
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.flipY = false;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    for (const k of ['house15', 'house03', 'house04']) this.g[k] && this.g[k].scene.traverse(o => { if (o.isMesh) o.material = mat; });
  }

  // static prop clone (shares geometry and materials)
  prop(k) { return this.g[k].scene.clone(true); }

  // rigged clone with its own skeleton; materials cloned so we can flash them
  char(k) {
    const m = SkeletonUtils.clone(this.g[k].scene);
    m.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.frustumCulled = false;
      }
    });
    return m;
  }

  anims(k) { return this.g[k].animations; }
}
