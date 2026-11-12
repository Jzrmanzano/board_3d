import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import * as T from 'three';
import { BOARDS, ITEM_INFO } from '../data/boards';
import { setTone } from '../sim/audio';
import { beginMove, currentReadout, finishMove, isWireEnd, moveTo, pressPoint, releasePoint, selectHot, setPoint, setProbe } from '../state/actions';
import { allTerminals, movedWire } from '../state/bench';
import { benchOf, burntOf, lessonOf, useLab } from '../state/store';
import { itemId } from '../types';
import { buildWorld } from './world';

/** Camera commands for the toolbar buttons, which live outside the canvas. */
export const view = { fit() {}, top() {}, zoom(_factor: number) {} };

const VIEW_DIR = new T.Vector3(-0.42, 0.78, 1).normalize(), TOP_DIR = new T.Vector3(0, 1, 0.001).normalize(), projected = new T.Vector3();

function pickOf(o: T.Object3D | null): string | null {
  for (; o; o = o.parent) if (o.userData.pick) return o.userData.pick;
  return null;
}

/** Everything inside the canvas: lights, camera rig and the bench for the open lesson. Part labels are plain buttons placed in `labelLayer`, a div lying over the canvas. */
export function Bench({ labelLayer }: { labelLayer: RefObject<HTMLDivElement | null> }) {
  const gl = useThree(s => s.gl), size = useThree(s => s.size);
  const camera = useThree(s => s.camera) as T.OrthographicCamera;
  const board = useLab(s => s.board), hot = useLab(s => s.hot), showParts = useLab(s => !!lessonOf(s).showParts);
  const probed = useLab(s => s.probe?.name ?? null), nav = useLab(s => s.nav), bench = useLab(benchOf), burnt = useLab(burntOf), point = useLab(s => s.point), pending = useLab(s => s.pending), sparks = useLab(s => s.sparks);
  const drag = useLab(s => s.drag);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // while a wire end is being dragged, the wire is drawn plugged into the point under the pointer
  const shown = useMemo(() => {
    if (!drag?.to) return bench;
    const r = movedWire(board, bench, drag.id, drag.end, drag.to);
    return 'items' in r ? r.items : bench;
  }, [bench, board, drag]);
  const viewH = useRef(200);   // world millimetres visible top to bottom at zoom 1
  const labelEls = useRef<HTMLButtonElement[]>([]);

  const world = useMemo(
    () => buildWorld({ board, parts: showParts ? BOARDS[board].parts : null, info: ITEM_INFO }, gl.capabilities.getMaxAnisotropy()),
    [board, showParts, gl],
  );
  useEffect(() => () => world.dispose(), [world]);

  /* the student's parts and wires */
  useLayoutEffect(() => { world.setCircuit(shown, useLab.getState().burnt[`${board}-${lessonOf(useLab.getState()).id}`] ?? []); }, [world, shown, board]);
  useEffect(() => { burnt.forEach(id => world.burn(id)); }, [world, burnt]);
  const firstSpark = useRef(sparks);
  useEffect(() => {
    if (sparks === firstSpark.current) return;
    firstSpark.current = sparks;
    const last = bench[bench.length - 1], at = last && world.anchor(last.t === 'wire' ? last.b : last.t === 'led' ? last.k : 'a1');
    if (at) world.puff(at.clone().setY(at.y + 3), 'spark');
  }, [world, sparks, bench]);

  useEffect(() => {
    const els = world.hots.map(h => {
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'hot'; el.textContent = h.title; el.onclick = () => selectHot(h.id);
      return el;
    });
    labelLayer.current!.append(...els); labelEls.current = els;
    return () => els.forEach(el => el.remove());
  }, [world, shown, showParts, labelLayer]);
  useEffect(() => {
    world.highlight(hot);
    labelEls.current.forEach((el, i) => el.setAttribute('aria-pressed', String(world.hots[i].id === hot)));
  }, [world, hot, shown]);
  useEffect(() => { world.markers(drag?.to ?? point ?? probed, pending); }, [world, point, pending, probed, drag?.to]);

  /* placing parts: the pointer picks the nearest hole or pin on screen, so tiny holes stay easy to hit */
  useEffect(() => {
    const el = gl.domElement, spots = allTerminals(board, bench).map(name => ({ name, at: world.anchor(name) })).filter((s): s is { name: string; at: T.Vector3 } => !!s.at);
    let grabbed = false;
    const nearest = (e: PointerEvent): string | null => {
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, reach = e.pointerType === 'touch' ? 22 : 13;
      let best: string | null = null, bestD = reach;
      for (const s of spots) {
        projected.copy(s.at).project(camera);
        const d = Math.hypot((projected.x * 0.5 + 0.5) * r.width - x, (-projected.y * 0.5 + 0.5) * r.height - y);
        if (d < bestD) { bestD = d; best = s.name; }
      }
      return best;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!useLab.getState().tool) {   // with no part in hand, a wire end can be picked up and moved
        const name = nearest(e);
        if (name && beginMove(name)) { grabbed = true; setProbe(null); if (controls.current) controls.current.enabled = false; }
        return;
      }
      if (pressPoint(nearest(e))) { grabbed = true; if (controls.current) controls.current.enabled = false; }
    };
    const move = (e: PointerEvent) => {
      if (useLab.getState().drag) { moveTo(nearest(e)); return; }
      if (useLab.getState().tool) { setProbe(null); setPoint(nearest(e)); return; }
      setPoint(null);
      if (e.buttons) { setProbe(null); return; }   // turning or sliding the view
      const name = nearest(e), r = el.getBoundingClientRect();
      setProbe(name ? { name, x: e.clientX - r.left, y: e.clientY - r.top } : null);
    };
    const leave = () => { setProbe(null); setPoint(null); };
    const up = (e: PointerEvent) => {
      if (!grabbed) return;
      grabbed = false;
      if (controls.current) controls.current.enabled = true;
      if (useLab.getState().drag) finishMove(nearest(e)); else releasePoint(nearest(e));
    };
    if (import.meta.env.DEV) {   // lets a test script find where a hole is on screen
      (window as unknown as { __screenOf: (n: string) => [number, number] | null }).__screenOf = name => {
        const at = world.anchor(name), r = el.getBoundingClientRect();
        if (!at) return null;
        projected.copy(at).project(camera);
        return [r.left + (projected.x * 0.5 + 0.5) * r.width, r.top + (-projected.y * 0.5 + 0.5) * r.height];
      };
    }
    if (import.meta.env.DEV) (window as unknown as { __nearest: (x: number, y: number) => string | null }).__nearest = (x, y) => nearest({ clientX: x, clientY: y, pointerType: 'mouse' } as PointerEvent);
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    window.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); window.removeEventListener('pointerup', up); if (controls.current) controls.current.enabled = true; };
  }, [world, bench, board, gl, camera]);

  const frustum = () => {
    const a = size.width / size.height, h = viewH.current;
    camera.left = -h * a / 2; camera.right = h * a / 2; camera.top = h / 2; camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  };
  const fit = () => {   // frame the bench's bounding box as seen from the default camera direction
    const box = new T.Box3();
    world.group.children.forEach(o => { if (!o.userData.nofit && o.visible) box.expandByObject(o); });
    const c = box.getCenter(new T.Vector3()), target = controls.current!.target;
    camera.position.copy(c).addScaledVector(VIEW_DIR, 900); camera.lookAt(c); camera.updateMatrixWorld();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const d = new T.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const x = d.dot(right), y = d.dot(up);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    viewH.current = Math.max((y1 - y0) * 1.08, (x1 - x0) * 1.04 / (size.width / size.height));
    target.copy(c).addScaledVector(right, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2);
    camera.position.copy(target).addScaledVector(VIEW_DIR, 900);
    camera.zoom = 1; frustum(); controls.current!.update();
  };
  useLayoutEffect(fit, [world]);        // a new board reframes the view; placing parts does not
  useLayoutEffect(frustum, [size]);     // a resize keeps the same framing
  useEffect(() => {
    view.fit = fit;
    view.top = () => {   // look straight down: a flat 2D plan of the bench
      const target = controls.current!.target;
      camera.position.copy(target).addScaledVector(TOP_DIR, 900); camera.lookAt(target); controls.current!.update();
    };
    view.zoom = f => { camera.zoom = Math.min(6, Math.max(0.5, camera.zoom * f)); camera.updateProjectionMatrix(); };
  });

  useEffect(() => {   // arrow keys slide the view, as long as the student is not typing
    const onKey = (e: KeyboardEvent) => {
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] } as Record<string, number[]>)[e.key];
      if (!dir || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input, textarea, select, [role="tab"], [role="slider"]') || !controls.current) return;
      e.preventDefault();
      const step = (e.shiftKey ? 60 : 20) / camera.zoom, right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const move = right.multiplyScalar(dir[0] * step).addScaledVector(up, dir[1] * step);
      controls.current.target.add(move); camera.position.add(move); controls.current.update();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera]);

  useFrame(() => {   // copy pin states and on-screen inputs onto the 3D parts
    const s = useLab.getState(), now = currentReadout();   // the present, or the recorded moment the student is looking at
    let freq = 0;
    world.set('builtin', now ? now.builtinGlow : 0);
    benchOf(s).forEach((it, k) => {
      const id = itemId(it, k);
      if (it.t === 'led') world.set(id, now ? now.ledGlow(id) : 0);
      if (it.t === 'wire') world.set(id, now ? now.circuit.wireAmps(id) : 0);
      if (it.t === 'buzzer') { const f = now ? now.buzzFreq(id) : 0; world.set(id, f); freq ||= f; }
    });
    for (const id in s.inputs) world.set(id, s.inputs[id]);
    setTone(s.sound && !s.paused && s.cursor == null ? freq : 0);
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
      <OrbitControls ref={controls} enableDamping zoomToCursor screenSpacePanning
        mouseButtons={{ LEFT: nav === 'pan' ? T.MOUSE.PAN : T.MOUSE.ROTATE, MIDDLE: T.MOUSE.DOLLY, RIGHT: nav === 'pan' ? T.MOUSE.ROTATE : T.MOUSE.PAN }}
        touches={{ ONE: nav === 'pan' ? T.TOUCH.PAN : T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_PAN }} maxPolarAngle={Math.PI * 0.47} minZoom={0.5} maxZoom={6} />
      <primitive
        key={world.group.uuid}
        object={world.group}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.delta < 5 && !useLab.getState().tool) selectHot(pickOf(e.object)); }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); const st = useLab.getState(); gl.domElement.style.cursor = st.drag ? 'grabbing' : st.tool ? 'crosshair' : st.probe && isWireEnd(st.probe.name) ? 'grab' : pickOf(e.object) ? 'pointer' : ''; }}
        onPointerOut={() => { gl.domElement.style.cursor = ''; }}
      />
    </>
  );
}
