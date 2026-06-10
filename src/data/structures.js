// 구조물 종류 정의
export const STRUCTURE_TYPES = [
  {
    id: 'shelter',
    label: '비가림',
    desc: '단층 비가림 / 평지붕 또는 박공',
    color: 'sky',
  },
  {
    id: 'warehouse',
    label: '창고',
    desc: '박공지붕 창고형 구조물',
    color: 'amber',
  },
  {
    id: 'duplex',
    label: '복층',
    desc: '2층 복층 구조물 / 바닥판 포함',
    color: 'violet',
  },
  {
    id: 'rest_shelter',
    label: '체류형쉼터',
    desc: '박공+다락 구조 / 1층+다락층',
    color: 'emerald',
  },
];

// 구조물별 선택 옵션 설정
// type: 'select' → 버튼 선택, 'info' → 고정값 표시만
export const STRUCTURE_OPTIONS = {
  shelter: {
    roof: {
      label: '지붕 형태',
      type: 'select',
      default: 'flat',
      options: [
        { id: 'flat',  label: '평지붕(외경사)' },
        { id: 'gable', label: '박공(양경사)' },
      ],
    },
    floorFix: {
      label: '바닥 고정',
      type: 'select',
      default: 'plate',
      options: [
        { id: 'stone',    label: '주춧돌' },
        { id: 'plate',    label: '플레이트' },
        { id: 'l_anchor', label: 'L앙카플레이트' },
      ],
    },
    roofConnect: {
      label: '지붕 파이프 연결',
      type: 'select',
      default: 'hook_cross',
      options: [
        { id: 'hook_cross',  label: '걸이+크로스TEE' },
        { id: 'fixed_piece', label: '고정피스TEE' },
      ],
    },
  },

  warehouse: {
    roof: {
      label: '지붕 형태',
      type: 'select',
      default: 'flat',
      options: [
        { id: 'flat',  label: '평지붕(외경사)' },
        { id: 'gable', label: '박공(양경사)' },
      ],
    },
    roofConnect: {
      label: '지붕 파이프 연결',
      type: 'select',
      default: 'hook_cross',
      showWhen: (values) => values.roof === 'flat',
      options: [
        { id: 'hook_cross',  label: '걸이+크로스TEE' },
        { id: 'fixed_piece', label: '고정피스TEE' },
      ],
    },
    floorFix: {
      label: '바닥 고정',
      type: 'select',
      default: 'plate',
      options: [
        { id: 'stone',    label: '주춧돌' },
        { id: 'plate',    label: '플레이트' },
        { id: 'l_anchor', label: 'L앙카플레이트' },
      ],
    },
  },

  duplex: {
    railing: {
      label: '난간',
      type: 'select',
      default: 'none',
      options: [
        { id: 'none',             label: '없음' },
        { id: 'front',            label: '앞쪽만' },
        { id: 'front_left',       label: '앞+좌' },
        { id: 'front_right',      label: '앞+우' },
        { id: 'front_left_right', label: '앞+좌+우' },
        { id: 'all',              label: '전체' },
      ],
    },
    floorFix: {
      label: '바닥 고정',
      type: 'info',
      value: '플레이트 (고정)',
    },
  },

  rest_shelter: {
    roof: {
      label: '지붕 형태',
      type: 'info',
      value: '박공+다락 (고정)',
    },
    floorFix: {
      label: '바닥 고정',
      type: 'info',
      value: 'L앙카플레이트 (고정)',
    },
  },
};

// 기둥 배치 간격 (mm)
export const COLUMN_INTERVAL = 3000;

// 복층 / 체류형쉼터 바닥판 파이프 간격 (mm)
export const FLOOR_PANEL_FIRST = 302;   // 첫 번째 파이프 위치
export const FLOOR_PANEL_NEXT  = 407;   // 이후 반복 간격

// 복층 난간 높이 (mm)
export const RAILING_HEIGHT = 1200;

// 구조물 기본 옵션값 생성 유틸
export function getDefaultOptions(structureId) {
  const config = STRUCTURE_OPTIONS[structureId] ?? {};
  return Object.fromEntries(
    Object.entries(config)
      .filter(([, cfg]) => cfg.type === 'select')
      .map(([key, cfg]) => [key, cfg.default]),
  );
}

// 기둥 그리드 계산 — 3m 간격으로 배치했을 때 행·열 수
// 반환: { cols: number, rows: number }
//   cols = 가로 방향 기둥 수, rows = 세로 방향 기둥 수
export function calcColumnGrid(widthMm, depthMm) {
  const cols = Math.floor(widthMm / COLUMN_INTERVAL) + 1;
  const rows = Math.floor(depthMm / COLUMN_INTERVAL) + 1;
  return { cols, rows };
}

// 기둥 위치 분류 — 코너 / 외곽중간(측면) / 중앙
// 반환: { corner: number, edge: number, center: number }
export function classifyColumns(cols, rows) {
  const total  = cols * rows;
  const corner = 4;
  const edge   = (cols - 2) * 2 + (rows - 2) * 2; // 외곽 중간 기둥
  const center = total - corner - edge;
  return { corner: Math.max(0, corner), edge: Math.max(0, edge), center: Math.max(0, center) };
}

// 복층 바닥판 파이프 수 계산 (한 방향 기준)
export function calcFloorPanelCount(lengthMm) {
  if (lengthMm <= FLOOR_PANEL_FIRST) return 1;
  return 1 + Math.floor((lengthMm - FLOOR_PANEL_FIRST) / FLOOR_PANEL_NEXT);
}
