import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Printer, RotateCcw } from 'lucide-react';
import { STRUCTURE_TYPES, STRUCTURE_OPTIONS, getDefaultOptions, calcColumnGrid, classifyColumns } from '../../data/structures';
import { PIPE_SIZES, PRODUCTS } from '../../data/products';
import { calculate } from '../../utils/jointCalc';
import DuplexDiagram from './DuplexDiagram';

// status: 'unchanged' | 'added' | 'changed' | 'deleted'
function ResultRow({ part, index, status = 'unchanged', originalQty, onQtyChange, onDelete }) {
  const product   = PRODUCTS[part.id];
  const unitPrice = product?.price ?? 0;
  const total     = unitPrice * part.qty;

  const isDeleted  = status === 'deleted';
  const isAdded    = status === 'added';
  const isChanged  = status === 'changed';

  const rowBg =
    isDeleted ? 'bg-red-950/25 border-l-2 border-red-700/60' :
    isAdded   ? 'bg-emerald-950/25 border-l-2 border-emerald-600/60' :
    isChanged ? 'bg-yellow-950/15 border-l-2 border-yellow-600/50' :
    index % 2 === 0 ? 'bg-gray-800/40' : '';

  return (
    <tr className={rowBg}>
      {/* 부품명 */}
      <td className={`px-4 py-3 text-sm ${isDeleted ? 'line-through text-gray-500' : 'text-gray-300'}`}>
        {product?.name ?? part.id}
        {isAdded   && <span className="ml-2 px-1.5 py-0.5 bg-emerald-800/60 text-emerald-300 text-xs rounded font-semibold">추가</span>}
        {isDeleted && <span className="ml-2 px-1.5 py-0.5 bg-red-900/60 text-red-400 text-xs rounded font-semibold">삭제됨</span>}
      </td>

      {/* 규격 */}
      <td className={`px-4 py-3 text-sm text-center ${isDeleted ? 'line-through text-gray-600' : 'text-gray-400'}`}>
        {product?.spec ?? '—'}
      </td>

      {/* 수량 */}
      <td className="px-3 py-2 text-center">
        {isDeleted ? (
          <span className="line-through text-red-500/70 font-bold text-sm tabular-nums">{part.qty}</span>
        ) : onQtyChange ? (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onQtyChange(part.id, -1)}
                className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-sm font-bold transition-colors"
              >−</button>
              <span className={`w-8 text-center font-bold text-sm tabular-nums ${isChanged ? 'text-yellow-300' : 'text-white'}`}>
                {part.qty}
              </span>
              <button
                type="button"
                onClick={() => onQtyChange(part.id, +1)}
                className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-sm font-bold transition-colors"
              >＋</button>
            </div>
            {isChanged && originalQty !== undefined && (
              <span className="text-gray-600 text-xs line-through tabular-nums">{originalQty}</span>
            )}
          </div>
        ) : (
          <span className="text-white font-bold text-sm tabular-nums">{part.qty}</span>
        )}
      </td>

      {/* 단가 */}
      <td className={`px-4 py-3 text-right text-sm font-mono ${isDeleted ? 'text-gray-600' : 'text-gray-300'}`}>
        {unitPrice > 0 ? unitPrice.toLocaleString() : '—'}
      </td>

      {/* 금액 */}
      <td className={`px-4 py-3 text-right font-bold font-mono ${isDeleted ? 'line-through text-gray-600' : 'text-emerald-300'}`}>
        {isDeleted ? (total > 0 ? total.toLocaleString() : '—') : (total > 0 ? total.toLocaleString() : '—')}
      </td>

      {/* 삭제 버튼 */}
      <td className="px-3 py-2 text-center w-10">
        {!isDeleted && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(part.id)}
            className="w-6 h-6 flex items-center justify-center rounded bg-red-900/40 hover:bg-red-700/60 text-red-400 hover:text-red-200 text-xs font-bold transition-colors mx-auto"
            title="삭제"
          >✕</button>
        )}
      </td>
    </tr>
  );
}

// ── 부속 추가 패널 ────────────────────────────────────────────
function AddPartPanel({ onAdd, onClose }) {
  const [search,     setSearch]     = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [qty,        setQty]        = useState(1);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return Object.entries(PRODUCTS)
      .filter(([, p]) => p.name.toLowerCase().includes(q) || p.spec.toLowerCase().includes(q))
      .slice(0, 20);
  }, [search]);

  const selectedProduct = selectedId ? PRODUCTS[selectedId] : null;

  const handleSelect = (id) => { setSelectedId(id); setSearch(''); setQty(1); };

  const handleConfirm = () => {
    if (!selectedId || qty < 1) return;
    onAdd(selectedId, qty);
    setSelectedId(null);
    setSearch('');
    setQty(1);
    inputRef.current?.focus();
  };

  return (
    <div className="border-t border-gray-700 p-4 bg-gray-800/80">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-emerald-300">부속 직접 추가</p>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
          닫기 ✕
        </button>
      </div>

      <div className="space-y-2">
        {!selectedProduct && (
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="부품명 또는 규격 검색 (예: L형, 소켓, 75*75…)"
              className="w-full bg-gray-700 border border-gray-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-500 pr-8"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm">✕</button>
            )}
          </div>
        )}

        {filtered.length > 0 && !selectedProduct && (
          <div className="bg-gray-700 border border-gray-600 rounded-xl overflow-hidden max-h-52 overflow-y-auto divide-y divide-gray-600/50">
            {filtered.map(([id, p]) => (
              <button key={id} type="button" onClick={() => handleSelect(id)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-600 text-left transition-colors">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="text-white text-sm font-medium truncate">{p.name}</span>
                  <span className="text-gray-400 text-xs shrink-0">{p.spec}</span>
                </span>
                <span className="text-gray-400 text-xs font-mono shrink-0 ml-3">
                  {p.price > 0 ? p.price.toLocaleString() + '원' : '—'}
                </span>
              </button>
            ))}
          </div>
        )}

        {search && filtered.length === 0 && !selectedProduct && (
          <p className="text-gray-500 text-xs px-1">검색 결과 없음</p>
        )}

        {selectedProduct && (
          <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">{selectedProduct.name}</p>
              <p className="text-gray-400 text-xs mt-0.5">
                {selectedProduct.spec}
                {selectedProduct.price > 0 && <span className="ml-2 text-gray-500">· {selectedProduct.price.toLocaleString()}원</span>}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedId(null)}
              className="text-gray-500 hover:text-gray-300 text-xs shrink-0 transition-colors">다시선택</button>
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs text-gray-500">수량</label>
              <input
                type="number" value={qty} min={1} max={9999}
                onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                className="w-16 bg-gray-700 border border-gray-600 focus:border-emerald-500 focus:outline-none rounded-lg px-2 py-1.5 text-white text-sm text-center font-mono"
                autoFocus
              />
            </div>
            <button type="button" onClick={handleConfirm}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shrink-0">
              추가
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 옵션 선택 패널 ────────────────────────────────────────────
function OptionsPanel({ structureId, values, onChange }) {
  const config = STRUCTURE_OPTIONS[structureId] ?? {};
  if (Object.keys(config).length === 0) return null;

  return (
    <section className="bg-gray-800 rounded-2xl border border-gray-700 p-5 space-y-5">
      <p className="text-sm font-semibold text-emerald-300">옵션 선택</p>
      {Object.entries(config).map(([key, cfg]) => {
        if (cfg.showWhen && !cfg.showWhen(values)) return null;
        return (<div key={key}>
          <p className="text-xs text-gray-400 mb-2">{cfg.label}</p>
          {cfg.type === 'info' ? (
            <span className="inline-block bg-gray-700 border border-gray-600 text-gray-300 text-sm px-3 py-1.5 rounded-lg">{cfg.value}</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cfg.options.map(opt => (
                <button key={opt.id} type="button" onClick={() => onChange(key, opt.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    values[key] === opt.id
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-900/40'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-emerald-500/50 hover:text-white'
                  }`}>{opt.label}</button>
              ))}
            </div>
          )}
        </div>);
      })}
    </section>
  );
}

// ── 메인 계산기 컴포넌트 ──────────────────────────────────────
export default function JointCalculator() {
  const [structureId,      setStructureId]      = useState('shelter');
  const [pipeSize,         setPipeSize]         = useState('50');
  const [dims,             setDims]             = useState({ width: 6000, depth: 3000, height: 3000 });
  const [options,          setOptions]          = useState(() => getDefaultOptions('shelter'));
  const [results,          setResults]          = useState(null);
  const [originalResults,  setOriginalResults]  = useState(null);
  const [calcInfo,         setCalcInfo]         = useState(null);
  const [viewMode,         setViewMode]         = useState('modified'); // 'modified' | 'original'
  const [addPanelOpen,     setAddPanelOpen]     = useState(false);

  const handleStructureChange = useCallback((id) => {
    setStructureId(id);
    setOptions(getDefaultOptions(id));
    setResults(null);
    setOriginalResults(null);
    setCalcInfo(null);
  }, []);

  const handleOptionChange = useCallback((key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
    setResults(null);
  }, []);

  const handleDimChange = useCallback((key, value) => {
    const num = Math.max(100, Math.min(99900, Number(value) || 0));
    setDims(prev => ({ ...prev, [key]: num }));
    setResults(null);
  }, []);

  const handleCalculate = useCallback(() => {
    const { cols, rows } = calcColumnGrid(dims.width, dims.depth);
    const { corner, edge, center } = classifyColumns(cols, rows);
    setCalcInfo({ cols, rows, corner, edge, center, total: cols * rows });

    const parts = calculate(structureId, dims, pipeSize, options);
    setResults(parts);
    setOriginalResults(parts ? parts.map(p => ({ ...p })) : null);
    setViewMode('modified');
    setAddPanelOpen(false);
  }, [structureId, dims, pipeSize, options]);

  const handleReset = useCallback(() => {
    setStructureId('shelter');
    setPipeSize('50');
    setDims({ width: 6000, depth: 3000, height: 3000 });
    setOptions(getDefaultOptions('shelter'));
    setResults(null);
    setOriginalResults(null);
    setCalcInfo(null);
    setViewMode('modified');
    setAddPanelOpen(false);
  }, []);

  const handleResetToOriginal = useCallback(() => {
    if (!originalResults) return;
    setResults(originalResults.map(p => ({ ...p })));
    setViewMode('modified');
    setAddPanelOpen(false);
  }, [originalResults]);

  const handleQtyChange = useCallback((id, delta) => {
    setResults(prev => prev.map(p => p.id === id ? { ...p, qty: Math.max(1, p.qty + delta) } : p));
  }, []);

  const handleDelete = useCallback((id) => {
    setResults(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleAddPart = useCallback((id, qty) => {
    setResults(prev => {
      const exists = prev.find(p => p.id === id);
      if (exists) return prev.map(p => p.id === id ? { ...p, qty: p.qty + qty } : p);
      return [...prev, { id, qty }];
    });
  }, []);

  const handlePrint = useCallback(() => { window.print(); }, []);

  // ── 차이 계산 ──────────────────────────────────────────────
  const modifiedViewItems = useMemo(() => {
    if (!Array.isArray(results) || !Array.isArray(originalResults)) return results ?? [];
    const items = results.map(p => {
      const orig = originalResults.find(o => o.id === p.id);
      if (!orig) return { ...p, status: 'added' };
      if (orig.qty !== p.qty) return { ...p, status: 'changed', originalQty: orig.qty };
      return { ...p, status: 'unchanged' };
    });
    const deleted = originalResults
      .filter(o => !results.find(p => p.id === o.id))
      .map(o => ({ ...o, status: 'deleted' }));
    return [...items, ...deleted];
  }, [results, originalResults]);

  const hasDiff = useMemo(() => {
    if (!Array.isArray(results) || !Array.isArray(originalResults)) return false;
    if (results.length !== originalResults.length) return true;
    return results.some(p => {
      const orig = originalResults.find(o => o.id === p.id);
      return !orig || orig.qty !== p.qty;
    });
  }, [results, originalResults]);

  const grandTotal = useMemo(() =>
    Array.isArray(results)
      ? results.reduce((sum, p) => sum + (PRODUCTS[p.id]?.price ?? 0) * p.qty, 0)
      : 0,
  [results]);

  const originalGrandTotal = useMemo(() =>
    Array.isArray(originalResults)
      ? originalResults.reduce((sum, p) => sum + (PRODUCTS[p.id]?.price ?? 0) * p.qty, 0)
      : 0,
  [originalResults]);

  const totalDiff = grandTotal - originalGrandTotal;

  const currentStructureLabel = STRUCTURE_TYPES.find(t => t.id === structureId)?.label ?? '';

  // 현재 뷰에 표시할 아이템
  const displayItems = viewMode === 'original' ? originalResults : modifiedViewItems;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">

      {/* 헤더 */}
      <header className="no-print bg-gray-800 border-b border-emerald-500/30 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-700 rounded-lg">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
              <line x1="10" y1="6.5" x2="14" y2="6.5"/>
              <line x1="10" y1="17.5" x2="14" y2="17.5"/>
              <line x1="6.5" y1="10" x2="6.5" y2="14"/>
              <line x1="17.5" y1="10" x2="17.5" y2="14"/>
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">사각조인트(둑스) 부속 산출</h1>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">구조물 종류·치수·옵션 → 필요 부속 자동 산출 및 견적</p>
          </div>
          <button type="button" onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 hover:text-orange-300 text-xs font-semibold rounded-xl border border-orange-500/20 hover:border-orange-500/40 transition-all">
            <RotateCcw className="w-3.5 h-3.5" />초기화
          </button>
        </div>
      </header>

      <main className="no-print max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* STEP 1 */}
        <section className="bg-gray-800 rounded-2xl border border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">STEP 1 · 구조물 종류</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STRUCTURE_TYPES.map(type => (
              <button key={type.id} type="button" onClick={() => handleStructureChange(type.id)}
                className={`flex flex-col items-center py-4 px-2 rounded-xl border text-sm font-bold transition-all ${
                  structureId === type.id
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/40'
                    : 'bg-gray-700/60 border-gray-600 text-gray-300 hover:border-emerald-500/50 hover:text-white'
                }`}>
                <span className="text-base mb-1">{type.label}</span>
                <span className={`text-xs font-normal leading-tight text-center ${structureId === type.id ? 'text-emerald-200' : 'text-gray-500'}`}>
                  {type.desc}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* STEP 2 */}
        <section className="bg-gray-800 rounded-2xl border border-gray-700 p-5 space-y-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">STEP 2 · 규격 및 치수</p>
          <div>
            <p className="text-xs text-gray-400 mb-2">파이프 규격</p>
            <div className="flex flex-wrap gap-2">
              {PIPE_SIZES.map(size => (
                <button key={size.id} type="button" onClick={() => { setPipeSize(size.id); setResults(null); }}
                  className={`flex flex-col items-center px-5 py-2.5 rounded-xl border font-semibold transition-all ${
                    pipeSize === size.id
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-emerald-500/50'
                  }`}>
                  <span className="text-sm">{size.label}</span>
                  <span className={`text-xs font-normal ${pipeSize === size.id ? 'text-emerald-200' : 'text-gray-500'}`}>{size.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">치수 입력 (mm 단위)</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'width', label: '가로', icon: '↔' },
                { key: 'depth', label: '세로', icon: '↕' },
                { key: 'height', label: '높이', icon: '↑' },
              ].map(({ key, label, icon }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1.5"><span className="mr-1">{icon}</span>{label} (mm)</label>
                  <input type="number" value={dims[key]} min={100} max={99900} step={100}
                    onChange={e => handleDimChange(key, e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none rounded-xl px-3 py-2.5 text-white text-sm font-mono transition-colors"
                  />
                </div>
              ))}
            </div>
            {dims.width > 0 && dims.depth > 0 && (() => {
              const { cols, rows } = calcColumnGrid(dims.width, dims.depth);
              const { corner, edge, center } = classifyColumns(cols, rows);
              return (
                <div className="mt-3 bg-gray-700/40 border border-gray-700 rounded-xl px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                  <span>기둥 배치 <span className="text-white font-bold">{cols}×{rows}</span></span>
                  <span>코너 <span className="text-sky-300 font-bold">{corner}개</span></span>
                  <span>외곽중간 <span className="text-amber-300 font-bold">{edge}개</span></span>
                  <span>중앙 <span className="text-violet-300 font-bold">{center}개</span></span>
                  <span className="ml-auto text-gray-500">3m 간격 기준</span>
                </div>
              );
            })()}
          </div>
        </section>

        {/* STEP 3 */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 mb-3">STEP 3 · 옵션 선택</p>
          <OptionsPanel structureId={structureId} values={options} onChange={handleOptionChange} />
          {Object.keys(STRUCTURE_OPTIONS[structureId] ?? {}).length === 0 && (
            <div className="bg-gray-800 rounded-2xl border border-gray-700 px-5 py-4 text-sm text-gray-500">
              이 구조물은 별도 선택 옵션이 없습니다.
            </div>
          )}
        </div>

        {/* 산출 버튼 */}
        <button type="button" onClick={handleCalculate}
          className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-base py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3"/>
            <path d="M9 15h3l8.5-8.5a1.5 1.5 0 0 0-3-3L9 12v3"/>
          </svg>
          부속 산출하기
        </button>

        {/* STEP 4 — 결과 */}
        {structureId === 'duplex' && Array.isArray(results) && results.length > 0 && (
          <section className="bg-gray-800 rounded-2xl border border-gray-700 p-5">
            <DuplexDiagram
              dims={dims}
              pipeSize={pipeSize}
              options={options}
              results={results}
            />
          </section>
        )}

        {results !== undefined && (
          <section className="bg-gray-800 rounded-2xl border border-emerald-500/30 overflow-hidden shadow-xl">

            {/* 결과 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 bg-emerald-600/10 border-b border-emerald-500/20">
              <div>
                <p className="text-sm font-bold text-emerald-300">부속 산출 결과</p>
                {calcInfo && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    기둥 {calcInfo.cols}×{calcInfo.rows} 배치 · 총 {calcInfo.total}개
                  </p>
                )}
              </div>
              <button type="button" onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg border border-gray-600 transition-colors">
                <Printer className="w-3.5 h-3.5" />인쇄 / PDF
              </button>
            </div>

            {/* 미구현 / 빈 결과 */}
            {results === null ? (
              <div className="px-5 py-12 text-center">
                <p className="text-amber-400 font-semibold text-sm">'{currentStructureLabel}' 산출 로직 준비 중</p>
                <p className="text-gray-600 text-xs mt-1">비가림 먼저 지원 · 나머지 구조물 순차 구현 예정</p>
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-gray-500 text-sm">산출된 부속이 없습니다.</p>
              </div>
            ) : (
              <>
                {/* ── 원본 / 수정본 탭 바 ───────────────────────── */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800/60">
                  <div className="flex rounded-lg bg-gray-900 p-0.5 gap-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('modified')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        viewMode === 'modified'
                          ? 'bg-emerald-600 text-white shadow'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      수정본
                      {hasDiff && (
                        <span className="flex gap-0.5">
                          {modifiedViewItems.some(i => i.status === 'added')   && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"/>}
                          {modifiedViewItems.some(i => i.status === 'changed') && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"/>}
                          {modifiedViewItems.some(i => i.status === 'deleted') && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"/>}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('original')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        viewMode === 'original'
                          ? 'bg-gray-600 text-white shadow'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >원본</button>
                  </div>

                  {hasDiff && (
                    <button type="button" onClick={handleResetToOriginal}
                      className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors">
                      <RotateCcw className="w-3 h-3" />원본으로 초기화
                    </button>
                  )}
                </div>

                {/* ── 범례 (수정본 탭에서 차이가 있을 때) ─────────── */}
                {viewMode === 'modified' && hasDiff && (
                  <div className="flex flex-wrap gap-3 px-4 py-2 bg-gray-800/40 border-b border-gray-700/50 text-xs text-gray-500">
                    {modifiedViewItems.some(i => i.status === 'added')   && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>추가 항목</span>}
                    {modifiedViewItems.some(i => i.status === 'changed') && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block"/>수량 변경 (노란색 = 수정값, 취소선 = 원본값)</span>}
                    {modifiedViewItems.some(i => i.status === 'deleted') && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>삭제된 항목</span>}
                  </div>
                )}

                {/* ── 테이블 ────────────────────────────────────── */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-700/60 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="text-left px-4 py-3">부품명</th>
                        <th className="text-center px-4 py-3">규격</th>
                        <th className="text-center px-4 py-3">수량</th>
                        <th className="text-right px-4 py-3">단가 (원)</th>
                        <th className="text-right px-4 py-3">금액 (원)</th>
                        <th className="px-3 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {(displayItems ?? []).map((part, i) => (
                        <ResultRow
                          key={part.id + (part.status ?? '')}
                          part={part}
                          index={i}
                          status={part.status}
                          originalQty={part.originalQty}
                          onQtyChange={viewMode === 'modified' && part.status !== 'deleted' ? handleQtyChange : undefined}
                          onDelete={viewMode === 'modified' && part.status !== 'deleted' ? handleDelete : undefined}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── 부속 추가 (수정본 탭에서만) ──────────────────── */}
                {viewMode === 'modified' && (
                  addPanelOpen ? (
                    <AddPartPanel onAdd={handleAddPart} onClose={() => setAddPanelOpen(false)} />
                  ) : (
                    <div className="border-t border-gray-700 px-4 py-3">
                      <button type="button" onClick={() => setAddPanelOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/40 border border-emerald-700/30 hover:border-emerald-600/50 rounded-xl transition-all">
                        <span className="text-base leading-none">＋</span>부속 추가
                      </button>
                    </div>
                  )
                )}

                {/* ── 합계 ─────────────────────────────────────── */}
                {(grandTotal > 0 || originalGrandTotal > 0) && (
                  <div className="border-t border-gray-700 bg-gray-700/30 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* 수정본 합계 */}
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">
                          {hasDiff ? '수정본 합계' : '합계 금액'}
                          <span className="ml-1 text-gray-600">(부가세 별도)</span>
                        </p>
                        <p className="text-2xl font-black text-emerald-400">
                          {grandTotal.toLocaleString()}
                          <span className="text-sm font-normal text-gray-400 ml-1">원</span>
                        </p>
                        {hasDiff && totalDiff !== 0 && (
                          <p className={`text-xs font-semibold mt-1 ${totalDiff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            원본 대비 {totalDiff > 0 ? '+' : ''}{totalDiff.toLocaleString()}원
                          </p>
                        )}
                      </div>

                      {/* 원본 합계 + 부가세 */}
                      <div className="text-right text-xs text-gray-500 space-y-1">
                        {hasDiff && (
                          <div className="mb-2 pb-2 border-b border-gray-700">
                            <p className="text-gray-600">원본 합계</p>
                            <p className="text-gray-500 line-through font-mono text-sm">
                              {originalGrandTotal.toLocaleString()}원
                            </p>
                          </div>
                        )}
                        <p>부가세 (10%)</p>
                        <p className="text-gray-400 font-semibold">{(grandTotal * 0.1).toLocaleString()}원</p>
                        <p className="text-white font-bold">총액 {(grandTotal * 1.1).toLocaleString()}원</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

      </main>

      <div id="joint-print-root" className="hidden print:block">
        <p style={{ fontWeight: 700, fontSize: 16 }}>사각조인트(둑스) 구조물 부속 산출서</p>
      </div>
    </div>
  );
}
