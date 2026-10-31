import * as THREE from "three";

export type SceneHandle = { dispose: () => void };

type Opts = {
  host: HTMLElement;
  cards: HTMLElement[];
  lowPower: boolean;
};

const ORANGE = 0xf07400;
const CYAN = 0x0eaecf;
const DARK = 0x211815;

function mat(color: number, rough = 0.45, metal = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function wheel(radius: number, width: number, seg: number) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, seg), mat(DARK, 0.9, 0));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, width * 1.05, seg), mat(0xe4dcd5, 0.3, 0.7));
  tyre.rotation.x = hub.rotation.x = Math.PI / 2;
  g.add(tyre, hub);
  return g;
}

function buildCar(seg: number) {
  const car = new THREE.Group();
  const body = new THREE.Shape();
  body.moveTo(-1.9, 0.25);
  body.lineTo(-1.9, 0.75);
  body.quadraticCurveTo(-1.5, 0.85, -0.9, 0.9);
  body.lineTo(-0.45, 1.45);
  body.quadraticCurveTo(-0.3, 1.55, 0, 1.55);
  body.lineTo(0.7, 1.55);
  body.quadraticCurveTo(0.95, 1.5, 1.1, 1.25);
  body.lineTo(1.35, 0.9);
  body.quadraticCurveTo(1.9, 0.85, 1.95, 0.55);
  body.lineTo(1.95, 0.25);
  body.closePath();
  const geo = new THREE.ExtrudeGeometry(body, { depth: 1.5, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2, curveSegments: seg });
  geo.translate(0, 0, -0.75);
  car.add(new THREE.Mesh(geo, mat(ORANGE, 0.3, 0.45)));
  const glass = mat(0x1b2a33, 0.1, 0.8);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.4, 1.62), glass);
  win.position.set(0.3, 1.2, 0);
  win.rotation.z = 0.04;
  car.add(win);
  for (const x of [-1.15, 1.2]) for (const z of [-0.8, 0.8]) {
    const w = wheel(0.38, 0.28, seg);
    w.position.set(x, 0.38, z);
    car.add(w);
  }
  for (const z of [-0.5, 0.5]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
    hl.position.set(2.05, 0.6, z);
    car.add(hl);
  }
  return car;
}

function buildBike(seg: number) {
  const bike = new THREE.Group();
  const body = mat(CYAN, 0.35, 0.35);
  const dark = mat(DARK, 0.6, 0.2);
  for (const x of [-0.85, 0.85]) {
    const w = wheel(0.34, 0.16, seg);
    w.position.set(x, 0.34, 0);
    bike.add(w);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.42), body);
  deck.position.set(-0.05, 0.5, 0);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.48), body);
  rear.position.set(-0.55, 0.78, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.4), dark);
  seat.position.set(-0.5, 1.08, 0);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 10), dark);
  col.position.set(0.7, 0.9, 0);
  col.rotation.z = -0.22;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), dark);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.6, 1.4, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
  lamp.position.set(0.8, 1.3, 0);
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), body);
  fender.position.set(0.9, 0.75, 0);
  bike.add(deck, rear, seat, col, bar, lamp, fender);
  return bike;
}

export function startScene({ host, cards, lowPower }: Opts): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2));
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 4, 12.5);
  camera.lookAt(0, 0.9, 0);

  scene.add(new THREE.HemisphereLight(0xfff1e6, 0x6f645c, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 7, 5);
  scene.add(sun);
  const rim = new THREE.PointLight(CYAN, 30, 14);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  const seg = lowPower ? 14 : 28;
  const stage = new THREE.Group();
  scene.add(stage);

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.18, lowPower ? 40 : 72), mat(0xfaf7f4, 0.5, 0.1));
  disc.position.y = -0.1;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.04, 8, lowPower ? 60 : 120), new THREE.MeshBasicMaterial({ color: ORANGE }));
  ring.rotation.x = Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.025, 8, lowPower ? 60 : 120), new THREE.MeshBasicMaterial({ color: CYAN }));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.01;
  stage.add(disc, ring, ring2);

  const car = buildCar(seg);
  car.scale.setScalar(0.62);
  car.position.set(-0.9, 0, 0.9);
  car.rotation.y = 0.5;
  const bike = buildBike(seg);
  bike.scale.setScalar(0.85);
  bike.position.set(1.7, 0, -0.5);
  bike.rotation.y = -0.6;
  stage.add(car, bike);
  stage.rotation.y = -0.35;

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.9 ? 15 : 12.5;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // Pointer parallax (fine pointers only).
  let tx = 0;
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 0.6;
  };
  if (!lowPower) window.addEventListener("pointermove", onMove, { passive: true });

  let visible = true;
  let tabVisible = !document.hidden;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
  io.observe(host);
  const onVis = () => { tabVisible = !document.hidden; };
  document.addEventListener("visibilitychange", onVis);

  const v = new THREE.Vector3();
  const clock = new THREE.Clock();
  let raf = 0;
  let parallax = 0;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible || !tabVisible) return;
    const t = clock.getElapsedTime();
    parallax += (tx - parallax) * 0.05;
    stage.rotation.y = -0.35 + t * 0.18 + parallax;
    car.position.y = Math.sin(t * 1.4) * 0.03;
    bike.position.y = Math.sin(t * 1.4 + 1.5) * 0.03;
    ring2.rotation.z = t * 0.4;
    renderer.render(scene, camera);

    const w = host.clientWidth;
    const h = host.clientHeight;
    const n = cards.length;
    cards.forEach((el, i) => {
      const a = (i / n) * Math.PI * 2 + t * 0.22;
      v.set(Math.cos(a) * 4.4, 2.1 + Math.sin(t * 0.9 + i) * 0.18 + (i % 2) * 0.9, Math.sin(a) * 2.4).project(camera);
      const depth = (Math.sin(a) + 1) / 2; // 0 = back, 1 = front
      el.style.left = `${((v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - v.y) / 2) * h}px`;
      el.style.opacity = String(0.55 + depth * 0.45);
      el.style.transform = `translate(-50%,-50%) scale(${0.82 + depth * 0.22})`;
      el.style.zIndex = String(Math.round(depth * 10));
    });
  };
  frame();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else mm?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
