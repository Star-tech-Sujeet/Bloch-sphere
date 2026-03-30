// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════

// Qubit state: complex amplitudes [alpha_re, alpha_im, beta_re, beta_im]
let qubit = [1, 0, 0, 0]; // |0⟩

// Bloch vector (x,y,z) derived from qubit
function blochFromQubit(q) {
  const [ar, ai, br, bi] = q;
  // Bloch coords: x = 2 Re(α*β), y = 2 Im(α*β), z = |α|²-|β|²
  const x = 2*(ar*br + ai*bi);
  const y = 2*(ar*bi - ai*br);
  const z = ar*ar + ai*ai - (br*br + bi*bi);
  return { x, y, z };
}

// Named state lookup
function getStateName(q) {
  const eps = 0.04;
  const { x, y, z } = blochFromQubit(q);
  if (z >  1-eps) return '|0⟩';
  if (z < -1+eps) return '|1⟩';
  if (Math.abs(x - 1) < eps) return '|+⟩';
  if (Math.abs(x + 1) < eps) return '|−⟩';
  if (Math.abs(y - 1) < eps) return '|i⟩';
  if (Math.abs(y + 1) < eps) return '|−i⟩';
  return 'custom';
}

function getDiracLabel(q) {
  const n = getStateName(q);
  if (n !== 'custom') return n;
  const [ar, ai, br, bi] = q;
  const alpha = Math.sqrt(ar*ar + ai*ai);
  const beta  = Math.sqrt(br*br + bi*bi);
  return `${alpha.toFixed(2)}|0⟩+${beta.toFixed(2)}|1⟩`;
}

// Gate matrices (2x2 complex: [[a_re,a_im,b_re,b_im],[c_re,c_im,d_re,d_im]])
const GATES = {
  X:   { mat: [[0,0,1,0],[1,0,0,0]], axis:'X', angle:Math.PI,  color:'#f87171', label:'X' },
  Y:   { mat: [[0,0,0,-1],[0,1,0,0]], axis:'Y', angle:Math.PI, color:'#fbbf24', label:'Y' },
  Z:   { mat: [[1,0,0,0],[0,0,-1,0]], axis:'Z', angle:Math.PI, color:'#a78bfa', label:'Z' },
  H:   { mat: [[1/Math.SQRT2,0,1/Math.SQRT2,0],[1/Math.SQRT2,0,-1/Math.SQRT2,0]], axis:'X+Z', angle:Math.PI, color:'#4fffb0', label:'H' },
  S:   { mat: [[1,0,0,0],[0,0,0,1]], axis:'Z', angle:Math.PI/2, color:'#5b8dee', label:'S' },
  T:   { mat: [[1,0,0,0],[0,0,Math.SQRT2/2,Math.SQRT2/2]], axis:'Z', angle:Math.PI/4, color:'#f472b6', label:'T' },
  Sdg: { mat: [[1,0,0,0],[0,0,0,-1]], axis:'Z', angle:-Math.PI/2, color:'#34d399', label:'S†' },
};

// Apply gate to qubit (complex matrix multiply)
function applyMatrix(mat, q) {
  const [[ar,ai,br,bi],[cr,ci,dr,di]] = mat;
  const [xr,xi,yr,yi] = q;
  // new_alpha = a*x + b*y (complex)
  const nr = ar*xr - ai*xi + br*yr - bi*yi;
  const ni = ar*xi + ai*xr + br*yi + bi*yr;
  // new_beta  = c*x + d*y
  const mr = cr*xr - ci*xi + dr*yr - di*yi;
  const mi = cr*xi + ci*xr + dr*yi + di*yr;
  // Normalize
  const norm = Math.sqrt(nr*nr+ni*ni+mr*mr+mi*mi);
  return [nr/norm, ni/norm, mr/norm, mi/norm];
}

// ══════════════════════════════════════════════════════
//  THREE.JS SCENE
// ══════════════════════════════════════════════════════

const container = document.getElementById('canvas-container');
const W = () => container.clientWidth;
const H2 = () => container.clientHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(W(), H2());
renderer.setClearColor(0x000000, 0);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W()/H2(), 0.1, 100);
camera.position.set(2.8, 1.8, 2.8);
camera.lookAt(0, 0, 0);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dlight = new THREE.DirectionalLight(0x88aaff, 0.8);
dlight.position.set(5, 10, 5);
scene.add(dlight);
const dlight2 = new THREE.DirectionalLight(0x4fffb0, 0.3);
dlight2.position.set(-5, -5, -5);
scene.add(dlight2);

// ── Sphere ───────────────────────────────────────────
const sphereGeo = new THREE.SphereGeometry(1, 64, 64);
const sphereMat = new THREE.MeshPhongMaterial({
  color: 0x1a2a4a,
  transparent: true,
  opacity: 0.18,
  shininess: 80,
  specular: 0x4488ff,
  side: THREE.FrontSide,
});
const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphereMesh);

// Sphere wireframe (inner glow)
const wireMat = new THREE.MeshBasicMaterial({
  color: 0x2a4a8a,
  wireframe: true,
  transparent: true,
  opacity: 0.06,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), wireMat));

// ── Grid lines (lat/lon circles) ─────────────────────
const gridGroup = new THREE.Group();

function makeCircle(radius, axis, color, opacity) {
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    if (axis === 'z') pts.push(new THREE.Vector3(Math.cos(a)*radius, Math.sin(a)*radius, 0));
    else if (axis === 'x') pts.push(new THREE.Vector3(0, Math.cos(a)*radius, Math.sin(a)*radius));
    else pts.push(new THREE.Vector3(Math.cos(a)*radius, 0, Math.sin(a)*radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geo, mat);
}

// Equator & meridians
gridGroup.add(makeCircle(1, 'z', 0x3355aa, 0.5));   // equator (xy-plane)
gridGroup.add(makeCircle(1, 'x', 0x223366, 0.3));   // xz meridian
gridGroup.add(makeCircle(1, 'y', 0x223366, 0.3));   // yz meridian

// Latitude circles
[0.5, 0.866].forEach(lat => {
  const r = Math.sqrt(1 - lat*lat);
  const circle = makeCircle(r, 'z', 0x1a2a55, 0.2);
  circle.position.z = lat;
  gridGroup.add(circle);
  const circle2 = makeCircle(r, 'z', 0x1a2a55, 0.2);
  circle2.position.z = -lat;
  gridGroup.add(circle2);
});

scene.add(gridGroup);

// ── Axes ─────────────────────────────────────────────
const axesGroup = new THREE.Group();

function makeAxis(from, to, color) {
  const pts = [new THREE.Vector3(...from), new THREE.Vector3(...to)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
  return new THREE.Line(geo, mat);
}

axesGroup.add(makeAxis([-1.5,0,0],[1.5,0,0], 0xff4444));
axesGroup.add(makeAxis([0,-1.5,0],[0,1.5,0], 0x44ff44));
axesGroup.add(makeAxis([0,0,-1.5],[0,0,1.5], 0x4488ff));

scene.add(axesGroup);

// Axis labels (sprites)
const labelsGroup = new THREE.Group();

function makeLabel(text, x, y, z, color='#fff') {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 36px IBM Plex Mono, monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.4, 0.2, 1);
  sprite.position.set(x, y, z);
  return sprite;
}

labelsGroup.add(makeLabel('+X', 1.7, 0, 0, '#ff6666'));
labelsGroup.add(makeLabel('+Y', 0, 0, -1.7, '#44ff88'));
labelsGroup.add(makeLabel('+Z', 0, 1.7, 0, '#6699ff'));
labelsGroup.add(makeLabel('|0⟩', 0, 1.28, 0, '#aaccff'));
labelsGroup.add(makeLabel('|1⟩', 0, -1.28, 0, '#ffaaaa'));
labelsGroup.add(makeLabel('|+⟩', 1.3, 0, 0, '#88ffcc'));
labelsGroup.add(makeLabel('|−⟩', -1.3, 0, 0, '#88ffcc'));
scene.add(labelsGroup);

// ── State vector (arrow) ──────────────────────────────
const vecGroup = new THREE.Group();

// Shaft
const shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 12);
const shaftMat = new THREE.MeshPhongMaterial({ color: 0x4fffb0, emissive: 0x1a6644, shininess: 100 });
const shaft = new THREE.Mesh(shaftGeo, shaftMat);
shaft.position.y = 0.5;

// Arrowhead
const headGeo = new THREE.ConeGeometry(0.06, 0.18, 12);
const headMat = new THREE.MeshPhongMaterial({ color: 0x4fffb0, emissive: 0x2a9966, shininess: 120 });
const head = new THREE.Mesh(headGeo, headMat);
head.position.y = 1.09;

vecGroup.add(shaft);
vecGroup.add(head);
scene.add(vecGroup);

// Dotted line to Z axis (projection)
const projPts = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)];
const projGeo = new THREE.BufferGeometry().setFromPoints(projPts);
const projMat = new THREE.LineDashedMaterial({ color: 0x4fffb0, transparent: true, opacity: 0.25, dashSize: 0.05, gapSize: 0.05 });
const projLine = new THREE.Line(projGeo, projMat);
projLine.computeLineDistances();
scene.add(projLine);

// ── Orbit controls (manual) ───────────────────────────
let isDragging = false;
let prevMouse = { x: 0, y: 0 };
let sphericalTheta = Math.atan2(2.8, 2.8);  // azimuth
let sphericalPhi   = Math.atan2(Math.sqrt(2.8*2.8+2.8*2.8), 1.8); // polar
let sphericalR     = Math.sqrt(2.8*2.8+1.8*1.8+2.8*2.8);

function updateCamera() {
  const x = sphericalR * Math.sin(sphericalPhi) * Math.cos(sphericalTheta);
  const y = sphericalR * Math.cos(sphericalPhi);
  const z = sphericalR * Math.sin(sphericalPhi) * Math.sin(sphericalTheta);
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

renderer.domElement.addEventListener('mousedown', e => {
  isDragging = true;
  prevMouse = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('touchstart', e => {
  isDragging = true;
  prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});

window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('touchend', () => isDragging = false);

function onMove(cx, cy) {
  if (!isDragging) return;
  const dx = cx - prevMouse.x;
  const dy = cy - prevMouse.y;
  sphericalTheta -= dx * 0.008;
  sphericalPhi   = Math.max(0.1, Math.min(Math.PI - 0.1, sphericalPhi + dy * 0.008));
  prevMouse = { x: cx, y: cy };
  updateCamera();
}

renderer.domElement.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
renderer.domElement.addEventListener('touchmove', e => onMove(e.touches[0].clientX, e.touches[0].clientY));

renderer.domElement.addEventListener('wheel', e => {
  sphericalR = Math.max(2.0, Math.min(7.0, sphericalR + e.deltaY * 0.005));
  updateCamera();
  e.preventDefault();
}, { passive: false });

// ── Vector direction update ───────────────────────────
// Three.js Y-up, but Bloch Z-up
// Bloch (x,y,z) → Three.js: x→x, z→y, y→-z (convention adjustment)
function blochToThree(bx, by, bz) {
  return new THREE.Vector3(bx, bz, -by);
}

let currentBloch = { x: 0, y: 0, z: 1 };
let targetBloch  = { x: 0, y: 0, z: 1 };
let animating    = false;
let animT        = 1;
let animDur      = 0.7; // seconds
let animStart    = null;
let fromBloch    = { x: 0, y: 0, z: 1 };

function setVectorDir(bx, by, bz) {
  const dir = blochToThree(bx, by, bz).normalize();
  const len = Math.sqrt(bx*bx + by*by + bz*bz);
  
  // Orient vecGroup so +Y points along dir
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
  vecGroup.setRotationFromQuaternion(q);
  vecGroup.scale.setScalar(len);

  // Projection dot line: from tip to equator plane
  const tip = dir.clone().multiplyScalar(len);
  const proj = new THREE.Vector3(tip.x, 0, tip.z);
  const pos = projGeo.attributes.position;
  pos.setXYZ(0, tip.x, tip.y, tip.z);
  pos.setXYZ(1, proj.x, proj.y, proj.z);
  pos.needsUpdate = true;
  projLine.computeLineDistances();
}

// Smooth animation via lerp on sphere (slerp)
function slerp(a, b, t) {
  // Great-circle interpolation for unit vectors
  const ax=a.x, ay=a.y, az=a.z;
  const bx=b.x, by=b.y, bz=b.z;
  const dot = Math.max(-1, Math.min(1, ax*bx+ay*by+az*bz));
  const omega = Math.acos(Math.abs(dot));
  if (omega < 0.001) {
    return { x: ax+(bx-ax)*t, y: ay+(by-ay)*t, z: az+(bz-az)*t };
  }
  const s = 1/Math.sin(omega);
  const c0 = Math.sin((1-t)*omega)*s;
  const c1 = Math.sin(t*omega)*s;
  const sign = dot < 0 ? -1 : 1;
  return { x: c0*ax + c1*bx*sign, y: c0*ay + c1*by*sign, z: c0*az + c1*bz*sign };
}

function easeInOut(t) {
  return t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
}

// ── Animation loop ────────────────────────────────────
let clock = new THREE.Clock();

function animate(timestamp) {
  requestAnimationFrame(animate);

  // Vector animation
  if (animating) {
    if (!animStart) animStart = timestamp;
    const elapsed = (timestamp - animStart) / 1000;
    const t = Math.min(elapsed / animDur, 1);
    const et = easeInOut(t);
    currentBloch = slerp(fromBloch, targetBloch, et);
    setVectorDir(currentBloch.x, currentBloch.y, currentBloch.z);
    if (t >= 1) {
      animating = false;
      currentBloch = { ...targetBloch };
    }
  }

  // Sphere gentle auto-rotate when not dragging
  if (!isDragging && !animating) {
    sphericalTheta += 0.001;
    updateCamera();
  }

  // Pulse sphere glow slightly
  const t = clock.getElapsedTime();
  sphereMat.opacity = 0.16 + 0.04 * Math.sin(t * 0.7);

  renderer.render(scene, camera);
}
animate();

// Resize handler
window.addEventListener('resize', () => {
  const w = W(), h = H2();
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

// ══════════════════════════════════════════════════════
//  GATE APPLICATION & UI UPDATES
// ══════════════════════════════════════════════════════

let gateHistory = [];

function applyGate(name) {
  const gate = GATES[name];
  if (!gate) return;

  // Animate button
  const btns = document.querySelectorAll('.gate-btn');
  btns.forEach(b => {
    if (b.querySelector('.gate-btn-symbol').textContent === gate.label) {
      b.classList.add('firing');
      setTimeout(() => b.classList.remove('firing'), 400);
    }
  });

  // Apply transformation
  const oldQubit = [...qubit];
  qubit = applyMatrix(gate.mat, qubit);

  // Get new bloch vector
  const newBloch = blochFromQubit(qubit);
  
  // Start animation
  fromBloch = { ...currentBloch };
  targetBloch = { x: newBloch.x, y: newBloch.y, z: newBloch.z };
  animating = true;
  animStart = null;

  // Show rotation info
  const info = document.getElementById('rotation-info');
  const deg = Math.round(Math.abs(gate.angle) * 180 / Math.PI);
  info.style.opacity = '1';
  info.textContent = `${gate.label} gate — rotate ${deg}° around ${gate.axis}`;
  setTimeout(() => { info.style.opacity = '0'; }, 2000);

  // Update history
  const stateLabel = getDiracLabel(qubit);
  gateHistory.unshift({ gate: gate.label, state: stateLabel, color: gate.color });
  if (gateHistory.length > 12) gateHistory.pop();
  renderHistory();

  // Update UI
  updateUI();
}

function updateUI() {
  const { x, y, z } = blochFromQubit(qubit);
  
  // State labels
  const label = getDiracLabel(qubit);
  document.getElementById('dirac-state').textContent = label;
  document.getElementById('state-label').textContent = label;
  
  // Angles
  const theta = Math.acos(Math.max(-1,Math.min(1, z))) * 180 / Math.PI;
  const phi   = Math.atan2(y, x) * 180 / Math.PI;
  document.getElementById('state-coords').textContent = 
    `θ = ${theta.toFixed(1)}° · φ = ${phi.toFixed(1)}°`;
  
  // Amplitudes
  const [ar, ai, br, bi] = qubit;
  const alpha = Math.sqrt(ar*ar+ai*ai);
  const beta  = Math.sqrt(br*br+bi*bi);
  document.getElementById('amp0').textContent = alpha.toFixed(3);
  document.getElementById('amp1').textContent = beta.toFixed(3);
  
  // Bloch vector magnitude
  const mag = Math.sqrt(x*x+y*y+z*z);
  document.getElementById('vec-magnitude').textContent = `|r| = ${mag.toFixed(3)}`;
  document.getElementById('vec-bar').style.width = (mag * 100).toFixed(1) + '%';
}

function renderHistory() {
  const list = document.getElementById('history-list');
  if (gateHistory.length === 0) {
    list.innerHTML = '<div class="history-empty">No gates applied yet.</div>';
    return;
  }
  list.innerHTML = gateHistory.map(h => `
    <div class="history-item">
      <span class="history-gate" style="--gate-c:${h.color}">${h.gate}</span>
      <span class="history-arrow">→</span>
      <span class="history-state">${h.state}</span>
    </div>
  `).join('');
}

// ── Reset & preset states ─────────────────────────────
function resetState() {
  qubit = [1, 0, 0, 0];
  targetBloch = { x: 0, y: 0, z: 1 };
  fromBloch = { ...currentBloch };
  animating = true;
  animStart = null;
  updateUI();
}

function setPlus() {
  const s = 1/Math.SQRT2;
  qubit = [s, 0, s, 0];
  targetBloch = blochFromQubit(qubit);
  fromBloch = { ...currentBloch };
  animating = true;
  animStart = null;
  updateUI();
}

function setMinus() {
  const s = 1/Math.SQRT2;
  qubit = [s, 0, -s, 0];
  targetBloch = blochFromQubit(qubit);
  fromBloch = { ...currentBloch };
  animating = true;
  animStart = null;
  updateUI();
}

function clearHistory() {
  gateHistory = [];
  renderHistory();
}

// ── Toggles ───────────────────────────────────────────
let showAxes   = true;
let showGrid   = true;
let showLabels = true;

function toggleAxes() {
  showAxes = !showAxes;
  axesGroup.visible = showAxes;
  const el = document.getElementById('toggle-axes');
  el.classList.toggle('on', showAxes);
}

function toggleGrid() {
  showGrid = !showGrid;
  gridGroup.visible = showGrid;
  const el = document.getElementById('toggle-grid');
  el.classList.toggle('on', showGrid);
}

function toggleLabels() {
  showLabels = !showLabels;
  labelsGroup.visible = showLabels;
  const el = document.getElementById('toggle-labels');
  el.classList.toggle('on', showLabels);
}

// ── Keyboard shortcuts ────────────────────────────────
window.addEventListener('keydown', e => {
  const map = { x:'X', y:'Y', z:'Z', h:'H', s:'S', t:'T', r: null };
  const key = e.key.toLowerCase();
  if (key === 'r') { resetState(); return; }
  if (map[key]) applyGate(map[key]);
});

// Init
updateUI();
updateCamera();
