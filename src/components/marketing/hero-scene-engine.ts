import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type SceneHandle = { dispose: () => void };

type Opts = {
  host: HTMLElement;
  lowPower: boolean;
  carUrl: string;
  bikeUrl: string;
};

const ORANGE = 0xf07400;
const CYAN = 0x0eaecf;

/** Radial blob used as a soft contact shadow under each vehicle. */
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(33,24,21,0.55)");
  grad.addColorStop(1, "rgba(33,24,21,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * Resolves once the car and bike photo have loaded and the first frame is rendered.
 * Rejects (so the caller keeps the static fallback) if either asset fails.
 */
export async function startScene({ host, lowPower, carUrl, bikeUrl }: Opts): Promise<SceneHandle> {
  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 5);
  scene.add(key);

  // Subtle brand rings on the floor; no cartoon plinth.
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.05, 3.12, lowPower ? 64 : 128), new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.34, lowPower ? 64 : 128), new THREE.MeshBasicMaterial({ color: CYAN, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  ring2.rotation.x = -Math.PI / 2;
  ring.position.y = ring2.position.y = 0.005;
  scene.add(ring, ring2);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();
  const [gltf, bikeTex] = await Promise.all([loader.loadAsync(carUrl), texLoader.loadAsync(bikeUrl)]);

  // Car: centre it, scale to ~3.3 units long, rest on the floor.
  const car = new THREE.Group();
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);
  car.add(model);
  car.scale.setScalar(3.3 / Math.max(size.x, size.z));
  car.position.set(-1.1, 0, 0);
  scene.add(car);

  // Bike: real product photo as an always-facing billboard with a soft contact shadow.
  bikeTex.colorSpace = THREE.SRGBColorSpace;
  bikeTex.anisotropy = 4;
  const aspect = bikeTex.image.width / bikeTex.image.height;
  const bikeH = 1.9;
  const bike = new THREE.Mesh(new THREE.PlaneGeometry(bikeH * aspect, bikeH), new THREE.MeshBasicMaterial({ map: bikeTex, transparent: true, toneMapped: false }));
  bike.position.set(1.9, bikeH / 2 + 0.02, 0.6);
  scene.add(bike);
  const blob = shadowTexture();
  const mkShadow = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.01, z);
    scene.add(m);
  };
  mkShadow(4.2, 2.2, -1.1, 0);
  mkShadow(2.8, 0.9, 1.9, 0.6);

  host.prepend(renderer.domElement);

  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = w / h < 0.9;
    camera.position.set(0, narrow ? 3.4 : 2.6, narrow ? 13 : 10.5);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let tx = 0;
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
  };
  if (!lowPower) window.addEventListener("pointermove", onMove, { passive: true });

  let visible = true;
  let tabVisible = !document.hidden;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
  io.observe(host);
  const onVis = () => { tabVisible = !document.hidden; };
  document.addEventListener("visibilitychange", onVis);

  const clock = new THREE.Clock();
  let raf = 0;
  let parallax = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!visible || !tabVisible) return;
    const t = clock.getElapsedTime();
    parallax += (tx - parallax) * 0.05;
    car.rotation.y = 0.55 + Math.sin(t * 0.35) * 0.45 + parallax; // gentle showroom sweep, never shows the back
    ring2.rotation.z = t * 0.3;
    renderer.render(scene, camera);
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
        for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) {
          for (const v of Object.values(x)) if (v instanceof THREE.Texture) v.dispose();
          x.dispose();
        }
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
