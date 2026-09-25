import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RollRecord } from '../../types';
import { Dices, RotateCw } from 'lucide-react';
import { useAudioHaptic } from '../AudioHapticManager';

interface DiceRollAnimationProps {
  roll: RollRecord;
  onComplete?: () => void;
  className?: string;
}

function expandDiceTerms(roll: RollRecord): number[] {
  if (roll.diceTerms?.length) {
    return roll.diceTerms.flatMap((term) => Array.from({ length: term.count }, () => term.sides));
  }
  const dice = roll.formula.match(/(\d*)d(\d+)/gi);
  if (!dice?.length) return [20];
  return dice.flatMap((term) => {
    const match = term.match(/(\d*)d(\d+)/i);
    const count = Math.max(1, Number(match?.[1] || 1));
    const sides = Math.max(2, Number(match?.[2] || 20));
    return Array.from({ length: count }, () => sides);
  });
}

function randomFace(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

type DieVisualType = 'D4' | 'D6' | 'D8' | 'D10' | 'D12' | 'D20' | 'D100' | 'GENERIC';

export function getDieVisualType(sides: number): DieVisualType {
  if (sides === 4) return 'D4';
  if (sides === 6) return 'D6';
  if (sides === 8) return 'D8';
  if (sides === 10) return 'D10';
  if (sides === 12) return 'D12';
  if (sides === 20) return 'D20';
  if (sides === 100) return 'D100';
  return 'GENERIC';
}

interface Vec3 { x: number; y: number; z: number; }
interface Face { indices: number[]; label: number; }

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function length(v: Vec3): number {
  return Math.sqrt(dot(v, v)) || 1;
}
function normalize(v: Vec3): Vec3 {
  return scale(v, 1 / length(v));
}

function rotate(v: Vec3, rx: number, ry: number, rz: number): Vec3 {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  let p = { x: v.x, y: v.y * cx - v.z * sx, z: v.y * sx + v.z * cx };
  p = { x: p.x * cy + p.z * sy, y: p.y, z: -p.x * sy + p.z * cy };
  return { x: p.x * cz - p.y * sz, y: p.x * sz + p.y * cz, z: p.z };
}

const ICOSAHEDRON_VERTICES: Vec3[] = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  return [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => normalize({ x, y, z }));
})();

const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

function createDodecahedron(): { vertices: Vec3[]; faces: Face[] } {
  const vertices = ICOSAHEDRON_FACES.map((face) =>
    normalize(scale(add(add(ICOSAHEDRON_VERTICES[face[0]], ICOSAHEDRON_VERTICES[face[1]]), ICOSAHEDRON_VERTICES[face[2]]), 1))
  );
  const faces: Face[] = [];

  for (let vertexIndex = 0; vertexIndex < ICOSAHEDRON_VERTICES.length; vertexIndex += 1) {
    const normal = ICOSAHEDRON_VERTICES[vertexIndex];
    const adjacent = ICOSAHEDRON_FACES
      .map((face, faceIndex) => (face.includes(vertexIndex) ? faceIndex : -1))
      .filter((index) => index >= 0);

    const reference = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const tangent = normalize(cross(normal, reference));
    const bitangent = normalize(cross(normal, tangent));
    adjacent.sort((a, b) => {
      const ca = vertices[a];
      const cb = vertices[b];
      const aa = Math.atan2(dot(ca, bitangent), dot(ca, tangent));
      const ab = Math.atan2(dot(cb, bitangent), dot(cb, tangent));
      return aa - ab;
    });

    faces.push({ indices: adjacent, label: vertexIndex + 1 });
  }
  return { vertices, faces };
}

function createGeometry(type: DieVisualType, sides: number): { vertices: Vec3[]; faces: Face[] } {
  if (type === 'D6') {
    const v: Vec3[] = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ].map(([x, y, z]) => normalize({ x, y, z }));
    return {
      vertices: v,
      faces: [
        { indices: [0, 1, 2, 3], label: 1 },
        { indices: [4, 7, 6, 5], label: 6 },
        { indices: [0, 4, 5, 1], label: 2 },
        { indices: [3, 2, 6, 7], label: 5 },
        { indices: [1, 5, 6, 2], label: 3 },
        { indices: [0, 3, 7, 4], label: 4 },
      ],
    };
  }

  if (type === 'D4') {
    const v: Vec3[] = [
      [0, 1, 0],
      [-1, -0.5, 0.866],
      [1, -0.5, 0.866],
      [0, -0.5, -1.0],
    ].map(([x, y, z]) => normalize({ x, y, z }));
    return {
      vertices: v,
      faces: [
        { indices: [0, 2, 1], label: 1 },
        { indices: [0, 1, 3], label: 2 },
        { indices: [0, 3, 2], label: 3 },
        { indices: [1, 2, 3], label: 4 },
      ],
    };
  }

  if (type === 'D8') {
    const v: Vec3[] = [
      [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0],
      [0, 0, 1], [0, 0, -1],
    ].map(([x, y, z]) => ({ x, y, z }));
    return {
      vertices: v,
      faces: [
        { indices: [0, 2, 4], label: 1 }, { indices: [0, 4, 3], label: 2 },
        { indices: [0, 3, 5], label: 3 }, { indices: [0, 5, 2], label: 4 },
        { indices: [1, 4, 2], label: 5 }, { indices: [1, 3, 4], label: 6 },
        { indices: [1, 5, 3], label: 7 }, { indices: [1, 2, 5], label: 8 },
      ],
    };
  }

  if (type === 'D10' || type === 'D100') {
    // A 5-sided bipyramid has ten triangular faces and gives a clear physical
    // low-poly silhouette for D10 and percentile dice without pretending the
    // face is a flat card.
    const ring = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2;
      return normalize({ x: Math.cos(a), y: 0, z: Math.sin(a) });
    });
    const vertices = [
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      ...ring,
    ];
    const faces: Face[] = [];
    for (let i = 0; i < 5; i += 1) {
      const next = (i + 1) % 5;
      faces.push({ indices: [0, 2 + i, 2 + next], label: i + 1 });
      faces.push({ indices: [1, 2 + next, 2 + i], label: i + 6 });
    }
    return { vertices, faces };
  }

  if (type === 'D12') {
    return createDodecahedron();
  }

  if (type === 'D20') {
    return {
      vertices: ICOSAHEDRON_VERTICES,
      faces: ICOSAHEDRON_FACES.map((indices, index) => ({ indices, label: index + 1 })),
    };
  }

  const sidesClamped = Math.max(4, Math.min(20, sides));
  const vertices: Vec3[] = [];
  const faces: Face[] = [];
  const top = { x: 0, y: 1, z: 0 };
  const bottom = { x: 0, y: -1, z: 0 };
  vertices.push(top, bottom);
  for (let i = 0; i < sidesClamped; i += 1) {
    const a = (i / sidesClamped) * Math.PI * 2;
    vertices.push(normalize({ x: Math.cos(a), y: 0, z: Math.sin(a) }));
  }
  for (let i = 0; i < sidesClamped; i += 1) {
    const next = (i + 1) % sidesClamped;
    faces.push({ indices: [0, 2 + i, 2 + next], label: i + 1 });
    if (i + 1 < sidesClamped) faces.push({ indices: [1, 2 + next, 2 + i], label: i + 1 + sidesClamped });
  }
  return { vertices, faces };
}

const PolyhedralDie: React.FC<{
  type: DieVisualType;
  sides: number;
  value: number;
  rolling: boolean;
}> = ({ type, sides, value, rolling }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const startedRef = useRef<number | null>(null);
  const geometry = useMemo(() => createGeometry(type, sides), [type, sides]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logicalSize = 180;
    canvas.width = logicalSize * dpr;
    canvas.height = logicalSize * dpr;
    canvas.style.width = logicalSize + 'px';
    canvas.style.height = logicalSize + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (time: number) => {
      const started = startedRef.current ?? time;
      const elapsed = time - started;
      const spin = rolling ? elapsed / 1000 : 0;
      const rx = 0.42 + spin * 7.2;
      const ry = -0.35 + spin * 9.5;
      const rz = 0.2 + spin * 4.8;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, logicalSize, logicalSize);

      const center = { x: logicalSize / 2, y: logicalSize / 2 + 4 };
      const scalePx = 58;
      const focal = 430;
      const transformed = geometry.vertices.map((vertex) => {
        const rotated = rotate(vertex, rx, ry, rz);
        const depth = focal / Math.max(80, focal - rotated.z * 95);
        return {
          x: center.x + rotated.x * scalePx * depth,
          y: center.y - rotated.y * scalePx * depth,
          z: rotated.z,
          rotated,
        };
      });

      const orderedFaces = geometry.faces
        .map((face) => {
          const points = face.indices.map((index) => transformed[index]);
          const centroid = points.reduce((sum, point) => add(sum, point.rotated), { x: 0, y: 0, z: 0 } as Vec3);
          const faceCenter = scale(centroid, 1 / points.length);
          const edgeA = sub(points[1].rotated, points[0].rotated);
          const edgeB = sub(points[2].rotated, points[0].rotated);
          const normal = normalize(cross(edgeA, edgeB));
          const light = Math.max(0.15, Math.min(1, 0.35 + dot(normal, normalize({ x: -0.4, y: 0.8, z: 0.7 })) * 0.75));
          return { face, points, faceCenter, normal, light };
        })
        .sort((a, b) => a.faceCenter.z - b.faceCenter.z);

      orderedFaces.forEach(({ face, points, light }) => {
        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        const hue = type === 'D100' ? 330 : 258;
        const saturation = 62;
        const lightness = Math.round(23 + light * 30);
        ctx.fillStyle = `hsl(${hue} ${saturation}% ${lightness}%)`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.lineWidth = 1.7;
        ctx.stroke();

        const labelPoint = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
        labelPoint.x /= points.length;
        labelPoint.y /= points.length;
        const isResultFace = !rolling && face.label === value;
        const label = type === 'D100' ? String(face.label * 10).padStart(2, '0') : String(face.label);
        ctx.fillStyle = isResultFace ? '#ffffff' : 'rgba(255,255,255,0.78)';
        ctx.font = isResultFace ? 'bold 15px system-ui' : 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelPoint.x, labelPoint.y);
      });

      if (rolling) {
        animationRef.current = window.requestAnimationFrame(draw);
      }
    };

    startedRef.current = rolling ? performance.now() : null;
    draw(performance.now());

    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [geometry, rolling, type, value]);

  return (
    <div className="relative flex h-[180px] w-[180px] items-center justify-center" role="img" aria-label={`D${sides} three-dimensional die showing ${value}`}>
      <canvas ref={canvasRef} className="h-[180px] w-[180px]" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-1 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-white/65">
        D{sides}
      </div>
    </div>
  );
};

export const DiceRollAnimation: React.FC<DiceRollAnimationProps> = ({
  roll,
  onComplete,
  className = '',
}) => {
  const { playSfx, triggerHaptic } = useAudioHaptic();
  const diceSides = useMemo(() => expandDiceTerms(roll), [roll]);
  const [isRolling, setIsRolling] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [faces, setFaces] = useState<number[]>(() =>
    roll.individualDice.map((value, index) => value || randomFace(diceSides[index] || 20))
  );

  useEffect(() => {
    setFaces(roll.individualDice.map((value, index) => value || randomFace(diceSides[index] || 20)));
    setRevealed(false);
    setIsRolling(false);
  }, [roll, diceSides]);

  const startRoll = () => {
    if (isRolling || revealed) return;

    setIsRolling(true);
    triggerHaptic('medium');
    playSfx('dice.roll', 'HIGH', 0.85);

    const interval = window.setInterval(() => {
      setFaces((current) => current.map((_, index) => randomFace(diceSides[index] || 20)));
    }, 75);

    window.setTimeout(() => {
      window.clearInterval(interval);
      setFaces([...roll.individualDice]);
      setIsRolling(false);
      setRevealed(true);
      window.setTimeout(() => {
        playSfx(
          roll.isCriticalSuccess
            ? 'dice.critical'
            : roll.isCriticalFailure
            ? 'dice.failure'
            : 'dice.result',
          roll.isCriticalSuccess || roll.isCriticalFailure ? 'HIGH' : 'NORMAL',
          0.8
        );
        triggerHaptic(roll.isCriticalSuccess ? 'heavy' : roll.isCriticalFailure ? 'medium' : 'light');
        onComplete?.();
      }, 180);
    }, 1450);
  };

  return (
    <div className={`rounded-xl border border-violet-400/10 bg-[#0b0712]/75 px-3 py-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Dices className="h-3.5 w-3.5 text-stone-600" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-600">{roll.formula}</span>
        </div>
        {!revealed && (
          <button
            type="button"
            onClick={startRoll}
            disabled={isRolling}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRolling ? 'animate-spin' : ''}`} />
            {isRolling ? 'Rolling…' : 'Roll'}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {diceSides.map((sides, index) => (
          <PolyhedralDie
            key={`${roll.rollId}-${index}`}
            type={getDieVisualType(sides)}
            sides={sides}
            value={faces[index] ?? 1}
            rolling={isRolling}
          />
        ))}
      </div>

      {revealed && (
        <div className="mt-1 flex items-center justify-between border-t border-stone-900 pt-2 text-xs">
          <span className="text-stone-600">{roll.individualDice.length > 1 ? 'Dice total' : 'Die result'}</span>
          <span className="font-semibold text-stone-200">{roll.individualDice.join(' + ')}</span>
        </div>
      )}
    </div>
  );
};
