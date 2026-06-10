import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Minus, Plus, Trash2, Package, Scissors,
  BarChart3, ClipboardList, Printer, RotateCcw, ChevronUp, ChevronDown,
} from 'lucide-react';
import JointCalculator from './components/joint/JointCalculator';

const PIPE_LENGTH = 6000;
const DEFAULT_KERF = 0;

const SPECS = ['3030', '4040', '5050', '7575', '7545', '10050', '100100', '150100'];
const THICKNESSES = ['2t', '3t', '4t'];

interface CutItem {
  id: string;
  spec: string;
  thickness: string;
  length: number;
  qty: number;
}

interface GroupResult {
  spec: string;
  thickness: string;
  totalPipes: number;
  totalWaste: number;
  bins: number[][];
}

interface ParsedRow {
  spec: string;
  thickness: string;
  length: number;
  qty: number;
}

interface ParseError {
  line: string;
  reason: string;
}

interface BulkWarning {
  lineNo: number;
  line: string;
  qty: number;
  length: number;
  spec: string;
  thickness: string;
}

// ── 알고리즘 ─────────────────────────────────────────────

function buildPatterns(
  uniqueLengths: number[],
  stock: number,
  kerf: number,
  maxItems = 20,
): number[][] {
  const n = uniqueLengths.length;
  const patterns: number[][] = [];

  function backtrack(idx: number, remaining: number, current: number[]) {
    const total = current.reduce((a, b) => a + b, 0);
    if (total > 0) patterns.push([...current]);
    if (patterns.length > maxItems) return;
    for (let i = idx; i < n; i++) {
      const needed = uniqueLengths[i] + (total > 0 ? kerf : 0);
      if (needed <= remaining) {
        current[i]++;
        backtrack(i, remaining - needed, current);
        current[i]--;
      }
    }
  }

  backtrack(0, stock, new Array(n).fill(0));
  patterns.sort((a, b) => {
    const use = (p: number[]) =>
      p.reduce((s, cnt, i) => s + cnt * uniqueLengths[i] + (cnt > 0 ? (cnt - 1) * kerf : 0), 0);
    return use(b) - use(a);
  });
  return patterns;
}

function cuttingStockOptimize(
  lengths: number[],
  stock: number,
  kerf: number,
): { bins: number[][]; totalWaste: number } {
  if (lengths.length === 0) return { bins: [], totalWaste: 0 };

  // FFD
  const sorted = [...lengths].sort((a, b) => b - a);
  const ffdBins: number[][] = [];
  const ffdRemaining: number[] = [];

  for (const len of sorted) {
    let placed = false;
    for (let i = 0; i < ffdBins.length; i++) {
      const cutCost = ffdBins[i].length > 0 ? kerf : 0;
      if (ffdRemaining[i] >= len + cutCost) {
        ffdBins[i].push(len);
        ffdRemaining[i] -= len + cutCost;
        placed = true;
        break;
      }
    }
    if (!placed) {
      ffdBins.push([len]);
      ffdRemaining.push(stock - len);
    }
  }

  // Column Generation (greedy)
  const demandMap = new Map<number, number>();
  for (const l of lengths) demandMap.set(l, (demandMap.get(l) ?? 0) + 1);

  const uniqueLens = [...demandMap.keys()].sort((a, b) => b - a);
  const maxPat = Math.min(30, uniqueLens.length <= 6 ? 60 : 20);
  const patterns = buildPatterns(uniqueLens, stock, kerf, maxPat);

  const cgBins: number[][] = [];
  const cgDemand = new Map(demandMap);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let bestPat: number[] | null = null;
    let bestScore = 0;
    for (const pat of patterns) {
      let feasible = true;
      let score = 0;
      for (let i = 0; i < uniqueLens.length; i++) {
        if (pat[i] > (cgDemand.get(uniqueLens[i]) ?? 0)) { feasible = false; break; }
        score += pat[i];
      }
      if (feasible && score > bestScore) { bestScore = score; bestPat = pat; }
    }
    if (!bestPat || bestScore === 0) break;

    const bin: number[] = [];
    for (let i = 0; i < uniqueLens.length; i++) {
      for (let k = 0; k < bestPat[i]; k++) {
        bin.push(uniqueLens[i]);
        cgDemand.set(uniqueLens[i], (cgDemand.get(uniqueLens[i]) ?? 0) - 1);
      }
    }
    cgBins.push(bin);
  }

  // remaining pieces → FFD again
  const remaining: number[] = [];
  for (const [len, cnt] of cgDemand) for (let i = 0; i < cnt; i++) remaining.push(len);
  remaining.sort((a, b) => b - a);

  const restBins: number[][] = [];
  const restRem: number[] = [];
  for (const len of remaining) {
    let placed = false;
    for (let i = 0; i < restBins.length; i++) {
      const cutCost = restBins[i].length > 0 ? kerf : 0;
      if (restRem[i] >= len + cutCost) {
        restBins[i].push(len);
        restRem[i] -= len + cutCost;
        placed = true;
        break;
      }
    }
    if (!placed) { restBins.push([len]); restRem.push(stock - len); }
  }

  // pick whichever solution uses fewer pipes
  let chosenBins: number[][];
  let chosenRemaining: number[];

  if (cgBins.length + restBins.length <= ffdBins.length) {
    chosenBins = [...cgBins, ...restBins];
    chosenRemaining = chosenBins.map(bin => {
      const used = bin.reduce((s, l) => s + l, 0);
      const cuts = bin.length > 1 ? (bin.length - 1) * kerf : 0;
      return stock - used - cuts;
    });
  } else {
    chosenBins = ffdBins;
    chosenRemaining = ffdRemaining;
  }

  return { bins: chosenBins, totalWaste: chosenRemaining.reduce((a, b) => a + b, 0) };
}

// ── 파싱 ──────────────────────────────────────────────────

const THICKNESS_DIGITS = ['2', '3', '4'];
const SHORTHAND_MAP: Record<string, string> = { '74': '7545', '15': '10050' };

function expandShorthand(digits: string): string | null {
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 3) {
    const code = digits.slice(0, 2);
    const t    = digits.slice(2);
    if (!THICKNESS_DIGITS.includes(t)) return null;
    if (SHORTHAND_MAP[code] && SPECS.includes(SHORTHAND_MAP[code])) return SHORTHAND_MAP[code] + t;
    const sq = code + code;
    if (SPECS.includes(sq)) return sq + t;
  }
  if (digits.length === 6) {
    const specPart = digits.slice(0, 5);
    const t        = digits.slice(5);
    if (THICKNESS_DIGITS.includes(t) && SPECS.includes(specPart)) return specPart + t;
  }
  return null;
}

function parseSpecThicknessToken(raw: string): { spec: string; thickness: string } | null {
  const s = raw.replace(/\s/g, '');
  const symFull = s.match(/^([\d*]+)\*(\d+)t?$/i);
  if (symFull) {
    const thickStr = symFull[2];
    if (THICKNESS_DIGITS.includes(thickStr)) {
      const specDigits = symFull[1].replace(/\*/g, '');
      if (SPECS.includes(specDigits)) return { spec: specDigits, thickness: `${thickStr}t` };
    }
  }
  const digits = s.replace(/[*t]/gi, '');
  if (/^\d+$/.test(digits)) {
    const expanded = expandShorthand(digits);
    const sorted = [...SPECS].sort((a, b) => b.length - a.length);
    const src = expanded ?? digits;
    for (const spec of sorted) {
      if (src.startsWith(spec)) {
        const rem = src.slice(spec.length);
        if (THICKNESS_DIGITS.includes(rem)) return { spec, thickness: `${rem}t` };
      }
    }
  }
  return null;
}

function formatSpec(spec: string): string {
  const half = spec.length / 2;
  if (Number.isInteger(half)) return `${spec.slice(0, half)}*${spec.slice(half)}`;
  if (spec.length === 6) return `${spec.slice(0, 3)}*${spec.slice(3)}`;
  return spec;
}

function extractSpecThickness(tokens: string[]): { spec: string; thickness: string; rest: string[] } | null {
  if (!tokens.length) return null;
  const single = parseSpecThicknessToken(tokens[0]);
  if (single) return { ...single, rest: tokens.slice(1) };
  if (tokens.length >= 2) {
    const combined = parseSpecThicknessToken(tokens[0] + tokens[1]);
    if (combined) return { ...combined, rest: tokens.slice(2) };
    const star = parseSpecThicknessToken(tokens[0] + '*' + tokens[1]);
    if (star) return { ...star, rest: tokens.slice(2) };
  }
  return null;
}

function parseBulkText(text: string): { rows: ParsedRow[]; errors: ParseError[]; warnings: BulkWarning[] } {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  const warnings: BulkWarning[] = [];

  const lines = text.split('\n')
    .map((l, i) => ({ raw: l.trim(), lineNo: i + 1 }))
    .filter(l => l.raw.length > 0);

  let lastSpec: string | null = null;
  let lastThickness: string | null = null;

  for (const { raw: line, lineNo } of lines) {
    const tokens = line.replace(/\s+/g, ' ').trim().split(' ');
    const clean  = tokens.map(t => t.replace(/mm$/i, '').replace(/본$/g, ''));
    const parsed = extractSpecThickness(clean);

    let spec: string;
    let thickness: string;
    let numTokens: string[];

    if (parsed && SPECS.includes(parsed.spec)) {
      ({ spec, thickness } = parsed);
      numTokens = parsed.rest;
      lastSpec = spec; lastThickness = thickness;
    } else if (lastSpec && lastThickness) {
      spec = lastSpec; thickness = lastThickness; numTokens = clean;
    } else {
      errors.push({ line, reason: `[${lineNo}번째 줄] 규격/두께를 인식할 수 없습니다.` });
      continue;
    }

    const nums = numTokens.map(t => parseInt(t)).filter(n => !isNaN(n) && n > 0);
    if (nums.length < 2) {
      errors.push({ line, reason: `[${lineNo}번째 줄] 수량 또는 치수가 누락되었습니다.` });
      continue;
    }

    let i = 0;
    while (i < nums.length) {
      if (i + 1 >= nums.length) {
        errors.push({ line, reason: `[${lineNo}번째 줄] 수량 또는 치수가 누락되었습니다.` });
        break;
      }
      const lenVal = nums[i], qty = nums[i + 1];
      i += 2;
      if (lenVal > PIPE_LENGTH) {
        errors.push({ line, reason: `[${lineNo}번째 줄] 재단 치수(${lenVal.toLocaleString()}mm)가 원본 파이프 길이(${PIPE_LENGTH.toLocaleString()}mm)를 초과합니다.` });
        continue;
      }
      if (qty >= 100) warnings.push({ lineNo, line, qty, length: lenVal, spec, thickness });
      rows.push({ spec, thickness, length: lenVal, qty });
    }
  }

  return { rows, errors, warnings };
}

// ── 계산 / localStorage ───────────────────────────────────

function calculateResults(items: CutItem[], kerf = DEFAULT_KERF): GroupResult[] {
  const groups: Record<string, CutItem[]> = {};
  for (const item of items) {
    const key = `${item.spec}-${item.thickness}`;
    (groups[key] ??= []).push(item);
  }
  return Object.entries(groups).map(([key, gItems]) => {
    const [spec, thickness] = key.split('-');
    const allLengths: number[] = [];
    for (const item of gItems) for (let i = 0; i < item.qty; i++) allLengths.push(item.length);
    const { bins, totalWaste } = cuttingStockOptimize(allLengths, PIPE_LENGTH, kerf);
    return { spec, thickness, totalPipes: bins.length, totalWaste, bins };
  });
}

const LS_ITEMS   = 'pipe_calc_items';
const LS_RESULTS = 'pipe_calc_results';

function loadItems(): CutItem[] {
  try { const r = localStorage.getItem(LS_ITEMS); return r ? JSON.parse(r) : []; } catch { return []; }
}
function loadResults(): GroupResult[] | null {
  try { const r = localStorage.getItem(LS_RESULTS); return r ? JSON.parse(r) : null; } catch { return null; }
}

void THICKNESSES; // suppress unused warning

// ── 컴포넌트 ──────────────────────────────────────────────

export default function App() {
  const [activeApp, setActiveApp] = useState<'pipe' | 'joint'>('pipe');
  const [reportExpanded,   setReportExpanded]   = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [bulkText,         setBulkText]         = useState('');
  const [bulkErrors,       setBulkErrors]       = useState<ParseError[]>([]);
  const [qtyWarningModal,  setQtyWarningModal]  = useState<{ warnings: BulkWarning[]; rows: ParsedRow[] } | null>(null);
  const [items,   setItems]   = useState<CutItem[]>(loadItems);
  const [results, setResults] = useState<GroupResult[] | null>(loadResults);
  const [kerf,       setKerf]       = useState(DEFAULT_KERF);
  const [printMode,  setPrintMode]  = useState<'summary' | 'detail'>('summary');
  const [flashIds,   setFlashIds]   = useState<Set<string>>(new Set());

  const bulkTextRef       = useRef<HTMLTextAreaElement>(null);
  const resultsRef        = useRef<HTMLElement>(null);
  const qtyConfirmBtnRef  = useRef<HTMLButtonElement>(null);
  const printDateRef      = useRef('');

  const liveRecalc = results !== null;

  const triggerFlash = useCallback((id: string) => {
    setFlashIds(p => new Set(p).add(id));
    setTimeout(() => setFlashIds(p => { const n = new Set(p); n.delete(id); return n; }), 300);
  }, []);

  const handleQtyChange = useCallback((id: string, delta: number) => {
    setItems(p => p.map(it => it.id !== id ? it : { ...it, qty: Math.max(1, it.qty + delta) }));
    triggerFlash(id + '-qty');
  }, [triggerFlash]);

  const handleLengthChange = useCallback((id: string, delta: number) => {
    setItems(p => p.map(it => it.id !== id ? it : { ...it, length: Math.min(PIPE_LENGTH, Math.max(10, it.length + delta)) }));
    triggerFlash(id + '-len');
  }, [triggerFlash]);

  const handleDelete = useCallback((id: string) => {
    setItems(p => p.filter(i => i.id !== id));
  }, []);

  const commitBulkRows = useCallback((rows: ParsedRow[]) => {
    setItems(prev => {
      const merged = [...prev, ...rows.map(r => ({ id: crypto.randomUUID(), ...r }))];
      setResults(calculateResults(merged, kerf));
      return merged;
    });
    setBulkText(''); setBulkErrors([]);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    setTimeout(() => bulkTextRef.current?.focus(), 50);
  }, [kerf]);

  const handleBulkAdd = useCallback(() => {
    if (!bulkText.trim()) return;
    const { rows, errors, warnings } = parseBulkText(bulkText);
    setBulkErrors(errors);
    if (errors.length > 0) return;
    if (rows.length === 0) return;
    if (warnings.length > 0) { setQtyWarningModal({ warnings, rows }); return; }
    commitBulkRows(rows);
  }, [bulkText, commitBulkRows]);

  const handleFullReset = useCallback(() => setShowResetConfirm(true), []);

  const confirmReset = useCallback(() => {
    setShowResetConfirm(false);
    setItems([]); setResults(null); setBulkErrors([]); setBulkText('');
    localStorage.removeItem(LS_ITEMS); localStorage.removeItem(LS_RESULTS);
    setTimeout(() => bulkTextRef.current?.focus(), 50);
  }, []);

  const handlePrint = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (!results) return;
    printDateRef.current = new Date().toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const el = document.getElementById('print-date');
    if (el) el.textContent = printDateRef.current;
    document.body.dataset.printMode = printMode;
    setTimeout(() => {
      window.print();
      setTimeout(() => { delete document.body.dataset.printMode; }, 1000);
    }, 100);
  }, [results, printMode]);

  // effects
  useEffect(() => {
    if (!liveRecalc) return;
    if (items.length === 0) { setResults(null); return; }
    setResults(calculateResults(items, kerf));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kerf]);

  useEffect(() => { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); }, [items]);

  useEffect(() => {
    if (results) localStorage.setItem(LS_RESULTS, JSON.stringify(results));
    else localStorage.removeItem(LS_RESULTS);
  }, [results]);

  useEffect(() => {
    if (qtyWarningModal) setTimeout(() => qtyConfirmBtnRef.current?.focus(), 50);
  }, [qtyWarningModal]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (qtyWarningModal) return;
      if (showResetConfirm) { setShowResetConfirm(false); return; }
      if (items.length > 0 || results) setShowResetConfirm(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length, results, qtyWarningModal, showResetConfirm]);

  useEffect(() => { bulkTextRef.current?.focus(); }, []);

  // ── JSX ────────────────────────────────────────────────

  if (activeApp === 'joint') {
    return (
      <>
        {/* 전역 탭 네비 */}
        <nav className="no-print bg-gray-950 border-b border-gray-800 flex">
          <button
            type="button"
            onClick={() => setActiveApp('pipe')}
            className="px-5 py-2.5 text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border-r border-gray-800"
          >
            ← 각파이프 재단 계산기
          </button>
          <button
            type="button"
            className="px-5 py-2.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border-b-2 border-emerald-500"
          >
            사각조인트 부속 산출
          </button>
        </nav>
        <JointCalculator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 print:bg-white print:text-black print:min-h-0" translate="no">

      {/* 전역 탭 네비 */}
      <nav className="no-print bg-gray-950 border-b border-gray-800 flex">
        <button
          type="button"
          className="px-5 py-2.5 text-xs font-bold text-blue-400 bg-blue-500/10 border-b-2 border-blue-500"
        >
          각파이프 재단 계산기
        </button>
        <button
          type="button"
          onClick={() => setActiveApp('joint')}
          className="px-5 py-2.5 text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          사각조인트 부속 산출 →
        </button>
      </nav>

      {/* 초기화 확인 모달 */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onKeyDown={e => { if (e.key === 'Escape') setShowResetConfirm(false); if (e.key === 'Enter') confirmReset(); }}
        >
          <div className="bg-gray-800 border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-500/10 border-b border-red-500/20 px-5 py-4 flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 flex-shrink-0 rounded-full bg-red-500/20 flex items-center justify-center">
                <RotateCcw className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-red-300 font-bold text-base">전체 초기화</p>
                <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">입력된 내용과 계산 결과가 모두 삭제됩니다.<br />정말 초기화하시겠습니까?</p>
              </div>
            </div>
            <div className="px-5 py-4 flex gap-3">
              <button autoFocus onClick={() => setShowResetConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 text-gray-200 font-semibold py-2.5 rounded-xl transition-colors text-sm">
                취소
              </button>
              <button onClick={confirmReset}
                className="flex-1 bg-red-600 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
                확인, 지우기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수량 과다 확인 모달 */}
      {qtyWarningModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onKeyDown={e => {
            if (e.key === 'Enter') { const r = qtyWarningModal.rows; setQtyWarningModal(null); commitBulkRows(r); }
            else if (e.key === 'Escape') setQtyWarningModal(null);
          }}
        >
          <div className="bg-gray-800 border border-yellow-500/40 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-5 py-4 flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5">⚠️</span>
              <div>
                <p className="text-yellow-300 font-bold text-base">수량 과다 확인 필요</p>
                <p className="text-yellow-200/60 text-xs mt-0.5">100개 이상 수량이 입력되었습니다. 오타가 아닌지 확인해 주세요.</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-2 max-h-60 overflow-y-auto">
              {qtyWarningModal.warnings.map((w, i) => (
                <div key={i} className="bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2.5 text-sm">
                  <span className="text-gray-500 text-xs mr-2">[{w.lineNo}번째 줄]</span>
                  <span className="text-gray-300 font-mono">{w.spec} {w.thickness}</span>
                  <span className="text-gray-500 mx-1.5">·</span>
                  <span className="text-white font-mono">{w.length.toLocaleString()}mm</span>
                  <span className="text-gray-500 mx-1.5">·</span>
                  <span className="text-yellow-300 font-bold">{w.qty.toLocaleString()}개</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-700 flex gap-3">
              <button onClick={() => setQtyWarningModal(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold py-2.5 rounded-xl transition-colors text-sm">
                아니오, 수정할게요
              </button>
              <button ref={qtyConfirmBtnRef}
                onClick={() => { const r = qtyWarningModal.rows; setQtyWarningModal(null); commitBulkRows(r); }}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300 text-gray-900 font-bold py-2.5 rounded-xl transition-colors text-sm">
                네, 맞습니다
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="no-print bg-gray-800 border-b border-blue-500/30 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Scissors className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white tracking-wide">각파이프 자재 소요량 계산기</h1>
            <p className="text-xs text-blue-400 font-medium">Pipe Cutting Optimizer · 원본 6,000mm 기준</p>
          </div>
          {(items.length > 0 || results) && (
            <button type="button" onClick={handleFullReset}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 active:bg-orange-500/30 text-orange-400 hover:text-orange-300 text-xs font-semibold rounded-xl transition-all border border-orange-500/20 hover:border-orange-500/40">
              <RotateCcw className="w-3.5 h-3.5" />
              전체 초기화
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="no-print max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* 일괄 입력 */}
        <section className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden shadow-xl">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700 bg-gray-700/30">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-blue-300">자재 일괄 입력</span>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-600 mr-0.5 shrink-0">지원 규격</span>
              {['30','40','50','75','100','75×45','100×50','150×100'].map(s => (
                <span key={s} className="bg-gray-700/70 border border-gray-600/60 text-gray-300 text-xs font-mono px-2 py-0.5 rounded-md">{s}</span>
              ))}
            </div>
            <div className="text-xs text-gray-500 leading-relaxed space-y-0.5">
              <p>
                <span className="text-gray-300 font-mono">규격두께 치수 수량</span> 순으로 입력
                <span className="text-gray-700 mx-1.5">|</span>
                <span className="font-mono text-gray-400">752 2300 4</span>
                <span className="text-gray-700 mx-1">→</span>
                <span className="text-gray-500">75*75 2t · 2300mm · 4개</span>
              </p>
              <p>
                동일 규격은 <span className="text-gray-300 font-semibold">치수 수량을 이어서</span> 입력 가능
                <span className="text-gray-700 mx-1.5">|</span>
                <span className="font-mono text-gray-400">752 2300 4 1700 3</span>
              </p>
            </div>
            <textarea
              ref={bulkTextRef}
              value={bulkText}
              onChange={e => { setBulkText(e.target.value); setBulkErrors([]); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (bulkText.trim()) handleBulkAdd(); } }}
              placeholder={"752 2300 4 1500 2\n100502 1500 2 3000 4\n40402 800 10 1200 5"}
              rows={7}
              className={`w-full bg-gray-700 border rounded-xl px-4 py-3 text-white text-sm font-mono leading-relaxed focus:outline-none placeholder-gray-600 resize-y transition-colors ${bulkErrors.length > 0 ? 'border-red-500/70 focus:border-red-400 focus:ring-1 focus:ring-red-500/50' : 'border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'}`}
            />
            <p className="text-xs text-gray-600 text-right -mt-1">
              줄바꿈 <kbd className="bg-gray-700 border border-gray-600 text-gray-400 rounded px-1 py-0.5 font-sans">Shift</kbd> + <kbd className="bg-gray-700 border border-gray-600 text-gray-400 rounded px-1 py-0.5 font-sans">Enter</kbd>
              &nbsp;&nbsp;계산 <kbd className="bg-gray-700 border border-gray-600 text-gray-400 rounded px-1 py-0.5 font-sans">Enter</kbd>
            </p>
            {bulkErrors.length > 0 && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                  <span>❌</span>
                  <span>오류 발견 — 수정 후 다시 등록해 주세요 ({bulkErrors.length}건)</span>
                </p>
                {bulkErrors.map((err, i) => (
                  <div key={i} className="text-xs space-y-0.5">
                    <p className="text-red-300 font-semibold">{err.reason}</p>
                    <p className="font-mono bg-gray-800/80 px-2 py-1 rounded text-red-400/70 break-all">{err.line}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={handleBulkAdd} disabled={!bulkText.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base py-3.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
              <ClipboardList className="w-5 h-5" />
              계산하기
            </button>
          </div>
        </section>

        {/* 재단 목록 */}
        {items.length > 0 && (
          <section className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-700/50 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" />
                <span className="font-semibold text-gray-300 text-sm tracking-wide">재단 목록</span>
                <span className="bg-blue-600/30 text-blue-300 text-xs font-bold px-2 py-0.5 rounded-full">{items.length}건</span>
              </div>
              <button type="button" onClick={handleFullReset}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 transition-colors font-medium">
                <RotateCcw className="w-3.5 h-3.5" /> 전체 초기화
              </button>
            </div>
            <div className="divide-y divide-gray-700/50">
              {items.map(item => (
                <div key={item.id} className="px-4 py-4 hover:bg-gray-700/20 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-base">{formatSpec(item.spec)}</span>
                      <span className="bg-gray-700 text-gray-400 text-xs font-semibold px-2 py-0.5 rounded-full">{item.thickness}</span>
                    </div>
                    <button onClick={() => handleDelete(item.id)}
                      className="p-2.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 active:bg-red-900/40 rounded-xl transition-all touch-manipulation">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-700/50 rounded-xl border border-gray-600/50 overflow-hidden">
                      <div className="flex items-center">
                        <button onClick={() => handleLengthChange(item.id, -10)}
                          className="flex items-center justify-center w-12 h-12 text-gray-400 hover:text-white hover:bg-gray-600/60 active:bg-gray-600 transition-all touch-manipulation flex-shrink-0">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <div className="flex-1 text-center text-blue-300">
                          <span className={`font-bold text-lg tabular-nums inline-block ${flashIds.has(item.id + '-len') ? 'num-flash' : ''}`}>{item.length.toLocaleString()}</span>
                          <span className="text-xs text-gray-500 ml-0.5">mm</span>
                        </div>
                        <button onClick={() => handleLengthChange(item.id, 10)}
                          className="flex items-center justify-center w-12 h-12 text-gray-400 hover:text-white hover:bg-gray-600/60 active:bg-gray-600 transition-all touch-manipulation flex-shrink-0">
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-center text-xs text-gray-600 pb-1.5 -mt-1">치수</div>
                    </div>
                    <div className="bg-gray-700/50 rounded-xl border border-gray-600/50 overflow-hidden">
                      <div className="flex items-center">
                        <button onClick={() => handleQtyChange(item.id, -1)} disabled={item.qty <= 1}
                          className="flex items-center justify-center w-12 h-12 text-gray-400 hover:text-white hover:bg-gray-600/60 active:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all touch-manipulation">
                          <Minus className="w-4 h-4" />
                        </button>
                        <div className="w-12 text-center">
                          <span className={`font-black text-xl tabular-nums inline-block ${flashIds.has(item.id + '-qty') ? 'num-flash text-green-300' : 'text-gray-100'}`}>{item.qty}</span>
                        </div>
                        <button onClick={() => handleQtyChange(item.id, 1)}
                          className="flex items-center justify-center w-12 h-12 text-gray-400 hover:text-white hover:bg-gray-600/60 active:bg-gray-600 transition-all touch-manipulation">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-center text-xs text-gray-600 pb-1.5 -mt-1">수량(본)</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 톱날 두께 */}
        {items.length > 0 && (
          <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
            <Scissors className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-400 flex-1">톱날 두께 (Kerf)</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setKerf(k => Math.max(0, k - 1))}
                className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-300 flex items-center justify-center transition-colors touch-manipulation">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-12 text-center font-bold text-white text-base">
                {kerf}<span className="text-xs font-normal text-gray-500 ml-0.5">mm</span>
              </span>
              <button type="button" onClick={() => setKerf(k => Math.min(10, k + 1))}
                className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-300 flex items-center justify-center transition-colors touch-manipulation">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-xs text-gray-600 hidden sm:block">컷당 손실량</span>
          </div>
        )}

        {/* 계산 결과 */}
        {results && (
          <section ref={resultsRef} className="bg-gray-800 rounded-2xl border border-blue-500/30 overflow-hidden shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3 bg-blue-600/10 border-b border-blue-500/20">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-blue-300 text-sm tracking-wide">계산 결과 리포트</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-lg border border-gray-600 overflow-hidden text-xs font-semibold">
                  <button type="button" onClick={() => setPrintMode('summary')}
                    className={`px-3 py-1.5 transition-colors ${printMode === 'summary' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'}`}>
                    요약 결과만
                  </button>
                  <button type="button" onClick={() => setPrintMode('detail')}
                    className={`px-3 py-1.5 transition-colors border-l border-gray-600 ${printMode === 'detail' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200'}`}>
                    배치 상세 포함
                  </button>
                </div>
                <button type="button" onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-gray-200 text-xs font-semibold rounded-lg transition-colors border border-gray-600">
                  <Printer className="w-3.5 h-3.5" /> 인쇄 / PDF 저장
                </button>
              </div>
            </div>

            {/* 요약 테이블 */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-700/60 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="text-left px-5 py-3">규격</th>
                    <th className="text-left px-4 py-3">두께</th>
                    <th className="text-right px-4 py-3">필요 원본</th>
                    <th className="text-right px-5 py-3">자투리 합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-5 py-4 font-bold text-white text-base">{formatSpec(r.spec)}</td>
                      <td className="px-4 py-4 text-gray-300 font-medium">{r.thickness}</td>
                      <td className="px-4 py-4 text-right">
                        <span className="bg-blue-600/20 text-blue-300 font-bold text-lg px-3 py-1 rounded-lg border border-blue-500/30">
                          {r.totalPipes}<span className="text-sm font-normal ml-0.5">본</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className={`font-semibold text-base ${r.totalWaste === 0 ? 'text-green-400' : 'text-amber-400'}`}>
                          {r.totalWaste.toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">mm</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 배치 상세 */}
            {(() => {
              const SHOW_LIMIT = 5;
              const allRows = results.flatMap(r =>
                r.bins.map((bin, bi) => ({ spec: r.spec, thickness: r.thickness, groupTotalPipes: r.totalPipes, bin, groupBinIndex: bi }))
              );
              const totalRows = allRows.length;
              const needsCollapse = totalRows > SHOW_LIMIT;
              const visibleRows = needsCollapse && !reportExpanded ? allRows.slice(0, SHOW_LIMIT) : allRows;
              const hiddenCount = totalRows - SHOW_LIMIT;

              const rendered: React.ReactNode[] = [];
              let lastGroupKey = '';
              visibleRows.forEach((row, idx) => {
                const groupKey = `${row.spec}-${row.thickness}`;
                if (groupKey !== lastGroupKey) {
                  lastGroupKey = groupKey;
                  rendered.push(
                    <div key={`hdr-${groupKey}-${idx}`} className={`flex items-center gap-2 ${idx > 0 ? 'mt-4' : ''} mb-2`}>
                      <span className="text-sm font-bold text-white">{formatSpec(row.spec)}</span>
                      <span className="text-xs text-gray-400 font-medium">{row.thickness}</span>
                      <span className="text-xs text-gray-500">— 총 {row.groupTotalPipes}본</span>
                    </div>
                  );
                }
                const { bin, groupBinIndex } = row;
                const used = bin.reduce((a, b) => a + b, 0);
                const kerfTotal = bin.length > 1 ? (bin.length - 1) * kerf : 0;
                const waste = PIPE_LENGTH - used - kerfTotal;
                const usedPct = ((used + kerfTotal) / PIPE_LENGTH) * 100;
                rendered.push(
                  <div key={`bin-${groupKey}-${groupBinIndex}`} className="bg-gray-700/40 rounded-xl p-2.5 space-y-1.5 mb-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="font-medium">원본 {groupBinIndex + 1}번</span>
                      <span className="font-semibold">
                        {usedPct.toFixed(1)}% 사용 · 자투리{' '}
                        <span className={waste === 0 ? 'text-green-400' : 'text-amber-400'}>{waste.toLocaleString()}mm</span>
                      </span>
                    </div>
                    <div className="flex h-6 rounded-lg overflow-hidden gap-px">
                      {bin.map((seg, si) => (
                        <div key={si} style={{ flex: seg }} className="bg-blue-500 flex items-center justify-center overflow-hidden" title={`${seg}mm`}>
                          <span className="text-white font-bold truncate px-1" style={{ fontSize: '10px' }}>{seg}</span>
                        </div>
                      ))}
                      {waste > 0 && <div style={{ flex: waste }} className="bg-gray-600/50" title={`자투리 ${waste}mm`} />}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {bin.map((seg, si) => (
                        <span key={si} className="bg-blue-600/20 text-blue-300 text-xs font-semibold px-2 py-0.5 rounded border border-blue-500/20">{seg.toLocaleString()}mm</span>
                      ))}
                      {waste > 0 && (
                        <span className="bg-gray-700 text-gray-500 text-xs font-medium px-2 py-0.5 rounded border border-gray-600">자투리 {waste.toLocaleString()}mm</span>
                      )}
                    </div>
                  </div>
                );
              });

              return (
                <div className="border-t border-gray-700 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">배치 상세</p>
                  {rendered}
                  {needsCollapse && (
                    <div className="relative pt-0.5">
                      {!reportExpanded && (
                        <div className="absolute -top-10 left-0 right-0 h-10 bg-gradient-to-t from-gray-800 to-transparent pointer-events-none" />
                      )}
                      <div className="text-center pt-1.5">
                        {!reportExpanded && <p className="text-xs text-gray-500 mb-1.5">... 외 {hiddenCount}개의 파이프 내역이 더 있습니다.</p>}
                        <button onClick={() => setReportExpanded(v => !v)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-200 font-semibold text-sm rounded-xl transition-colors border border-gray-600 hover:border-gray-500">
                          {reportExpanded ? <>리포트 접기 <span className="text-gray-400">▲</span></> : <>결과 리포트 더 보기 <span className="text-gray-400">▼</span></>}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 전체 합계 */}
            <div className="border-t border-gray-700 bg-gray-700/30 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-gray-400">전체 합계</span>
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-0.5">총 필요 원본</p>
                  <p className="text-2xl font-black text-blue-400">
                    {results.reduce((a, r) => a + r.totalPipes, 0)}
                    <span className="text-sm font-normal text-gray-400 ml-1">본</span>
                  </p>
                </div>
                <div className="w-px h-10 bg-gray-600" />
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-0.5">총 자투리</p>
                  <p className="text-2xl font-black text-amber-400">
                    {results.reduce((a, r) => a + r.totalWaste, 0).toLocaleString()}
                    <span className="text-sm font-normal text-gray-400 ml-1">mm</span>
                  </p>
                </div>
              </div>
            </div>

            {/* 규격별 집계 */}
            {(() => {
              const pipesMap: Record<string, number> = {};
              for (const r of results) pipesMap[r.spec] = (pipesMap[r.spec] ?? 0) + r.totalPipes;

              const cutQtyMap: Record<string, { spec: string; thickness: string; qty: number }[]> = {};
              for (const item of items) {
                if (!cutQtyMap[item.spec]) cutQtyMap[item.spec] = [];
                const ex = cutQtyMap[item.spec].find(e => e.thickness === item.thickness);
                if (ex) ex.qty += item.qty;
                else cutQtyMap[item.spec].push({ spec: item.spec, thickness: item.thickness, qty: item.qty });
              }

              return (
                <div className="border-t border-gray-700 px-5 py-5 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">규격별 최종 집계</p>
                  {Object.keys(pipesMap).map(spec => {
                    const cutRows = cutQtyMap[spec] ?? [];
                    const totalCuts = cutRows.reduce((a, r) => a + r.qty, 0);
                    return (
                      <div key={spec} className="bg-gray-700/30 rounded-2xl border border-gray-700/60 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-700/50 border-b border-gray-700/50">
                          <span className="font-black text-white text-base">{formatSpec(spec)}</span>
                          <span className="text-gray-400 text-sm font-medium">
                            총 소요 본수&nbsp;
                            <span className="text-blue-300 font-black text-xl">{pipesMap[spec]}</span>
                            <span className="text-gray-500 text-xs ml-0.5">본</span>
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                          {cutRows.map(row => (
                            <span key={row.thickness} className="text-sm text-gray-400">
                              <span className="text-gray-300 font-semibold">{row.thickness}</span>&nbsp;재단&nbsp;
                              <span className="text-gray-200 font-bold">{row.qty}번</span>
                            </span>
                          ))}
                          <span className="text-sm text-gray-600 ml-auto">합계 재단&nbsp;<span className="text-gray-400 font-bold">{totalCuts}번</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}

        {/* 빈 상태 */}
        {items.length === 0 && !results && (
          <div className="text-center py-16 text-gray-600">
            <Scissors className="w-14 h-14 mx-auto mb-4 opacity-30" />
            <p className="text-base font-medium">자재를 입력하고 Enter를 누르면 최적 배치를 계산합니다.</p>
          </div>
        )}
      </main>

      <footer className="no-print max-w-4xl mx-auto px-4 py-6 text-center text-xs text-gray-600 border-t border-gray-800 mt-4">
        Pipe Cutting Optimizer · 원본 파이프 6,000mm 기준 · 1D 커팅 스톡 최적화 (FFD + Column Generation)
      </footer>

      {/* 인쇄 전용 영역 */}
      <div id="print-root" style={{ display: 'none' }}>
        {results && (
          <>
            <div className="print-title">
              <h1>각파이프 자재 소요량 산출서</h1>
              <p>
                출력일시: <span id="print-date"></span>
                &nbsp;·&nbsp; 원본 파이프 기준: 6,000mm
                &nbsp;·&nbsp; 출력 형식: {printMode === 'summary' ? '요약 결과형' : '배치 상세형'}
                &nbsp;·&nbsp; 컷당 손실량: {kerf}mm
              </p>
            </div>

            <div id="print-summary">
              <div className="print-section-title">재단 항목 목록</div>
              <table className="print-table">
                <thead><tr><th>No.</th><th>규격</th><th>두께</th><th>재단 치수 (mm)</th><th>수량 (본)</th></tr></thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id}><td>{idx + 1}</td><td>{item.spec}</td><td>{item.thickness}</td><td>{item.length.toLocaleString()}</td><td>{item.qty}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="print-section-title">최종 소요 본수 요약</div>
              {(() => {
                const cutQty: Record<string, number> = {};
                for (const item of items) {
                  const k = `${item.spec}-${item.thickness}`;
                  cutQty[k] = (cutQty[k] ?? 0) + item.qty;
                }
                return (
                  <table className="print-table">
                    <thead><tr><th>규격</th><th>두께</th><th>필요 원본 (본)</th><th>자투리 합계 (mm)</th><th>재단수량 합계</th></tr></thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i}>
                          <td>{r.spec}</td><td>{r.thickness}</td>
                          <td>{r.totalPipes}본</td>
                          <td>{r.totalWaste.toLocaleString()}</td>
                          <td>{(cutQty[`${r.spec}-${r.thickness}`] ?? 0).toLocaleString()}개</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>합 계</td>
                        <td>{results.reduce((a, r) => a + r.totalPipes, 0)}본</td>
                        <td>{results.reduce((a, r) => a + r.totalWaste, 0).toLocaleString()}</td>
                        <td>{items.reduce((a, it) => a + it.qty, 0).toLocaleString()}개</td>
                      </tr>
                    </tfoot>
                  </table>
                );
              })()}

            </div>

            <div id="print-detail">
              <div className="print-section-title">재단 항목 목록</div>
              <table className="print-table">
                <thead><tr><th>No.</th><th>규격</th><th>두께</th><th>재단 치수 (mm)</th><th>수량 (본)</th></tr></thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id}><td>{idx + 1}</td><td>{item.spec}</td><td>{item.thickness}</td><td>{item.length.toLocaleString()}</td><td>{item.qty}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="print-section-title">최종 소요 본수 요약</div>
              {(() => {
                const cutQty: Record<string, number> = {};
                for (const item of items) {
                  const k = `${item.spec}-${item.thickness}`;
                  cutQty[k] = (cutQty[k] ?? 0) + item.qty;
                }
                return (
                  <table className="print-table">
                    <thead><tr><th>규격</th><th>두께</th><th>필요 원본 (본)</th><th>자투리 합계 (mm)</th><th>재단수량 합계</th></tr></thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i}>
                          <td>{r.spec}</td><td>{r.thickness}</td>
                          <td>{r.totalPipes}본</td>
                          <td>{r.totalWaste.toLocaleString()}</td>
                          <td>{(cutQty[`${r.spec}-${r.thickness}`] ?? 0).toLocaleString()}개</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>합 계</td>
                        <td>{results.reduce((a, r) => a + r.totalPipes, 0)}본</td>
                        <td>{results.reduce((a, r) => a + r.totalWaste, 0).toLocaleString()}</td>
                        <td>{items.reduce((a, it) => a + it.qty, 0).toLocaleString()}개</td>
                      </tr>
                    </tfoot>
                  </table>
                );
              })()}

              <div className="print-section-title">원본 배치 상세</div>
              {results.map((r, ri) => (
                <div key={ri} className="print-detail-block">
                  <p className="print-detail-group-title">[{r.spec} · {r.thickness}] 총 {r.totalPipes}본</p>
                  <table className="print-detail-table">
                    <thead>
                      <tr>
                        <th style={{ width: '12%', whiteSpace: 'nowrap' }}>원본 번호</th>
                        <th>재단 구성 (mm)</th>
                        <th style={{ width: '11%' }}>사용률</th>
                        <th style={{ width: '14%' }}>자투리 (mm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.bins.map((bin, bi) => {
                        const used = bin.reduce((a, b) => a + b, 0);
                        const waste = PIPE_LENGTH - used;
                        return (
                          <tr key={bi}>
                            <td>#{bi + 1}</td>
                            <td className="cut-composition" style={{ fontSize: '14px', fontWeight: 600 }}>{bin.map(s => s.toLocaleString()).join(' + ')}</td>
                            <td>{((used / PIPE_LENGTH) * 100).toFixed(1)}%</td>
                            <td>{waste.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div className="print-footer">
              각파이프 자재 소요량 계산기 · 주식회사 상상
            </div>
          </>
        )}
      </div>
    </div>
  );
}
