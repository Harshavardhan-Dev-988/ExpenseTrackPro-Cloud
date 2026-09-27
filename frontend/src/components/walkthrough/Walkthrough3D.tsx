import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, ContactShadows, Sparkles, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import type { CategoryStats } from '../../types';
import { getCategoryGroupBreakdown, formatMoney } from '../../utils/helpers';

import imgGroceries from '../../assets/walkthrough/groceries.webp';
import imgDining from '../../assets/walkthrough/dining-takeout.webp';
import imgFuel from '../../assets/walkthrough/fuel-transportation.webp';
import imgHomeBills from '../../assets/walkthrough/home-bills.webp';
import imgShopping from '../../assets/walkthrough/shopping.webp';
import imgLifestyle from '../../assets/walkthrough/lifestyle-entertainment.webp';
import imgMedical from '../../assets/walkthrough/medical-expenses.webp';
import imgGifting from '../../assets/walkthrough/gifting-donations.webp';
import imgAgriculture from '../../assets/walkthrough/agriculture-farming.webp';
import imgEducation from '../../assets/walkthrough/education.webp';
import imgTravel from '../../assets/walkthrough/travel.webp';
import imgHousehold from '../../assets/walkthrough/household-services.webp';
import imgFinancial from '../../assets/walkthrough/financial-others.webp';

interface Walkthrough3DProps {
  categoryStats: CategoryStats[];
  currency: string;
  totalAmount: number;
  totalEntries: number;
  periodLabel: string;
  onClose: () => void;
}

// Reads a Ledger design token (stored as "R G B" triples, per index.css) so
// the 3D scene is built from the exact same palette as the rest of the app
// instead of a generic three.js gray-and-blue demo look, and stays correct
// whichever theme (light/dark) was active when the walkthrough was opened.
function cssTokenRgb(varName: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;
  return [parts[0], parts[1], parts[2]];
}
function rgbStr(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
function rgbaStr(rgb: [number, number, number], a: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}
function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
// Deterministic pseudo-random in [0,1) — still used for the doorway's idle
// bob phase and the floor's grain lines, so each stays fixed frame to frame
// instead of reshuffling on every re-render.
function hash01(i: number): number {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const HUB_RADIUS = 3.4;
const ROOM_DEPTH = 3.2;

interface RoomLayout {
  name: string;
  icon: string;
  value: number;
  count: number;
  color: string;
  pct: number;
  subcategories: { category: string; label: string; total: number; count: number }[];
  angle: number;
  doorPos: [number, number, number];
  roomCenter: [number, number, number];
}

interface ThemeColors {
  paperRgb: [number, number, number];
  surfaceRgb: [number, number, number];
  inkRgb: [number, number, number];
  pineHex: string;
  isDark: boolean;
}

type SceneState = 'hub' | string;

// Every category group gets its own generated illustration — a small flat-
// art "scene" (grocery bag, plate and cutlery, a car on the road, and so
// on) rather than a stock photo, since a hotlinked photo can't be relied
// on to keep loading, keep its licensing, or match the app's palette. Each
// image is pre-rendered once and used both as the doorway's peek window
// back in the hub and as the mural filling the room you step into.
const ROOM_IMAGE_BY_NAME: Record<string, string> = {
  'Groceries': imgGroceries,
  'Dining & Takeout': imgDining,
  'Fuel & Transportation': imgFuel,
  'Home & Bills': imgHomeBills,
  'Shopping': imgShopping,
  'Lifestyle & Entertainment': imgLifestyle,
  'Medical Expenses': imgMedical,
  'Gifting & Donations': imgGifting,
  'Agriculture & Farming': imgAgriculture,
  'Education': imgEducation,
  'Travel': imgTravel,
  'Household Services': imgHousehold,
  'Financial & Others': imgFinancial,
};
function imageForRoom(name: string): string {
  return ROOM_IMAGE_BY_NAME[name] ?? imgFinancial;
}

/** Crops a (square, 1:1) texture to "cover" a plane of a different aspect
 * ratio — same idea as CSS `background-size: cover` — instead of letting
 * three.js stretch it to fit. Mutates the texture's repeat/offset. */
function coverUV(texture: THREE.Texture, planeW: number, planeH: number, imageAspect = 1) {
  const planeAspect = planeW / planeH;
  if (planeAspect > imageAspect) {
    // Plane is relatively wider than the image: crop top/bottom.
    const repeatY = imageAspect / planeAspect;
    texture.repeat.set(1, repeatY);
    texture.offset.set(0, (1 - repeatY) / 2);
  } else {
    // Plane is relatively taller/narrower than the image: crop left/right.
    const repeatX = planeAspect / imageAspect;
    texture.repeat.set(repeatX, 1);
    texture.offset.set((1 - repeatX) / 2, 0);
  }
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

/** A slow-turning halo of light behind the pedestal — cheap, safe (doesn't
 * touch OrbitControls), and does a lot to make the hub feel like a living
 * space rather than a static diagram. */
function PedestalHalo({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.15;
  });
  return (
    <mesh ref={ref} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.95, 1.08, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Soft, textureless "sky" dressing: real drei Stars at night (shader based,
 * no external asset), and a few slowly drifting frosted discs by day — kept
 * hand-rolled rather than drei's Cloud helper so the scene has zero external
 * network dependency and never has a broken/missing-texture frame. */
function SkyDecor({ dark, tint }: { dark: boolean; tint: string }) {
  const blobRefs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  useFrame(({ clock }) => {
    blobRefs.forEach((r, i) => {
      if (!r.current) return;
      const t = clock.elapsedTime * 0.05 + i * 2.1;
      r.current.position.x = Math.sin(t) * 7 + i * 3 - 3;
      r.current.position.z = Math.cos(t * 0.8) * 6 - 4;
    });
  });
  if (dark) {
    return <Stars radius={42} depth={22} count={550} factor={2} fade speed={0.4} />;
  }
  return (
    <>
      {blobRefs.map((r, i) => (
        <mesh key={i} ref={r} position={[i * 3 - 3, 6.5 + i * 0.6, -6]}>
          <sphereGeometry args={[1.6 + i * 0.4, 12, 12]} />
          <meshBasicMaterial color={tint} transparent opacity={0.10} />
        </mesh>
      ))}
    </>
  );
}

/** Smoothly steers the camera and the OrbitControls pivot toward whichever
 * point the current scene state calls for — the "walking" feeling comes
 * entirely from this easing rather than any teleport. */
function CameraRig({
  sceneState,
  rooms,
  controlsRef,
}: {
  sceneState: SceneState;
  rooms: RoomLayout[];
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 5.6, 9));
  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  // Once the eased "walk" to a destination arrives, this flips off and the
  // rig stops touching the camera/controls entirely — otherwise the lerp
  // below runs forever and fights every drag/rotate the user makes with
  // OrbitControls, snapping the view back on the very next frame.
  const traveling = useRef(true);

  useEffect(() => {
    if (sceneState === 'hub') {
      targetPos.current.set(0, 3.1, 5.6);
      targetLookAt.current.set(0, 0.9, 0);
      traveling.current = true;
      return;
    }
    const room = rooms.find((r) => r.name === sceneState);
    if (!room) return;
    const [dx, , dz] = room.doorPos;
    const dirLen = Math.hypot(dx, dz) || 1;
    const nx = dx / dirLen;
    const nz = dz / dirLen;
    // Stand just inside the doorway, a step short of the room's center,
    // looking further in toward the plaque on the back wall.
    targetPos.current.set(dx + nx * 1.15, 1.75, dz + nz * 1.15);
    targetLookAt.current.set(room.roomCenter[0], 1.35, room.roomCenter[2]);
    traveling.current = true;
  }, [sceneState, rooms]);

  useFrame((_, delta) => {
    if (!traveling.current) return;
    const t = 1 - Math.pow(0.006, delta);
    camera.position.lerp(targetPos.current, t);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, t);
      controlsRef.current.update();
    }
    const posDist = camera.position.distanceTo(targetPos.current);
    const lookDist = controlsRef.current ? controlsRef.current.target.distanceTo(targetLookAt.current) : 0;
    if (posDist < 0.02 && lookDist < 0.02) {
      // Arrived — hand full, unfought control back to OrbitControls.
      traveling.current = false;
    }
  });

  return null;
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Doorway({
  room,
  currency,
  onEnter,
}: {
  room: RoomLayout;
  currency: string;
  onEnter: (name: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const facing = room.angle + Math.PI;
  const phase = useMemo(() => hash01(room.angle * 3.1) * Math.PI * 2, [room.angle]);
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const rippleStart = useRef(-999);
  const { clock } = useThree();
  const peekTexture = useTexture(imageForRoom(room.name)) as THREE.Texture;
  useMemo(() => {
    peekTexture.colorSpace = THREE.SRGBColorSpace;
    coverUV(peekTexture, 0.92, 1.72);
  }, [peekTexture]);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered]);

  useFrame(({ clock: c }) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(c.elapsedTime * 0.8 + phase) * 0.03;
    }
    if (matRef.current) {
      const mat = matRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.16 + Math.sin(c.elapsedTime * 1.4 + phase) * 0.07 + (hovered ? 0.2 : 0);
    }
    if (ringRef.current) {
      const dt = c.elapsedTime - rippleStart.current;
      if (dt >= 0 && dt < 0.6) {
        ringRef.current.visible = true;
        ringRef.current.scale.setScalar(0.3 + dt * 2.1);
        (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - dt / 0.6);
      } else {
        ringRef.current.visible = false;
      }
    }
  });

  return (
    <group position={room.doorPos} rotation={[0, facing, 0]}>
      <group ref={groupRef}>
        {/* Frame: two pillars + a lintel, so the doorway reads as an arch
            rather than a single flat plane. */}
        <mesh position={[-0.55, 0.95, 0]}>
          <boxGeometry args={[0.14, 1.9, 0.16]} />
          <meshStandardMaterial color={room.color} emissive={room.color} emissiveIntensity={hovered ? 0.5 : 0.22} roughness={0.5} fog={false} />
        </mesh>
        <mesh position={[0.55, 0.95, 0]}>
          <boxGeometry args={[0.14, 1.9, 0.16]} />
          <meshStandardMaterial color={room.color} emissive={room.color} emissiveIntensity={hovered ? 0.5 : 0.22} roughness={0.5} fog={false} />
        </mesh>
        <mesh position={[0, 1.92, 0]}>
          <boxGeometry args={[1.24, 0.14, 0.16]} />
          <meshStandardMaterial color={room.color} emissive={room.color} emissiveIntensity={hovered ? 0.5 : 0.22} roughness={0.5} fog={false} />
        </mesh>

        {/* Peek window: a still glimpse of the room's living mural */}
        <mesh
          position={[0, 0.95, 0]}
          scale={hovered ? 1.05 : 1}
          onClick={(e) => {
            e.stopPropagation();
            rippleStart.current = clock.elapsedTime;
            onEnter(room.name);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <planeGeometry args={[0.92, 1.72]} />
          <meshBasicMaterial map={peekTexture} toneMapped={false} fog={false} />
        </mesh>

        {/* Click ripple */}
        <mesh ref={ringRef} position={[0, 0.95, 0.09]} visible={false}>
          <ringGeometry args={[0.5, 0.58, 32]} />
          <meshBasicMaterial color={room.color} transparent opacity={0} side={THREE.DoubleSide} fog={false} />
        </mesh>

        {/* Entrance mat — a soft colored disc on the floor marking the click target, breathing gently */}
        <mesh ref={matRef} position={[0, 0.012, 0.55]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.62, 32]} />
          <meshStandardMaterial color={room.color} transparent opacity={0.22} fog={false} />
        </mesh>
      </group>

      <Html position={[0, 2.15, 0]} center distanceFactor={undefined} zIndexRange={[10, 0]}>
        <div
          className="pointer-events-none select-none text-center whitespace-nowrap font-mono"
          style={{ transform: 'translateY(-100%)' }}
        >
          <div className="text-[13px] leading-none mb-1">{room.icon}</div>
          <div className="text-[11px] font-semibold text-ink bg-surface/90 border border-line rounded px-1.5 py-0.5 leading-tight">
            {room.name}
          </div>
        </div>
      </Html>

      <AnimatePresence>
        {hovered && (
          <Html position={[0, 0.42, 0.6]} center zIndexRange={[11, 0]}>
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.9 }}
              transition={{ duration: 0.16 }}
              className="pointer-events-none select-none whitespace-nowrap font-mono text-[10px] bg-ink/90 text-paper rounded px-2 py-1 shadow-lg"
            >
              {formatMoney(room.value, currency)} · {room.count} entries
            </motion.div>
          </Html>
        )}
      </AnimatePresence>
    </group>
  );
}

function BarRow({
  label,
  value,
  currency,
  color,
  fraction,
  delayMs,
}: {
  label: string;
  value: number;
  currency: string;
  color: string;
  fraction: number;
  delayMs: number;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return (
    <div className="relative text-[11px]">
      <div
        className="absolute inset-y-0 left-0 rounded-sm origin-left transition-transform duration-700 ease-out"
        style={{
          width: '100%',
          backgroundColor: `${color}22`,
          transform: `scaleX(${grown ? Math.max(fraction, 0.04) : 0})`,
        }}
      />
      <div className="relative flex items-center justify-between gap-2 px-1.5 py-1">
        <span className="text-ink/80 truncate">{label}</span>
        <span className="font-mono tabular text-slate shrink-0">{formatMoney(value, currency)}</span>
      </div>
    </div>
  );
}

function RoomInterior({
  room,
  currency,
  onBack,
}: {
  room: RoomLayout;
  currency: string;
  onBack: () => void;
}) {
  const muralTexture = useTexture(imageForRoom(room.name)) as THREE.Texture;
  useMemo(() => {
    muralTexture.colorSpace = THREE.SRGBColorSpace;
  }, [muralTexture]);
  const animatedTotal = useCountUp(room.value, 900);
  const maxSub = Math.max(1, ...room.subcategories.map((s) => s.total));
  const facing = room.angle + Math.PI;
  // Unit vectors along the room's central axis (nx,nz) and perpendicular to
  // it (px,pz) — used to push the mural further back than the floating
  // card, and to plant two tinted side panels that close off the view to
  // either side, so looking around inside a room stays inside that room's
  // scene instead of glimpsing the hub's open sky through the gaps.
  const nx = Math.sin(room.angle);
  const nz = Math.cos(room.angle);
  const px = -nz;
  const pz = nx;
  const backDepth = 1.7;
  const backX = room.roomCenter[0] + nx * backDepth;
  const backZ = room.roomCenter[2] + nz * backDepth;
  const sideOffset = 2.05;

  return (
    <group>
      {/* Side panels — close the peripheral gaps with a wash of the room's color */}
      {[1, -1].map((s) => (
        <mesh
          key={s}
          position={[room.roomCenter[0] + px * sideOffset * s, 1.6, room.roomCenter[2] + pz * sideOffset * s]}
          rotation={[0, facing + (s > 0 ? Math.PI / 2 : -Math.PI / 2), 0]}
        >
          <planeGeometry args={[4.6, 4.2]} />
          <meshStandardMaterial color={room.color} opacity={0.55} transparent roughness={1} fog={false} />
        </mesh>
      ))}

      {/* The room's living mural — a real generated illustration filling the back wall */}
      <mesh position={[backX, 1.7, backZ]} rotation={[0, facing, 0]}>
        <planeGeometry args={[7.4, 7.4]} />
        <meshBasicMaterial map={muralTexture} toneMapped={false} fog={false} />
      </mesh>

      <Sparkles
        count={26}
        scale={[2.6, 2.2, 1.4]}
        size={2.4}
        speed={0.3}
        color={room.color}
        position={[room.roomCenter[0], 1.4, room.roomCenter[2]]}
      />

      <Html
        position={[room.roomCenter[0], 1.35, room.roomCenter[2]]}
        rotation={[0, facing, 0]}
        transform
        distanceFactor={2.6}
        occlude={false}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="relative w-64 select-none overflow-hidden rounded-xl border card-surface"
          style={{ pointerEvents: 'auto', borderColor: `${room.color}55` }}
        >
          <style>{`
            @keyframes wt-shimmer { 0% { transform: translateX(-120%) skewX(-12deg); } 100% { transform: translateX(220%) skewX(-12deg); } }
          `}</style>
          <div
            className="pointer-events-none absolute inset-y-0 w-1/3 opacity-40"
            style={{
              background: `linear-gradient(90deg, transparent, ${room.color}55, transparent)`,
              animation: 'wt-shimmer 1.4s ease-out 0.15s 1',
            }}
          />
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${room.color}, transparent)` }} />
          <div className="p-4">
            <div className="flex items-center gap-2.5 mb-2.5">
              <span
                className="text-xl flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                style={{ background: `${room.color}22`, boxShadow: `0 0 18px ${room.color}55` }}
                aria-hidden="true"
              >
                {room.icon}
              </span>
              <div className="min-w-0">
                <p className="font-display font-semibold text-ink text-sm leading-tight truncate">{room.name}</p>
                <p className="text-[10px] text-slate font-mono">{room.count} entries · {room.pct.toFixed(1)}% of total</p>
              </div>
            </div>
            <p className="font-mono tabular font-semibold text-2xl mb-2.5" style={{ color: room.color }}>
              {formatMoney(animatedTotal, currency)}
            </p>
            {room.subcategories.length > 0 && (
              <div className="border-t border-line pt-1.5 -mx-1.5 space-y-0.5">
                {room.subcategories.slice(0, 4).map((sub, i) => (
                  <BarRow
                    key={sub.category}
                    label={sub.label}
                    value={sub.total}
                    currency={currency}
                    color={room.color}
                    fraction={sub.total / maxSub}
                    delayMs={150 + i * 90}
                  />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onBack}
              className="mt-3 w-full text-[11px] font-medium text-paper rounded-md py-1.5 transition-transform hover:-translate-y-px active:translate-y-0"
              style={{ backgroundColor: room.color }}
            >
              ← Back to the hall
            </button>
          </div>
        </motion.div>
      </Html>
    </group>
  );
}

function Scene({
  rooms,
  totalAmount,
  totalEntries,
  periodLabel,
  currency,
  sceneState,
  setSceneState,
}: {
  rooms: RoomLayout[];
  totalAmount: number;
  totalEntries: number;
  periodLabel: string;
  currency: string;
  sceneState: SceneState;
  setSceneState: (s: SceneState) => void;
}) {
  const controlsRef = useRef<any>(null);

  const theme = useMemo<ThemeColors>(() => {
    const paperRgb = cssTokenRgb('--paper', [238, 241, 238]);
    const surfaceRgb = cssTokenRgb('--surface', [250, 250, 248]);
    const inkRgb = cssTokenRgb('--ink', [23, 33, 29]);
    const pineRgb = cssTokenRgb('--pine', [47, 77, 63]);
    return {
      paperRgb,
      surfaceRgb,
      inkRgb,
      pineHex: `#${pineRgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
      isDark: relativeLuminance(paperRgb) < 128,
    };
  }, []);

  const floorColor = rgbStr(theme.paperRgb);
  const pineColor = theme.pineHex;
  const inkColor = rgbStr(theme.inkRgb);

  const floorTexture = useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = floorColor;
      ctx.fillRect(0, 0, size, size);
      const vg = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.72);
      vg.addColorStop(0, theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)');
      vg.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = rgbaStr(theme.inkRgb, 0.05);
      ctx.lineWidth = 1;
      for (let i = 0; i < 46; i++) {
        const y = hash01(i * 3.7) * size;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + (hash01(i + 1) - 0.5) * 18, size * 0.7, y + (hash01(i + 2) - 0.5) * 18, size, y);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorColor, theme.isDark]);

  const activeRoom = sceneState === 'hub' ? null : rooms.find((r) => r.name === sceneState) || null;
  const totalCountUp = useCountUp(totalAmount, 1100);

  return (
    <>
      <color attach="background" args={[floorColor]} />
      <fog attach="fog" args={[floorColor, 9, 24]} />
      <ambientLight intensity={0.85} color={floorColor} />
      <directionalLight position={[6, 8, 4]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-6, 4, -4]} intensity={0.35} color={pineColor} />

      <SkyDecor dark={theme.isDark} tint={pineColor} />
      <Sparkles count={70} scale={[10, 3.5, 10]} size={2} speed={0.22} color={pineColor} opacity={0.45} />

      {/* Floor */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[HUB_RADIUS + ROOM_DEPTH + 1.5, 64]} />
        <meshStandardMaterial map={floorTexture} color={floorColor} roughness={0.9} />
      </mesh>

      {/* Hub pedestal + the grand total */}
      <PedestalHalo color={pineColor} />
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.62, 0.72, 0.9, 32]} />
        <meshStandardMaterial color={pineColor} emissive={pineColor} emissiveIntensity={0.2} roughness={0.4} metalness={0.15} />
      </mesh>
      <Html position={[0, 1.55, 0]} center zIndexRange={[10, 0]}>
        <div className="pointer-events-none select-none text-center card-surface px-4 py-2.5 min-w-[150px]" style={{ boxShadow: `0 0 24px ${pineColor}33` }}>
          <p className="text-[9px] uppercase tracking-wide text-slate font-mono mb-0.5">{periodLabel}</p>
          <p className="font-mono tabular font-semibold text-ink text-lg leading-tight">{formatMoney(totalCountUp, currency)}</p>
          <p className="text-[9px] text-slate mt-0.5">{totalEntries} entries · {rooms.length} rooms</p>
        </div>
      </Html>

      {rooms.map((room) => (
        <Doorway key={room.name} room={room} currency={currency} onEnter={setSceneState} />
      ))}

      {activeRoom && (
        <RoomInterior key={activeRoom.name} room={activeRoom} currency={currency} onBack={() => setSceneState('hub')} />
      )}

      <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={20} blur={2.2} far={4} color={inkColor} />

      <CameraRig sceneState={sceneState} rooms={rooms} controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.12}
        minDistance={1.5}
        maxDistance={sceneState === 'hub' ? 9 : 3.2}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  );
}

/**
 * The dashboard's numbers, walked through instead of read off a chart: a
 * round hall with the grand total on a pedestal at its center, a doorway
 * for every category group that has spend this period, and a small room
 * behind each door holding that category's own plaque of numbers. Built
 * as an alternate, opt-in view — the 2D dashboard is still the default —
 * so this is a place to explore the same data from, not a replacement for
 * reading it quickly.
 */
export default function Walkthrough3D({ categoryStats, currency, totalAmount, totalEntries, periodLabel, onClose }: Walkthrough3DProps) {
  const [sceneState, setSceneState] = useState<SceneState>('hub');
  const [showHint, setShowHint] = useState(true);

  const rooms = useMemo<RoomLayout[]>(() => {
    const groups = getCategoryGroupBreakdown(categoryStats);
    const total = groups.reduce((s, g) => s + g.value, 0);
    const angleStep = (Math.PI * 2) / Math.max(groups.length, 1);
    return groups.map((g, i) => {
      const angle = i * angleStep;
      const dx = Math.sin(angle);
      const dz = Math.cos(angle);
      return {
        ...g,
        pct: total > 0 ? (g.value / total) * 100 : 0,
        angle,
        doorPos: [dx * HUB_RADIUS, 0, dz * HUB_RADIUS] as [number, number, number],
        roomCenter: [dx * (HUB_RADIUS + ROOM_DEPTH), 0, dz * (HUB_RADIUS + ROOM_DEPTH)] as [number, number, number],
      };
    });
  }, [categoryStats]);

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => setShowHint(false), 4500);
    return () => clearTimeout(t);
  }, [showHint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sceneState !== 'hub') setSceneState('hub');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sceneState, onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Walk through your expenses"
      className="fixed inset-0 z-50 bg-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {rooms.length === 0 ? (
        <div className="h-full flex items-center justify-center p-6">
          <div className="card-surface p-8 text-center max-w-sm">
            <p className="font-display text-lg font-semibold text-ink mb-2">Nothing to walk through yet</p>
            <p className="text-sm text-slate mb-5">Add a few expenses for this period and the hall will fill up with rooms.</p>
            <button onClick={onClose} className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold hover:bg-pine-strong transition-colors">
              Close
            </button>
          </div>
        </div>
      ) : (
        <Canvas camera={{ position: [0, 5.6, 9], fov: 52 }} dpr={[1, 1.75]}>
          <Suspense fallback={null}>
            <Scene
              rooms={rooms}
              totalAmount={totalAmount}
              totalEntries={totalEntries}
              periodLabel={periodLabel}
              currency={currency}
              sceneState={sceneState}
              setSceneState={setSceneState}
            />
          </Suspense>
        </Canvas>
      )}

      {/* Chrome overlaid on the canvas: close button, back button, hint */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close walkthrough"
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-lg card-surface flex items-center justify-center text-ink hover:text-ember-strong transition-colors"
      >
        ✕
      </button>

      <div className="absolute top-4 left-4 z-10 card-surface px-3.5 py-2 flex items-center gap-2">
        <span className="text-base" aria-hidden="true">🚶</span>
        <span className="font-display text-sm font-semibold text-ink">Walk through</span>
      </div>

      <AnimatePresence>
        {sceneState !== 'hub' && (
          <motion.button
            type="button"
            onClick={() => setSceneState('hub')}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-pine text-paper text-sm font-semibold shadow-ledger hover:bg-pine-strong transition-colors"
          >
            ← Back to the hall
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHint && sceneState === 'hub' && rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 card-surface px-4 py-2 text-xs text-slate font-mono text-center max-w-[92vw] sm:whitespace-nowrap"
          >
            Drag to look around · tap a doorway to step inside
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
