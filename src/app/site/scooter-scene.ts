import * as THREE from "three";

/**
 * Procedural, stylised electric scooter built from three.js primitives (no model files, no photos).
 * It is NOT the exact design of any Yadea model. Parts explode apart by `e` (0..1) and labels follow them.
 * Loaded lazily by exploded-scooter.tsx so three.js never ships with the first paint.
 */
export type PartLabel = { part: string; title: string; value: string };

type Part = { obj: THREE.Object3D; base: THREE.Vector3; dir: THREE.Vector3 };

const BRAND = "#FF5F00";
const DARK = "#2a2a2c";
const GREY = "#717071";
const LIGHT = "#cfcfcf";

// Vertical nudge (px) so neighbouring labels do not sit on top of each other.
const DY: Record<string, number> = { rearWheel: 52, frontWheel: 52, motor: -22, battery: 12 };

// On narrow screens only the main callouts are shown so they fit.
const COMPACT = new Set(["battery", "motor", "handlebar", "floor"]);

const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, ...o });

function wheel(): THREE.Group {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.095, 20, 40), mat("#1b1b1d", { roughness: 0.85 }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.13, 32), mat(LIGHT, { metalness: 0.5, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.15, 32), mat(GREY, { metalness: 0.6 }));
  disc.rotation.x = Math.PI / 2;
  g.add(tyre, rim, disc);
  return g;
}

export function createScooter(host: HTMLElement, labels: PartLabel[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b9bd, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(3, 5, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffe2cf, 0.8); fill.position.set(-4, 2, -3); scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);
  const parts = new Map<string, Part>();
  const add = (key: string, obj: THREE.Object3D, base: [number, number, number], dir: [number, number, number]) => {
    obj.position.set(...base);
    root.add(obj);
    parts.set(key, { obj, base: new THREE.Vector3(...base), dir: new THREE.Vector3(...dir) });
  };

  // wheels and hub motor
  add("rearWheel", wheel(), [-0.85, 0.32, 0], [-0.95, 0, 0]);
  add("frontWheel", wheel(), [0.85, 0.32, 0], [0.95, -0.05, 0]);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 32), mat(BRAND, { metalness: 0.35 }));
  motor.rotation.x = Math.PI / 2;
  add("motor", motor, [-0.85, 0.32, 0], [-0.2, 0.5, 0.85]);

  // front fork + steering + handlebar
  const fork = new THREE.Group();
  for (const z of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.78, 12), mat(LIGHT, { metalness: 0.6, roughness: 0.3 }));
    leg.position.z = z; fork.add(leg);
  }
  fork.rotation.z = -0.22;
  add("fork", fork, [0.78, 0.7, 0], [0.7, 0.35, 0]);
  const bar = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), mat(DARK)); stem.position.y = -0.1;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 12), mat(DARK)); tube.rotation.x = Math.PI / 2;
  const grips = new THREE.Group();
  for (const z of [-0.3, 0.3]) { const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12), mat("#111")); gr.rotation.x = Math.PI / 2; gr.position.z = z; grips.add(gr); }
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), mat("#111"));
  dash.position.set(-0.04, 0.07, 0);
  bar.add(stem, tube, grips, dash);
  add("handlebar", bar, [0.66, 1.2, 0], [0.25, 0.85, 0]);

  // body panels
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.46), mat(BRAND));
  shield.rotation.z = -0.2;
  add("frontPanel", shield, [0.58, 0.68, 0], [0.55, 0.15, 0.55]);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.26), mat("#fff6df", { emissive: new THREE.Color("#ffe9b0"), emissiveIntensity: 0.9 }));
  add("headlight", head, [0.69, 0.92, 0], [0.95, 0.5, 0]);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.42), mat(GREY));
  add("floor", floor, [0.05, 0.28, 0], [0.1, -0.35, 0.1]);
  const battery = new THREE.Group();
  const cell = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.17, 0.32), mat("#1d1d1f"));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.34), mat(BRAND, { emissive: new THREE.Color(BRAND), emissiveIntensity: 0.25 }));
  stripe.position.y = 0.04; battery.add(cell, stripe);
  add("battery", battery, [0.05, 0.18, 0], [0.1, -1.0, 0]);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.34, 0.4), mat(BRAND));
  add("rearBody", rear, [-0.5, 0.5, 0], [-0.55, 0.2, -0.55]);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.34), mat(DARK, { roughness: 0.8 }));
  add("seat", seat, [-0.48, 0.74, 0], [-0.15, 1.0, 0]);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.24), mat("#d4001a", { emissive: new THREE.Color("#ff2030"), emissiveIntensity: 0.7 }));
  add("tailLight", tail, [-0.88, 0.62, 0], [-1.2, 0.15, 0]);

  // soft ground shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.05 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.62; scene.add(shadow);

  // labels (plain DOM, no innerHTML)
  const els = labels.filter((l) => parts.has(l.part)).map((l) => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;opacity:0;will-change:transform,opacity;display:flex;align-items:center;gap:8px;white-space:nowrap";
    const dot = document.createElement("span");
    dot.style.cssText = `width:9px;height:9px;border-radius:9999px;background:${BRAND};box-shadow:0 0 0 4px rgba(255,95,0,.2);flex:none`;
    const box = document.createElement("span");
    box.style.cssText = `background:#fff;border:1px solid #e5e5e5;border-left:3px solid ${BRAND};border-radius:10px;padding:6px 10px;box-shadow:0 8px 24px -12px rgba(0,0,0,.35);font-weight:600;font-size:12px;line-height:1.25`;
    const t = document.createElement("span"); t.style.cssText = "display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#717071"; t.textContent = l.title;
    const v = document.createElement("span"); v.style.cssText = "display:block;font-size:13px;color:#111"; v.textContent = l.value;
    box.style.transform = `translateY(${DY[l.part] ?? 0}px)`;
    box.append(t, v); el.append(dot, box); host.appendChild(el);
    return { el, dot, box, part: l.part };
  });

  let w = 1, h = 1;
  const resize = () => {
    w = Math.max(1, host.clientWidth); h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // fit the exploded width (~5.4 units) and height (~3 units)
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max((w < 560 ? 2.35 : 2.95) / (t * camera.aspect), 1.75 / t);
    camera.position.set(0, 0.55, dist); camera.lookAt(0, 0.35, 0);
  };
  resize();

  const v3 = new THREE.Vector3();
  const render = (e: number, rot: number) => {
    parts.forEach((p) => p.obj.position.copy(p.base).addScaledVector(p.dir, e * 1.15));
    root.rotation.y = rot; root.rotation.x = 0.04;
    root.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const a = Math.min(1, Math.max(0, (e - 0.25) * 2.2));
    for (const l of els) {
      parts.get(l.part)!.obj.getWorldPosition(v3).project(camera);
      const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
      const left = v3.x < 0;
      l.el.style.flexDirection = left ? "row-reverse" : "row";
      const lw = l.el.offsetWidth;
      const px = Math.min(Math.max(left ? x - lw : x, 4), w - lw - 4);
      l.el.style.transform = `translate(${px}px, ${y - l.el.offsetHeight / 2}px)`;
      l.el.style.opacity = String(w < 560 && !COMPACT.has(l.part) ? 0 : a);
    }
  };

  const dispose = () => {
    els.forEach((l) => l.el.remove());
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
    renderer.dispose(); renderer.domElement.remove();
  };
  return { render, resize, dispose };
}
