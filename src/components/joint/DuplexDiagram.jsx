import React, { useMemo } from 'react';
import { PRODUCTS } from '../../data/products';

const RAIL_H = 1200;
const PAD    = 500;   // 평면도 여백
const EPAD   = 740;   // 입면도 여백 (뱃지 공간 확보)

// 부품별 색상
const PIPE_CLR = '#94a3b8'; // 통일된 파이프 색상 (은회색)
const PIPE_BDR = '#64748b'; // 파이프 테두리 (slate-500)

const C = {
  col:    PIPE_CLR,   // 주기둥
  colEdg: PIPE_CLR,   // 외곽중간기둥
  colCtr: PIPE_CLR,   // 중앙기둥
  rcol:   PIPE_CLR,   // 난간 중간기둥
  panel:  PIPE_CLR,   // 바닥판 파이프
  cross:  '#f97316',  // 교차TEE (주황)
  fix:    '#22c55e',  // 고정피스TEE (초록)
  plate:  '#ca8a04',  // 플레이트
  anchor: '#9ca3af',  // 셋앙카
  capM:   '#a78bfa',  // 사각캡(주기둥)
  capS:   '#c4b5fd',  // 사각캡(50각)
  beam:   PIPE_CLR,   // 구조보 그리드
  rail:   PIPE_CLR,   // 난간
  dim:    '#4b5563',  // 치수선
  dimT:   '#94a3b8',  // 치수 글자
  gnd:    '#92400e',  // 지면
};

const fmt = v => v >= 1000 ? `${v / 1000}m` : `${v}mm`;

// 파이프 규격별 SVG 픽셀 크기 (두께별 통일 표현)
const PIPE_PX = {
  '50':  { sq: 160, cw: 50  },
  '75':  { sq: 210, cw: 75  },
  '100': { sq: 260, cw: 100 },
};
const RAIL_PX = { sq: 110, cw: 50 }; // 난간 중간기둥 (항상 50각)

// 범례 색상/모양 반환
function legendStyle(id) {
  if (id.startsWith('L형') || id.startsWith('삼방TEE') || id.startsWith('십자TEE'))
    return { shape: 'sq', bg: C.col, border: '#6b7280', dark: true };
  if (id.startsWith('교차TEE'))
    return { shape: 'ci', bg: C.cross };
  if (id.startsWith('고정피스TEE'))
    return { shape: 'ci', bg: C.fix };
  if (id.startsWith('플레이트'))
    return { shape: 'sq', bg: C.plate, border: '#78350f' };
  if (id.startsWith('셋앙카'))
    return { shape: 'di', bg: C.anchor };
  if (id === '사각캡_50')
    return { shape: 'sq', bg: C.capS, border: '#7c3aed' };
  if (id.startsWith('사각캡'))
    return { shape: 'sq', bg: C.capM, border: '#4c1d95' };
  return { shape: 'ci', bg: '#6b7280' };
}

// ── 치수선 ─────────────────────────────────────────────────────

// 가로 치수선 (y0: 연장선 시작 y)
function DH({ x1, x2, y, y0, label, below = false }) {
  const mid = (x1 + x2) / 2, A = 72, SW = 10, FS = 88;
  const ty = below ? y + 155 : y - 140;
  return (
    <g>
      {y0 !== undefined && (
        <>
          <line x1={x1} y1={y0} x2={x1} y2={y + 50} stroke={C.dim} strokeWidth={6} opacity={.6} />
          <line x1={x2} y1={y0} x2={x2} y2={y + 50} stroke={C.dim} strokeWidth={6} opacity={.6} />
        </>
      )}
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C.dim} strokeWidth={SW} />
      <polygon points={`${x1},${y} ${x1+A},${y-A*.35} ${x1+A},${y+A*.35}`} fill={C.dim} />
      <polygon points={`${x2},${y} ${x2-A},${y-A*.35} ${x2-A},${y+A*.35}`} fill={C.dim} />
      <text x={mid} y={ty} textAnchor="middle" fill={C.dimT} fontSize={FS} fontFamily="monospace">{label}</text>
    </g>
  );
}

// 세로 치수선 (x0: 연장선 시작 x)
function DV({ x, x0, y1, y2, label }) {
  const mid = (y1 + y2) / 2, A = 72, SW = 10, tx = x + 210;
  return (
    <g>
      {x0 !== undefined && (
        <>
          <line x1={x0} y1={y1} x2={x + 50} y2={y1} stroke={C.dim} strokeWidth={6} opacity={.6} />
          <line x1={x0} y1={y2} x2={x + 50} y2={y2} stroke={C.dim} strokeWidth={6} opacity={.6} />
        </>
      )}
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={C.dim} strokeWidth={SW} />
      <polygon points={`${x},${y1} ${x-A*.35},${y1+A} ${x+A*.35},${y1+A}`} fill={C.dim} />
      <polygon points={`${x},${y2} ${x-A*.35},${y2-A} ${x+A*.35},${y2-A}`} fill={C.dim} />
      <text x={tx} y={mid} textAnchor="middle" dominantBaseline="middle"
        fill={C.dimT} fontSize={88} fontFamily="monospace"
        transform={`rotate(-90,${tx},${mid})`}>{label}</text>
    </g>
  );
}

// 번호 뱃지 (원형)
function Dot({ x, y, r, fill, n }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} />
      {n != null && (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
          fontSize={r * .92} fill="#fff" fontWeight="bold" fontFamily="sans-serif">{n}</text>
      )}
    </g>
  );
}

// 기둥 사각형 (번호 포함)
function ColRect({ x, y, s, fill, border, n }) {
  const textFill = '#111827';
  return (
    <g>
      <rect x={x - s / 2} y={y - s / 2} width={s} height={s}
        fill={fill} stroke={border} strokeWidth={14} rx={8} />
      {n != null && (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
          fontSize={s * .62} fill={textFill} fontWeight="bold" fontFamily="sans-serif">{n}</text>
      )}
    </g>
  );
}

// ── 평면도 ─────────────────────────────────────────────────────

function PlanView({ width, depth, colXs, colYs, panelXs, railFaces, pm, pipeSize, pipePx }) {
  const cols = colXs.length, rows = colYs.length;
  const colType = (c, r) =>
    (c === 0 || c === cols - 1) && (r === 0 || r === rows - 1) ? 'corner'
    : (c === 0 || c === cols - 1 || r === 0 || r === rows - 1) ? 'edge' : 'center';

  const ids = {
    L:  `L형_${pipeSize}`,
    S3: `삼방TEE_${pipeSize}`,
    SC: `십자TEE_${pipeSize}`,
    CX: '교차TEE_100_50',
    GP: '고정피스TEE_50',
    PC: `플레이트코너_${pipeSize}`,
    PS: `플레이트측면_${pipeSize}`,
    PM: `플레이트중앙_${pipeSize}`,
  };

  // 최초 1회만 번호 표시 (mutable tracking — deterministic render order)
  const shown = {};
  const once = (id) => {
    if (pm[id] == null || shown[id]) return null;
    shown[id] = true;
    return pm[id];
  };

  // 교차TEE 대표 위치 (중간 교차점)
  const midPI = Math.floor(panelXs.length / 2);
  const midRI = Math.floor(rows / 2);

  // 고정피스TEE 대표 위치 (첫 번째 패널 상단)
  const gpRepI = Math.floor(panelXs.length / 2);

  // 난간 중간기둥 위치
  const railMids = useMemo(() => {
    const pts = [];
    if (railFaces.front) colXs.slice(0, -1).forEach((x, i) =>
      pts.push({ x: (x + colXs[i + 1]) / 2, y: 0 }));
    if (railFaces.back) colXs.slice(0, -1).forEach((x, i) =>
      pts.push({ x: (x + colXs[i + 1]) / 2, y: depth }));
    if (railFaces.left) colYs.slice(0, -1).forEach((y, i) =>
      pts.push({ x: 0, y: (y + colYs[i + 1]) / 2 }));
    if (railFaces.right) colYs.slice(0, -1).forEach((y, i) =>
      pts.push({ x: width, y: (y + colYs[i + 1]) / 2 }));
    return pts;
  }, [railFaces, colXs, colYs, depth, width]);

  const S = pipePx.sq; // 기둥 사각형 크기 (규격별 통일)

  return (
    <svg viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${depth + PAD * 2}`}
      className="w-full" style={{ display: 'block' }}>

      {/* 배경 */}
      <rect x={-PAD} y={-PAD} width={width + PAD * 2} height={depth + PAD * 2} fill="#0d1117" />
      <rect x={0} y={0} width={width} height={depth} fill="#131c2e" rx={18} />

      {/* 구조보 그리드 (3m 간격) */}
      {colYs.map((y, r) =>
        <line key={`gh${r}`} x1={0} y1={y} x2={width} y2={y} stroke={C.beam} strokeWidth={4} vectorEffect="non-scaling-stroke" />
      )}
      {colXs.map((x, c) =>
        <line key={`gv${c}`} x1={x} y1={0} x2={x} y2={depth} stroke={C.beam} strokeWidth={4} vectorEffect="non-scaling-stroke" />
      )}

      {/* 바닥판 파이프 (하늘색) */}
      {panelXs.map((x, p) =>
        <line key={`fp${p}`} x1={x} y1={0} x2={x} y2={depth}
          stroke={C.panel} strokeWidth={4} vectorEffect="non-scaling-stroke" />
      )}

      {/* 교차TEE — 주황 원 (패널 × 구조보 교차점) */}
      {colYs.flatMap((y, r) =>
        panelXs.map((x, p) => {
          const isRep = p === midPI && r === midRI;
          return (
            <Dot key={`cx${r}-${p}`} x={x} y={y} r={76}
              fill={C.cross} n={isRep ? once(ids.CX) : null} />
          );
        })
      )}

      {/* 고정피스TEE — 초록 원 (패널 양끝) */}
      {panelXs.map((x, p) => {
        const isRep = p === gpRepI;
        return (
          <g key={`gp${p}`}>
            <Dot x={x} y={-68} r={56} fill={C.fix} n={isRep ? once(ids.GP) : null} />
            <Dot x={x} y={depth + 68} r={56} fill={C.fix} />
          </g>
        );
      })}

      {/* 난간 면 표시 */}
      {railFaces.front && <rect x={0} y={-95} width={width} height={50} fill={C.rail} opacity={.18} rx={4} />}
      {railFaces.back  && <rect x={0} y={depth + 45} width={width} height={50} fill={C.rail} opacity={.18} rx={4} />}
      {railFaces.left  && <rect x={-95} y={0} width={50} height={depth} fill={C.rail} opacity={.18} rx={4} />}
      {railFaces.right && <rect x={width + 45} y={0} width={50} height={depth} fill={C.rail} opacity={.18} rx={4} />}

      {/* 난간 중간기둥 (50각, 노란 사각형) */}
      {railMids.map((pt, i) => (
        <rect key={i}
          x={pt.x - RAIL_PX.sq / 2} y={pt.y - RAIL_PX.sq / 2}
          width={RAIL_PX.sq} height={RAIL_PX.sq}
          fill={C.rcol} stroke={C.rail} strokeWidth={1.5} vectorEffect="non-scaling-stroke" rx={6} />
      ))}

      {/* 주기둥 사각형 (흰색) + 번호 */}
      {colXs.flatMap((x, c) =>
        colYs.map((y, r) => {
          const t = colType(c, r);
          const id   = t === 'corner' ? ids.L  : t === 'edge' ? ids.S3 : ids.SC;
          const fill = t === 'corner' ? C.col  : t === 'edge' ? C.colEdg : C.colCtr;
          const bdr  = PIPE_BDR;
          return <ColRect key={`col${c}-${r}`} x={x} y={y} s={S} fill={fill} border={bdr} n={once(id)} />;
        })
      )}

      {/* 플레이트 번호는 평면도에서 제외 — 입면도 하단에 표시 */}

      {/* 치수선 */}
      <DH x1={0} x2={width} y={-PAD * .57} y0={0} label={fmt(width)} />
      <DV x={width + PAD * .62} x0={width} y1={0} y2={depth} label={fmt(depth)} />
      {cols > 1 && <DH x1={0} x2={colXs[1]} y={depth + PAD * .44} y0={depth} label="3m" below />}

      {/* 뷰 제목 + 규격 */}
      <text x={-PAD * .88} y={-PAD * .88} fill={C.dimT} fontSize={108} fontWeight="bold" fontFamily="sans-serif">
        평면도
      </text>
      <text x={-PAD * .88} y={-PAD * .52} fill={C.dimT} fontSize={72} fontFamily="monospace">
        주기둥 {pipeSize}×{pipeSize}mm{Object.values(railFaces).some(Boolean) ? ` / 난간기둥 50×50mm` : ''}
      </text>
    </svg>
  );
}

// ── 입면도 (정면/측면) ─────────────────────────────────────────

function ElevView({ svgTitle, spanLen, spanXs, floorH, totalH, hasRail, pm, pipeSize, pipePx }) {
  const Yfl  = totalH - floorH;  // 바닥판 레벨 (SVG Y: 0=상단, totalH=지면)
  const Ygnd = totalH;
  const n    = spanXs.length;
  const CW   = pipePx.cw; // 기둥 폭 (규격별 통일)
  // viewBox 폭에 비례하는 선 두께 — 정면도·측면도 모두 동일한 시각적 두께
  const vbW = spanLen + EPAD * 2;
  const sw = n => Math.round(n * vbW / 7480); // 기준 6m 구조물 viewBox폭 7480

  const ids = {
    L:   `L형_${pipeSize}`,
    S3:  `삼방TEE_${pipeSize}`,
    PC:  `플레이트코너_${pipeSize}`,
    PS:  `플레이트측면_${pipeSize}`,
    CAP: `사각캡_${pipeSize}`,
    C50: '사각캡_50',
    GP:  '고정피스TEE_50',
  };

  const shown = {};
  const once = (id) => {
    if (pm[id] == null || shown[id]) return null;
    shown[id] = true;
    return pm[id];
  };

  const top = hasRail ? 0 : Yfl;

  return (
    <svg viewBox={`${-EPAD} ${-EPAD} ${spanLen + EPAD * 2} ${totalH + EPAD * 2}`}
      className="w-full" style={{ display: 'block' }}>

      {/* 배경 */}
      <rect x={-EPAD} y={-EPAD} width={spanLen + EPAD * 2} height={totalH + EPAD * 2} fill="#0d1117" />

      {/* 지면 */}
      <line x1={-80} y1={Ygnd} x2={spanLen + 80} y2={Ygnd} stroke={C.gnd} strokeWidth={5} vectorEffect="non-scaling-stroke" opacity={.55} />
      <line x1={-80} y1={Ygnd + 55} x2={spanLen + 80} y2={Ygnd + 55} stroke={C.gnd} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={.25} />

      {/* 상단 가로보 — 기둥 상단 연결 */}
      <line x1={spanXs[0]} y1={top} x2={spanXs[n - 1]} y2={top}
        stroke={C.beam} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" />

      {/* 중간 가로보 — 바닥판 레벨 (난간 있을 때만) */}
      {hasRail && Yfl > top && (
        <line x1={spanXs[0]} y1={Yfl} x2={spanXs[n - 1]} y2={Yfl}
          stroke={C.beam} strokeWidth={4} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      )}

      {/* 바닥판 레벨 점선 표시 */}
      {hasRail && (
        <line x1={0} y1={Yfl} x2={spanLen} y2={Yfl}
          stroke="#fbbf24" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="15 8" opacity={.35} />
      )}

      {/* 난간 살대 3줄 */}
      {hasRail && [400, 800, 1200].map(h => (
        <line key={h} x1={0} y1={Yfl - h} x2={spanLen} y2={Yfl - h}
          stroke={C.rail} strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={.38} />
      ))}

      {/* 난간 중간기둥 (mid-span) */}
      {hasRail && n > 1 && spanXs.slice(0, -1).map((x, i) => {
        const mx = (x + spanXs[i + 1]) / 2;
        return (
          <g key={i}>
            <line x1={mx} y1={Yfl - RAIL_H} x2={mx} y2={Yfl}
              stroke={C.rcol} strokeWidth={5} vectorEffect="non-scaling-stroke" opacity={.6} />
            <rect x={mx - sw(RAIL_PX.cw * 1.4)} y={Yfl - RAIL_H - sw(60)} width={sw(RAIL_PX.cw * 2.8)} height={sw(60)}
              fill={C.capS} rx={4} />
          </g>
        );
      })}

      {/* 주기둥 */}
      {spanXs.map((x, i) => {
        const fill = (i === 0 || i === n - 1) ? C.col : C.colEdg;
        const bdr  = PIPE_BDR;
        return (
          <g key={i}>
            <rect x={x - CW / 2} y={top} width={CW} height={Ygnd - top}
              fill={fill} stroke={bdr} strokeWidth={1.5} vectorEffect="non-scaling-stroke" opacity={.8} rx={6} />
            {hasRail && (
              <rect x={x - CW * .7} y={top - sw(60)} width={CW * 1.4} height={sw(60)}
                fill={C.capM} rx={4} />
            )}
          </g>
        );
      })}

      {/* 플레이트 (기둥 하단) */}
      {spanXs.map((x, i) => (
        <rect key={i} x={x - sw(72)} y={Ygnd - sw(24)} width={sw(144)} height={sw(48)}
          fill={C.plate} opacity={.55} rx={sw(6)} />
      ))}

      {/* 번호 뱃지 (2배 크기) */}
      {/* L형 — 첫 기둥 상단 */}
      {pm[ids.L] != null && (
        <Dot x={spanXs[0]} y={top - 390} r={200} fill="#64748b" n={once(ids.L)} />
      )}
      {/* 삼방TEE — 두 번째 기둥 */}
      {pm[ids.S3] != null && n > 2 && (
        <Dot x={spanXs[1]} y={top - 390} r={200} fill="#f97316" n={once(ids.S3)} />
      )}
      {/* 사각캡 주기둥 */}
      {hasRail && pm[ids.CAP] != null && (
        <Dot x={spanXs[n - 1]} y={top - 390} r={180} fill={C.capM} n={once(ids.CAP)} />
      )}
      {/* 사각캡 50각 */}
      {hasRail && n > 1 && pm[ids.C50] != null && (
        <Dot x={(spanXs[0] + spanXs[1]) / 2} y={top - 390} r={160} fill={C.capS} n={once(ids.C50)} />
      )}
      {/* 고정피스TEE (난간 중간기둥 연결) */}
      {hasRail && n > 1 && pm[ids.GP] != null && (
        <Dot x={(spanXs[0] + spanXs[1]) / 2} y={Yfl - 680} r={160} fill={C.fix} n={once(ids.GP)} />
      )}
      {/* 플레이트 — 기둥 하단 (셋앙카 제외, 도면에 표시 안 함) */}
      {pm[ids.PC] != null && (
        <Dot x={spanXs[0]} y={Ygnd + 390} r={190} fill={C.plate} n={once(ids.PC)} />
      )}
      {pm[ids.PS] != null && n > 2 && (
        <Dot x={spanXs[1]} y={Ygnd + 390} r={190} fill={C.plate} n={once(ids.PS)} />
      )}

      {/* 치수선 */}
      <DH x1={0} x2={spanLen} y={-EPAD * .62} y0={top} label={fmt(spanLen)} />
      <DV x={spanLen + EPAD * .62} x0={spanLen} y1={Yfl} y2={Ygnd} label={fmt(floorH)} />
      {hasRail && (
        <DV x={spanLen + EPAD * .62} x0={spanLen} y1={top} y2={Yfl} label={fmt(RAIL_H)} />
      )}
      {n > 1 && <DH x1={spanXs[0]} x2={spanXs[1]} y={Ygnd + EPAD * .42} y0={Ygnd} label="3m" below />}

      {/* 뷰 제목 + 규격 */}
      <text x={-EPAD * .88} y={-EPAD * .88} fill={C.dimT} fontSize={105} fontWeight="bold" fontFamily="sans-serif">
        {svgTitle}
      </text>
      <text x={-EPAD * .88} y={-EPAD * .56} fill={C.dimT} fontSize={72} fontFamily="monospace">
        주기둥 {pipeSize}×{pipeSize}mm{hasRail ? ` / 난간기둥 50×50mm` : ''}
      </text>
    </svg>
  );
}

// ── 범례 (HTML) ────────────────────────────────────────────────

function Legend({ results }) {
  return (
    <div className="h-full flex flex-col">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-0.5">범례</p>
      <div className="flex-1 bg-[#0d1117] rounded-xl border border-gray-700/60 p-3 space-y-1.5 overflow-auto">
        {results.map((part, i) => {
          const p   = PRODUCTS[part.id];
          const n   = i + 1;
          const sty = legendStyle(part.id);
          return (
            <div key={part.id} className="flex items-center gap-2 min-w-0">
              {/* 색상 아이콘 */}
              <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                {sty.shape === 'sq' && (
                  <span className="w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: sty.bg, border: `2px solid ${sty.border ?? '#555'}`, color: sty.dark ? '#111' : '#fff' }}>
                    {n}
                  </span>
                )}
                {sty.shape === 'ci' && (
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: sty.bg }}>
                    {n}
                  </span>
                )}
                {sty.shape === 'di' && (
                  <span className="w-3 h-3 rotate-45 flex items-center justify-center"
                    style={{ backgroundColor: sty.bg }} />
                )}
              </span>
              {/* 부품 정보 */}
              <div className="min-w-0">
                <p className="text-[10px] text-gray-200 truncate leading-tight">{p?.name ?? part.id}</p>
                <p className="text-[9px] text-gray-500 truncate">{p?.spec ?? ''}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 메인 ───────────────────────────────────────────────────────

export default function DuplexDiagram({ dims, pipeSize, options, results }) {
  const { width, depth, height: floorH = 3000 } = dims;
  const { railing = 'none' } = options ?? {};

  const hasAnyRail = railing !== 'none';
  const cols    = Math.floor(width  / 3000) + 1;
  const rows    = Math.floor(depth  / 3000) + 1;
  const totalH  = floorH + (hasAnyRail ? RAIL_H : 0);

  const panelXs = useMemo(() =>
    Array.from({ length: Math.floor(width / 407) + 1 }, (_, i) => i * 407), [width]);
  const colXs = useMemo(() =>
    Array.from({ length: cols }, (_, c) => c * 3000), [cols]);
  const colYs = useMemo(() =>
    Array.from({ length: rows }, (_, r) => r * 3000), [rows]);

  const railFaces = useMemo(() => ({
    front: ['front', 'front_left', 'front_right', 'front_left_right', 'all'].includes(railing),
    back:  railing === 'all',
    left:  ['front_left', 'front_left_right', 'all'].includes(railing),
    right: ['front_right', 'front_left_right', 'all'].includes(railing),
  }), [railing]);

  const pm = useMemo(() => {
    if (!Array.isArray(results)) return {};
    return Object.fromEntries(results.map((r, i) => [r.id, i + 1]));
  }, [results]);

  const pipePx = PIPE_PX[pipeSize] ?? PIPE_PX['50'];

  if (!Array.isArray(results) || results.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-0.5">구조물 도면</p>

      {/* 평면도 + 범례 */}
      <div>
        <p className="text-[11px] text-gray-500 mb-1 px-0.5">① 평면도 (위에서 본 모습)</p>
        <div className="flex gap-3 items-stretch">
          <div className="flex-1 min-w-0 bg-[#0d1117] rounded-xl border border-gray-700/60 overflow-hidden">
            <PlanView
              width={width} depth={depth}
              colXs={colXs} colYs={colYs} panelXs={panelXs}
              railFaces={railFaces} pm={pm} pipeSize={pipeSize} pipePx={pipePx}
            />
          </div>
          <div className="w-44 shrink-0">
            <Legend results={results} />
          </div>
        </div>
      </div>

      {/* 정면도 + 측면도 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-gray-500 mb-1 px-0.5">② 정면도 (앞에서 본 모습)</p>
          <div className="bg-[#0d1117] rounded-xl border border-gray-700/60 overflow-hidden">
            <ElevView
              svgTitle="정면도"
              spanLen={width} spanXs={colXs}
              floorH={floorH} totalH={totalH}
              hasRail={railFaces.front}
              pm={pm} pipeSize={pipeSize} pipePx={pipePx}
            />
          </div>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 mb-1 px-0.5">③ 측면도 (옆에서 본 모습)</p>
          <div className="bg-[#0d1117] rounded-xl border border-gray-700/60 overflow-hidden">
            <ElevView
              svgTitle="측면도"
              spanLen={depth} spanXs={colYs}
              floorH={floorH} totalH={totalH}
              hasRail={railFaces.left || railFaces.right}
              pm={pm} pipeSize={pipeSize} pipePx={pipePx}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
