// استوديو السينما 3D — محرك المشاهد والشخصيات
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const S = {
  filmDur: 30, time: 0, playing: false,
  objects: [],   // عناصر المشهد
  shots: [],     // اللقطات
  sfx: [],       // مؤثرات صوتية {id,time,type}
  music: { mood: 'epic', on: true, volume: 0.5 },
  sun: { tod: 0.35, intensity: 1.1 },   // time of day 0..1
  ambient: 0.55,
  spots: [],     // {id,color,intensity,pos:[x,y,z],target:[x,y,z]}
  selected: null,
  grade: 0,          // فلتر لوني: 0 بدون، 1 سيبيا، 2 أبيض وأسود، 3 مشبع، 4 غروب دافئ
  title: 'فيلمي القصير'
};
let nid = 1;
export const genId = () => 'o' + (nid++);

// ---------- فلاتر لونية (تظهر في التصدير) ----------
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uMode: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform int uMode; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      if (uMode == 1) col = vec3(dot(col, vec3(.393,.769,.189)), dot(col, vec3(.349,.686,.168)), dot(col, vec3(.272,.534,.131))) * 0.9;
      else if (uMode == 2) { float g = dot(col, vec3(.299,.587,.114)); col = vec3(g * g * 0.4 + g * 0.75); }
      else if (uMode == 3) { float g = dot(col, vec3(.299,.587,.114)); col = clamp(mix(vec3(g), col, 1.65), 0., 1.) * 1.04; }
      else if (uMode == 4) col *= vec3(1.14, 1.0, 0.82);
      gl_FragColor = vec4(col, c.a);
    }`
};
let composer = null, gradePass = null, renderPass = null;
function ensureComposer() {
  if (composer) return;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
}
function render3D(cam) {
  if (S.grade) {
    ensureComposer();
    renderPass.camera = cam;
    gradePass.uniforms.uMode.value = S.grade;
    composer.render();
  } else renderer.render(scene, cam);
}
export const GRADES = [[0, 'بدون 🎞️'], [1, 'سيبيا كلاسيك 📜'], [2, 'أبيض وأسود 🎬'], [3, 'ألوان مشبعة 🌈'], [4, 'غروب دافئ 🌇']];

// ---------- renderer / scene ----------
const canvas = document.getElementById('c3d');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x87b5e0, 60, 220);

export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
camera.position.set(14, 9, 16);
export const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 2; controls.maxDistance = 120;

// ---------- lights ----------
export const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 200;
scene.add(sun); scene.add(sun.target);
export const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, S.ambient);
scene.add(hemi);

// ---------- ground & sky ----------
const ground = new THREE.Mesh(
  new THREE.CylinderGeometry(150, 150, 1, 48),
  new THREE.MeshStandardMaterial({ color: 0xd9c391, roughness: 1 })
);
ground.position.y = -0.5; ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.PolarGridHelper(150, 24, 8, 64, 0x000000, 0x9a8a68);
grid.position.y = 0.02; grid.material.opacity = 0.25; grid.material.transparent = true;
scene.add(grid);

function skyColor(tod) {
  // 0 فجر .. 0.25 ظهر .. 0.5 غروب .. 0.75 ليل
  const day = new THREE.Color(0x87b5e0), dusk = new THREE.Color(0xe88a4e),
        night = new THREE.Color(0x0b1030), dawn = new THREE.Color(0xd9a0a8);
  let c;
  if (tod < 0.25) c = dawn.clone().lerp(day, tod / 0.25);
  else if (tod < 0.5) c = day.clone().lerp(dusk, (tod - 0.25) / 0.25);
  else if (tod < 0.75) c = dusk.clone().lerp(night, (tod - 0.5) / 0.25);
  else c = night.clone().lerp(dawn, (tod - 0.75) / 0.25);
  return c;
}
export function applySun() {
  const tod = S.sun.tod;
  const ang = tod * Math.PI * 2 - Math.PI / 2;
  const r = 80;
  sun.position.set(Math.cos(ang) * r, Math.max(4, Math.sin(ang) * r), 30);
  const dayness = Math.max(0, Math.sin(ang));
  const c = skyColor(tod);
  scene.background = c; scene.fog.color = c;
  sun.intensity = S.sun.intensity * (0.15 + dayness);
  sun.color.setHSL(0.09 + 0.04 * dayness, 0.5, 0.5 + 0.4 * dayness);
  hemi.intensity = S.ambient * (0.25 + dayness * 0.9);
  stars.visible = tod > 0.55 && tod < 0.95;
}
// نجوم
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.48, r = 260;
    pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r + 5, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
scene.add(stars);

// ---------- خامات ----------
const MAT = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// ---------- الشخصيات ----------
export function makeCharacter(opts = {}) {
  const skin = opts.skin ?? 0xe8b88a, shirt = opts.shirt ?? 0x3a6bd6, pants = opts.pants ?? 0x2c2f45;
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.42, 0.7, 6, 14), MAT(shirt), 0, 1.25, 0);
  const head = mesh(new THREE.SphereGeometry(0.34, 20, 16), MAT(skin), 0, 2.15, 0);
  // عيون
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
  const e1 = mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeM, -0.12, 2.2, 0.29, false);
  const e2 = e1.clone(); e2.position.x = 0.12;
  // شعر/غطاء رأس
  const hair = mesh(new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), MAT(opts.hair ?? 0x2a2018), 0, 2.18, 0);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.52, 1.75, 0); armR.position.set(0.52, 1.75, 0);
  const armGeo = new THREE.CapsuleGeometry(0.13, 0.62, 4, 10);
  armL.add(mesh(armGeo, MAT(shirt), 0, -0.4, 0));
  armR.add(mesh(armGeo, MAT(shirt), 0, -0.4, 0));
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.2, 0.78, 0); legR.position.set(0.2, 0.78, 0);
  const legGeo = new THREE.CapsuleGeometry(0.15, 0.6, 4, 10);
  legL.add(mesh(legGeo, MAT(pants), 0, -0.38, 0));
  legR.add(mesh(legGeo, MAT(pants), 0, -0.38, 0));
  g.add(body, head, e1, e2, hair, armL, armR, legL, legR);
  g.userData.parts = { body, head, armL, armR, legL, legR };
  g.traverse(m => { m.userData.objRoot = g; });
  return g;
}

// ---------- الديكور ----------
export const PROP_DEFS = {
  pyramid: { name: 'هرم', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(6, 7, 4), MAT(0xd8b878), 0, 3.5, 0));
    g.children[0].rotation.y = Math.PI / 4;
    return g;
  }},
  palm: { name: 'نخلة', make() {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.3, 4.4, 8), MAT(0x8a6a42), 0, 2.2, 0);
    trunk.rotation.z = 0.08; g.add(trunk);
    for (let i = 0; i < 7; i++) {
      const leaf = mesh(new THREE.ConeGeometry(0.35, 2.6, 4), MAT(0x3f8a3f), 0, 4.6, 0);
      leaf.rotation.z = Math.PI / 2.3;
      leaf.rotation.y = (i / 7) * Math.PI * 2;
      leaf.position.y = 4.5;
      leaf.translateX(1.0);
      g.add(leaf);
    }
    return g;
  }},
  column: { name: 'عمود فرعوني', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.62, 5, 12), MAT(0xd0b98a), 0, 2.5, 0));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), MAT(0xc4ac7c), 0, 5.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.4, 12), MAT(0xc4ac7c), 0, 0.2, 0));
    return g;
  }},
  sphinx: { name: 'تمثال', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(3.2, 1.1, 1.2), MAT(0xd8b878), 0, 0.55, 0));
    g.add(mesh(new THREE.SphereGeometry(0.62, 14, 12), MAT(0xd8b878), 1.5, 1.5, 0));
    g.add(mesh(new THREE.ConeGeometry(0.66, 0.9, 4), MAT(0xc8a868), 1.5, 2.1, 0));
    return g;
  }},
  tree: { name: 'شجرة', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 8), MAT(0x6a4a2a), 0, 0.9, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(1.4, 1), MAT(0x4a9a4a), 0, 2.6, 0));
    return g;
  }},
  rock: { name: 'صخرة', make() {
    return mesh(new THREE.DodecahedronGeometry(1, 0), MAT(0x8a8578), 0, 0.6, 0) && (() => {
      const g = new THREE.Group();
      const r = mesh(new THREE.DodecahedronGeometry(1, 0), MAT(0x8a8578), 0, 0.6, 0);
      r.scale.set(1, 0.7, 0.8); g.add(r); return g;
    })();
  }},
  house: { name: 'بيت', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(3.4, 2.4, 3), MAT(0xe0cfa8), 0, 1.2, 0));
    const roof = mesh(new THREE.ConeGeometry(2.7, 1.4, 4), MAT(0xa85f3f), 0, 3.1, 0);
    roof.rotation.y = Math.PI / 4; g.add(roof);
    g.add(mesh(new THREE.BoxGeometry(0.8, 1.4, 0.15), MAT(0x5a3a22), 0, 0.7, 1.53));
    return g;
  }},
  tent: { name: 'خيمة', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.ConeGeometry(2.2, 2.6, 6), MAT(0xb05a3c), 0, 1.3, 0));
    return g;
  }},
  fire: { name: 'نار مخيم', make() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const log = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), MAT(0x4a3018), 0, 0.12, 0);
      log.rotation.z = Math.PI / 2; log.rotation.y = i * 1.25; g.add(log);
    }
    const flame = mesh(new THREE.ConeGeometry(0.35, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8a2a }), 0, 0.6, 0, false);
    flame.name = 'flame'; g.add(flame);
    const l = new THREE.PointLight(0xff9540, 2.2, 12, 1.6); l.position.y = 0.9; l.name = 'firelight';
    g.add(l);
    return g;
  }},
  well: { name: 'بئر', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(1, 1.1, 0.9, 12, 1, true), MAT(0x9a9078), 0, 0.45, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), MAT(0x6a4a2a), -0.9, 1.4, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), MAT(0x6a4a2a), 0.9, 1.4, 0));
    const roof = mesh(new THREE.ConeGeometry(1.5, 0.8, 4), MAT(0xa85f3f), 0, 2.8, 0);
    roof.rotation.y = Math.PI / 4; g.add(roof);
    return g;
  }},
  obelisk: { name: 'مسلة', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.1, 6.5, 1.1), MAT(0xc9b184), 0, 3.25, 0));
    const tip = mesh(new THREE.ConeGeometry(0.78, 1, 4), MAT(0xd9c391), 0, 7, 0);
    tip.rotation.y = Math.PI / 4; g.add(tip);
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), MAT(0xb89a6a), 0, 0.25, 0));
    return g;
  }},
  boat: { name: 'مركب شراعي', make() {
    const g = new THREE.Group();
    const hull = mesh(new THREE.CylinderGeometry(0.9, 0.5, 4.6, 8, 1), MAT(0x7a4a26), 0, 0.4, 0);
    hull.rotation.z = Math.PI / 2; hull.scale.z = 0.55; g.add(hull);
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 6), MAT(0x5a3a1a), 0, 2.6, 0));
    const sail = mesh(new THREE.ConeGeometry(1.6, 3.4, 3), new THREE.MeshStandardMaterial({ color: 0xf2ead8, side: THREE.DoubleSide }), 0, 3, 0);
    sail.scale.z = 0.05; g.add(sail);
    return g;
  }},
  arch: { name: 'أطلال أثرية', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.8, 3.4, 0.8), MAT(0xc4ae82), -1.6, 1.7, 0));
    g.add(mesh(new THREE.BoxGeometry(0.8, 2.6, 0.8), MAT(0xbaa474), 1.6, 1.3, 0));
    const top = mesh(new THREE.BoxGeometry(4.2, 0.6, 0.9), MAT(0xc4ae82), 0, 3.5, 0);
    top.rotation.z = 0.06; g.add(top);
    g.add(mesh(new THREE.DodecahedronGeometry(0.5, 0), MAT(0xb09a6a), 2.6, 0.35, 0.4));
    return g;
  }},
  streetlamp: { name: 'عمود نور', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.09, 0.13, 4.6, 8), MAT(0x3a3f4a), 0, 2.3, 0));
    const arm = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), MAT(0x3a3f4a), 0.5, 4.55, 0);
    arm.rotation.z = Math.PI / 2; g.add(arm);
    g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), 1.05, 4.45, 0, false));
    const l = new THREE.PointLight(0xffdf90, 1.6, 14, 1.8); l.position.set(1.05, 4.3, 0); l.name = 'firelight';
    g.add(l);
    return g;
  }},
  stall: { name: 'كشك سوق', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(2.6, 0.9, 1.4), MAT(0x8a5a30), 0, 0.45, 0));
    for (const dx of [-1.2, 1.2]) for (const dz of [-0.6, 0.6])
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), MAT(0x6a4a2a), dx, 1.2, dz));
    const roof = mesh(new THREE.BoxGeometry(3, 0.12, 1.9), new THREE.MeshStandardMaterial({ color: 0xd4504a }), 0, 2.45, 0);
    roof.rotation.x = 0.08; g.add(roof);
    for (let i = 0; i < 6; i++)
      g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), MAT([0xe8842a, 0xc23a3a, 0x3a8a3a][i % 3]), -1 + (i % 3) * 0.5, 1.02 + Math.floor(i / 3) * 0.28, 0));
    return g;
  }},
  camel: { name: 'جمل', make() {
    const g = new THREE.Group();
    const body = mesh(new THREE.SphereGeometry(0.9, 12, 10), MAT(0xc9985e), 0, 1.35, 0);
    body.scale.set(1.5, 0.95, 0.8); g.add(body);
    g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), MAT(0xb8874e), -0.1, 2, 0));
    const neck = mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 8), MAT(0xc9985e), 1.15, 2.3, 0);
    neck.rotation.z = -0.5; g.add(neck);
    const head = mesh(new THREE.BoxGeometry(0.55, 0.3, 0.28), MAT(0xc9985e), 1.75, 2.95, 0);
    head.rotation.z = -0.15; g.add(head);
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.3, 0.3])
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 1.3, 6), MAT(0xb8874e), dx, 0.65, dz));
    return g;
  }},
  ball: { name: 'كورة', make() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), MAT(0xf2ead8), 0, 0.32, 0));
    return g;
  }},
  bike: { name: 'موتوسيكل', make() {
    const g = new THREE.Group();
    const w1 = mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 16), MAT(0x1a1c22), -0.85, 0.55, 0);
    const w2 = mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 16), MAT(0x1a1c22), 0.95, 0.55, 0);
    g.add(w1); g.add(w2);
    const body = mesh(new THREE.BoxGeometry(1.6, 0.4, 0.5), MAT(0xc23a3a), 0.1, 0.95, 0);
    body.rotation.z = -0.06; g.add(body);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.28, 0.44), MAT(0x2a2e3a), -0.5, 1.2, 0));
    const bar = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), MAT(0x888), 0.95, 1.45, 0);
    bar.rotation.x = Math.PI / 2; g.add(bar);
    const head = mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), 1.35, 1.15, 0, false);
    g.add(head);
    return g;
  }},
};

// ---------- إدارة العناصر ----------
export function addCharacter(name, opts = {}, x = 0, z = 0) {
  const group = makeCharacter(opts);
  group.position.set(x, 0, z);
  scene.add(group);
  const o = {
    id: genId(), kind: 'char', name: name || ('ممثل ' + nid),
    colors: { skin: opts.skin ?? 0xe8b88a, shirt: opts.shirt ?? 0x3a6bd6, pants: opts.pants ?? 0x2c2f45, hair: opts.hair ?? 0x2a2018 },
    group, track: { keys: [{ t: 0, x, y: 0, z, ry: 0 }], actions: [] }
  };
  S.objects.push(o);
  return o;
}
export function addProp(type, x = 0, z = 0, scale = 1) {
  const def = PROP_DEFS[type]; if (!def) return null;
  const group = def.make();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  group.traverse(m => { m.userData.objRoot = group; });
  scene.add(group);
  const o = {
    id: genId(), kind: 'prop', propType: type, name: def.name,
    group, scale, track: { keys: [{ t: 0, x, y: 0, z, ry: 0 }], actions: [] }
  };
  S.objects.push(o);
  return o;
}
export function removeObject(id) {
  const i = S.objects.findIndex(o => o.id === id);
  if (i < 0) return;
  scene.remove(S.objects[i].group);
  S.objects.splice(i, 1);
  if (S.selected === id) S.selected = null;
}
export const getObj = id => S.objects.find(o => o.id === id);

// ---------- محرك الكي فريم ----------
function lerp(a, b, k) { return a + (b - a) * k; }
function smooth(k) { return k * k * (3 - 2 * k); }

export function addKey(o, t, x, z, ry) {
  const keys = o.track.keys;
  const ex = keys.find(k => Math.abs(k.t - t) < 0.05);
  if (ex) { ex.x = x; ex.z = z; ex.y = 0; if (ry !== undefined) ex.ry = ry; }
  else keys.push({ t, x, y: 0, z, ry: ry ?? 0 });
  keys.sort((a, b) => a.t - b.t);
}
export function sampleTrack(o, t) {
  const keys = o.track.keys;
  if (!keys.length) return { x: 0, y: 0, z: 0, ry: 0 };
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = smooth((t - a.t) / Math.max(0.001, b.t - a.t));
      return { x: lerp(a.x, b.x, k), y: 0, z: lerp(a.z, b.z, k), ry: lerp(a.ry, b.ry, k) };
    }
  }
  return keys[keys.length - 1];
}

// تقييم عنصر في لحظة: الكي فريم + أفعال (مشي/إيماءة)
export function evalObject(o, t) {
  let p = { ...sampleTrack(o, t) };
  let walking = false, gesture = null, speed = 0;
  for (const a of o.track.actions) {
    if (a.type === 'walk' && t >= a.t0 && t <= a.t1) {
      const k = smooth((t - a.t0) / Math.max(0.001, a.t1 - a.t0));
      p = { x: lerp(a.fx, a.tx, k), y: 0, z: lerp(a.fz, a.tz, k), ry: Math.atan2(a.tx - a.fx, a.tz - a.fz) };
      walking = true;
      speed = Math.hypot(a.tx - a.fx, a.tz - a.fz) / Math.max(0.001, a.t1 - a.t0);
    } else if (a.type === 'gesture' && t >= a.time && t <= a.time + a.dur) {
      gesture = { name: a.name, k: (t - a.time) / a.dur };
    }
  }
  return { p, walking, gesture, speed };
}

function poseCharacter(o, t) {
  const { p, walking, gesture, speed } = evalObject(o, t);
  const g = o.group, parts = g.userData.parts;
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.ry || 0;
  const running = walking && speed > 2.2;
  const ph = t * (running ? 11 : 7);
  if (walking) {
    const amp = running ? 1.0 : 0.7;
    parts.legL.rotation.x = Math.sin(ph) * amp;
    parts.legR.rotation.x = -Math.sin(ph) * amp;
    parts.armL.rotation.x = -Math.sin(ph) * (amp - 0.15);
    parts.armR.rotation.x = Math.sin(ph) * (amp - 0.15);
    parts.body.rotation.x = running ? 0.22 : 0;
    parts.body.position.y = 1.25 + Math.abs(Math.sin(ph)) * (running ? 0.09 : 0.05);
  } else {
    parts.legL.rotation.x *= 0.8; parts.legR.rotation.x *= 0.8;
    parts.armL.rotation.x *= 0.8;
    if (!gesture) parts.armR.rotation.x *= 0.8;
    parts.body.position.y = 1.25;
  }
  if (gesture) {
    const k = gesture.k, env = Math.sin(Math.min(1, k) * Math.PI);
    if (gesture.name === 'wave') {
      parts.armR.rotation.x = 0; parts.armR.rotation.z = Math.PI * 0.85;
      parts.armR.rotation.y = Math.sin(k * 18) * 0.5 * env;
    } else if (gesture.name === 'run') {
      const rp = k * 22;
      parts.legL.rotation.x = Math.sin(rp) * 1.05;
      parts.legR.rotation.x = -Math.sin(rp) * 1.05;
      parts.armL.rotation.x = -Math.sin(rp) * 0.9;
      parts.armR.rotation.x = Math.sin(rp) * 0.9;
      parts.body.rotation.x = 0.25 * env;
      parts.body.position.y = 1.25 + Math.abs(Math.sin(rp)) * 0.09;
    } else if (gesture.name === 'jump') {
      g.position.y = Math.sin(k * Math.PI) * 1.2;
      parts.armL.rotation.z = -env * 2.4; parts.armR.rotation.z = env * 2.4;
    } else if (gesture.name === 'sit') {
      parts.legL.rotation.x = -Math.PI / 2 * env; parts.legR.rotation.x = -Math.PI / 2 * env;
      g.position.y -= 0.45 * env;
    } else if (gesture.name === 'bow') {
      parts.body.rotation.x = env * 0.8; parts.head.rotation.x = env * 0.5;
      if (k >= 1) { parts.body.rotation.x = 0; parts.head.rotation.x = 0; }
    } else if (gesture.name === 'point') {
      parts.armR.rotation.x = -Math.PI / 2 * env;
    } else if (gesture.name === 'clap') {
      parts.armL.rotation.x = -Math.PI / 2.4; parts.armR.rotation.x = -Math.PI / 2.4;
      parts.armL.rotation.y = Math.sin(k * 20) * 0.4 * env;
      parts.armR.rotation.y = -Math.sin(k * 20) * 0.4 * env;
    } else if (gesture.name === 'dance') {
      parts.armL.rotation.z = -Math.sin(k * 10) * 1.6 * env - 0.5;
      parts.armR.rotation.z = Math.sin(k * 10) * 1.6 * env + 0.5;
      g.position.y += Math.abs(Math.sin(k * 12)) * 0.25 * env;
      g.rotation.y += Math.sin(k * 6) * 0.5 * env;
      parts.legL.rotation.x = Math.sin(k * 12) * 0.4 * env;
      parts.legR.rotation.x = -Math.sin(k * 12) * 0.4 * env;
    } else if (gesture.name === 'punch') {
      parts.armR.rotation.x = -Math.PI / 2 * Math.sin(k * Math.PI * 3) * env;
      parts.body.rotation.y = Math.sin(k * Math.PI * 3) * 0.3 * env;
    } else if (gesture.name === 'cheer') {
      parts.armL.rotation.z = -2.6 * env; parts.armR.rotation.z = 2.6 * env;
      g.position.y += Math.abs(Math.sin(k * 8)) * 0.35 * env;
    } else if (gesture.name === 'cry') {
      parts.head.rotation.x = 0.4 * env;
      parts.armL.rotation.x = -2.6 * env; parts.armR.rotation.x = -2.6 * env;
      parts.body.position.y = 1.25 - 0.1 * env;
    } else if (gesture.name === 'think') {
      parts.armR.rotation.x = -2.1 * env; parts.armR.rotation.y = 0.6 * env;
      parts.head.rotation.x = 0.18 * env; parts.head.rotation.z = 0.15 * env;
    } else if (gesture.name === 'faint') {
      const f = Math.min(1, k * 1.4);
      g.rotation.z = -f * Math.PI / 2 * 0.94;
      g.position.y -= f * 0.5;
      parts.armL.rotation.x = -0.6 * env; parts.armR.rotation.x = -0.6 * env;
    }
  } else {
    parts.armR.rotation.z *= 0.8; parts.armL.rotation.z *= 0.8;
    parts.body.rotation.x *= 0.7; parts.head.rotation.x *= 0.7;
    parts.body.rotation.y *= 0.7; parts.armR.rotation.y *= 0.8; parts.armL.rotation.y *= 0.8;
  }
}

export const GESTURES = [
  ['wave', '👋 يلوّح'], ['run', '🏃 يجري'], ['jump', '🦘 يقفز'], ['sit', '🪑 يجلس'],
  ['bow', '🙇 ينحني'], ['point', '👉 يشير'], ['clap', '👏 يصفّق'],
  ['dance', '💃 يرقص'], ['punch', '🥊 يلكم'], ['cheer', '🎉 يحتفل'], ['cry', '😢 يبكي'],
  ['think', '🤔 يفكّر'], ['faint', '😵 يغمى عليه']
];

// ---------- اللقطات ----------
export function addShot(name, t0, t1) {
  const sh = { id: genId(), name: name || ('لقطة ' + (S.shots.length + 1)), t0, t1, keys: [] };
  S.shots.push(sh);
  S.shots.sort((a, b) => a.t0 - b.t0);
  return sh;
}
export function removeShot(id) {
  S.shots = S.shots.filter(s => s.id !== id);
}
export function shotKey(sh, t, pos, look, fov, lookObj) {
  const ex = sh.keys.find(k => Math.abs(k.t - t) < 0.05);
  const key = { t, pos: [...pos], look: [...look], fov, lookObj: lookObj || null };
  if (ex) Object.assign(ex, key); else sh.keys.push(key);
  sh.keys.sort((a, b) => a.t - b.t);
}
export function activeShot(t) {
  if (!S.shots.length) return null;
  return S.shots.find(s => t >= s.t0 && t < s.t1) || S.shots[S.shots.length - 1];
}
function sampleShotCam(sh, t) {
  const keys = sh.keys;
  if (!keys.length) return null;
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = smooth((t - a.t) / Math.max(0.001, b.t - a.t));
      return {
        pos: [lerp(a.pos[0], b.pos[0], k), lerp(a.pos[1], b.pos[1], k), lerp(a.pos[2], b.pos[2], k)],
        look: [lerp(a.look[0], b.look[0], k), lerp(a.look[1], b.look[1], k), lerp(a.look[2], b.look[2], k)],
        fov: lerp(a.fov, b.fov, k)
      };
    }
  }
  return keys[keys.length - 1];
}

// ---------- الصوت ----------
export const audio = {
  ctx: null, master: null, musicGain: null, sfxGain: null, dest: null,
  schedTimer: null, nextNoteT: 0, step: 0,
};
export function ensureAudio() {
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 1;
  audio.master.connect(audio.ctx.destination);
  audio.dest = audio.ctx.createMediaStreamDestination();
  audio.master.connect(audio.dest);
  audio.musicGain = audio.ctx.createGain();
  audio.musicGain.gain.value = S.music.volume * 0.5;
  audio.musicGain.connect(audio.master);
  audio.sfxGain = audio.ctx.createGain();
  audio.sfxGain.gain.value = 0.9;
  audio.sfxGain.connect(audio.master);
}
export function applyVolume() {
  if (audio.musicGain) audio.musicGain.gain.value = S.music.volume * 0.5;
}

const MOODS = {
  epic:   { name: 'ملحمي 🥁',  root: 146.83, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 96,  wave: 'sawtooth', bass: true, drums: true },
  calm:   { name: 'هادئ 🌊',   root: 220,    scale: [0, 2, 4, 7, 9],        bpm: 70,  wave: 'sine',     bass: false, drums: false },
  tension:{ name: 'تشويق ⚡',  root: 110,    scale: [0, 1, 3, 5, 6, 8, 10], bpm: 120, wave: 'square',   bass: true, drums: true },
  happy:  { name: 'مبهج 🌞',   root: 261.63, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 110, wave: 'triangle', bass: true, drums: true },
  oriental:{name: 'شرقي 🪕',   root: 196,    scale: [0, 1, 4, 5, 7, 8, 11], bpm: 100, wave: 'sawtooth', bass: true, drums: true },
};
export const MOOD_KEYS = Object.keys(MOODS);
export const moodName = k => MOODS[k]?.name || k;

function note(ctx, dest, freq, t, dur, wave, vol = 0.15) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = wave; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
function drum(ctx, dest, t, type) {
  if (type === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
  } else {
    const len = 0.06, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = type === 'hat' ? 7000 : 1800;
    const g = ctx.createGain(); g.gain.value = type === 'hat' ? 0.12 : 0.25;
    src.connect(f); f.connect(g); g.connect(dest); src.start(t);
  }
}
export function startMusic(filmOffset = 0) {
  ensureAudio();
  stopMusic();
  const mood = MOODS[S.music.mood]; if (!mood || !S.music.on) return;
  const spb = 60 / mood.bpm / 2; // نصف نبضة
  audio.step = Math.floor(filmOffset / spb);
  audio.nextNoteT = audio.ctx.currentTime + 0.06;
  audio.musicT0 = audio.nextNoteT - (filmOffset % spb);
  audio.spb = spb;
  audio.schedTimer = setInterval(() => {
    const ctx = audio.ctx, m = MOODS[S.music.mood];
    while (audio.nextNoteT < ctx.currentTime + 0.35) {
      const t = audio.nextNoteT, st = audio.step;
      const deg = [0, 4, 7, 4, 5, 4, 7, 9][Math.floor(st / 4) % 8] + m.scale[(st * 7) % m.scale.length];
      const f = m.root * Math.pow(2, deg / 12);
      if (st % 2 === 0) note(ctx, audio.musicGain, f * 2, t, 0.22, m.wave, 0.055);
      if (m.bass && st % 4 === 0) note(ctx, audio.musicGain, m.root / 2, t, spb * 3.5, 'triangle', 0.16);
      if (m.drums) {
        if (st % 4 === 0) drum(ctx, audio.musicGain, t, 'kick');
        if (st % 4 === 2) drum(ctx, audio.musicGain, t, 'snare');
        drum(ctx, audio.musicGain, t, 'hat');
      }
      audio.nextNoteT += spb; audio.step++;
    }
  }, 120);
}
export function stopMusic() {
  if (audio.schedTimer) { clearInterval(audio.schedTimer); audio.schedTimer = null; }
}

export const SFX_DEFS = {
  whoosh:  { name: '💨 سووش' }, boom: { name: '💥 انفجار' }, chirp: { name: '🐦 عصافير' },
  steps:   { name: '👣 خطوات' }, wind: { name: '🌬️ رياح' }, bell: { name: '🔔 جرس' },
  magic:   { name: '✨ سحر' }, crowd: { name: '👥 جمهور' },
};
export function playSfx(type) {
  ensureAudio();
  const ctx = audio.ctx, t = ctx.currentTime + 0.02, out = audio.sfxGain;
  if (type === 'whoosh') {
    const len = 0.35, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + len);
    src.connect(f); f.connect(out); src.start(t);
  } else if (type === 'boom') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.8);
  } else if (type === 'chirp') {
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + i * 0.16;
      o.frequency.setValueAtTime(2200 + Math.random() * 800, tt);
      o.frequency.exponentialRampToValueAtTime(3200, tt + 0.07);
      g.gain.setValueAtTime(0.12, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.1);
      o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 0.12);
    }
  } else if (type === 'steps') {
    for (let i = 0; i < 6; i++) drum(ctx, out, t + i * 0.3, 'kick');
  } else if (type === 'wind') {
    const len = 1.6, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.6);
    g.gain.linearRampToValueAtTime(0.001, t + len);
    src.connect(f); f.connect(g); g.connect(out); src.start(t);
  } else if (type === 'bell') {
    [523, 659, 784].forEach((f, i) => note(ctx, out, f, t + i * 0.28, 0.9, 'sine', 0.2));
  } else if (type === 'magic') {
    [880, 1108, 1318, 1760].forEach((f, i) => note(ctx, out, f, t + i * 0.09, 0.5, 'sine', 0.12));
  } else if (type === 'crowd') {
    const len = 1.4, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.15 * Math.sin((i / d.length) * Math.PI);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800;
    src.connect(f); f.connect(out); src.start(t);
  }
}
// مؤثرات مجدولة مع الفيلم
let sfxFired = new Set();
export function checkSfx(prevT, t) {
  for (const s of S.sfx) {
    if (s.time > prevT && s.time <= t && !sfxFired.has(s.id + '|' + Math.floor(t))) {
      playSfx(s.type);
      sfxFired.add(s.id + '|' + Math.floor(t));
    }
  }
  if (t < prevT) sfxFired.clear();
}

// ---------- حفظ / تحميل ----------
export function serialize() {
  return JSON.stringify({
    v: 1, title: S.title, filmDur: S.filmDur, sun: S.sun, ambient: S.ambient, music: S.music,
    objects: S.objects.map(o => ({
      id: o.id, kind: o.kind, name: o.name, propType: o.propType, scale: o.scale,
      colors: o.colors, track: o.track,
    })),
    shots: S.shots, sfx: S.sfx,
    spots: S.spots, texts: S.texts || [], weather: S.weather || 'none', narr: S.narr || [],
    bubbles: S.bubbles || [], slowmo: S.slowmo || false, grade: S.grade || 0,
  });
}
export function deserialize(json) {
  const d = JSON.parse(json);
  clearAll();
  S.title = d.title || 'فيلمي القصير';
  S.filmDur = d.filmDur || 30;
  S.sun = d.sun || S.sun; S.ambient = d.ambient ?? 0.55;
  S.music = d.music || S.music;
  for (const od of d.objects || []) {
    let o;
    if (od.kind === 'char') o = addCharacter(od.name, od.colors || {}, 0, 0);
    else o = addProp(od.propType, 0, 0, od.scale || 1);
    if (!o) continue;
    o.track = od.track;
  }
  S.shots = d.shots || [];
  S.sfx = d.sfx || [];
  S.texts = d.texts || [];
  S.narr = d.narr || [];
  S.bubbles = d.bubbles || [];
  S.slowmo = d.slowmo || false;
  S.grade = d.grade || 0;
  const slBtn = document.getElementById('tl-slow'); if (slBtn) slBtn.classList.toggle('sel', S.slowmo);
  clearBubbleSprites();
  setWeather(d.weather || 'none');
  for (const sp of d.spots || []) addSpot(sp);
  applySun(); applyVolume();
}
export function clearAll() {
  for (const o of [...S.objects]) removeObject(o.id);
  S.shots = []; S.sfx = []; S.texts = []; S.narr = []; S.bubbles = [];
  clearBubbleSprites();
  setWeather('none');
  for (const sp of [...S.spots]) removeSpot(sp.id);
  S.selected = null; S.time = 0;
}

// ---------- كشافات ----------
export function addSpot(cfg = {}) {
  const l = new THREE.SpotLight(cfg.color ?? 0xfff2cc, cfg.intensity ?? 60, 60, Math.PI / 5, 0.4, 1.4);
  const pos = cfg.pos || [0, 8, 6], target = cfg.target || [0, 0, 0];
  l.position.set(...pos);
  l.target.position.set(...target);
  l.castShadow = true;
  scene.add(l); scene.add(l.target);
  const sp = { id: cfg.id || genId(), color: l.color.getHex(), intensity: l.intensity, pos, target, light: l };
  S.spots.push(sp);
  return sp;
}
export function removeSpot(id) {
  const i = S.spots.findIndex(s => s.id === id);
  if (i < 0) return;
  scene.remove(S.spots[i].light); scene.remove(S.spots[i].light.target);
  S.spots.splice(i, 1);
}
export function updateSpot(sp) {
  sp.light.color.setHex(sp.color);
  sp.light.intensity = sp.intensity;
  sp.light.position.set(...sp.pos);
  sp.light.target.position.set(...sp.target);
}

// ---------- حلقة العرض ----------
let prevT = 0, lastFrame = performance.now();
export const filmCam = new THREE.PerspectiveCamera(50, 1, 0.1, 600);

function applyTime(t) {
  S.time = Math.max(0, Math.min(S.filmDur, t));
  for (const o of S.objects) {
    if (o.kind === 'char') poseCharacter(o, S.time);
    else {
      const { p } = evalObject(o, S.time);
      o.group.position.set(p.x, p.y, p.z);
      o.group.rotation.y = p.ry || 0;
    }
  }
  // نار المخيم تتراقص
  scene.traverse(m => {
    if (m.name === 'flame') m.scale.setScalar(1 + Math.sin(t * 12 + m.id) * 0.15);
    if (m.name === 'firelight') m.intensity = 2 + Math.sin(t * 10) * 0.5;
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (S.playing) {
    const prev = S.time;
    applyTime(S.time + dt * (S.slowmo ? 0.4 : 1));
    checkSfx(prev, S.time);
    checkNarr(prev, S.time);
    checkShotMood();
    if (S.time >= S.filmDur) { pause(); if (onFilmEnd) onFilmEnd(); }
  }
  updateBubbles(S.time);
  updateWeatherFX(S.time, dt);
  if (S.playing) {
    const sh = activeShot(S.time);
    const cam = sh ? sampleShotCam(sh, S.time) : null;
    if (cam) {
      filmCam.position.set(...cam.pos);
      if (cam.lookObj) {
        const lo = getObj(cam.lookObj);
        if (lo) {
          const lp = evalObject(lo, S.time).p;
          filmCam.lookAt(lp.x, lp.y + 1.4, lp.z);
        } else filmCam.lookAt(...cam.look);
      } else filmCam.lookAt(...cam.look);
      filmCam.fov = cam.fov || 50;
      filmCam.updateProjectionMatrix();
      if (sh.shake) {
        const s = sh.shake * 0.028;
        filmCam.rotation.x += Math.sin(S.time * 37) * s + Math.sin(S.time * 71) * s * 0.4;
        filmCam.rotation.y += Math.sin(S.time * 43 + 1.3) * s;
      }
      render3D(filmCam);
    } else {
      controls.update();
      render3D(camera);
    }
  } else {
    controls.update();
    render3D(camera);
  }
  updateTextOverlay(S.time);
  updateFade(S.time);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(overlayScene, overlayCam);
  renderer.autoClear = true;
  updateClock();
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * renderer.getPixelRatio() || canvas.height !== h * renderer.getPixelRatio()) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    filmCam.aspect = w / h; filmCam.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
  }
}
new ResizeObserver(resize).observe(canvas);

export let onFilmEnd = null;
export function play() {
  ensureAudio();
  audio.ctx.resume();
  S.playing = true;
  controls.enabled = false;
  document.getElementById('letterbox').classList.add('on');
  document.getElementById('tl-play').textContent = '⏸';
  startMusic(S.time);
}
export function pause() {
  S.playing = false;
  controls.enabled = true;
  document.getElementById('letterbox').classList.remove('on');
  document.getElementById('tl-play').textContent = '▶';
  stopMusic();
}
export function seek(t) { applyTime(t); sfxFired.clear(); drawTimeline(); }

// ---------- ساعة الفيلم ----------
const clockEl = document.getElementById('film-clock');
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function updateClock() {
  clockEl.textContent = fmt(S.time) + ' / ' + fmt(S.filmDur);
  document.getElementById('tl-time').textContent = S.time.toFixed(1) + ' ث / ' + S.filmDur + ' ث';
}

// ---------- تحديد باللمس/الفأرة ----------
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let downPos = null;
canvas.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 6 || S.playing) return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(scene.children, true);
  for (const h of hits) {
    const root = h.object.userData.objRoot;
    if (root) {
      const o = S.objects.find(x => x.group === root);
      if (o) { select(o.id); toast('تم تحديد: ' + o.name); return; }
    }
  }
  select(null);
});

// ---------- شريط الزمن ----------
const tlc = document.getElementById('tl-canvas');
const tlctx = tlc.getContext('2d');
const SHOT_COLORS = ['#f5b942', '#4ecdc4', '#ff7b9c', '#9b8af7', '#7bd88a', '#ffa65c'];
export function drawTimeline() {
  const dpr = devicePixelRatio || 1;
  const w = tlc.clientWidth, h = tlc.clientHeight;
  if (tlc.width !== w * dpr) { tlc.width = w * dpr; tlc.height = h * dpr; }
  tlctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  tlctx.clearRect(0, 0, w, h);
  const x = t => (t / S.filmDur) * w;
  // شبكة ثوانٍ
  tlctx.strokeStyle = '#232850'; tlctx.fillStyle = '#6a70a0'; tlctx.font = '10px Cairo';
  tlctx.textAlign = 'center';
  const step = S.filmDur > 60 ? 10 : S.filmDur > 25 ? 5 : 2;
  for (let s = 0; s <= S.filmDur; s += step) {
    tlctx.beginPath(); tlctx.moveTo(x(s), 14); tlctx.lineTo(x(s), h); tlctx.stroke();
    tlctx.fillText(s, x(s), 11);
  }
  // اللقطات
  S.shots.forEach((sh, i) => {
    tlctx.fillStyle = SHOT_COLORS[i % SHOT_COLORS.length] + '55';
    tlctx.strokeStyle = SHOT_COLORS[i % SHOT_COLORS.length];
    tlctx.beginPath(); tlctx.roundRect(x(sh.t0) + 1, 18, Math.max(4, x(sh.t1) - x(sh.t0) - 2), 22, 5);
    tlctx.fill(); tlctx.stroke();
    tlctx.fillStyle = '#fff'; tlctx.font = 'bold 10px Cairo';
    if (x(sh.t1) - x(sh.t0) > 40) tlctx.fillText(sh.name, (x(sh.t0) + x(sh.t1)) / 2, 33);
    // مفاتيح الكاميرا
    for (const k of sh.keys) {
      tlctx.fillStyle = SHOT_COLORS[i % SHOT_COLORS.length];
      tlctx.beginPath(); tlctx.arc(x(k.t), 46, 3.5, 0, 7); tlctx.fill();
    }
  });
  // مفاتيح العنصر المحدد
  const sel = getObj(S.selected);
  if (sel) {
    tlctx.fillStyle = '#ffffff';
    for (const k of sel.track.keys) {
      tlctx.beginPath(); tlctx.moveTo(x(k.t), 58); tlctx.lineTo(x(k.t) - 4, 66); tlctx.lineTo(x(k.t) + 4, 66); tlctx.fill();
    }
    tlctx.fillStyle = '#4ecdc4';
    for (const a of sel.track.actions) {
      if (a.type === 'walk') { tlctx.fillRect(x(a.t0), 70, Math.max(3, x(a.t1) - x(a.t0)), 5); }
      else { tlctx.fillRect(x(a.time) - 2, 70, 4, 5); }
    }
  }
  // مؤثرات
  tlctx.font = '11px Cairo';
  for (const s of S.sfx) {
    tlctx.fillStyle = '#ff7b9c';
    tlctx.beginPath(); tlctx.arc(x(s.time), h - 10, 4, 0, 7); tlctx.fill();
  }
  // مؤشر الزمن
  tlctx.strokeStyle = '#ff5d6c'; tlctx.lineWidth = 2;
  tlctx.beginPath(); tlctx.moveTo(x(S.time), 0); tlctx.lineTo(x(S.time), h); tlctx.stroke();
  tlctx.lineWidth = 1;
}
let scrubbing = false, dragMark = null;
function scrubTo(e) {
  const r = tlc.getBoundingClientRect();
  const t = Math.max(0, Math.min(S.filmDur, ((e.clientX - r.left) / r.width) * S.filmDur));
  seek(t);
}
function hitMark(e) {
  const r = tlc.getBoundingClientRect();
  const w = r.width, h = r.height;
  const x = t => (t / S.filmDur) * w;
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  for (const s of S.sfx) if (Math.abs(x(s.time) - mx) < 7 && Math.abs(my - (h - 10)) < 9) return { kind: 'sfx', ref: s };
  const sel = getObj(S.selected);
  if (sel) {
    for (const a of sel.track.actions) {
      if (a.type !== 'walk' && Math.abs(x(a.time) - mx) < 7 && my > 64 && my < 80) return { kind: 'act', ref: a };
      if (a.type === 'walk' && Math.abs(x(a.t0) - mx) < 7 && my > 64 && my < 80) return { kind: 'walk0', ref: a };
      if (a.type === 'walk' && Math.abs(x(a.t1) - mx) < 7 && my > 64 && my < 80) return { kind: 'walk1', ref: a };
    }
    for (const k of sel.track.keys) if (Math.abs(x(k.t) - mx) < 7 && my > 54 && my < 68) return { kind: 'key', ref: k, o: sel };
  }
  for (const sh of S.shots) for (const k of sh.keys) if (Math.abs(x(k.t) - mx) < 7 && Math.abs(my - 46) < 8) return { kind: 'camkey', ref: k, sh };
  return null;
}
tlc.addEventListener('pointerdown', e => {
  if (!S.playing) { dragMark = hitMark(e); if (dragMark) return; }
  scrubbing = true; scrubTo(e);
});
addEventListener('pointermove', e => {
  if (dragMark) {
    const r = tlc.getBoundingClientRect();
    const t = Math.max(0, Math.min(S.filmDur, Math.round(((e.clientX - r.left) / r.width) * S.filmDur * 10) / 10));
    const m = dragMark;
    if (m.kind === 'sfx' || m.kind === 'act') m.ref.time = t;
    else if (m.kind === 'walk0') m.ref.t0 = Math.min(t, m.ref.t1 - 0.5);
    else if (m.kind === 'walk1') m.ref.t1 = Math.max(t, m.ref.t0 + 0.5);
    else if (m.kind === 'key') { m.ref.t = t; m.o.track.keys.sort((a, b) => a.t - b.t); }
    else if (m.kind === 'camkey') { m.ref.t = Math.max(m.sh.t0, Math.min(m.sh.t1, t)); m.sh.keys.sort((a, b) => a.t - b.t); }
    drawTimeline();
    return;
  }
  if (scrubbing) scrubTo(e);
});
addEventListener('pointerup', () => {
  if (dragMark) { dragMark = null; renderPanel(); saveLocal(); toast('تم تحريك العلامة ✋'); }
  scrubbing = false;
});

// ---------- واجهة اللوحات ----------
const panelBody = document.getElementById('panel-body');
let activeTab = 'scene';
document.querySelectorAll('#panel-tabs button').forEach(b => {
  b.onclick = () => {
    activeTab = b.dataset.tab;
    document.querySelectorAll('#panel-tabs button').forEach(x => x.classList.toggle('active', x === b));
    renderPanel();
  };
});
const panelToggle = document.getElementById('panel-toggle');
const panelEl = document.getElementById('panel');
panelToggle.onclick = () => {
  panelEl.classList.toggle('hidden');
  panelToggle.textContent = panelEl.classList.contains('hidden') ? '◀' : '▶';
};
if (innerWidth < 760) { panelEl.classList.add('hidden'); panelToggle.textContent = '◀'; }

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200);
}
export function select(id) { S.selected = id; renderPanel(); drawTimeline(); }

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = n => '#' + n.toString(16).padStart(6, '0');

function renderPanel() {
  if (activeTab === 'scene') renderSceneTab();
  else if (activeTab === 'shots') renderShotsTab();
  else if (activeTab === 'texts') renderTextsTab();
  else if (activeTab === 'sound') renderSoundTab();
  else renderLightTab();
}

// ---- تبويب المشهد ----
function renderSceneTab() {
  const sel = getObj(S.selected);
  let html = `
  <div class="sec"><h4>➕ إضافة ممثل</h4>
    <div class="row"><label>الاسم</label><input type="text" id="nc-name" placeholder="بطل الفيلم"></div>
    <div class="row"><label>القميص</label><input type="color" id="nc-shirt" value="#3a6bd6">
    <label>البنطلون</label><input type="color" id="nc-pants" value="#2c2f45">
    <label>البشرة</label><input type="color" id="nc-skin" value="#e8b88a"></div>
    <div class="row"><label>جاهز</label>
      <button class="chip-btn" data-preset="فلاح|#f2ead8|#f2ead8|#b87850">🧑‍🌾 فلاح</button>
      <button class="chip-btn" data-preset="عريس|#f5f5f5|#1a1c28|#b87850">🤵 عريس</button>
      <button class="chip-btn" data-preset="طالبة|#d43a6a|#2c2f45|#e8b88a">👩‍🎓 طالبة</button>
      <button class="chip-btn" data-preset="عسكري|#8a2020|#3a2a1a|#c98f5e">💂 حارس</button></div>
    <button class="chip-btn sel" id="nc-add" style="width:100%">إضافة الممثل للمشهد 🎭</button>
  </div>
  <div class="sec"><h4>🏺 إضافة ديكور</h4><div class="grid2" id="prop-grid">`;
  for (const [k, d] of Object.entries(PROP_DEFS)) html += `<button class="chip-btn" data-prop="${k}">${d.name}</button>`;
  html += `</div></div>`;
  if (sel) {
    html += `<div class="sec"><h4>🎯 المحدد: ${esc(sel.name)}</h4>
      <div class="row"><label>الاسم</label><input type="text" id="sel-name" value="${esc(sel.name)}"></div>
      <div class="row"><label>مكان X</label><input type="range" id="sel-x" min="-60" max="60" step="0.5" value="${sel.group.position.x}"><span id="sel-x-v" style="font-size:11px;width:30px">${sel.group.position.x.toFixed(1)}</span></div>
      <div class="row"><label>مكان Z</label><input type="range" id="sel-z" min="-60" max="60" step="0.5" value="${sel.group.position.z}"><span id="sel-z-v" style="font-size:11px;width:30px">${sel.group.position.z.toFixed(1)}</span></div>
      <div class="row"><label>اتجاه</label><input type="range" id="sel-ry" min="-3.14" max="3.14" step="0.05" value="${(sel.track.keys[0]?.ry || 0)}"></div>`;
    if (sel.kind === 'prop') html += `<div class="row"><label>حجم</label><input type="range" id="sel-sc" min="0.3" max="4" step="0.1" value="${sel.scale || 1}"></div>`;
    html += `<button class="chip-btn sel" id="sel-key" style="width:100%">📍 ثبّت مفتاح حركة عند ${S.time.toFixed(1)} ث</button>
      <button class="chip-btn" id="sel-dup" style="width:100%;margin-top:5px">🧬 انسخ العنصر (بلا حركات)</button>`;
    if (sel.kind === 'char') {
      html += `<div class="row" style="margin-top:6px"><label>يمشي إلى</label>
        <input type="number" id="walk-x" placeholder="X" style="width:56px;flex:none">
        <input type="number" id="walk-z" placeholder="Z" style="width:56px;flex:none">
        <button class="chip-btn" id="walk-add">🚶 أضف مشي</button></div>
      <div class="row"><label>إيماءة</label><select id="gest-sel">${GESTURES.map(g => `<option value="${g[0]}">${g[1]}</option>`).join('')}</select>
        <button class="chip-btn" id="gest-add">أضف عند ${S.time.toFixed(1)}ث</button></div>
      <div class="row"><label>يقول</label><input type="text" id="bub-text" placeholder="جملة الحوار…"></div>
      <button class="chip-btn" id="bub-add" style="width:100%">💬 فقاعة كلام عند ${S.time.toFixed(1)}ث</button>`;
    html += `<div class="obj-list" style="max-height:70px;margin-top:5px">`;
    S.bubbles.forEach((b, i) => {
      if (b.objId !== sel.id) return;
      html += `<div class="obj-item"><span class="nm">💬 ${esc(b.text)} @${b.time.toFixed(1)}ث</span><span class="x" data-del-bub="${i}">✕</span></div>`;
    });
    html += `</div>`;
    }
    html += `<div class="obj-list" style="max-height:110px;margin-top:6px">`;
    sel.track.actions.forEach((a, i) => {
      const txt = a.type === 'walk' ? `🚶 مشي ${a.t0.toFixed(1)}→${a.t1.toFixed(1)}ث` : `${GESTURES.find(g=>g[0]===a.name)?.[1]||a.name} @${a.time.toFixed(1)}ث`;
      html += `<div class="obj-item"><span class="nm">${txt}</span><span class="x" data-del-act="${i}">✕</span></div>`;
    });
    html += `</div></div>`;
  }
  html += `<div class="sec"><h4>📋 عناصر المشهد <span class="mini" id="objs-count">${S.objects.length} عنصر</span></h4><div class="obj-list">`;
  for (const o of S.objects) {
    const col = o.kind === 'char' ? hex(o.colors.shirt) : '#8a8578';
    html += `<div class="obj-item ${o.id === S.selected ? 'sel' : ''}" data-sel="${o.id}">
      <span class="sw" style="background:${col}"></span><span class="nm">${o.kind === 'char' ? '🧍' : '🏺'} ${esc(o.name)}</span>
      <span class="x" data-del="${o.id}">✕</span></div>`;
  }
  html += `</div></div>`;
  panelBody.innerHTML = html;
  // أحداث
  document.getElementById('nc-add').onclick = () => {
    const name = document.getElementById('nc-name').value.trim() || undefined;
    const o = addCharacter(name, {
      shirt: parseInt(document.getElementById('nc-shirt').value.slice(1), 16),
      pants: parseInt(document.getElementById('nc-pants').value.slice(1), 16),
      skin: parseInt(document.getElementById('nc-skin').value.slice(1), 16),
    }, (Math.random() * 10 - 5), (Math.random() * 10 - 5));
    select(o.id); toast('انضم ممثل جديد 🎭');
  };
  panelBody.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const [n, sh, pa, sk] = b.dataset.preset.split('|');
    document.getElementById('nc-name').value = n;
    document.getElementById('nc-shirt').value = sh;
    document.getElementById('nc-pants').value = pa;
    document.getElementById('nc-skin').value = sk;
    toast('تعبئة جاهزة: ' + n + ' — اضغط إضافة');
  });
  panelBody.querySelectorAll('[data-prop]').forEach(b => b.onclick = () => {
    const o = addProp(b.dataset.prop, (Math.random() * 16 - 8), (Math.random() * 16 - 8));
    if (o) { select(o.id); toast('أُضيف: ' + o.name); }
  });
  panelBody.querySelectorAll('[data-sel]').forEach(el => el.onclick = e => { if (e.target.dataset.del) return; select(el.dataset.sel); });
  panelBody.querySelectorAll('[data-del]').forEach(el => el.onclick = () => { removeObject(el.dataset.del); renderPanel(); drawTimeline(); });
  if (sel) {
    const bindRange = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.oninput = () => fn(parseFloat(el.value));
    };
    bindRange('sel-x', v => { sel.group.position.x = v; document.getElementById('sel-x-v').textContent = v.toFixed(1); });
    bindRange('sel-z', v => { sel.group.position.z = v; document.getElementById('sel-z-v').textContent = v.toFixed(1); });
    bindRange('sel-ry', v => { sel.group.rotation.y = v; });
    bindRange('sel-sc', v => { sel.scale = v; sel.group.scale.setScalar(v); });
    const nm = document.getElementById('sel-name');
    if (nm) nm.onchange = () => { sel.name = nm.value; renderPanel(); };
    document.getElementById('sel-key').onclick = () => {
      addKey(sel, S.time, sel.group.position.x, sel.group.position.z, sel.group.rotation.y);
      toast('مفتاح حركة عند ' + S.time.toFixed(1) + ' ث 📍'); drawTimeline();
    };
    document.getElementById('sel-dup').onclick = () => {
      const nx = sel.group.position.x + 2.5, nz = sel.group.position.z + 2.5;
      let o;
      if (sel.kind === 'char') o = addCharacter(sel.name + ' (نسخة)', sel.colors || {}, nx, nz);
      else o = addProp(sel.propType, nx, nz, sel.scale || 1);
      if (o) { select(o.id); toast('اتعملت نسخة 🧬'); }
    };
    const wa = document.getElementById('walk-add');
    if (wa) wa.onclick = () => {
      const tx = parseFloat(document.getElementById('walk-x').value), tz = parseFloat(document.getElementById('walk-z').value);
      if (isNaN(tx) || isNaN(tz)) return toast('اكتب إحداثيات الهدف X و Z');
      const cur = evalObject(sel, S.time).p;
      const dist = Math.hypot(tx - cur.x, tz - cur.z);
      const dur = Math.max(1, dist / 1.4);
      sel.track.actions.push({ type: 'walk', t0: S.time, t1: Math.min(S.filmDur, S.time + dur), fx: cur.x, fz: cur.z, tx, tz });
      toast('مشي لمسافة ' + dist.toFixed(1) + ' م 🚶'); renderPanel(); drawTimeline();
    };
    const ga = document.getElementById('gest-add');
    if (ga) ga.onclick = () => {
      sel.track.actions.push({ type: 'gesture', name: document.getElementById('gest-sel').value, time: S.time, dur: 2 });
      toast('إيماءة عند ' + S.time.toFixed(1) + ' ث'); renderPanel(); drawTimeline();
    };
    const ba = document.getElementById('bub-add');
    if (ba) ba.onclick = () => {
      const txt = document.getElementById('bub-text').value.trim();
      if (!txt) return toast('اكتب جملة الحوار أولًا');
      S.bubbles.push({ id: genId(), objId: sel.id, time: S.time, dur: 3, text: txt });
      toast('فقاعة كلام @ ' + S.time.toFixed(1) + ' ث 💬'); renderPanel(); drawTimeline(); saveLocal();
    };
    panelBody.querySelectorAll('[data-del-bub]').forEach(el => el.onclick = () => {
      const b = S.bubbles[+el.dataset.delBub];
      const sp = bubbleSprites.get(b.id);
      if (sp) { sp.parent?.remove(sp); bubbleSprites.delete(b.id); }
      S.bubbles.splice(+el.dataset.delBub, 1); renderPanel(); drawTimeline();
    });
    panelBody.querySelectorAll('[data-del-act]').forEach(el => el.onclick = () => {
      sel.track.actions.splice(+el.dataset.delAct, 1); renderPanel(); drawTimeline();
    });
  }
}

// ---- تبويب اللقطات ----
function renderShotsTab() {
  let html = `<div class="sec"><h4>🎥 اللقطات</h4>
    <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px">كل لقطة لها زمن وكاميرا. حرّك الكاميرا في العرض ثم اضغط «التقط» لتخزين مفتاح كاميرا عند الزمن الحالي.</p>
    <div class="row"><input type="text" id="sh-name" placeholder="اسم اللقطة">
    <button class="chip-btn sel" id="sh-split">✂️ قسّم عند ${S.time.toFixed(1)}ث</button></div>
    <button class="chip-btn" id="sh-add" style="width:100%">＋ لقطة جديدة تغطي باقي الفيلم</button>
  </div>`;
  S.shots.forEach((sh, i) => {
    html += `<div class="sec"><h4 style="color:${SHOT_COLORS[i % 6]}">${esc(sh.name)} <span class="mini" data-del-shot="${sh.id}">حذف ✕</span></h4>
      <div class="row"><label>من</label><input type="number" id="sh-t0-${sh.id}" value="${sh.t0}" step="0.5" style="width:64px;flex:none">
      <label>إلى</label><input type="number" id="sh-t1-${sh.id}" value="${sh.t1}" step="0.5" style="width:64px;flex:none">
      <label>عدسة</label><input type="number" id="sh-fov-${sh.id}" value="50" step="1" style="width:56px;flex:none"></div>
      <div class="row"><label>انتقال</label><select data-shot-tr="${sh.id}">
        <option value="cut" ${sh.transition !== 'fade' ? 'selected' : ''}>قطع مباشر</option>
        <option value="fade" ${sh.transition === 'fade' ? 'selected' : ''}>تلاشي أسود</option></select>
      <label>موسيقى</label><select data-shot-mood="${sh.id}">
        <option value="" ${!sh.mood ? 'selected' : ''}>الافتراضية</option>
      <label>هزة</label><select data-shot-shake="${sh.id}">
        <option value="" ${!sh.shake ? 'selected' : ''}>بدون</option>
        <option value="0.5" ${sh.shake === 0.5 ? 'selected' : ''}>خفيفة</option>
        <option value="1" ${sh.shake === 1 ? 'selected' : ''}>قوية</option></select></div>
      <div class="row"><label>تتبع المحدد</label><input type="checkbox" id="sh-follow-${sh.id}" style="width:18px;height:18px;accent-color:var(--accent)" ${getObj(S.selected) && getObj(S.selected).kind === 'char' ? '' : 'disabled'}></div>
      <button class="chip-btn sel" data-shot-key="${sh.id}" style="width:100%">📸 التقط الكاميرا الحالية @ ${S.time.toFixed(1)}ث</button>
      <div class="obj-list" style="max-height:80px;margin-top:6px">`;
    sh.keys.forEach((k, ki) => {
      html += `<div class="obj-item"><span class="nm">📸 @${k.t.toFixed(1)}ث عدسة ${k.fov}${k.lookObj ? ' 🎯' : ''}</span><span class="x" data-del-key="${sh.id}|${ki}">✕</span></div>`;
    });
    html += `</div></div>`;
  });
  panelBody.innerHTML = html;
  document.getElementById('sh-add').onclick = () => {
    const last = S.shots[S.shots.length - 1];
    const t0 = last ? last.t1 : 0;
    if (t0 >= S.filmDur) return toast('اللقطات تغطي الفيلم كله');
    addShot(document.getElementById('sh-name').value.trim() || undefined, t0, S.filmDur);
    renderPanel(); drawTimeline();
  };
  document.getElementById('sh-split').onclick = () => {
    const sh = S.shots.find(s => S.time > s.t0 && S.time < s.t1);
    if (!sh) return toast('ضع المؤشر داخل لقطة لتقسيمها');
    const t1 = sh.t1; sh.t1 = S.time;
    addShot(sh.name + ' (ب)', S.time, t1);
    sh.keys.forEach(k => { if (k.t > S.time) { /* تبقى */ } });
    renderPanel(); drawTimeline(); toast('تم التقسيم ✂️');
  };
  panelBody.querySelectorAll('[data-shot-key]').forEach(b => b.onclick = () => {
    const sh = S.shots.find(s => s.id === b.dataset.shotKey);
    const fovEl = document.getElementById('sh-fov-' + sh.id);
    const fov = Math.max(20, Math.min(100, parseFloat(fovEl.value) || 50));
    const follow = document.getElementById('sh-follow-' + sh.id);
    const sel = getObj(S.selected);
    const lookObj = (follow && follow.checked && sel && sel.kind === 'char') ? sel.id : null;
    shotKey(sh, S.time, camera.position.toArray(), controls.target.toArray(), fov, lookObj);
    toast('مفتاح كاميرا محفوظ 📸' + (lookObj ? ' (يتبع ' + sel.name + ')' : '')); renderPanel(); drawTimeline();
  });
  panelBody.querySelectorAll('[data-shot-tr]').forEach(el => el.onchange = () => {
    const sh = S.shots.find(s => s.id === el.dataset.shotTr);
    sh.transition = el.value; toast('الانتقال: ' + (el.value === 'fade' ? 'تلاشي 🌑' : 'قطع ✂️')); saveLocal();
  });
  panelBody.querySelectorAll('[data-shot-mood]').forEach(el => el.onchange = () => {
    const sh = S.shots.find(s => s.id === el.dataset.shotMood);
    sh.mood = el.value || null; toast('موسيقى اللقطة: ' + (el.value ? moodName(el.value) : 'الافتراضية')); saveLocal();
  });
  panelBody.querySelectorAll('[data-shot-shake]').forEach(el => el.onchange = () => {
    const sh = S.shots.find(s => s.id === el.dataset.shotShake);
    sh.shake = el.value ? +el.value : null; toast('هزة الكاميرا: ' + (sh.shake ? (sh.shake === 1 ? 'قوية 📳' : 'خفيفة') : 'بدون')); saveLocal();
  });
  panelBody.querySelectorAll('[data-del-shot]').forEach(el => el.onclick = () => {
    removeShot(el.dataset.delShot); renderPanel(); drawTimeline();
  });
  panelBody.querySelectorAll('[data-del-key]').forEach(el => el.onclick = () => {
    const [sid, ki] = el.dataset.delKey.split('|');
    const sh = S.shots.find(s => s.id === sid);
    sh.keys.splice(+ki, 1); renderPanel(); drawTimeline();
  });
  S.shots.forEach(sh => {
    const t0 = document.getElementById('sh-t0-' + sh.id), t1 = document.getElementById('sh-t1-' + sh.id);
    if (t0) t0.onchange = () => { sh.t0 = Math.max(0, parseFloat(t0.value) || 0); S.shots.sort((a, b) => a.t0 - b.t0); drawTimeline(); };
    if (t1) t1.onchange = () => { sh.t1 = Math.min(S.filmDur, parseFloat(t1.value) || S.filmDur); drawTimeline(); };
  });
}

// ---- تبويب الصوت ----
function renderSoundTab() {
  let html = `<div class="sec"><h4>🎵 موسيقى الفيلم</h4>
    <div class="row"><label>النمط</label><select id="mus-mood">${MOOD_KEYS.map(k => `<option value="${k}" ${S.music.mood === k ? 'selected' : ''}>${moodName(k)}</option>`).join('')}</select></div>
    <div class="row"><label>الصوت</label><input type="range" id="mus-vol" min="0" max="1" step="0.05" value="${S.music.volume}"></div>
    <div class="row"><label>تشغيل</label><input type="checkbox" id="mus-on" ${S.music.on ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)">
    <button class="chip-btn" id="mus-test">🎧 تجربة</button></div>
  </div>
  <div class="sec"><h4>🔊 مؤثرات صوتية</h4>
    <div class="row"><select id="sfx-type">${Object.entries(SFX_DEFS).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('')}</select>
    <button class="chip-btn sel" id="sfx-add">＋ @${S.time.toFixed(1)}ث</button>
    <button class="chip-btn" id="sfx-test">🎧</button></div>
    <div class="obj-list">`;
  S.sfx.forEach((s, i) => {
    html += `<div class="obj-item"><span class="nm">${SFX_DEFS[s.type]?.name || s.type} @${s.time.toFixed(1)}ث</span><span class="x" data-del-sfx="${i}">✕</span></div>`;
  });
  html += `</div></div>
  <div class="sec"><h4>🎙️ تعليق صوتي بصوتك</h4>
    <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px">حرّك المؤشر للحظة المناسبة ثم سجّل صوتك — سيُسمع داخل الفيلم المصدَّر.</p>
    <button class="chip-btn sel" id="narr-rec" style="width:100%">🎙️ سجّل تعليقًا @ ${S.time.toFixed(1)}ث</button>
    <div class="obj-list" style="margin-top:6px">`;
  S.narr.forEach((n, i) => {
    html += `<div class="obj-item"><span class="nm">🎙️ تعليق @${n.time.toFixed(1)}ث</span><span class="x" data-del-narr="${i}">✕</span></div>`;
  });
  html += `</div></div>`;
  panelBody.innerHTML = html;
  document.getElementById('narr-rec').onclick = e => toggleNarration(e.target);
  panelBody.querySelectorAll('[data-del-narr]').forEach(el => el.onclick = () => {
    S.narr.splice(+el.dataset.delNarr, 1); renderPanel(); drawTimeline();
  });
  document.getElementById('mus-mood').onchange = e => { S.music.mood = e.target.value; saveLocal(); };
  document.getElementById('mus-vol').oninput = e => { S.music.volume = +e.target.value; applyVolume(); };
  document.getElementById('mus-on').onchange = e => { S.music.on = e.target.checked; };
  document.getElementById('mus-test').onclick = () => { ensureAudio(); audio.ctx.resume(); startMusic(0); setTimeout(stopMusic, 2500); };
  document.getElementById('sfx-add').onclick = () => {
    S.sfx.push({ id: genId(), time: S.time, type: document.getElementById('sfx-type').value });
    toast('مؤثر عند ' + S.time.toFixed(1) + ' ث 🔊'); renderPanel(); drawTimeline();
  };
  document.getElementById('sfx-test').onclick = () => { ensureAudio(); audio.ctx.resume(); playSfx(document.getElementById('sfx-type').value); };
  panelBody.querySelectorAll('[data-del-sfx]').forEach(el => el.onclick = () => {
    S.sfx.splice(+el.dataset.delSfx, 1); renderPanel(); drawTimeline();
  });
}

// ---- تبويب الإضاءة ----
function renderLightTab() {
  const todNames = ['فجر 🌅', 'ظهر ☀️', 'غروب 🌇', 'ليل 🌙'];
  const todName = todNames[Math.min(3, Math.floor(S.sun.tod * 4))];
  let html = `<div class="sec"><h4>☀️ الشمس ووقت اليوم</h4>
    <div class="row"><label>الوقت</label><input type="range" id="sun-tod" min="0" max="1" step="0.01" value="${S.sun.tod}"><span style="font-size:12px;color:var(--accent);font-weight:700">${todName}</span></div>
    <div class="row"><label>قوة الشمس</label><input type="range" id="sun-int" min="0" max="2.5" step="0.05" value="${S.sun.intensity}"></div>
    <div class="row"><label>إضاءة عامة</label><input type="range" id="amb-int" min="0" max="1.5" step="0.05" value="${S.ambient}"></div>
    <div class="row"><label>الطقس</label><select id="weather-sel">
      <option value="none" ${S.weather === 'none' ? 'selected' : ''}>بدون ☀️</option>
      <option value="rain" ${S.weather === 'rain' ? 'selected' : ''}>مطر 🌧️</option>
      <option value="snow" ${S.weather === 'snow' ? 'selected' : ''}>ثلج ❄️</option>
      <option value="dust" ${S.weather === 'dust' ? 'selected' : ''}>عاصفة رملية 🌪️</option></select></div>
    <div class="row"><label>فلتر لوني</label><select id="grade-sel">
      ${GRADES.map(([v, n]) => `<option value="${v}" ${S.grade === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
  </div>
  <div class="sec"><h4>🔦 كشافات تصوير</h4>
    <button class="chip-btn sel" id="spot-add" style="width:100%">＋ كشاف جديد</button>
    <div class="obj-list" style="margin-top:6px">`;
  for (const sp of S.spots) {
    html += `<div class="obj-item"><span class="sw" style="background:${hex(sp.color)}"></span><span class="nm">كشاف (${sp.pos.map(v => v.toFixed(0)).join(', ')})</span><span class="x" data-del-spot="${sp.id}">✕</span></div>
    <div class="row"><label>لون</label><input type="color" data-spot-col="${sp.id}" value="${hex(sp.color)}">
    <label>قوة</label><input type="range" data-spot-int="${sp.id}" min="0" max="200" step="5" value="${sp.intensity}"></div>`;
  }
  html += `</div></div>`;
  panelBody.innerHTML = html;
  document.getElementById('sun-tod').oninput = e => { S.sun.tod = +e.target.value; applySun(); renderPanel(); };
  document.getElementById('sun-int').oninput = e => { S.sun.intensity = +e.target.value; applySun(); };
  document.getElementById('amb-int').oninput = e => { S.ambient = +e.target.value; applySun(); };
  document.getElementById('weather-sel').onchange = e => { setWeather(e.target.value); toast('الطقس: ' + e.target.selectedOptions[0].textContent); saveLocal(); };
  document.getElementById('grade-sel').onchange = e => { S.grade = +e.target.value; toast('الفلتر: ' + e.target.selectedOptions[0].textContent); saveLocal(); };
  document.getElementById('spot-add').onclick = () => {
    addSpot({ pos: [Math.random() * 10 - 5, 7, Math.random() * 8 + 2], color: 0xfff2cc, intensity: 60 });
    renderPanel();
  };
  panelBody.querySelectorAll('[data-del-spot]').forEach(el => el.onclick = () => { removeSpot(el.dataset.delSpot); renderPanel(); });
  panelBody.querySelectorAll('[data-spot-col]').forEach(el => el.oninput = () => {
    const sp = S.spots.find(s => s.id === el.dataset.spotCol);
    sp.color = parseInt(el.value.slice(1), 16); updateSpot(sp);
  });
  panelBody.querySelectorAll('[data-spot-int]').forEach(el => el.oninput = () => {
    const sp = S.spots.find(s => s.id === el.dataset.spotInt);
    sp.intensity = +el.value; updateSpot(sp);
  });
}

// ---------- مشهد جاهز ----------
function buildDemo() {
  clearAll();
  S.filmDur = 30; S.title = 'لقاء عند الأهرام';
  // ديكور
  addProp('pyramid', -18, -30, 2.2);
  addProp('pyramid', -32, -22, 1.4);
  addProp('sphinx', 8, -18, 1.6);
  addProp('palm', 12, -8); addProp('palm', 15, -4); addProp('palm', -8, -10);
  addProp('column', -6, -14); addProp('column', 2, -14);
  addProp('fire', 0, 2);
  addProp('tent', 10, 6); addProp('rock', -7, 6); addProp('well', 7, 12);
  // ممثلون
  const hero = addCharacter('سارة', { shirt: 0xd6455a, pants: 0x2c2f45, hair: 0x1a1410 }, -14, 8);
  const hero2 = addCharacter('عمر', { shirt: 0x3a6bd6, pants: 0x3a3a20, skin: 0xc98f5e }, 14, 6);
  // سارة تمشي للنار وتلوّح
  hero.track.actions.push({ type: 'walk', t0: 1, t1: 8, fx: -14, fz: 8, tx: -2, tz: 3 });
  hero.track.actions.push({ type: 'gesture', name: 'wave', time: 9, dur: 2.5 });
  hero.track.actions.push({ type: 'gesture', name: 'sit', time: 20, dur: 3 });
  // عمر يمشي ويقفز فرحًا ويصفق
  hero2.track.actions.push({ type: 'walk', t0: 2, t1: 9, fx: 14, fz: 6, tx: 2.5, tz: 3.5 });
  hero2.track.actions.push({ type: 'gesture', name: 'jump', time: 10.5, dur: 1.6 });
  hero2.track.actions.push({ type: 'gesture', name: 'clap', time: 13, dur: 3 });
  hero2.track.actions.push({ type: 'gesture', name: 'point', time: 16.5, dur: 2.5 });
  hero2.track.actions.push({ type: 'gesture', name: 'sit', time: 20.5, dur: 3 });
  // اللقطات
  const sh1 = addShot('افتتاحية واسعة', 0, 8);
  shotKey(sh1, 0, [26, 14, 30], [0, 2, -6], 55);
  shotKey(sh1, 8, [16, 8, 22], [0, 2, 0], 50);
  const sh2 = addShot('اقتراب اللقاء', 8, 16);
  shotKey(sh2, 8, [8, 4, 12], [0, 1.6, 3], 42);
  shotKey(sh2, 16, [-6, 3, 9], [0, 1.6, 3], 40);
  const sh3 = addShot('حول النار', 16, 24);
  shotKey(sh3, 16, [5, 2.2, 7], [0, 1.2, 2], 38);
  shotKey(sh3, 24, [-5, 2.2, 7], [0, 1.2, 2], 38);
  const sh4 = addShot('خاتمة الغروب', 24, 30); sh4.transition = 'fade';
  shotKey(sh4, 24, [0, 3, 14], [0, 3, -10], 48);
  shotKey(sh4, 30, [0, 16, 26], [0, 2, -14], 55);
  // نصوص على الشاشة
  S.texts = [
    { id: genId(), time: 0.3, dur: 2.8, text: 'لقاء عند الأهرام', style: 'card', color: '#f5b942' },
    { id: genId(), time: 9.2, dur: 2.6, text: 'سارة: أهلًا يا عمر!', style: 'sub', color: '#ffffff' },
    { id: genId(), time: 16.8, dur: 2.8, text: 'عمر: انظر إلى الأهرامات!', style: 'sub', color: '#ffffff' },
    { id: genId(), time: 26.5, dur: 2.8, text: 'النهاية', style: 'title', color: '#f5b942' },
  ];
  // صوت
  S.music.mood = 'oriental';
  S.sfx = [
    { id: genId(), time: 0.5, type: 'wind' }, { id: genId(), time: 2, type: 'chirp' },
    { id: genId(), time: 5, type: 'steps' }, { id: genId(), time: 9.2, type: 'magic' },
    { id: genId(), time: 16.8, type: 'whoosh' }, { id: genId(), time: 24.5, type: 'bell' },
  ];
  // غروب سينمائي
  S.sun.tod = 0.48; S.sun.intensity = 1.3;
  addSpot({ pos: [0, 6, 8], color: 0xffd9a0, intensity: 80, target: [0, 1, 2] });
  seek(0); applySun();
}

// ---------- تصدير الفيلم ----------
let recorder = null, recChunks = [];
function exportFilm() {
  if (S.playing) pause();
  overlay(true, '', 'اختر جودة التصدير — 1080p أعلى جودة لكنه أبطأ وأثقل:', [
    { t: '🎬 تصدير 720p', cls: 'primary', fn: () => { overlay(false); doExport(1280, 720); } },
    { t: '💎 تصدير 1080p', fn: () => { overlay(false); doExport(1920, 1080); } },
    { t: 'إلغاء', fn: () => overlay(false) },
  ]);
}
function doExport(exW, exH) {
  ensureAudio(); audio.ctx.resume();
  // دقة التصدير
  renderer.setPixelRatio(1);
  renderer.setSize(exW, exH, false);
  if (composer) { composer.setPixelRatio(1); composer.setSize(exW, exH); }
  camera.aspect = exW / exH; camera.updateProjectionMatrix();
  filmCam.aspect = exW / exH; filmCam.updateProjectionMatrix();
  const restoreView = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    resize();
  };
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
  const stream = canvas.captureStream(30);
  const atrack = audio.dest.stream.getAudioTracks()[0];
  if (atrack) stream.addTrack(atrack);
  try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: exW > 1300 ? 14_000_000 : 8_000_000 } : undefined); }
  catch (e) { recorder = new MediaRecorder(stream); }
  recChunks = [];
  recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    document.getElementById('rec-badge').classList.remove('on');
    overlay(false);
    onFilmEnd = null;
    restoreView();
    const blob = new Blob(recChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (S.title || 'فيلم') + '.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('تم تصدير الفيلم ⬇️ (' + (blob.size / 1048576).toFixed(1) + ' م.ب)');
  };
  overlay(true, 'جارٍ تصوير وتصدير فيلمك…', 'الفيلم يُعرض الآن من البداية ويُسجَّل لقطة بلقطة (' + exW + '×' + exH + '). لا تغلق الصفحة.');
  document.getElementById('rec-badge').classList.add('on');
  seek(0);
  recorder.start(250);
  onFilmEnd = () => { pause(); setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 400); };
  play();
}
function overlay(show, title, text, btns) {
  const ov = document.getElementById('overlay'), box = document.getElementById('overlay-box');
  if (!show) { ov.classList.remove('on'); return; }
  box.innerHTML = (title ? `<div class="spinner"></div><h2>${title}</h2>` : '') + (text ? `<p>${text}</p>` : '');
  if (btns) {
    const row = document.createElement('div'); row.className = 'row';
    btns.forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'tb-btn ' + (b.cls || ''); btn.textContent = b.t;
      btn.onclick = b.fn; row.appendChild(btn);
    });
    box.appendChild(row);
  }
  ov.classList.add('on');
}

// ---------- حفظ محلي ----------
const LS_KEY = 'cinema3d-project';
let saveT = null;
export function saveLocal() {
  clearTimeout(saveT);
  const ind = document.getElementById('save-ind');
  if (ind) { ind.textContent = '⏳ بيحفظ…'; ind.style.color = '#8a90b8'; }
  saveT = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, serialize());
      if (ind) { ind.textContent = '✓ محفوظ'; ind.style.color = '#4ecdc4'; }
    } catch (e) {}
  }, 600);
}

// ---------- شريط الأدوات ----------
document.getElementById('btn-demo').onclick = () => {
  buildDemo(); renderPanel(); drawTimeline(); saveLocal();
  toast('مشهد جاهز: «لقاء عند الأهرام» — اضغط تشغيل ▶');
};
document.getElementById('btn-export').onclick = exportFilm;
document.getElementById('btn-save').onclick = () => { localStorage.setItem(LS_KEY, serialize()); toast('تم الحفظ 💾'); };
document.getElementById('btn-savejson').onclick = () => {
  const blob = new Blob([serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = (S.title || 'مشروع') + '.json'; a.click();
};
document.getElementById('btn-loadjson').onclick = () => document.getElementById('json-file').click();
document.getElementById('json-file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    deserialize(await f.text());
    document.getElementById('film-dur').value = S.filmDur;
    document.getElementById('film-dur-lbl').textContent = S.filmDur + ' ث';
    renderPanel(); drawTimeline(); seek(0);
    toast('تم الاستيراد 📂');
  } catch (err) { toast('ملف غير صالح ⚠️'); }
  e.target.value = '';
};
document.getElementById('btn-clear').onclick = () => {
  overlay(true, '', 'تبدأ مشروعًا جديدًا من الصفر؟ سيتم مسح المشهد الحالي.', [
    { t: 'نعم، مشروع جديد', cls: 'danger', fn: () => { clearAll(); S.filmDur = 30; addShot('لقطة 1', 0, 30); S.sun.tod = 0.35; applySun(); seek(0); renderPanel(); drawTimeline(); overlay(false); saveLocal(); } },
    { t: 'إلغاء', fn: () => overlay(false) },
  ]);
};

// ---------- شريط الزمن ----------
document.getElementById('tl-play').onclick = () => S.playing ? pause() : play();
document.getElementById('tl-stop').onclick = () => { pause(); seek(0); };
document.getElementById('tl-slow').onclick = () => {
  S.slowmo = !S.slowmo;
  document.getElementById('tl-slow').classList.toggle('sel', S.slowmo);
  toast(S.slowmo ? 'حركة بطيئة 🐢 (تنعكس في التصدير)' : 'سرعة عادية'); saveLocal();
};
document.getElementById('film-dur').oninput = e => {
  S.filmDur = +e.target.value;
  document.getElementById('film-dur-lbl').textContent = S.filmDur + ' ث';
  drawTimeline(); saveLocal();
};
document.getElementById('tl-addmark').onclick = () => {
  S.sfx.push({ id: genId(), time: S.time, type: 'whoosh' });
  toast('حدث صوتي عند ' + S.time.toFixed(1) + ' ث (غيّر نوعه من تبويب الصوت)');
  drawTimeline(); if (activeTab === 'sound') renderPanel();
};

// حفظ تلقائي عند التغييرات
setInterval(saveLocal, 5000);
addEventListener('beforeunload', () => { try { localStorage.setItem(LS_KEY, serialize()); } catch (e) {} });

// ---------- مشاركة الفيلم برابط ----------
async function filmShareLink() {
  const json = serialize();
  const cs = new CompressionStream('deflate-raw');
  const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return location.origin + location.pathname + '#film=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function filmFromHash() {
  if (!location.hash.startsWith('#film=')) return false;
  try {
    const b64 = location.hash.slice(6).replace(/-/g, '+').replace(/_/g, '/');
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ds = new DecompressionStream('deflate-raw');
    const json = await new Response(new Blob([bin]).stream().pipeThrough(ds)).text();
    deserialize(json);
    return true;
  } catch (e) { console.warn('hash load failed', e); return false; }
}
document.getElementById('btn-share').onclick = async () => {
  toast('بيجهّز الرابط… ⏳');
  try {
    const url = await filmShareLink();
    try { await navigator.clipboard.writeText(url); }
    catch { prompt('انسخ رابط الفيلم:', url); }
    toast(url.length > 14000 ? 'اتنسخ 🔗 بس طويل (' + url.length + ') — ممكن مايفتحش في كل المتصفحات' : 'اتنسخ رابط الفيلم 🔗 ابعته لأي حد!');
  } catch (e) { toast('تعذر تجهيز الرابط'); }
};

// ---------- إقلاع ----------
(async function boot() {
  const fromLink = await filmFromHash();
  const saved = fromLink ? null : localStorage.getItem(LS_KEY);
  if (saved) {
    try {
      deserialize(saved);
      document.getElementById('film-dur').value = S.filmDur;
      document.getElementById('film-dur-lbl').textContent = S.filmDur + ' ث';
    } catch (e) { buildDemo(); }
  } else {
    buildDemo();
  }
  if (!S.shots.length) addShot('لقطة 1', 0, S.filmDur);
  applySun(); applyVolume(); seek(0);
  renderPanel(); drawTimeline(); resize();
  requestAnimationFrame(animate);
  setTimeout(() => document.getElementById('viewport-hint').style.opacity = 0, 6000);
  if (fromLink) toast('اتحمّل فيلم من رابط مشاركة 🎬');
  if (!localStorage.getItem('cinema3d-seen-intro')) {
    setTimeout(() => {
      overlay(true, 'أهلًا بيك في الاستوديو! 🎬', 'ثلاث خطوات وعملت فيلمك الأول:', [
        { t: '1️⃣ ابدأ من قالب جاهز', fn: () => { overlay(false); document.getElementById('btn-demo').click(); } },
        { t: '2️⃣ هبني من الصفر بنفسي', fn: () => { overlay(false); toast('أضف ممثلين وديكور من لوحة المشهد ➕'); } },
        { t: '⏭ تخطّي', fn: () => overlay(false) },
      ]);
      localStorage.setItem('cinema3d-seen-intro', '1');
    }, 1200);
  }
})();

// ================== الجولة ٢ ==================
// ---------- نصوص على الشاشة (تُسجَّل داخل الفيديو) ----------
S.texts = S.texts || [];   // {id,time,dur,text,style:'title'|'sub'|'card',color}
S.weather = S.weather || 'none';
S.narr = S.narr || [];     // {id,time,dataURL}

const overlayScene = new THREE.Scene();
const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
overlayCam.position.z = 1;
let textSprite = null, textKey = '', fadeMesh = null;

function makeTextSprite(text, style, color) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl';
  if (style === 'card') {
    g.fillStyle = '#0d0f1a';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = color || '#f5b942';
    g.font = '900 150px Cairo, sans-serif';
    g.shadowColor = '#000'; g.shadowBlur = 30;
    g.fillText(text, c.width / 2, c.height / 2, c.width - 200);
  } else if (style === 'title') {
    g.fillStyle = color || '#ffffff';
    g.font = '900 170px Cairo, sans-serif';
    g.shadowColor = '#000'; g.shadowBlur = 26; g.shadowOffsetY = 6;
    g.fillText(text, c.width / 2, c.height / 2, c.width - 160);
  } else if (style === 'outline') {
    g.font = '900 160px Cairo, sans-serif';
    g.lineWidth = 18; g.strokeStyle = '#0a0a12'; g.lineJoin = 'round';
    g.strokeText(text, c.width / 2, c.height / 2, c.width - 160);
    g.fillStyle = color || '#f5b942';
    g.fillText(text, c.width / 2, c.height / 2, c.width - 160);
  } else {
    g.font = '700 96px Cairo, sans-serif';
    const w = Math.min(c.width - 120, g.measureText(text).width + 120);
    g.fillStyle = '#000000b0';
    g.beginPath(); g.roundRect((c.width - w) / 2, c.height / 2 - 90, w, 180, 40); g.fill();
    g.fillStyle = color || '#ffffff';
    g.shadowColor = '#000'; g.shadowBlur = 12;
    g.fillText(text, c.width / 2, c.height / 2, w - 60);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 2;
  return sp;
}
function activeTextAt(t) {
  return S.texts.find(x => t >= x.time && t <= x.time + x.dur) || null;
}
function updateTextOverlay(t) {
  let at = activeTextAt(t);
  if (!at && !S.playing && S.texts.length) {
    const near = S.texts.find(x => Math.abs(x.time - t) < 0.4 && x.style !== 'card');
    at = near || null;
  }
  const key = at ? at.id + '|' + at.text + '|' + at.style + '|' + at.color : '';
  if (key === textKey) return;
  textKey = key;
  if (textSprite) { overlayScene.remove(textSprite); textSprite.material.map.dispose(); textSprite.material.dispose(); textSprite = null; }
  if (at) {
    textSprite = makeTextSprite(at.text, at.style, at.color);
    if (at.style === 'card') { textSprite.scale.set(2, 1, 1); textSprite.position.set(0, 0, 0); }
    else if (at.style === 'title') { textSprite.scale.set(1.7, 0.425, 1); textSprite.position.set(0, 0.45, 0); }
    else if (at.style === 'outline') { textSprite.scale.set(1.7, 0.425, 1); textSprite.position.set(0, 0.42, 0); }
    else { textSprite.scale.set(1.6, 0.4, 1); textSprite.position.set(0, -0.62, 0); }
    overlayScene.add(textSprite);
  }
}
// انتقال تلاشي
function ensureFadeMesh() {
  if (fadeMesh) return fadeMesh;
  fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false }));
  fadeMesh.renderOrder = 1;
  fadeMesh.position.z = 0.5;
  overlayScene.add(fadeMesh);
  return fadeMesh;
}
function updateFade(t) {
  const fm = ensureFadeMesh();
  if (!S.playing) { fm.material.opacity = 0; return; }
  let op = 0;
  const sh = activeShot(t);
  if (sh && sh.transition === 'fade') {
    const FADE = 0.8;
    const inK = (t - sh.t0) / FADE, outK = (sh.t1 - t) / FADE;
    if (inK < 1) op = Math.max(op, 1 - inK);
    if (outK < 1 && outK > 0) op = Math.max(op, 1 - outK);
  }
  const card = activeTextAt(t);
  if (card && card.style === 'card') op = 1;
  fm.material.opacity = Math.max(0, Math.min(1, op));
}

// ---------- الطقس ----------
var weatherPts = null, weatherVel = null;
export function setWeather(type) {
  S.weather = type;
  if (weatherPts) { scene.remove(weatherPts); weatherPts.geometry.dispose(); weatherPts = null; }
  if (type === 'none') return;
  const N = type === 'dust' ? 500 : 1600;
  const pos = new Float32Array(N * 3);
  weatherVel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = Math.random() * 120 - 60;
    pos[i * 3 + 1] = Math.random() * 30;
    pos[i * 3 + 2] = Math.random() * 120 - 60;
    weatherVel[i] = type === 'rain' ? 14 + Math.random() * 8 : type === 'snow' ? 1.5 + Math.random() * 2 : 0.6 + Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: type === 'rain' ? 0x9db8d9 : type === 'snow' ? 0xffffff : 0xd8c090,
    size: type === 'rain' ? 0.12 : type === 'snow' ? 0.25 : 0.3,
    transparent: true, opacity: type === 'dust' ? 0.35 : 0.75,
  });
  weatherPts = new THREE.Points(geo, mat);
  weatherPts.frustumCulled = false;
  scene.add(weatherPts);
}
function updateWeatherFX(t, dt) {
  if (!weatherPts) return;
  const pos = weatherPts.geometry.attributes.position;
  const fall = S.weather === 'dust' ? 0.4 : 1;
  for (let i = 0; i < weatherVel.length; i++) {
    let y = pos.getY(i) - weatherVel[i] * dt * fall;
    if (y < 0) y = 28 + Math.random() * 3;
    pos.setY(i, y);
    if (S.weather === 'snow') pos.setX(i, pos.getX(i) + Math.sin(t * 2 + i) * dt * 0.8);
    if (S.weather === 'dust') pos.setX(i, pos.getX(i) + dt * 2);
    if (Math.abs(pos.getX(i)) > 62) pos.setX(i, -pos.getX(i) * 0.95);
  }
  pos.needsUpdate = true;
}

// ---------- تتبع الكاميرا لممثل ----------
const _origSampleShotCam = sampleShotCam;

// ---------- تراجع / إعادة ----------
const undoStack = [], redoStack = [];
let lastSer = null;
function refreshAfterLoad() {
  document.getElementById('film-dur').value = S.filmDur;
  document.getElementById('film-dur-lbl').textContent = S.filmDur + ' ث';
  setWeather(S.weather || 'none');
  renderPanel(); drawTimeline(); seek(Math.min(S.time, S.filmDur));
}
export function undo() {
  if (!undoStack.length) return toast('لا شيء للتراجع عنه');
  redoStack.push(lastSer);
  lastSer = undoStack.pop();
  deserialize(lastSer);
  refreshAfterLoad();
}
export function redo() {
  if (!redoStack.length) return toast('لا شيء لإعادته');
  undoStack.push(lastSer);
  lastSer = redoStack.pop();
  deserialize(lastSer);
  refreshAfterLoad();
}
addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.key === ' ') { e.preventDefault(); S.playing ? pause() : play(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.selected) { removeObject(S.selected); renderPanel(); drawTimeline(); toast('اتمسح العنصر 🗑️'); }
  }
  else if (e.key === 'ArrowLeft') { seek(Math.max(0, S.time - 1)); }
  else if (e.key === 'ArrowRight') { seek(Math.min(S.filmDur, S.time + 1)); }
});
setInterval(() => {
  const cur = serialize();
  if (lastSer === null) { lastSer = cur; return; }
  if (cur !== lastSer) {
    undoStack.push(lastSer);
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
    lastSer = cur;
  }
}, 1500);

// ---------- تعليق صوتي ----------
let narrRec = null, narrChunks = [], narrStream = null;
const narrBuffers = new Map(); const narrFired = new Set();
export async function toggleNarration(btn) {
  if (narrRec && narrRec.state === 'recording') {
    narrRec.stop();
    return;
  }
  try {
    narrStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) { toast('الميكروفون غير متاح ⚠️'); return; }
  narrChunks = [];
  narrRec = new MediaRecorder(narrStream);
  const startTime = S.time;
  narrRec.ondataavailable = e => { if (e.data.size) narrChunks.push(e.data); };
  narrRec.onstop = () => {
    narrStream.getTracks().forEach(tr => tr.stop());
    const blob = new Blob(narrChunks, { type: narrRec.mimeType || 'audio/webm' });
    const rd = new FileReader();
    rd.onload = () => {
      S.narr.push({ id: genId(), time: startTime, dataURL: rd.result });
      narrBuffers.delete(startTime);
      toast('تعليق صوتي عند ' + startTime.toFixed(1) + ' ث 🎙️');
      if (activeTab === 'sound') renderPanel();
      drawTimeline();
    };
    rd.readAsDataURL(blob);
    if (btn) { btn.textContent = '🎙️ سجّل تعليقًا'; btn.classList.remove('danger'); }
  };
  narrRec.start();
  if (btn) { btn.textContent = '⏹ إيقاف التسجيل'; btn.classList.add('danger'); }
  toast('جارٍ تسجيل التعليق… 🎙️');
}
async function narrBuffer(n) {
  if (narrBuffers.has(n.id)) return narrBuffers.get(n.id);
  ensureAudio();
  const res = await fetch(n.dataURL);
  const buf = await audio.ctx.decodeAudioData(await res.arrayBuffer());
  narrBuffers.set(n.id, buf);
  return buf;
}
export async function checkNarr(prevT, t) {
  for (const n of S.narr) {
    if (n.time > prevT && n.time <= t && !narrFired.has(n.id)) {
      narrFired.add(n.id);
      try {
        const buf = await narrBuffer(n);
        const src = audio.ctx.createBufferSource();
        src.buffer = buf; src.connect(audio.master); src.start();
      } catch (e) {}
    }
  }
  if (t < prevT) narrFired.clear();
}

// ---- تبويب النصوص ----
function renderTextsTab() {
  let html = `<div class="sec"><h4>📝 نص على الشاشة</h4>
    <p style="font-size:11.5px;color:var(--muted);margin:0 0 8px">يظهر النص داخل الفيديو المصدَّر (عنوان، ترجمة سفلية، أو بطاقة سوداء).</p>
    <div class="row"><label>النص</label><input type="text" id="tx-text" placeholder="اكتب العنوان أو الترجمة…"></div>
    <div class="row"><label>النوع</label><select id="tx-style">
      <option value="title">عنوان علوي كبير</option>
      <option value="outline">عنوان بحدود سوداء</option>
      <option value="sub">ترجمة سفلية</option>
      <option value="card">بطاقة سوداء كاملة</option></select></div>
    <div class="row"><label>اللون</label><input type="color" id="tx-color" value="#ffffff">
    <label>المدة</label><input type="number" id="tx-dur" value="3" min="0.5" max="20" step="0.5" style="width:64px;flex:none"></div>
    <button class="chip-btn sel" id="tx-add" style="width:100%">＋ أضف عند ${S.time.toFixed(1)} ث</button>
  </div>
  <div class="sec"><h4>📋 النصوص المضافة</h4><div class="obj-list">`;
  S.texts.forEach((t, i) => {
    const styleName = t.style === 'title' ? 'عنوان' : t.style === 'card' ? 'بطاقة' : t.style === 'outline' ? 'محدد' : 'ترجمة';
    html += `<div class="obj-item"><span class="nm">📝 [${styleName}] ${esc(t.text)} @${t.time.toFixed(1)}ث</span><span class="x" data-del-tx="${i}">✕</span></div>`;
  });
  html += `</div></div>`;
  panelBody.innerHTML = html;
  document.getElementById('tx-add').onclick = () => {
    const text = document.getElementById('tx-text').value.trim();
    if (!text) return toast('اكتب النص أولًا');
    S.texts.push({
      id: genId(), time: S.time, text,
      style: document.getElementById('tx-style').value,
      color: document.getElementById('tx-color').value,
      dur: Math.max(0.5, parseFloat(document.getElementById('tx-dur').value) || 3),
    });
    toast('نص مضاف @ ' + S.time.toFixed(1) + ' ث 📝');
    renderPanel(); drawTimeline(); saveLocal();
  };
  panelBody.querySelectorAll('[data-del-tx]').forEach(el => el.onclick = () => {
    S.texts.splice(+el.dataset.delTx, 1); renderPanel(); drawTimeline();
  });
}

// ---------- قوالب مشاهد إضافية ----------
function buildDemoChase() {
  clearAll();
  S.filmDur = 25; S.title = 'مطاردة في الصحراء';
  addProp('pyramid', -25, -35, 2.5);
  addProp('arch', 5, -15); addProp('arch', -12, -5);
  addProp('obelisk', 14, -12); addProp('obelisk', -4, -22);
  addProp('rock', 6, 4); addProp('rock', -9, 9); addProp('palm', 18, 2); addProp('tent', -16, 14);
  addProp('camel', -14, -8, 1.2); addProp('stall', 12, 10, 1.1);
  const runner = addCharacter('لص', { shirt: 0x2c2f45, pants: 0x1a1c28, skin: 0xc98f5e }, -20, 12);
  const guard = addCharacter('حارس', { shirt: 0x8a2020, pants: 0x3a2a1a }, -26, 16);
  runner.track.actions.push({ type: 'walk', t0: 0.5, t1: 6, fx: -20, fz: 12, tx: 0, tz: 4 });
  runner.track.actions.push({ type: 'walk', t0: 6, t1: 12, fx: 0, fz: 4, tx: 14, tz: -6 });
  runner.track.actions.push({ type: 'gesture', name: 'jump', time: 6.2, dur: 1.2 });
  runner.track.actions.push({ type: 'walk', t0: 12, t1: 19, fx: 14, fz: -6, tx: 22, tz: 8 });
  guard.track.actions.push({ type: 'walk', t0: 1.5, t1: 8, fx: -26, fz: 16, tx: -4, fz2: 0, tx2: 0, tz: 7 });
  guard.track.actions.push({ type: 'walk', t0: 8, t1: 14, fx: -4, fz: 7, tx: 11, tz: -3 });
  guard.track.actions.push({ type: 'gesture', name: 'point', time: 14.5, dur: 2 });
  guard.track.actions.push({ type: 'walk', t0: 15, t1: 22, fx: 11, fz: -3, tx: 20, tz: 6 });
  const sh1 = addShot('انطلاقة', 0, 7); sh1.transition = 'fade';
  shotKey(sh1, 0, [-24, 5, 24], [-18, 1.5, 10], 45, runner.id);
  shotKey(sh1, 7, [2, 4, 14], [0, 1.5, 4], 42, runner.id);
  const sh2 = addShot('بين الأطلال', 7, 15); sh2.transition = 'fade';
  shotKey(sh2, 7, [8, 2.5, 2], [10, 1.5, -5], 38, runner.id);
  shotKey(sh2, 15, [16, 3, 6], [16, 1.5, 0], 40, runner.id);
  const sh3 = addShot('الخاتمة', 15, 25); sh3.transition = 'fade'; sh3.shake = 0.5;
  shotKey(sh3, 15, [24, 3.5, 14], [21, 1.5, 7], 42, runner.id);
  shotKey(sh3, 25, [10, 9, 22], [18, 2, 2], 52, null);
  S.music.mood = 'tension';
  S.sfx = [
    { id: genId(), time: 0.8, type: 'steps' }, { id: genId(), time: 6, type: 'whoosh' },
    { id: genId(), time: 12.5, type: 'steps' }, { id: genId(), time: 15, type: 'boom' },
    { id: genId(), time: 21, type: 'wind' },
  ];
  S.texts = [
    { id: genId(), time: 0.3, dur: 2.6, text: 'مطاردة في الصحراء', style: 'card', color: '#f5b942' },
    { id: genId(), time: 22, dur: 2.6, text: 'يتبع…', style: 'title', color: '#f5b942' },
  ];
  S.bubbles = [
    { id: genId(), objId: guard.id, time: 14.5, dur: 2.6, text: 'قِف مكانك أيها اللص!' },
    { id: genId(), objId: runner.id, time: 18, dur: 2.8, text: 'لن تمسكني أبدًا!' },
  ];
  S.weather = 'dust'; setWeather('dust');
  S.sun.tod = 0.42; S.sun.intensity = 1.35;
  addSpot({ pos: [4, 6, 8], color: 0xffc890, intensity: 70, target: [2, 1, 2] });
  seek(0); applySun();
}
function buildDemoNile() {
  clearAll();
  S.filmDur = 25; S.title = 'ليلة على النيل';
  addProp('boat', 0, -6, 1.3);
  addProp('palm', -14, -2); addProp('palm', -18, -8); addProp('palm', 16, -4); addProp('palm', 20, -10);
  addProp('fire', -4, 6); addProp('tent', -9, 9); addProp('well', 8, 8);
  addProp('house', 14, 12); addProp('house', -16, 14);
  const girl = addCharacter('ليلى', { shirt: 0x7a4ad6, pants: 0x2c2f45, hair: 0x120e0a }, -5, 3);
  const boy = addCharacter('كريم', { shirt: 0x2a8a6a, pants: 0x2c2f45 }, 5, 3);
  girl.track.actions.push({ type: 'walk', t0: 2, t1: 7, fx: -5, fz: 3, tx: -1.5, tz: 4.5 });
  girl.track.actions.push({ type: 'gesture', name: 'wave', time: 8, dur: 2.5 });
  girl.track.actions.push({ type: 'gesture', name: 'sit', time: 15, dur: 3 });
  boy.track.actions.push({ type: 'walk', t0: 2.5, t1: 7.5, fx: 5, fz: 3, tx: 1.5, tz: 4.5 });
  boy.track.actions.push({ type: 'gesture', name: 'bow', time: 8.5, dur: 2 });
  boy.track.actions.push({ type: 'gesture', name: 'clap', time: 11.5, dur: 2.5 });
  boy.track.actions.push({ type: 'gesture', name: 'sit', time: 15.5, dur: 3 });
  const sh1 = addShot('ليلة النيل', 0, 9); sh1.transition = 'fade';
  shotKey(sh1, 0, [0, 8, 22], [0, 2, -4], 55);
  shotKey(sh1, 9, [-6, 4, 12], [0, 1.5, 3], 45);
  const sh2 = addShot('اللقاء', 9, 17); sh2.transition = 'fade';
  shotKey(sh2, 9, [4, 2.5, 9], [0, 1.4, 4.5], 40);
  shotKey(sh2, 17, [-4, 2.5, 9], [0, 1.4, 4.5], 40);
  const sh3 = addShot('القمر والنار', 17, 25); sh3.transition = 'fade';
  shotKey(sh3, 17, [2, 1.8, 8.5], [0, 1, 5], 36);
  shotKey(sh3, 25, [0, 12, 20], [0, 2, -2], 50);
  S.music.mood = 'calm';
  S.sfx = [
    { id: genId(), time: 1, type: 'chirp' }, { id: genId(), time: 8.2, type: 'magic' },
    { id: genId(), time: 12, type: 'crowd' }, { id: genId(), time: 18, type: 'bell' },
  ];
  S.texts = [
    { id: genId(), time: 0.4, dur: 2.8, text: 'ليلة على النيل', style: 'card', color: '#4ecdc4' },
    { id: genId(), time: 21.5, dur: 2.8, text: 'النهاية', style: 'title', color: '#4ecdc4' },
  ];
  S.bubbles = [
    { id: genId(), objId: girl.id, time: 8.5, dur: 3, text: 'أهلًا يا كريم! الجو جميل الليلة' },
    { id: genId(), objId: boy.id, time: 12, dur: 3, text: 'وأجمل بوجودك يا ليلى' },
  ];
  S.sun.tod = 0.82; S.sun.intensity = 0.9; S.ambient = 0.5;
  addSpot({ pos: [0, 5, 8], color: 0xffb060, intensity: 90, target: [0, 1, 4] });
  seek(0); applySun();
}
function buildDemoWedding() {
  clearAll();
  S.filmDur = 25; S.title = 'فرح في الحارة';
  addProp('house', -14, 8); addProp('house', 14, 8); addProp('house', 0, 16, 1.2);
  addProp('palm', -18, -4); addProp('palm', 18, -4);
  addProp('fire', 0, 2); addProp('tent', -10, -10, 1.2); addProp('tent', 10, -10, 1.2);
  const groom = addCharacter('العريس', { shirt: 0xf5f5f5, pants: 0x1a1c28, skin: 0xb87850 }, -2, -2);
  const bride = addCharacter('العروسة', { shirt: 0xe8b4d8, pants: 0xf5f5f5, hair: 0x120e0a }, 2, -2);
  const friend1 = addCharacter('صديق', { shirt: 0x3a6ad4, pants: 0x2c2f45 }, -6, 2);
  const friend2 = addCharacter('صديقة', { shirt: 0xd43a6a, pants: 0x2c2f45, hair: 0x2a1a0a }, 6, 2);
  groom.track.actions.push({ type: 'walk', t0: 0.5, t1: 3.5, fx: -2, fz: -2, tx: 0, tz: 0 });
  groom.track.actions.push({ type: 'gesture', name: 'dance', time: 5, dur: 5 });
  groom.track.actions.push({ type: 'gesture', name: 'cheer', time: 11, dur: 3 });
  groom.track.actions.push({ type: 'gesture', name: 'bow', time: 20, dur: 2.5 });
  bride.track.actions.push({ type: 'walk', t0: 0.5, t1: 3.5, fx: 2, fz: -2, tx: 0.8, tz: 0.4 });
  bride.track.actions.push({ type: 'gesture', name: 'dance', time: 5.5, dur: 5 });
  bride.track.actions.push({ type: 'gesture', name: 'wave', time: 11.5, dur: 2.5 });
  bride.track.actions.push({ type: 'gesture', name: 'clap', time: 20.5, dur: 2.5 });
  friend1.track.actions.push({ type: 'gesture', name: 'clap', time: 4, dur: 3 });
  friend1.track.actions.push({ type: 'gesture', name: 'dance', time: 7.5, dur: 4 });
  friend1.track.actions.push({ type: 'gesture', name: 'cheer', time: 14, dur: 2.5 });
  friend1.track.actions.push({ type: 'walk', t0: 16, t1: 20, fx: -6, fz: 2, tx: -3, tz: 1 });
  friend2.track.actions.push({ type: 'gesture', name: 'dance', time: 4.5, dur: 5 });
  friend2.track.actions.push({ type: 'gesture', name: 'cheer', time: 10, dur: 2.5 });
  friend2.track.actions.push({ type: 'gesture', name: 'clap', time: 15, dur: 3 });
  friend2.track.actions.push({ type: 'gesture', name: 'jump', time: 19, dur: 1.5 });
  const sh1 = addShot('دخلة العريس', 0, 8); sh1.transition = 'fade';
  shotKey(sh1, 0, [0, 7, 18], [0, 2, -1], 52);
  shotKey(sh1, 8, [6, 3.5, 9], [0, 1.5, 0], 44);
  const sh2 = addShot('الرقصة', 8, 16); sh2.transition = 'fade'; sh2.mood = 'oriental';
  shotKey(sh2, 8, [-7, 2.5, 6], [0, 1.2, 0], 40);
  shotKey(sh2, 16, [7, 2.5, 6], [0, 1.2, 0], 40);
  const sh3 = addShot('زغاريد الختام', 16, 25); sh3.transition = 'fade';
  shotKey(sh3, 16, [3, 2, 5], [0, 1.3, 0], 36);
  shotKey(sh3, 25, [0, 11, 16], [0, 2, 2], 50);
  S.music.mood = 'happy';
  S.sfx = [
    { id: genId(), time: 0.5, type: 'crowd' }, { id: genId(), time: 4, type: 'bell' },
    { id: genId(), time: 8, type: 'crowd' }, { id: genId(), time: 12, type: 'magic' },
    { id: genId(), time: 16, type: 'crowd' }, { id: genId(), time: 21, type: 'bell' },
  ];
  S.texts = [
    { id: genId(), time: 0.3, dur: 2.8, text: 'فرح في الحارة', style: 'card', color: '#e8608a' },
    { id: genId(), time: 22, dur: 2.6, text: 'بالرفاء والبنين', style: 'title', color: '#e8608a' },
  ];
  S.bubbles = [
    { id: genId(), objId: friend1.id, time: 4.2, dur: 2.6, text: 'مبروك يا صاحبي!' },
    { id: genId(), objId: groom.id, time: 10.5, dur: 2.8, text: 'أحلى يوم في حياتي!' },
    { id: genId(), objId: friend2.id, time: 14, dur: 2.6, text: 'زغروطة للعروسة!' },
  ];
  S.sun.tod = 0.72; S.sun.intensity = 0.75; S.ambient = 0.55;
  addSpot({ pos: [-4, 6, 5], color: 0xff7090, intensity: 80, target: [0, 1, 0] });
  addSpot({ pos: [4, 6, 5], color: 0xffc060, intensity: 80, target: [0, 1, 0] });
  seek(0); applySun();
}
function buildDemoFootball() {
  clearAll();
  S.filmDur = 25; S.title = 'ماتش في الحارة';
  addProp('house', -16, 6); addProp('house', 16, 6); addProp('house', 0, 18, 1.3);
  addProp('streetlamp', -8, 10); addProp('streetlamp', 8, 10);
  addProp('stall', -12, -8); addProp('bike', 11, -6);
  const ball = addProp('ball', 0, 0, 1);
  const p1 = addCharacter('شيكو', { shirt: 0xc23a3a, pants: 0x1a1c28, skin: 0xb87850 }, -4, 2);
  const p2 = addCharacter('مودي', { shirt: 0x3a6ad4, pants: 0x2c2f45 }, 4, 1);
  const keeper = addCharacter('الحارس', { shirt: 0x2a8a6a, pants: 0x1a1c28 }, 0, -12);
  const fan = addCharacter('مشجع', { shirt: 0xe8a23a, pants: 0x2c2f45 }, -8, 5);
  p1.track.actions.push({ type: 'walk', t0: 1, t1: 4, fx: -4, fz: 2, tx: -1, tz: 0.5 });
  p1.track.actions.push({ type: 'walk', t0: 5, t1: 10, fx: -1, fz: 0.5, tx: 3, tz: -4 });
  p1.track.actions.push({ type: 'gesture', name: 'cheer', time: 12.5, dur: 3.5 });
  p1.track.actions.push({ type: 'gesture', name: 'run', time: 16, dur: 2.5 });
  p2.track.actions.push({ type: 'walk', t0: 1.5, t1: 5, fx: 4, fz: 1, tx: 0.5, tz: 0 });
  p2.track.actions.push({ type: 'gesture', name: 'cry', time: 13, dur: 3 });
  p2.track.actions.push({ type: 'gesture', name: 'think', time: 18, dur: 3 });
  keeper.track.actions.push({ type: 'gesture', name: 'jump', time: 11.6, dur: 1.4 });
  keeper.track.actions.push({ type: 'gesture', name: 'faint', time: 14, dur: 4 });
  fan.track.actions.push({ type: 'gesture', name: 'clap', time: 12.8, dur: 3 });
  fan.track.actions.push({ type: 'gesture', name: 'cheer', time: 16.5, dur: 3 });
  // مسار الكورة
  addKey(ball, 0, -0.5, 1, 0); addKey(ball, 10, 2.5, -3.5, 0);
  addKey(ball, 11.5, 0.5, -9, 0); addKey(ball, 12.2, 0, -11.5, 0);
  addKey(ball, 15, 1.5, -10, 0);
  const sh1 = addShot('سيطرة شيكو', 0, 10); sh1.transition = 'fade';
  shotKey(sh1, 0, [0, 9, 16], [0, 1, 0], 50);
  shotKey(sh1, 10, [5, 3.5, 7], [1, 1, -2], 44, p1.id);
  const sh2 = addShot('الجووول', 10, 15); sh2.transition = 'fade'; sh2.shake = 1; sh2.mood = 'epic';
  shotKey(sh2, 10, [6, 2, 2], [0, 1, -10], 42);
  shotKey(sh2, 15, [-5, 2.5, -4], [0, 1, -11], 40);
  const sh3 = addShot('الاحتفال', 15, 25); sh3.transition = 'fade';
  shotKey(sh3, 15, [4, 2.5, 6], [-1, 1.4, 2], 42, p1.id);
  shotKey(sh3, 25, [0, 10, 14], [0, 1.5, 2], 52);
  S.music.mood = 'happy';
  S.sfx = [
    { id: genId(), time: 1, type: 'crowd' }, { id: genId(), time: 10.2, type: 'whoosh' },
    { id: genId(), time: 12.3, type: 'crowd' }, { id: genId(), time: 12.6, type: 'bell' },
    { id: genId(), time: 16, type: 'crowd' },
  ];
  S.texts = [
    { id: genId(), time: 0.3, dur: 2.8, text: 'ماتش في الحارة', style: 'card', color: '#4ecdc4' },
    { id: genId(), time: 12.2, dur: 2.6, text: 'جوووول!', style: 'outline', color: '#f5b942' },
    { id: genId(), time: 22, dur: 2.6, text: 'النهاية', style: 'title', color: '#4ecdc4' },
  ];
  S.bubbles = [
    { id: genId(), objId: fan.id, time: 12.8, dur: 2.6, text: 'يابني انت وحش!' },
    { id: genId(), objId: p1.id, time: 16.5, dur: 2.8, text: 'هاتوا اللي بعده!' },
    { id: genId(), objId: p2.id, time: 19, dur: 2.6, text: 'العودة في الشوط التاني' },
  ];
  S.sun.tod = 0.6; S.sun.intensity = 1.1;
  addSpot({ pos: [0, 7, 4], color: 0xffe0a0, intensity: 60, target: [0, 1, 0] });
  seek(0); applySun();
}

// ---------- اختيار القالب ----------
document.getElementById('btn-demo').onclick = () => {
  overlay(true, '', 'اختر مشهدًا جاهزًا للانطلاق منه — كل قالب قصة كاملة بلقطات وموسيقى ونصوص:', [
    { t: '🏜️ لقاء عند الأهرام', fn: () => { buildDemo(); refreshAfterLoad(); overlay(false); toast('مشهد: لقاء عند الأهرام ▶'); } },
    { t: '🗡️ مطاردة في الصحراء', fn: () => { buildDemoChase(); refreshAfterLoad(); overlay(false); toast('مشهد: مطاردة في الصحراء ▶'); } },
    { t: '🌙 ليلة على النيل', fn: () => { buildDemoNile(); refreshAfterLoad(); overlay(false); toast('مشهد: ليلة على النيل ▶'); } },
    { t: '💃 فرح في الحارة', fn: () => { buildDemoWedding(); refreshAfterLoad(); overlay(false); toast('مشهد: فرح في الحارة ▶'); } },
    { t: '⚽ ماتش في الحارة', fn: () => { buildDemoFootball(); refreshAfterLoad(); overlay(false); toast('مشهد: ماتش في الحارة ▶'); } },
    { t: 'إلغاء', fn: () => overlay(false) },
  ]);
};

// أزرار التراجع/الإعادة في الشريط العلوي
document.getElementById('btn-undo').onclick = () => undo();
document.getElementById('btn-redo').onclick = () => redo();

// ================== الجولة ٣ ==================
S.bubbles = S.bubbles || [];   // {id, objId, time, dur, text}

// ---------- سحب العناصر داخل العرض ----------
var dragObj = null;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const viewportEl = document.getElementById('viewport');
viewportEl.addEventListener('pointerdown', e => {
  if (S.playing || !S.selected) return;
  const o = getObj(S.selected);
  if (!o) return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(o.group.children, true);
  if (hits.length) {
    dragObj = o;
    controls.enabled = false;
    e.stopPropagation();
  }
}, true);
addEventListener('pointermove', e => {
  if (!dragObj) return;
  const r = canvas.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(dragPlane, hit)) {
    dragObj.group.position.x = Math.max(-70, Math.min(70, hit.x));
    dragObj.group.position.z = Math.max(-70, Math.min(70, hit.z));
    if (activeTab === 'scene') {
      const sx = document.getElementById('sel-x'), sz = document.getElementById('sel-z');
      if (sx) { sx.value = dragObj.group.position.x; }
      if (sz) { sz.value = dragObj.group.position.z; }
    }
  }
}, true);
addEventListener('pointerup', () => {
  if (dragObj) {
    dragObj = null;
    if (!S.playing) controls.enabled = true;
  }
}, true);

// ---------- فقاعات الكلام ----------
var bubbleSprites = new Map();
function makeBubbleTexture(text) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 300;
  const g = c.getContext('2d');
  g.direction = 'rtl'; g.textAlign = 'center';
  g.font = '700 52px Cairo, sans-serif';
  // تقسيم السطور
  const words = text.split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    if (g.measureText(line + ' ' + w).width > 540 && line) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  const bh = 66 + lines.length * 62;
  const by = 10;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#222'; g.lineWidth = 5;
  g.beginPath(); g.roundRect(15, by, 610, bh, 34); g.fill(); g.stroke();
  // ذيل الفقاعة
  g.beginPath();
  g.moveTo(300, by + bh); g.lineTo(340, by + bh); g.lineTo(312, by + bh + 48);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1a1a22';
  lines.forEach((l, i) => g.fillText(l, 320, by + 56 + i * 62, 560));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function updateBubbles(t) {
  const active = new Set();
  for (const b of S.bubbles) {
    if (t >= b.time && t <= b.time + b.dur) active.add(b.id);
    let sp = bubbleSprites.get(b.id);
    if (t >= b.time && t <= b.time + b.dur) {
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeBubbleTexture(b.text), transparent: true, depthTest: false }));
        sp.renderOrder = 3;
        sp.scale.set(4.8, 2.25, 1);
        bubbleSprites.set(b.id, sp);
        const o = getObj(b.objId);
        if (o) o.group.add(sp);
        sp.position.set(0, 4.1, 0);
      }
      sp.visible = true;
    } else if (sp) sp.visible = false;
  }
}
function clearBubbleSprites() {
  if (!bubbleSprites) return;
  for (const sp of bubbleSprites.values()) {
    sp.parent?.remove(sp);
    sp.material.map.dispose(); sp.material.dispose();
  }
  bubbleSprites.clear();
}

// ---------- بوستر (صورة من الفيلم) ----------
function capturePoster() {
  render3D(S.playing ? filmCam : camera);
  renderer.autoClear = false; renderer.clearDepth();
  renderer.render(overlayScene, overlayCam);
  renderer.autoClear = true;
  canvas.toBlob(blob => {
    if (!blob) return toast('تعذر التقاط البوستر');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.title || 'فيلم') + '-بوستر.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    toast('تم حفظ البوستر 📸');
  }, 'image/png');
}
document.getElementById('btn-poster')?.addEventListener('click', capturePoster);

// ---------- موسيقى لكل لقطة ----------
var lastShotId = null;
function checkShotMood() {
  const sh = activeShot(S.time);
  if (!sh) return;
  if (sh.id !== lastShotId) {
    lastShotId = sh.id;
    if (sh.mood && sh.mood !== S.music.mood) {
      S.music.mood = sh.mood;
      if (S.playing) startMusic(S.time);
    }
  }
    }
