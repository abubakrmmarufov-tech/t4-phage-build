/* ============================================================================
   Bacteriophage T4 — a virus builds itself
   A single-scene, code-only WebGL piece. No external assets.
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* -------------------------------------------------------------------------- */
/*  small math helpers                                                         */
/* -------------------------------------------------------------------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
// deterministic pseudo-random
let _seed = 1337;
const rnd = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
const rand = (a, b) => a + (b - a) * rnd();

const TOTAL = 30.0;
const SHEATH_N = 22;

const CHAPTERS = [
  { t: 0.0,  num: '01 / 08', name: 'Capsid assembly',      desc: 'Protein subunits dock, one by one, into an elongated shell.' },
  { t: 4.6,  num: '02 / 08', name: 'Packing the genome',    desc: 'The double-stranded DNA is pumped into the empty head.' },
  { t: 8.2,  num: '03 / 08', name: 'Neck & collar',         desc: 'A collar forms between the head and the tail.' },
  { t: 9.8,  num: '04 / 08', name: 'Building the tail',     desc: 'A tube is wrapped by a stack of contractile sheath rings.' },
  { t: 13.2, num: '05 / 08', name: 'Attaching the fibres',  desc: 'Six long tail fibres are fitted to the baseplate.' },
  { t: 16.2, num: '06 / 08', name: 'Landing',               desc: 'The phage approaches a host bacterium.' },
  { t: 19.4, num: '07 / 08', name: 'Anchoring',             desc: 'Fibres pin the virus down; the sheath contracts.' },
  { t: 23.4, num: '08 / 08', name: 'Injecting the DNA',     desc: 'The genome is driven through the tail into the host.' },
];

/* -------------------------------------------------------------------------- */
/*  DOM                                                                        */
/* -------------------------------------------------------------------------- */
const $ = id => document.getElementById(id);
const app = $('app');
const loader = $('loader');
const errBox = $('err');

function fail(e) {
  console.error(e);
  errBox.style.display = 'flex';
  errBox.textContent = 'Build error:\n\n' + (e && e.stack ? e.stack : e);
  loader.classList.add('gone');
}

/* -------------------------------------------------------------------------- */
/*  renderer / scene / camera                                                  */
/* -------------------------------------------------------------------------- */
let renderer, scene, camera, composer, controls, bloom, grainPass;
let W = window.innerWidth, H = window.innerHeight;
const DPR_CAP = 2;
let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
let renderScale = 1;

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setPixelRatio(dpr * renderScale);
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04080d);
  scene.fog = new THREE.FogExp2(0x04080d, 0.0165);

  camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);
  camera.position.set(10.4, 4.2, 16.2);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.55, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 34;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.32;
  controls.update();
}

/* -------------------------------------------------------------------------- */
/*  lighting + ground                                                          */
/* -------------------------------------------------------------------------- */
function addLighting() {
  scene.add(new THREE.HemisphereLight(0x7fa2b4, 0x0a1016, 0.55));

  const key = new THREE.DirectionalLight(0xe6f4ff, 2.7);
  key.position.set(7, 12, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 45;
  key.shadow.camera.left = -12; key.shadow.camera.right = 12;
  key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x4fe0cd, 1.9);
  rim.position.set(-9, 3, -8);
  scene.add(rim);

  const back = new THREE.DirectionalLight(0x9fc4e8, 0.9);
  back.position.set(2, -4, -10);
  scene.add(back);

  const fill = new THREE.DirectionalLight(0x8fb0c8, 0.5);
  fill.position.set(-6, -3, 7);
  scene.add(fill);

  // soft studio pool of light on a dark floor
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grd.addColorStop(0, 'rgba(150,190,200,0.30)');
  grd.addColorStop(0.35, 'rgba(90,130,145,0.12)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7.35;
  scene.add(floor);

  // (no distant catcher plane — its detached blob shadows read as artifacts)
}

function addDust() {
  const N = 520;
  const pos = new Float32Array(N * 3);
  const siz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-18, 18);
    pos[i * 3 + 1] = rand(-11, 13);
    pos[i * 3 + 2] = rand(-16, 12);
    siz[i] = rand(0.5, 2.4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPix: { value: dpr } },
    vertexShader: `
      attribute float aSize; uniform float uTime; uniform float uPix; varying float vA;
      void main(){
        vec3 p = position;
        p.y += sin(uTime*0.13 + position.x*0.7)*0.35;
        p.x += cos(uTime*0.09 + position.z*0.5)*0.3;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPix * (24.0 / max(-mv.z,1.0));
        vA = smoothstep(40.0, 6.0, -mv.z) * 0.5;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5,0.0,d)*vA;
        gl_FragColor = vec4(0.55,0.78,0.82,a);
      }`
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return mat;
}

/* -------------------------------------------------------------------------- */
/*  geometry helpers                                                           */
/* -------------------------------------------------------------------------- */
function subdivIcosahedron(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]]
    .map(v => { const l = Math.hypot(...v); return v.map(x => x / l); });
  const faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
                 [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const map = new Map(), verts = [], tris = [];
  const add = (p, wi) => {
    const key = p.map(x => Math.round(x * 1e5)).join(',');
    if (map.has(key)) return map.get(key);
    const obj = { p, w: wi || 0 };
    const i = verts.length; map.set(key, i); verts.push(obj); return i;
  };
  for (const f of faces) {
    const a = base[f[0]], b = base[f[1]], c = base[f[2]];
    const grid = [];
    for (let i = 0; i <= detail; i++) {
      grid[i] = [];
      for (let j = 0; j <= detail - i; j++) {
        const wa = 1 - (i + j) / detail, wb = i / detail, wc = j / detail;
        let p = [a[0]*wa+b[0]*wb+c[0]*wc, a[1]*wa+b[1]*wb+c[1]*wc, a[2]*wa+b[2]*wb+c[2]*wc];
        const l = Math.hypot(...p); p = p.map(x => x / l);
        // which original vertex is closest? (weight tells pentamer/hexamer)
        const wi = (wa > wb && wa > wc) ? f[0] : (wb > wc ? f[1] : f[2]);
        grid[i][j] = add(p, wi);
      }
    }
    for (let i = 0; i < detail; i++) for (let j = 0; j < detail - i; j++) {
      tris.push(grid[i][j], grid[i+1][j], grid[i][j+1]);
      if (j < detail - i - 1) tris.push(grid[i+1][j], grid[i+1][j+1], grid[i][j+1]);
    }
  }
  // pentamers = the 12 original vertices (appear as corners of base faces)
  const pentSet = new Set(base.map(v => v.map(x => Math.round(x * 1e4)).join(',')));
  for (const v of verts) v.pent = pentSet.has(v.p.map(x => Math.round(x * 1e4)).join(','));
  return { verts, tris };
}

/* -------------------------------------------------------------------------- */
/*  the virus                                                                  */
/* -------------------------------------------------------------------------- */
const V = {
  headR: 1.52, headH: 2.18, headY: 3.55,
  headBottom: 3.55 - 2.18,
  collarY: 1.18,
  tailTop: 0.9, tailBottom: -2.62,
  baseY: -2.62,
  bactY: -6.35,
  descend: 1.60,
};

let phage, headGroup, capsidShell, capsomers, knobs, portal, dnaGroup, dnaStrandA, dnaStrandB, dnaRungs, packStream;
let neckGroup, collarRings, whiskers;
let tube, sheath, sheathMatRef, sheathRings = [];
let baseGroup, baseSpokes = [], shortFibers = [], longFibers = [];
let bacterium, bactCore, bactGlow;
let injectStream, injectHelix, injectCoil;

const capsData = [];   // final transforms + scatter for each capsomer
const _dummy = new THREE.Object3D();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function buildPhage() {
  phage = new THREE.Group();
  scene.add(phage);

  /* ---------- HEAD ---------- */
  headGroup = new THREE.Group();
  headGroup.position.y = V.headY;
  phage.add(headGroup);

  const ico = subdivIcosahedron(4); // 162 capsomers

  // faceted inner shell
  const shellPos = new Float32Array(ico.tris.length * 3);
  ico.tris.forEach((vi, k) => {
    const v = ico.verts[vi].p;
    shellPos[k*3]   = v[0] * V.headR * 0.985;
    shellPos[k*3+1] = v[1] * V.headH * 0.985;
    shellPos[k*3+2] = v[2] * V.headR * 0.985;
  });
  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.BufferAttribute(shellPos, 3));
  shellGeo.computeVertexNormals();
  capsidShell = new THREE.Mesh(shellGeo, new THREE.MeshPhysicalMaterial({
    color: 0x1d4a56, roughness: 0.42, metalness: 0.05,
    transparent: true, opacity: 0.20, side: THREE.DoubleSide,
    depthWrite: false, clearcoat: 0.5, clearcoatRoughness: 0.4
  }));
  capsidShell.visible = false;
  headGroup.add(capsidShell);

  // edge lines on shell
  const edgeGeo = new THREE.EdgesGeometry(shellGeo, 8);
  const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
    color: 0x6fb7c0, transparent: true, opacity: 0.10, depthWrite: false }));
  edges.visible = false;
  headGroup.add(edges);
  capsidShell.userData.edges = edges;

  // capsomers (hex prisms) + top knobs
  const capGeo = new THREE.CylinderGeometry(0.275, 0.315, 0.20, 6, 1);
  capGeo.translate(0, 0.10, 0);
  const knobGeo = new THREE.CylinderGeometry(0.15, 0.19, 0.10, 6, 1);
  knobGeo.translate(0, 0.05, 0);

  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.18, flatShading: true });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.22, flatShading: true });
  const N = ico.verts.length;
  capsomers = new THREE.InstancedMesh(capGeo, capMat, N);
  knobs = new THREE.InstancedMesh(knobGeo, knobMat, N);
  capsomers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  knobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  capsomers.castShadow = true; capsomers.receiveShadow = true;
  knobs.castShadow = true;

  const cHex = new THREE.Color(0x6f9ba5), cPent = new THREE.Color(0x8fc4c2);
  ico.verts.forEach((vv, i) => {
    const nrm = new THREE.Vector3(vv.p[0]/V.headR, vv.p[1]/V.headH, vv.p[2]/V.headR).normalize();
    const pos = new THREE.Vector3(vv.p[0]*V.headR, vv.p[1]*V.headH, vv.p[2]*V.headR).addScaledVector(nrm, 0.045);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, nrm);
    const s = vv.pent ? 1.12 : rand(0.93, 1.04);
    // begin as a loose cloud of subunits around the future head, closing in
    const sa = rnd() * Math.PI * 2, sb = Math.acos(rand(-1,1)), sr = rand(2.4, 4.3);
    const scatter = new THREE.Vector3(
      Math.sin(sb)*Math.cos(sa)*sr,
      Math.cos(sb)*sr*0.62 + 0.3,
      Math.sin(sb)*Math.sin(sa)*sr
    );
    capsData.push({ pos, q, s, pent: vv.pent, scatter,
      spin: new THREE.Vector3(rand(-3,3), rand(-3,3), rand(-3,3)),
      delay: (vv.p[1] * 0.5 + 0.5) * 0.55 + rand(0, 0.32) });
    capsomers.setColorAt(i, (vv.pent ? cPent : cHex).clone().multiplyScalar(rand(0.86, 1.08)));
    knobs.setColorAt(i, (vv.pent ? new THREE.Color(0xbfe6dd) : new THREE.Color(0x9cc9c8)).clone().multiplyScalar(rand(0.85, 1.05)));
  });
  capsomers.instanceColor.needsUpdate = true;
  knobs.instanceColor.needsUpdate = true;
  capsomers.visible = false; knobs.visible = false;
  headGroup.add(capsomers, knobs);

  // portal at south pole
  portal = new THREE.Group();
  const portRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.24, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8aa9ad, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
  portRing.position.y = 0.06;
  const portCap = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.06, 8, 16),
    new THREE.MeshBasicMaterial({ color: 0x6fe6d0, transparent: true, opacity: 0.85 }));
  portCap.rotation.x = Math.PI / 2; portCap.position.y = -0.06;
  portal.add(portRing, portCap);
  portal.position.set(0, -V.headH * 0.94, 0);
  portal.visible = false;
  headGroup.add(portal);

  /* ---------- DNA inside head ---------- */
  dnaGroup = new THREE.Group();
  headGroup.add(dnaGroup);
  const ptsA = [], ptsB = [];
  const NS = 620, turns = 15;
  for (let i = 0; i <= NS; i++) {
    const f = i / NS;
    const y = -V.headH * 0.80 + f * (V.headH * 1.60);
    const env = Math.pow(Math.sin(Math.PI * f), 0.42);
    const r = 0.10 + V.headR * 0.60 * env;
    const a = f * turns * Math.PI * 2;
    ptsA.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    ptsB.push(new THREE.Vector3(Math.cos(a + Math.PI) * r, y, Math.sin(a + Math.PI) * r));
  }
  const dnaMat = new THREE.MeshStandardMaterial({
    color: 0x2fd9be, emissive: 0x1bbfae, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.1
  });
  const curveA = new THREE.CatmullRomCurve3(ptsA);
  const curveB = new THREE.CatmullRomCurve3(ptsB);
  dnaStrandA = new THREE.Mesh(new THREE.TubeGeometry(curveA, 620, 0.052, 6, false), dnaMat);
  dnaStrandB = new THREE.Mesh(new THREE.TubeGeometry(curveB, 620, 0.052, 6, false), dnaMat);
  dnaStrandA.idxA = dnaStrandA.geometry.index.count;
  dnaStrandB.idxA = dnaStrandB.geometry.index.count;
  dnaGroup.add(dnaStrandA, dnaStrandB);

  const rungGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5);
  rungGeo.translate(0, 0.5, 0);
  const rungMat = new THREE.MeshStandardMaterial({ color: 0x8ff0dc, emissive: 0x2bc9b4, emissiveIntensity: 1.1, roughness: 0.4 });
  const NR = 110;
  dnaRungs = new THREE.InstancedMesh(rungGeo, rungMat, NR);
  for (let i = 0; i < NR; i++) {
    const f = (i + 0.5) / NR;
    const a = f * turns * Math.PI * 2;
    const env = Math.pow(Math.sin(Math.PI * f), 0.42);
    const r = 0.10 + V.headR * 0.60 * env;
    const y = -V.headH * 0.80 + f * (V.headH * 1.60);
    const p1 = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const p2 = new THREE.Vector3(Math.cos(a + Math.PI) * r, y, Math.sin(a + Math.PI) * r);
    const dir = _v.copy(p2).sub(p1);
    const len = dir.length(); dir.normalize();
    _dummy.position.copy(p1);
    _dummy.quaternion.setFromUnitVectors(UP, dir);
    _dummy.scale.set(1, len, 1);
    _dummy.updateMatrix();
    dnaRungs.setMatrixAt(i, _dummy.matrix);
  }
  dnaRungs.instanceMatrix.needsUpdate = true;
  dnaGroup.add(dnaRungs);

  packStream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1, 6),
    new THREE.MeshBasicMaterial({ color: 0x9ffbe6, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  headGroup.add(packStream);
  dnaGroup.visible = false; packStream.visible = false;

  /* ---------- NECK / COLLAR ---------- */
  neckGroup = new THREE.Group();
  phage.add(neckGroup);
  collarRings = new THREE.Group();
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x7799a2, roughness: 0.42, metalness: 0.4 });
  [[0.52, 0.10, 0.10], [0.62, 0.07, 0.0], [0.50, 0.09, -0.10]].forEach(([r,h,yy]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r*0.94, h, 16), collarMat);
    m.position.y = V.collarY + yy; m.castShadow = true; collarRings.add(m);
  });
  neckGroup.add(collarRings);
  // six fibritin whiskers
  whiskers = new THREE.Group();
  const whMat = new THREE.MeshStandardMaterial({ color: 0x8ec0bc, roughness: 0.5, metalness: 0.15 });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.2;
    const pivot = new THREE.Group(); pivot.rotation.y = a;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.45, V.collarY + 0.04, 0),
      new THREE.Vector3(1.1, V.collarY + 0.30, 0.1),
      new THREE.Vector3(1.9, V.collarY + 0.75, -0.2),
      new THREE.Vector3(2.5, V.collarY + 1.55, -0.35),
    ]);
    pivot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.022, 5, false), whMat));
    whiskers.add(pivot);
  }
  neckGroup.add(whiskers);

  /* ---------- TAIL TUBE + SHEATH ---------- */
  const tailLen = V.tailTop - V.tailBottom;
  tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.205, tailLen, 14),
    new THREE.MeshStandardMaterial({ color: 0x415d66, roughness: 0.38, metalness: 0.55,
      transparent: true, opacity: 0.82, depthWrite: false })
  );
  tube.position.y = (V.tailTop + V.tailBottom) / 2;
  tube.castShadow = true;
  phage.add(tube);
  // inner bore glow (visible during injection)
  injectStream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 1, 12),
    new THREE.MeshBasicMaterial({ color: 0x4fd9c4, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  phage.add(injectStream);
  // bright double helix running down the conduit, revealed from the head downward
  const hpts1 = [], hpts2 = [];
  const HN = 520, HT = 18, HLEN = 5.6, HR = 0.16;
  for (let i=0;i<=HN;i++){
    const f=i/HN, a=f*HT*Math.PI*2;
    hpts1.push(new THREE.Vector3(Math.cos(a)*HR, -f*HLEN, Math.sin(a)*HR));
    hpts2.push(new THREE.Vector3(Math.cos(a+Math.PI)*HR, -f*HLEN, Math.sin(a+Math.PI)*HR));
  }
  const injHelixMat = new THREE.MeshBasicMaterial({ color: 0x9dffe4, transparent:true, opacity:0.0, blending:THREE.AdditiveBlending, depthWrite:false });
  const injH1 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hpts1), HN, 0.036, 5, false), injHelixMat);
  const injH2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hpts2), HN, 0.036, 5, false), injHelixMat);
  injH1.idxA = injH1.geometry.index.count; injH2.idxA = injH2.geometry.index.count;
  injectHelix = new THREE.Group(); injectHelix.add(injH1, injH2);
  injectHelix.position.set(0, V.headBottom, 0);
  injectHelix.userData.parts = [injH1, injH2];
  phage.add(injectHelix);

  const sheathGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.125, 12, 1);
  sheathMatRef = new THREE.MeshStandardMaterial({ color: 0x829ba3, roughness: 0.36, metalness: 0.48,
    flatShading: true, transparent: true, opacity: 1, depthWrite: true });
  const sheathMat = sheathMatRef;
  sheath = new THREE.InstancedMesh(sheathGeo, sheathMat, SHEATH_N);
  sheath.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sheath.castShadow = true; sheath.receiveShadow = true;
  phage.add(sheath);
  for (let i = 0; i < SHEATH_N; i++) {
    const m = new THREE.Mesh(sheathGeo, sheathMat); // placeholder for per-ring data
    sheathRings.push({ i });
  }

  /* ---------- BASEPLATE ---------- */
  baseGroup = new THREE.Group();
  baseGroup.position.y = V.baseY;
  phage.add(baseGroup);
  const bpMat = new THREE.MeshStandardMaterial({ color: 0x7d989f, roughness: 0.4, metalness: 0.5, flatShading: true });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.30, 6), bpMat);
  hub.castShadow = true; baseGroup.add(hub);
  const hub2 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.40, 0.16, 6), bpMat);
  hub2.position.y = -0.20; baseGroup.add(hub2);
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.04, 7, 6), new THREE.MeshBasicMaterial({ color: 0x6fe0cc, transparent: true, opacity: 0.5 }));
  hubRing.rotation.x = Math.PI / 2; hubRing.position.y = -0.03; baseGroup.add(hubRing);

  // six baseplate spokes (open into a star on contraction)
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = i / 6 * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.20), bpMat);
    arm.position.set(0.34, -0.26, 0); arm.castShadow = true;
    const holder = new THREE.Group(); holder.add(arm);
    holder.position.set(0.12, -0.06, 0);
    pivot.add(holder);
    baseGroup.add(pivot);
    baseSpokes.push({ holder, arm });
  }
  // six short tail fibres (gp12) tucked under the baseplate
  const shortMat = new THREE.MeshStandardMaterial({ color: 0x9fc1bd, roughness: 0.45, metalness: 0.2 });
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = i / 6 * Math.PI * 2 + 0.52;
    const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6), shortMat);
    fiber.position.set(0.26, -0.45, 0);
    fiber.rotation.z = -0.55;
    pivot.add(fiber); baseGroup.add(pivot);
    shortFibers.push({ pivot, fiber });
  }

  /* ---------- SIX LONG TAIL FIBRES ---------- */
  const fibMat = new THREE.MeshStandardMaterial({ color: 0x86b5b2, roughness: 0.42, metalness: 0.25 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xd0ebe2, roughness: 0.3, metalness: 0.35 });
  const seg1Len = 1.55, seg2Len = 1.5;
  for (let i = 0; i < 6; i++) {
    const az = i / 6 * Math.PI * 2 + 0.26;
    const root = new THREE.Group(); root.rotation.y = az;
    root.position.set(0.25, -0.10, 0);

    const s1pivot = new THREE.Group(); root.add(s1pivot);
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, seg1Len, 6), fibMat);
    s1.position.y = -seg1Len / 2; s1.castShadow = true; s1pivot.add(s1);
    const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), tipMat);
    kneeBall.position.y = -seg1Len; s1pivot.add(kneeBall);

    const s2pivot = new THREE.Group(); s2pivot.position.y = -seg1Len; s1pivot.add(s2pivot);
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, seg2Len, 6), fibMat);
    s2.position.y = -seg2Len / 2; s2.castShadow = true; s2pivot.add(s2);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 6), tipMat);
    tip.position.y = -seg2Len - 0.12; tip.rotation.x = Math.PI; s2pivot.add(tip);

    baseGroup.add(root);
    longFibers.push({ root, s1pivot, s2pivot, az, phase: i / 6 });
  }

  /* ---------- BACTERIUM (host) ---------- */
  bacterium = new THREE.Group();
  bacterium.position.set(0, V.bactY, 0);
  scene.add(bacterium);
  const bactGeo = new THREE.CapsuleGeometry(1.18, 4.4, 10, 28);
  bactGeo.rotateZ(Math.PI / 2);
  // soft mottled membrane, generated in code
  const mc = document.createElement('canvas'); mc.width = mc.height = 256;
  const mx = mc.getContext('2d');
  mx.fillStyle = '#808080'; mx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 130; i++) {
    const x = rand(0,256), y = rand(0,256), r = rand(6, 34);
    const g = mx.createRadialGradient(x,y,0,x,y,r);
    const shade = rnd() > .5 ? '190,205,198' : '60,86,80';
    g.addColorStop(0, `rgba(${shade},0.35)`); g.addColorStop(1, `rgba(${shade},0)`);
    mx.fillStyle = g; mx.fillRect(x-r, y-r, r*2, r*2);
  }
  const memTex = new THREE.CanvasTexture(mc);
  memTex.wrapS = memTex.wrapT = THREE.RepeatWrapping;
  memTex.repeat.set(2, 1);
  const bactMat = new THREE.MeshPhysicalMaterial({
    color: 0x3d6559, roughness: 0.6, metalness: 0.02,
    transparent: true, opacity: 0.0, depthWrite: false,
    clearcoat: 0.35, clearcoatRoughness: 0.55,
    bumpMap: memTex, bumpScale: 0.055,
    emissive: 0x123029, emissiveIntensity: 0.45
  });
  const bactMesh = new THREE.Mesh(bactGeo, bactMat);
  bactMesh.castShadow = true; bactMesh.receiveShadow = true;
  bacterium.add(bactMesh);
  bacterium.userData.mat = bactMat;

  const coreGeo = new THREE.CapsuleGeometry(0.86, 3.9, 8, 20); coreGeo.rotateZ(Math.PI / 2);
  bactCore = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({
    color: 0x2a7d63, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  bacterium.add(bactCore);

  const glowGeo = new THREE.CapsuleGeometry(1.30, 4.5, 8, 24); glowGeo.rotateZ(Math.PI / 2);
  bactGlow = new THREE.Mesh(glowGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform float uOpacity;
      void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.0); gl_FragColor=vec4(0.25,0.95,0.66,f*0.55*uOpacity); }`
  }));
  bacterium.add(bactGlow);
  const bactLight = new THREE.PointLight(0x4fe8b8, 0, 7, 2);
  bacterium.add(bactLight);
  bacterium.userData.light = bactLight;

  // DNA coil that forms inside the bacterium during injection
  const injPts = [];
  const IN = 260;
  for (let i = 0; i <= IN; i++) {
    const f = i / IN;
    const ang = f * 14 * Math.PI * 2;
    const rr = 0.20 + 0.55 * Math.sin(f * Math.PI);
    injPts.push(new THREE.Vector3(Math.cos(ang) * rr, -0.75 + f * 1.5, Math.sin(ang) * rr * 0.72));
  }
  injectCoil = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(injPts), IN, 0.035, 5, false),
    new THREE.MeshBasicMaterial({ color: 0x6fdcc4, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  injectCoil.idxA = injectCoil.geometry.index.count;
  injectCoil.position.set(0, 0, 0);
  bacterium.add(injectCoil);
  injectCoil.visible = false;
}

/* -------------------------------------------------------------------------- */
/*  deterministic time evaluation                                             */
/* -------------------------------------------------------------------------- */
function setVisible(obj, v) { if (obj) obj.visible = v; }

function applyTime(t) {
  const headAsm = smooth(0.0, 4.4, t);
  const dnaPack = smooth(4.6, 7.9, t);
  const neckAsm  = smooth(8.2, 9.4, t);
  const tailAsm  = smooth(9.8, 12.6, t);
  const fiberAt  = smooth(13.2, 15.8, t);
  const approach = smooth(16.2, 18.9, t);
  const pin      = smooth(19.4, 20.8, t);
  const star     = smooth(20.8, 21.9, t);
  const contract = smooth(21.9, 23.35, t);
  const inject   = smooth(23.4, 27.6, t);

  // whole-phage descent toward the host during approach
  phage.position.y = -V.descend * easeInOut(approach);
  const breathe = Math.sin(t * 0.7) * 0.012;
  phage.rotation.y = 0.03 * Math.sin(t * 0.25);
  headGroup.rotation.z = breathe * 0.3;

  /* --- capsomers fly in & dock --- */
  const showCap = true;
  capsomers.visible = knobs.visible = showCap;
  capsidShell.visible = showCap;
  capsidShell.userData.edges.visible = showCap;
  capsidShell.material.opacity = 0.20 * smooth(0.6, 3.2, t);
  capsidShell.userData.edges.material.opacity = 0.10 * smooth(0.6, 3.2, t);
  portal.visible = smooth(0.0, 1.0, t) > 0.05;
  portal.scale.setScalar(0.6 + 0.4 * smooth(0, 1.0, t));

  const n = capsData.length;
  for (let i = 0; i < n; i++) {
    const d = capsData[i];
    const local = clamp((headAsm - d.delay) / (1 - d.delay + 1e-5));
    const e = easeOut(local);
    const overshoot = Math.sin(local * Math.PI) * 0.10;
    // gentle ambient swirl while the subunits are still free in space
    const sw = (1 - e) * realTime * 0.14;
    const cs = Math.cos(sw), sn = Math.sin(sw);
    _v.set(d.scatter.x*cs - d.scatter.z*sn, d.scatter.y, d.scatter.x*sn + d.scatter.z*cs)
      .lerp(d.pos, e).addScaledVector(d.pos.clone().normalize(), overshoot);
    _dummy.position.copy(_v);
    _dummy.quaternion.copy(d.q);
    // add a spin while flying
    const spinF = (1 - e) * 2.2;
    _dummy.rotateX(d.spin.x * spinF); _dummy.rotateY(d.spin.y * spinF);
    const sc = d.s * (0.55 + 0.45 * e);
    _dummy.scale.set(sc, sc, sc);
    _dummy.updateMatrix();
    capsomers.setMatrixAt(i, _dummy.matrix);
    _dummy.position.copy(_v).addScaledVector(d.q ? new THREE.Vector3(0,1,0).applyQuaternion(d.q) : UP, 0.0);
    _dummy.position.copy(_v);
    _dummy.position.add(new THREE.Vector3(0, 1, 0).applyQuaternion(d.q).multiplyScalar(0.20 * sc));
    _dummy.quaternion.copy(d.q);
    _dummy.rotateX(d.spin.x * spinF); _dummy.rotateY(d.spin.y * spinF);
    _dummy.scale.set(sc, sc, sc);
    _dummy.updateMatrix();
    knobs.setMatrixAt(i, _dummy.matrix);
  }
  capsomers.instanceMatrix.needsUpdate = true;
  knobs.instanceMatrix.needsUpdate = true;

  /* --- DNA packing --- */
  const dnaOn = dnaPack > 0.01;
  dnaGroup.visible = dnaOn;
  if (dnaOn) {
    const nA = Math.floor(dnaStrandA.idxA * dnaPack / 6) * 6;
    dnaStrandA.geometry.setDrawRange(0, Math.max(0, nA));
    dnaStrandB.geometry.setDrawRange(0, Math.max(0, nA));
    dnaRungs.count = Math.floor(dnaRungs.instanceMatrix.count * dnaPack);
    dnaMatPulse(dnaPack, t);
  }
  const streamOn = dnaPack > 0.01 && dnaPack < 0.995;
  packStream.visible = streamOn;
  if (streamOn) {
    const yy = lerp(-V.headH * 0.92, V.headH * 0.75, dnaPack);
    packStream.position.set(0, yy, 0);
    packStream.scale.set(1, 0.5 + 0.4 * Math.sin(t * 12), 1);
    packStream.material.opacity = 0.5 + 0.4 * Math.sin(t * 9) * Math.sin(t * 9);
  }

  /* --- neck / collar --- */
  const neckS = neckAsm;
  collarRings.visible = whiskers.visible = neckS > 0.02;
  collarRings.scale.set(0.4 + 0.6*neckS, neckS, 0.4 + 0.6*neckS);
  collarRings.position.y = (1 - neckS) * 0.5;
  whiskers.scale.setScalar(easeOut(neckS));
  whiskers.children.forEach((w, i) => { w.rotation.z = (1-neckS) * 0.6 * Math.sin(i); });

  /* --- tail sheath --- */
  sheath.visible = tube.visible = baseGroup.visible = tailAsm > 0.01;
  // the inner tube telescopes downward as the sheath shortens
  const Ltube = tailLen() * tailAsm * (1 + 0.36 * contract);
  tube.scale.y = Ltube / tailLen();
  tube.position.y = V.tailTop - Ltube / 2;
  tube.material.opacity = 0.82 - 0.45 * contract;
  const restSpacing = (V.tailTop - V.tailBottom - 0.28) / (SHEATH_N - 1);
  const restR = 1.0;
  for (let r = 0; r < SHEATH_N; r++) {
    const d = r / (SHEATH_N - 1);
    // rings assemble from the baseplate upward
    const local = clamp((tailAsm - d * 0.55) / 0.45);
    const appear = easeOut(local);
    const yRest = V.tailTop - 0.12 - d * restSpacing * (SHEATH_N - 1);
    const yAssemble = V.baseY + 0.6 + (1 - appear) * 3.5;
    let y = lerp(yAssemble, yRest, appear);
    // contraction
    const yContracted = V.tailTop - 0.12 - d * restSpacing * (SHEATH_N - 1) * 0.5;
    y = lerp(y, yContracted, contract);
    const rad = restR * lerp(1, 1.55, contract) * (0.85 + 0.15 * appear);
    _dummy.position.set(0, y, 0);
    _dummy.quaternion.identity();
    // keep the corrugation: rings thin as they bunch up
    _dummy.scale.set(rad, lerp(1, 0.62, contract), rad);
    _dummy.updateMatrix();
    sheath.setMatrixAt(r, _dummy.matrix);
  }
  sheath.instanceMatrix.needsUpdate = true;

  /* --- baseplate + short fibers --- */
  baseGroup.position.y = V.baseY + tailAsm * 0.0;
  baseGroup.scale.setScalar(0.6 + 0.4 * tailAsm);
  baseSpokes.forEach((s, i) => {
    s.holder.rotation.z = lerp(-0.15, -1.05, star) * (1);
    s.arm.position.y = lerp(-0.26, -0.10, star);
  });
  shortFibers.forEach((f, i) => {
    const ext = smooth(20.9, 21.9, t);
    f.fiber.rotation.z = lerp(-0.55, -1.35, ext);
    f.fiber.scale.y = lerp(0.6, 1.6, ext);
    f.pivot.visible = tailAsm > 0.2;
  });

  /* --- long tail fibres --- */
  longFibers.forEach((f, i) => {
    const appear = smooth(13.2 + f.phase * 1.1, 14.4 + f.phase * 1.1, t);
    f.root.visible = appear > 0.01;
    f.root.scale.setScalar(easeOut(appear));
    // resting folded pose -> splayed and reaching during pin
    const a1rest = -0.42, a1pin = -1.28;
    const a2rest = 2.05, a2pin = -0.02;
    const j = pin * (0.85 + 0.15 * Math.sin(f.phase * Math.PI * 2 + t));
    f.s1pivot.rotation.x = lerp(a1rest, a1pin, easeInOut(j));
    f.s2pivot.rotation.x = lerp(a2rest, a2pin, easeInOut(j));
    const flutter = (1 - pin) * Math.sin(t * 1.6 + f.phase * 6) * 0.03;
    f.s1pivot.rotation.z = flutter;
  });

  /* --- bacterium --- */
  const bactIn = smooth(15.8, 18.4, t);
  bacterium.visible = bactIn > 0.01;
  bacterium.userData.mat.opacity = lerp(0.48, 0.30, inject) * bactIn;
  bactCore.material.opacity = 0.13 * bactIn;
  bactGlow.material.uniforms.uOpacity.value = bactIn;
  bacterium.rotation.y = 0.05 * Math.sin(t * 0.18);
  // no shadow before the host is actually present
  bacterium.traverse(o => { if (o.isMesh) o.castShadow = bactIn > 0.05; });

  /* --- injection --- */
  const injActive = inject > 0.005;
  injectStream.visible = injectHelix.visible = injActive;
  injectStream.material.opacity = injActive * 0.06;
  injectHelix.children.forEach(c => { c.material.opacity = injActive * 0.62; });
  if (injActive) {
    // phage-local coordinates (children of phage)
    const yTop = V.headBottom + 0.05;
    const yBot = V.tailTop - Ltube - 0.35;
    const len = Math.max(0.1, yTop - yBot) * inject;
    injectStream.position.set(0, yTop - len / 2, 0);
    injectStream.scale.set(1, len, 1);
    const hh = injectHelix.userData.parts;
    hh.forEach(c => {
      const n = Math.floor(c.idxA * inject / 6) * 6;
      c.geometry.setDrawRange(0, Math.max(0, n));
    });
    tube.material.opacity = lerp(0.82 - 0.45 * contract, 0.10, inject);
    sheathMatRef.opacity = 1 - 0.62 * inject;
    sheathMatRef.depthWrite = inject < 0.3;
  } else {
    sheathMatRef.opacity = 1; sheathMatRef.depthWrite = true;
  }
  bacterium.userData.light.intensity = inject * 0.28;
  injectCoil.visible = inject > 0.02;
  if (injectCoil.visible) {
    const nn = Math.floor(injectCoil.idxA * inject / 6) * 6;
    injectCoil.geometry.setDrawRange(0, Math.max(0, nn));
  }
}

let dnaBaseEmissive = 1.5;
function dnaMatPulse(p, t) {
  const pulse = 1.5 + 0.35 * Math.sin(t * 2.2) + 0.4 * p;
  dnaStrandA.material.emissiveIntensity = pulse;
}
function tailLen() { return V.tailTop - V.tailBottom; }

/* -------------------------------------------------------------------------- */
/*  labels                                                                      */
/* -------------------------------------------------------------------------- */
const labelDefs = [
  { id:'capsid', text:'Capsid — protein shell', p:()=>worldOf(headGroup, new THREE.Vector3(1.5,1.2,0.6)), off:[110,-46], win:[1.8,16.6] },
  { id:'dna',    text:'Viral DNA',               p:()=>worldOf(headGroup, new THREE.Vector3(0,0.2,0.9)), off:[-104,-10], win:[5.0,16.6] },
  { id:'portal', text:'Portal vertex',          p:()=>worldOf(headGroup, new THREE.Vector3(0,-2.0,0.3)), off:[132,46], win:[4.6,16.6] },
  { id:'collar', text:'Collar',                 p:()=>worldOf(phage, new THREE.Vector3(0.6,V.collarY,0)), off:[232,-26], win:[8.8,16.6] },
  { id:'sheath', text:'Contractile sheath',     p:()=>worldOf(phage, new THREE.Vector3(0.55,-0.8,0)), off:[120,0], win:[10.4,23.8] },
  { id:'base',   text:'Baseplate',              p:()=>worldOf(phage, new THREE.Vector3(0.4,V.baseY,0)), off:[112,18], win:[11.2,24.4] },
  { id:'fiber',  text:'Long tail fibre',        p:()=>worldOf(phage, new THREE.Vector3(1.6,V.baseY-1.6,0)), off:[-118,10], win:[14.4,20.6] },
  { id:'host',   text:'Host bacterium',         p:()=>new THREE.Vector3(1.8,V.bactY+0.55,0), off:[74,8], win:[17.6,29.2] },
];
let labelsOn = true;
const labelEls = [];
function worldOf(obj, v) { return obj.localToWorld(v.clone()); }

function buildLabels() {
  const box = $('labels');
  labelDefs.forEach(def => {
    const d = document.createElement('div'); d.className = 'label';
    d.innerHTML = '<span class="dot"></span>' + def.text;
    const line = document.createElement('div'); line.className = 'leader';
    box.appendChild(line); box.appendChild(d);
    labelEls.push({ def, el: d, line });
  });
}
const _proj = new THREE.Vector3();
function updateLabels(t) {
  labelEls.forEach(o => {
    const { def, el, line } = o;
    const inWin = t >= def.win[0] && t <= def.win[1];
    const show = labelsOn && inWin;
    if (!show) { el.classList.remove('on'); line.classList.remove('on'); return; }
    _proj.copy(def.p()).project(camera);
    if (_proj.z > 1) { el.classList.remove('on'); line.classList.remove('on'); return; }
    const x = (_proj.x * 0.5 + 0.5) * W;
    const y = (-_proj.y * 0.5 + 0.5) * H;
    const lx = x + def.off[0], ly = y + def.off[1];
    el.style.left = lx + 'px'; el.style.top = ly + 'px';
    el.classList.add('on');
    const dx = lx - x, dy = ly - y, len = Math.hypot(dx, dy);
    line.style.left = x + 'px'; line.style.top = y + 'px';
    line.style.width = len + 'px';
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    line.classList.add('on');
  });
}

/* -------------------------------------------------------------------------- */
/*  post-processing                                                            */
/* -------------------------------------------------------------------------- */
function initPost() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.62, 0.62, 0.80);
  composer.addPass(bloom);
  grainPass = new ShaderPass({
    uniforms: { tDiffuse:{value:null}, uTime:{value:0}, uRes:{value:new THREE.Vector2(W,H)} },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
      float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv=vUv;
        vec2 d=uv-0.5;
        float ca=0.0011*dot(d,d);
        vec3 col;
        col.r=texture2D(tDiffuse,uv+d*ca).r;
        col.g=texture2D(tDiffuse,uv).g;
        col.b=texture2D(tDiffuse,uv-d*ca).b;
        float vig=smoothstep(1.25,0.25,length(d)*1.55);
        col*=mix(0.72,1.0,vig);
        float g=(rand(uv*uRes+uTime)-0.5)*0.014;
        col+=g;
        gl_FragColor=vec4(col,1.0);
      }`
  });
  composer.addPass(grainPass);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(dpr * renderScale);
  composer.setSize(W, H);
}

/* -------------------------------------------------------------------------- */
/*  camera presets                                                             */
/* -------------------------------------------------------------------------- */
const VIEWS = {
  hero:      { p:[10.4, 4.2, 16.2], t:[0, 0.55, 0] },
  head:      { p:[5.2, 5.6, 7.6],   t:[0, 3.5, 0] },
  tail:      { p:[5.6, -0.8, 7.6],  t:[0, -1.6, 0] },
  baseplate: { p:[6.0, -4.0, 8.5],  t:[0, -4.3, 0] },
  infection: { p:[10.2, 0.8, 15.8], t:[0, -1.8, 0] },
  side:      { p:[14.5, 0.6, 0.6],  t:[0, 0.0, 0] },
};
let camTween = null;
function setView(name, instant=false) {
  const v = VIEWS[name] || VIEWS.hero;
  if (instant) {
    camera.position.set(...v.p); controls.target.set(...v.t); controls.update(); return;
  }
  camTween = {
    t: 0, dur: 1.25,
    p0: camera.position.clone(), p1: new THREE.Vector3(...v.p),
    q0: controls.target.clone(), q1: new THREE.Vector3(...v.t)
  };
}

/* -------------------------------------------------------------------------- */
/*  audio (WebAudio, generated, muted at start)                                */
/* -------------------------------------------------------------------------- */
let actx = null, audioOn = false, droneGain = null;
function enableAudio() {
  if (actx) { actx.resume(); audioOn = true; return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    droneGain = actx.createGain(); droneGain.gain.value = 0.0;
    const lp = actx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=340;
    droneGain.connect(lp); lp.connect(actx.destination);
    [55, 82.4, 110].forEach((f,i) => {
      const o = actx.createOscillator(); o.type = i===2?'sine':'triangle'; o.frequency.value=f;
      const g = actx.createGain(); g.gain.value = i===2?0.06:0.10;
      o.connect(g); g.connect(droneGain); o.start();
    });
    const lfo = actx.createOscillator(); lfo.frequency.value=0.08;
    const lg = actx.createGain(); lg.gain.value=0.02;
    lfo.connect(lg); lg.connect(droneGain.gain); lfo.start();
    droneGain.gain.setTargetAtTime(0.16, actx.currentTime, 1.5);
    audioOn = true;
  } catch(e) { console.warn('audio unavailable', e); }
}
function chime(freq=523.25) {
  if (!audioOn || !actx) return;
  const o=actx.createOscillator(), g=actx.createGain();
  o.type='sine'; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0, actx.currentTime);
  g.gain.linearRampToValueAtTime(0.05, actx.currentTime+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+0.9);
  o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime+0.95);
}

/* -------------------------------------------------------------------------- */
/*  transport / time                                                           */
/* -------------------------------------------------------------------------- */
let time = 0, playing = true, frozen = false;
const scrub = $('scrub'), timeEl = $('time');
scrub.max = TOTAL;

function fmt(s){ return s.toFixed(1).padStart(4,'0'); }
function refreshTransport() {
  scrub.value = time;
  const pct = time / TOTAL * 100;
  scrub.style.background = `linear-gradient(90deg,var(--accent) 0%,var(--accent) ${pct}%,rgba(160,190,200,.18) ${pct}%,rgba(160,190,200,.18) 100%)`;
  timeEl.textContent = `${fmt(time)} / ${TOTAL.toFixed(1)}s`;
  let ci = 0;
  for (let i=0;i<CHAPTERS.length;i++) if (time >= CHAPTERS[i].t) ci=i;
  const ch = CHAPTERS[ci];
  $('chNum').textContent = ch.num; $('chName').textContent = ch.name; $('chDesc').textContent = ch.desc;
}

function buildTicks() {
  const box = $('chapters');
  CHAPTERS.forEach(c => {
    if (c.t===0) return;
    const d=document.createElement('div'); d.className='tick'; d.style.left=(c.t/TOTAL*100)+'%';
    d.innerHTML=`<span>${c.name.split(' ')[0]}</span>`;
    box.appendChild(d);
  });
}

function setPlay(v) {
  playing=v;
  $('playIcon').innerHTML = v ? '<path d="M2 1.5 H4.5 V10.5 H2 Z M7.5 1.5 H10 V10.5 H7.5 Z"/>' : '<path d="M2.5 1.5 L9.5 6 L2.5 10.5 Z"/>';
}

function bindUI() {
  $('playBtn').addEventListener('click', ()=>{ frozen=false; setPlay(!playing); });
  scrub.addEventListener('input', ()=>{ frozen=true; setPlay(false); time=parseFloat(scrub.value); applyTime(time); refreshTransport(); });
  scrub.addEventListener('change', ()=>{ /* stay frozen for inspection */ });
  $('labelBtn').addEventListener('click', ()=>{
    labelsOn=!labelsOn; $('labelBtn').classList.toggle('active', labelsOn);
  });
  $('viewSel').addEventListener('change', e=>{ setView(e.target.value); });
  $('soundBtn').addEventListener('click', ()=>{
    enableAudio();
    $('soundBtn').textContent = audioOn ? 'Sound on' : 'Enable sound';
    $('soundBtn').classList.toggle('active', audioOn);
  });
  window.addEventListener('keydown', e=>{
    if (e.code==='Space'){ e.preventDefault(); frozen=false; setPlay(!playing); }
    if (e.key==='l'||e.key==='L') $('labelBtn').click();
    if (e.key>='1'&&e.key<='6'){ const names=['hero','head','tail','baseplate','infection','side']; setView(names[+e.key-1]); $('viewSel').value=names[+e.key-1]; }
    if (e.key==='r'||e.key==='R'){ time=0; frozen=false; setPlay(true); }
  });
  controls.addEventListener('start', ()=>{ if(camTween) camTween=null; });
  window.addEventListener('resize', onResize);
}

function onResize() {
  W=window.innerWidth; H=window.innerHeight;
  camera.aspect=W/H; camera.updateProjectionMatrix();
  renderer.setSize(W,H);
  composer.setSize(W,H);
  grainPass.uniforms.uRes.value.set(W,H);
}

/* -------------------------------------------------------------------------- */
/*  URL params                                                                 */
/* -------------------------------------------------------------------------- */
function readParams() {
  const q = new URLSearchParams(location.search);
  if (q.has('t')) {
    const tv = parseFloat(q.get('t'));
    if (!isNaN(tv)) { time = clamp(tv, 0, TOTAL); frozen = true; setPlay(false); }
  }
  if (q.has('view')) {
    const v = q.get('view');
    if (VIEWS[v]) { setView(v, true); $('viewSel').value = v; }
  }
  if (q.has('labels') && q.get('labels')==='0') { labelsOn=false; $('labelBtn').classList.remove('active'); }
}

/* -------------------------------------------------------------------------- */
/*  main loop                                                                  */
/* -------------------------------------------------------------------------- */
let dustMat, last = performance.now(), frameAcc=0, frameCnt=0, lastChapter=0;
let realTime = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last)/1000); last = now;
  realTime = now / 1000;

  if (!frozen && playing) {
    time += dt;
    if (time > TOTAL) time = 0;
  }
  // camera tween
  if (camTween) {
    camTween.t += dt;
    const k = easeInOut(clamp(camTween.t/camTween.dur));
    camera.position.lerpVectors(camTween.p0, camTween.p1, k);
    controls.target.lerpVectors(camTween.q0, camTween.q1, k);
    if (camTween.t >= camTween.dur) camTween=null;
  }

  applyTime(time);
  updateLabels(time);
  refreshTransport();
  // gentle cross-fade across the loop seam
  const fadeOut = smooth(28.2, 30.0, time);
  const fadeIn = 1 - smooth(0.0, 0.9, time);
  $('fade').style.opacity = Math.max(fadeOut, fadeIn * 0.9).toFixed(3);
  dustMat.uniforms.uTime.value = now/1000;
  grainPass.uniforms.uTime.value = now/1000;
  bloom.strength = 0.56 + 0.08*Math.sin(time*0.6) - 0.20*smooth(23,25,time);

  // chapter chime
  let ci=0; for(let i=0;i<CHAPTERS.length;i++) if(time>=CHAPTERS[i].t) ci=i;
  if (ci!==lastChapter){ chime(523.25*Math.pow(2,(ci%4)/12*3)); lastChapter=ci; }

  controls.update();
  composer.render();

  // adaptive resolution (simple rolling average)
  frameAcc += dt; frameCnt++;
  if (frameCnt>=90) {
    const avg=frameAcc/frameCnt; frameAcc=0; frameCnt=0;
    if (avg>0.024 && renderScale>0.62) { renderScale=Math.max(0.62, renderScale-0.12); applyScale(); }
    else if (avg<0.014 && renderScale<1) { renderScale=Math.min(1, renderScale+0.08); applyScale(); }
  }
}
function applyScale(){
  renderer.setPixelRatio(dpr*renderScale);
  composer.setPixelRatio(dpr*renderScale);
  composer.setSize(W,H);
}

/* -------------------------------------------------------------------------- */
/*  boot                                                                       */
/* -------------------------------------------------------------------------- */
function boot() {
  initRenderer();
  addLighting();
  dustMat = addDust();
  buildPhage();
  buildLabels();
  initPost();
  buildTicks();
  bindUI();
  readParams();
  applyTime(time);
  refreshTransport();
  requestAnimationFrame(loop);
  window.__t4 = { scene, camera, renderer, bacterium, phage, bactGlow, bactCore };
  setTimeout(()=>loader.classList.add('gone'), 120);
}

try { boot(); } catch(e) { fail(e); }
window.addEventListener('error', e=>fail(e.error||e.message));
