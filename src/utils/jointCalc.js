import { calcColumnGrid, classifyColumns } from '../data/structures';

function addPart(acc, id, qty) {
  if (qty > 0) acc[id] = (acc[id] ?? 0) + qty;
}

function buildResult(acc) {
  return Object.entries(acc)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));
}

// ── 비가림 ─────────────────────────────────────────────────

export function calcShelter(dims, pipeSize, options) {
  const { width, depth } = dims;
  const { roof, floorFix, roofConnect } = options;

  const { cols, rows } = calcColumnGrid(width, depth);
  const { corner, edge, center } = classifyColumns(cols, rows);
  const totalCols = corner + edge + center;

  const acc = {};
  const add = (id, qty) => addPart(acc, id, qty);
  const key = (part) => `${part}_${pipeSize}`;

  // ① 기둥 상단
  add(key('처마각도L형'), corner);
  add(key('처마각도삼방TEE'), edge);
  if (center > 0) add(key('십자TEE'), center);

  // ② 바닥 고정
  if (floorFix === 'stone') {
    // 50각→주춧돌200, 75·100각→주춧돌300
    add(pipeSize === '50' ? '주춧돌_200' : '주춧돌_300', totalCols);
  } else if (floorFix === 'plate') {
    // 플레이트 + 셋앙카 (기둥당 4개)
    // 50각→셋앙카 3/8×70mm, 75·100각→셋앙카 1/2×100mm
    add(key('플레이트코너'), corner);
    add(key('플레이트측면'), edge);
    if (center > 0) add(key('플레이트중앙'), center);
    add(pipeSize === '50' ? '셋앙카_small' : '셋앙카_large', totalCols * 4);
  } else if (floorFix === 'l_anchor') {
    // L앙카 세트: 100각→L앙카_100, 나머지→L앙카_75
    add(pipeSize === '100' ? 'L앙카_100' : 'L앙카_75', totalCols);
  }

  // ③ 박공 용마루
  if (roof === 'gable') {
    const ridgeN = width >= depth ? cols : rows;
    add(key('용머리파이프교차'), ridgeN);
    if (ridgeN > 1) add(key('용머리파이프용'), ridgeN - 1);
  }

  // ④ 지붕 파이프 연결
  if (roofConnect === 'hook_cross') {
    add(key('걸이TEE'), edge);
    if (center > 0) add(key('크로스TEE'), center);
  } else {
    const n = edge * 1 + center * 2;
    if (n > 0) add(key('고정피스TEE'), n);
  }

  return buildResult(acc);
}

// ── 창고 ───────────────────────────────────────────────────
//
// 평지붕:
//   코너  → 처마각도L형
//   edge  → 처마각도삼방TEE
//   center → 십자TEE
//   지붕 파이프 연결: 걸이+크로스TEE 또는 고정피스TEE
//
// 박공:
//   코너  → 처마트러스L형
//   edge/center → 처마트러스삼방TEE
//   박공 꼭대기 기둥 위치 → 용머리파이프교차용
//   박공 꼭대기 기둥 사이 → 용머리파이프용
//   서까래마다 → 처마고정파이프용 (능선 방향 기둥 수 × 2 경사면)
//
// 바닥 고정: 비가림과 동일

export function calcWarehouse(dims, pipeSize, options) {
  const { width, depth } = dims;
  const { roof, floorFix, roofConnect } = options;

  const { cols, rows } = calcColumnGrid(width, depth);
  const { corner, edge, center } = classifyColumns(cols, rows);
  const totalCols = corner + edge + center;

  const acc = {};
  const add = (id, qty) => addPart(acc, id, qty);
  const key = (part) => `${part}_${pipeSize}`;

  // ① 기둥 상단
  if (roof === 'flat') {
    add(key('처마각도L형'), corner);
    add(key('처마각도삼방TEE'), edge);
    if (center > 0) add(key('십자TEE'), center);
  } else {
    // 박공 — 처마트러스 (center도 삼방TEE 사용)
    add(key('처마트러스L형'), corner);
    add(key('처마트러스삼방TEE'), edge + center);
  }

  // ② 바닥 고정 (비가림과 동일)
  if (floorFix === 'stone') {
    add(pipeSize === '50' ? '주춧돌_200' : '주춧돌_300', totalCols);
  } else if (floorFix === 'plate') {
    add(key('플레이트코너'), corner);
    add(key('플레이트측면'), edge);
    if (center > 0) add(key('플레이트중앙'), center);
    add(pipeSize === '50' ? '셋앙카_small' : '셋앙카_large', totalCols * 4);
  } else if (floorFix === 'l_anchor') {
    add(pipeSize === '100' ? 'L앙카_100' : 'L앙카_75', totalCols);
  }

  // ③ 박공 용마루 + 서까래 처마고정
  if (roof === 'gable') {
    const ridgeN = width >= depth ? cols : rows;
    add(key('용머리파이프교차'), ridgeN);
    if (ridgeN > 1) add(key('용머리파이프용'), ridgeN - 1);
    // 처마고정파이프용: 서까래마다 (능선 방향 기둥 수 × 양쪽 경사면 2)
    add(key('처마고정파이프'), ridgeN * 2);
  }

  // ④ 지붕 파이프 연결 (평지붕만)
  if (roof === 'flat') {
    if (roofConnect === 'hook_cross') {
      add(key('걸이TEE'), edge);
      if (center > 0) add(key('크로스TEE'), center);
    } else {
      const n = edge + center * 2;
      if (n > 0) add(key('고정피스TEE'), n);
    }
  }

  return buildResult(acc);
}

// ── 복층 ───────────────────────────────────────────────────
//
// 기둥 상단:
//   코너        → L형_N
//   edge(한방향) → 삼방TEE_N
//   center(양방향)→ 십자TEE_N
//
// 바닥판 (407mm 간격 격자):
//   pipes_X = floor(width/407)+1   (depth 방향으로 뻗는 파이프 수)
//   pipes_Y = floor(depth/407)+1   (width 방향으로 뻗는 파이프 수)
//   교차점 (pipes_X × pipes_Y)  → 교차TEE_100_50 (고정)
//   직선 끝단 2×(pipes_X+pipes_Y) → 고정피스TEE_50  (고정)
//
// 난간 (1.2m 연장, 50각 중간기둥):
//   주기둥 사이 1개 중간기둥(50각) per 스팬
//   중간기둥 하단: 고정피스TEE_50 × 2
//   살대 3줄 고정: 고정피스TEE_50 × 3 (중간기둥당)
//   주기둥 상단 캡: 사각캡_N, 중간기둥 상단 캡: 사각캡_50
//
// 바닥 고정: 플레이트(코너/측면/중앙) 고정, 셋앙카 기둥당 4개

const RAILING_SIDES = {
  none:             { front: false, back: false, left: false, right: false },
  front:            { front: true,  back: false, left: false, right: false },
  front_left:       { front: true,  back: false, left: true,  right: false },
  front_right:      { front: true,  back: false, left: false, right: true  },
  front_left_right: { front: true,  back: false, left: true,  right: true  },
  all:              { front: true,  back: true,  left: true,  right: true  },
};

export function calcDuplex(dims, pipeSize, options) {
  const { width, depth } = dims;
  const { railing = 'none' } = options;

  const { cols, rows } = calcColumnGrid(width, depth);
  const { corner, edge, center } = classifyColumns(cols, rows);
  const totalCols = corner + edge + center;

  const acc = {};
  const add = (id, qty) => addPart(acc, id, qty);
  const key = (part) => `${part}_${pipeSize}`;

  // ① 기둥 상단
  add(key('L형'), corner);
  add(key('삼방TEE'), edge);
  if (center > 0) add(key('십자TEE'), center);

  // ② 바닥판 (한 방향, 407mm 간격)
  // 바닥판 파이프: depth 방향으로 뻗음, width 방향으로 407mm 간격 배열
  const panelCount = Math.floor(width / 407) + 1;
  add('교차TEE_100_50', panelCount * rows);  // 파이프 × 구조보(기둥 줄 수) 교차점
  add('고정피스TEE_50',  panelCount * 2);    // 나머지 연결점 (파이프 양끝)

  // ③ 바닥 고정 — 플레이트 (L앙카 없음)
  add(key('플레이트코너'), corner);
  add(key('플레이트측면'), edge);
  if (center > 0) add(key('플레이트중앙'), center);
  add(pipeSize === '50' ? '셋앙카_small' : '셋앙카_large', totalCols * 4);

  // ④ 난간 (주기둥 1.2m 연장, 스팬당 50각 중간기둥 1개, 살대 3줄)
  if (railing !== 'none') {
    const { front, back, left, right } = RAILING_SIDES[railing] ?? RAILING_SIDES.none;

    // 난간 면별 스팬 수 = 중간기둥 수
    let spans = 0;
    if (front) spans += cols - 1;
    if (back)  spans += cols - 1;
    if (left)  spans += rows - 1;
    if (right) spans += rows - 1;

    if (spans > 0) {
      add('고정피스TEE_50', spans * 5);  // 하단 ×2 + 살대 ×3
      add('사각캡_50',      spans);      // 중간기둥 상단 캡
    }

    // 주기둥(난간 면 위 구조기둥) 상단 캡
    let mainRailCols = 0;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let sides = 0;
        if (front && r === 0)        sides++;
        if (back  && r === rows - 1) sides++;
        if (left  && c === 0)        sides++;
        if (right && c === cols - 1) sides++;
        if (sides > 0) mainRailCols++;
      }
    }
    if (mainRailCols > 0) add(key('사각캡'), mainRailCols);
  }

  return buildResult(acc);
}

// ── 메인 산출 진입점 ──────────────────────────────────────

export function calculate(structureId, dims, pipeSize, options) {
  switch (structureId) {
    case 'shelter':   return calcShelter(dims, pipeSize, options);
    case 'warehouse': return calcWarehouse(dims, pipeSize, options);
    case 'duplex':    return calcDuplex(dims, pipeSize, options);
    default:          return null;
  }
}
