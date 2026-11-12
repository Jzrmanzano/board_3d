import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import * as T from 'three';
import { BOARDS, ITEM_INFO } from '../data/boards';
import { setTone } from '../sim/audio';
import { activeHW, selectHot } from '../state/actions';
import { useLab } from '../state/store';
import { buildWorld } from './world';

/** Camera commands for the toolbar buttons, which live outside the canvas. */
export const view = { fit() {}, zoom(_factor: number) {} };

const VIEW_DIR = new T.Vector3(-0.42, 0.78, 1).normalize(), projected = new T.Vector3();

function pickOf(o: T.Object3D | null): string | null {
  for (; o; o = o.parent) if (o.userData.pick) return o.userData.pick;
  return null;
}

/** Everything inside the canvas: lights, camera rig and the bench for the open lesson. Part labels are plain buttons placed in `labelLayer`, a div lying over the canvas. */
export function Bench({ labelLayer }: { labelLayer: RefObject<HTMLDivElement | null> }) {
  const gl = useThree(s => s.gl), size = useThree(s => s.size);
  const camera = useThree(s => s.camera) as T.OrthographicCamera;
  const board = useLab(s => s.board), lesson = useLab(s => s.lesson), hot = useLab(s => s.hot);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const viewH = useRef(200);   // world millimetres visible top to bottom at zoom 1
  const labelEls = useRef<HTMLButtonElement[]>([]);

  const world = useMemo(() => {
    const b = BOARDS[board], l = b.lessons[lesson];
    return buildWorld({ board, parts: l.showParts ? b.parts : null, circuit: l.circuit, info: ITEM_INFO }, gl.capabilities.getMaxAnisotropy());
  }, [board, lesson, gl]);
  useEffect(() => () => world.dispose(), [world]);
  useEffect(() => {
    const els = world.hots.map(h => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'hot'; el.textContent = h.title; el.onclick = () => selectHot(h.id);
      return el;
    });
    labelLayer.current!.append(...els); labelEls.current = els;
    return () => els.forEach(el => el.remove());
  }, [world, labelLayer]);
  useEffect(() => {
    world.highlight(hot);
    labelEls.current.forEach((el, i) => el.setAttribute('aria-pressed', String(world.hots[i].id === hot)));
  }, [world, hot]);

  const frustum = () => {
    const a = size.width / size.height, h = viewH.current;
    camera.left = -h * a / 2; camera.right = h * a / 2; camera.top = h / 2; camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  };
  const fit = () => {   // frame the bench's bounding box as seen from the default camera direction
    const box = new T.Box3();
    world.group.children.forEach(o => { if (!o.userData.nofit) box.expandByObject(o); });
    const c = box.getCenter(new T.Vector3()), target = controls.current!.target;
    camera.position.copy(c).addScaledVector(VIEW_DIR, 900); camera.lookAt(c); camera.updateMatrixWorld();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const d = new T.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const x = d.dot(right), y = d.dot(up);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    viewH.current = Math.max((y1 - y0) * 1.16, (x1 - x0) * 1.1 / (size.width / size.height));
    target.copy(c).addScaledVector(right, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2);
    camera.position.copy(target).addScaledVector(VIEW_DIR, 900);
    camera.zoom = 1; frustum(); controls.current!.update();
  };
  useLayoutEffect(fit, [world]);        // a new lesson reframes the view
  useLayoutEffect(frustum, [size]);     // a resize keeps the same framing
  useEffect(() => {
    view.fit = fit;
    view.zoom = f => { camera.zoom = Math.min(6, Math.max(0.5, camera.zoom * f)); camera.updateProjectionMatrix(); };
  });

  useFrame(() => {   // copy pin states and on-screen inputs onto the 3D parts
    const s = useLab.getState(), hw = activeHW(), b = BOARDS[s.board];
    let freq = 0;
    world.set('builtin', hw ? hw.glow(b.builtin) : 0);
    for (const it of b.lessons[s.lesson].circuit) {
      if (it.t === 'led') world.set(it.id, hw ? hw.glow(it.pin) : 0);
      if (it.t === 'buzzer') { const f = hw?.tones[it.pin] || 0; world.set(it.id, f); freq ||= f; }
    }
    for (const id in s.inputs) world.set(id, s.inputs[id]);
    setTone(s.sound ? freq : 0);
    world.animate(performance.now());
    labelEls.current.forEach((el, i) => {   // keep each label over its part
      const p = projected.copy(world.hots[i].pos).project(camera);
      el.style.transform = `translate(${((p.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * size.height).toFixed(1)}px)`;
    });
  });

  return (
    <>
      <hemisphereLight args={[0xffffff, 0x9aa6b2, 0.46 * Math.PI]} />
      <directionalLight args={[0xffffff, 0.56 * Math.PI]} position={[-70, 150, 110]} />
      <gridHelper args={[1600, 160, 0x8b9bab, 0x8b9bab]} material-transparent material-opacity={0.22} />
      <OrbitControls ref={controls} enableDamping maxPolarAngle={Math.PI * 0.47} minZoom={0.5} maxZoom={6} />
      <primitive
        key={world.group.uuid}
        object={world.group}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta < 5) selectHot(pickOf(e.object)); }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); gl.domElement.style.cursor = pickOf(e.object) ? 'pointer' : ''; }}
        onPointerOut={() => { gl.domElement.style.cursor = ''; }}
      />
    </>
  );
}
