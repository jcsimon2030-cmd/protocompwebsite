// ProtoComp hero centerpiece — "Signal Field".
// A GPU-animated instanced cube lattice that ripples like a living readout of
// physiological signals, with a cyan readiness pulse sweeping through it.
// All motion happens in the vertex shader (one draw call), so it stays smooth
// even with thousands of cubes. Mounts only when WebGL + motion are available;
// otherwise the static .hero-grid stays and nothing here runs.

import * as THREE from 'three';

const GRID = 46;          // cubes per side  → 2116 instances, one draw call
const SPACING = 0.46;     // distance between cube centres
const CUBE = 0.30;        // cube footprint

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function saveData() {
  const c = navigator.connection;
  return !!(c && (c.saveData || /(2|3)g/.test(c.effectiveType || '')));
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (_) { return false; }
}

const VERT = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uPulse;     // 0..1 radius of the readiness sweep
  varying float vNorm;
  varying vec3  vNormalW;
  varying float vEdge;

  void main() {
    // World-space XZ of this instance (translation column of its matrix).
    vec3 inst = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float wx = inst.x;
    float wz = inst.z;
    float r  = length(vec2(wx, wz));

    // Flowing sum-of-sines terrain.
    float h = 0.0;
    h += sin(wx * 0.42 + uTime * 0.90);
    h += sin(wz * 0.50 - uTime * 0.70);
    h += 0.60 * sin((wx + wz) * 0.30 + uTime * 1.25);
    h += 0.45 * sin(r * 0.55 - uTime * 1.55);          // ambient radial ripple
    h = h * 0.5 + 1.25;

    // Readiness pulse: a bright ring sweeping outward from the centre.
    float ring = smoothstep(0.18, 0.0, abs(r - uPulse * 14.0));
    h += ring * 1.7;

    h = max(h, 0.06);
    float H = h * 0.85;

    vNorm = clamp(H / 3.4, 0.0, 1.0);

    // Unit-height box (translated so its base sits at y=0) grows upward.
    vec3 transformed = position;
    transformed.y *= H;
    vEdge = step(0.5, position.y);   // 1 on the top face

    vNormalW = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying float vNorm;
  varying vec3  vNormalW;
  varying float vEdge;

  void main() {
    vec3 low = vec3(0.015, 0.085, 0.120);
    vec3 mid = vec3(0.000, 0.520, 0.720);
    vec3 hi  = vec3(0.000, 0.900, 1.000);   // ProtoComp cyan

    vec3 col = mix(low, mid, smoothstep(0.0, 0.55, vNorm));
    col = mix(col, hi, smoothstep(0.55, 1.0, vNorm));

    // Cheap lambert so the cubes read as solid geometry.
    float diff = clamp(dot(normalize(vNormalW), normalize(vec3(0.35, 1.0, 0.28))), 0.0, 1.0);
    col *= (0.42 + 0.70 * diff);

    // Crest glow — HDR values get reined in by ACES tone mapping.
    col += hi * pow(vNorm, 3.0) * 1.55;
    col += hi * vEdge * vNorm * 0.30;        // brighter top faces

    gl_FragColor = vec4(col, 1.0);
  }
`;

function mount(hero) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hero.insertBefore(canvas, hero.firstChild);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
  } catch (_) {
    canvas.remove();
    return;
  }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.052);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 7.4, 13.5);
  camera.lookAt(0, 1.2, -2.5);

  // Instanced lattice.
  const geo = new THREE.BoxGeometry(CUBE, 1, CUBE);
  geo.translate(0, 0.5, 0); // base at y=0 so vertex-shader scaling grows upward

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: false,
  });

  const count = GRID * GRID;
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const half = ((GRID - 1) * SPACING) / 2;
  let i = 0;
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      m.makeTranslation(gx * SPACING - half, 0, gz * SPACING - half);
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(mesh);
  group.position.z = -3.5;
  scene.add(group);

  // Ambient glow disc behind the field for depth.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5)); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(0.0, 0.62, 0.78, a * 0.22); }`,
    })
  );
  halo.position.set(0, 0.5, -9);
  halo.rotation.x = -0.18;
  scene.add(halo);

  // Pointer parallax (lerped).
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function resize() {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  // ResizeObserver tracks the hero box itself (height can change on reflow /
  // font load independently of the window); fall back to resize event.
  if ('ResizeObserver' in window) {
    new ResizeObserver(resize).observe(hero);
  } else {
    window.addEventListener('resize', resize, { passive: true });
  }

  // Reduced-motion is reactive: if the OS preference flips on mid-session we
  // tear the scene down and let the static grid take back over.
  const motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  function teardown() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    geo.dispose();
    material.dispose();
    halo.geometry.dispose();
    halo.material.dispose();
    renderer.dispose();
    canvas.remove();
    hero.classList.remove('hero-3d-on');
  }
  motionMQ.addEventListener('change', (e) => { if (e.matches) teardown(); });

  // Only render while the hero is on-screen.
  let onScreen = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0 })
      .observe(hero);
  }

  const clock = new THREE.Clock();
  let pulse = 0;
  let raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!onScreen || document.hidden) return;

    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = t;

    // Heartbeat: a readiness sweep every ~6.5s.
    pulse = (t % 6.5) / 6.5;
    material.uniforms.uPulse.value = pulse < 0.62 ? pulse / 0.62 : 0.0;

    pointer.x += (target.x - pointer.x) * 0.045;
    pointer.y += (target.y - pointer.y) * 0.045;
    group.rotation.y = Math.sin(t * 0.05) * 0.12 + pointer.x * 0.22;
    group.rotation.x = -0.02 + pointer.y * 0.06;

    renderer.render(scene, camera);
  }
  frame();

  // Signal to CSS that the live canvas took over from the static grid.
  hero.classList.add('hero-3d-on');

  window.addEventListener('pagehide', teardown, { once: true });
}

function boot() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  if (prefersReducedMotion() || saveData() || !webglOK()) return;
  if (window.innerWidth < 720) return; // keep phones light; static grid stays
  try { mount(hero); } catch (err) { /* fail silent → static grid remains */ }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
