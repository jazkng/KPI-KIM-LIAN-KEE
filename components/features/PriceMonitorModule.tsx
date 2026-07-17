import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Filter,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
  Minus,
  WalletCards,
} from 'lucide-react';
import { DataManager } from '../../utils/dataManager';
import { StockPriceHistory } from '../../types';

interface PriceMonitorModuleProps {
  onClose: () => void;
}

interface PriceHistoryPoint {
  date: string;
  cost: number;
  logId?: string;
  isCurrent?: boolean;
}

type PriceMonitorStatus =
  | 'UP'
  | 'DOWN'
  | 'SAME'
  | 'NO_HISTORY'
  | 'INSUFFICIENT'
  | 'OUT_OF_RANGE'
  | 'MASTER_MISSING';

interface PriceChangeItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  currentCost: number;
  lastCost: number | null;
  diff: number;
  percent: number;
  lastDate: string;
  supplierName: string;
  status: PriceMonitorStatus;
  history: PriceHistoryPoint[];
  source: 'INVENTORY_MASTER' | 'PRICE_HISTORY' | 'MIXED';
}

type DateRange = '30' | '90' | '180' | 'ALL';
type FilterStatus = 'ALL' | 'UP' | 'DOWN' | 'SAME' | 'GAP';

const DEFAULT_RANGE: DateRange = '90';

const RANGE_DAYS: Record<DateRange, number | null> = {
  '30': 30,
  '90': 90,
  '180': 180,
  ALL: null,
};

const RANGE_LABELS: Record<DateRange, string> = {
  '30': '1M',
  '90': '3M',
  '180': '6M',
  ALL: '全部',
};

const CATEGORY_LABELS: Record<string, string> = {
  FRESH: '生鲜',
  MEAT: '肉类',
  SEAFOOD: '海鲜',
  VEG: '蔬果',
  NOODLE: '面食',
  SAUCE: '酱料',
  DRY: '干货',
  HQ: '总店',
  TEA: '茶叶',
  FRUIT: '水果',
  RTD: '罐装饮料',
  GENERAL: '杂项',
  FUEL: '燃料',
  PACKAGING: '包装',
  CLEANING: '清洁',
  TOOLS: '工具',
  WASTE: '消耗品',
  DAIRY: '奶制品',
  BEVERAGE: '饮料',
  FROZEN: '冷冻',
  GRAIN: '谷物',
  SPICE: '香料',
  OIL: '油类',
  CONDIMENT: '调味品',
};

const haptic = (pattern: number | number[] = 20) => {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    // ignore
  }
};

const normalizeSearch = (text: string) =>
  (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\(\)\-\_\\\/（）【】\[\]\{\}]/g, '');

const getCutoffDate = (daysAgo: number | null): string | undefined => {
  if (daysAgo === null) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
};

const money = (value: number) => `RM ${Number(value || 0).toFixed(2)}`;

const getItemCurrentCost = (item: any): number => {
  const value =
    item?.costPerBaseUnit ??
    item?.costPerUnit ??
    item?.baseCost ??
    item?.cost ??
    item?.price ??
    0;

  return Number.isFinite(Number(value)) ? Number(value) : 0;
};

const getItemUnit = (item: any): string => {
  return item?.baseUnit || item?.unit || item?.displayUnit || 'Unit';
};

const getCategoryLabel = (category: string) => {
  return CATEGORY_LABELS[category] || category || '未分类';
};

const statusGroup = (status: PriceMonitorStatus): FilterStatus => {
  if (status === 'UP') return 'UP';
  if (status === 'DOWN') return 'DOWN';
  if (status === 'SAME') return 'SAME';
  return 'GAP';
};

const getStatusMeta = (status: PriceMonitorStatus) => {
  switch (status) {
    case 'UP':
      return {
        label: '涨价',
        short: 'UP',
        icon: TrendingUp,
        tone:
          'bg-red-50 text-red-600 border-red-100 ',
        cardTone: 'border-red-100 ',
        accent: 'text-red-500',
      };
    case 'DOWN':
      return {
        label: '降价',
        short: 'DOWN',
        icon: TrendingDown,
        tone:
          'bg-green-50 text-green-600 border-green-100 ',
        cardTone: 'border-green-100 ',
        accent: 'text-green-600',
      };
    case 'SAME':
      return {
        label: '持平',
        short: 'SAME',
        icon: Minus,
        tone:
          'bg-amber-50 text-amber-700 border-amber-100 ',
        cardTone: 'border-amber-100 ',
        accent: 'text-amber-600',
      };
    case 'NO_HISTORY':
      return {
        label: '暂无历史',
        short: 'NO HISTORY',
        icon: Database,
        tone:
          'bg-gray-100 text-gray-600 border-gray-200 ',
        cardTone: 'border-gray-200 ',
        accent: 'text-gray-500',
      };
    case 'OUT_OF_RANGE':
      return {
        label: '超出范围',
        short: 'OUT RANGE',
        icon: Clock,
        tone:
          'bg-blue-50 text-blue-600 border-blue-100 ',
        cardTone: 'border-blue-100 ',
        accent: 'text-blue-500',
      };
    case 'MASTER_MISSING':
      return {
        label: '主档缺失',
        short: 'MISSING',
        icon: ShieldAlert,
        tone:
          'bg-orange-50 text-orange-700 border-orange-100 ',
        cardTone: 'border-orange-100 ',
        accent: 'text-orange-600',
      };
    case 'INSUFFICIENT':
    default:
      return {
        label: '数据不足',
        short: 'INSUFFICIENT',
        icon: Package,
        tone:
          'bg-gray-100 text-gray-600 border-gray-200 ',
        cardTone: 'border-gray-200 ',
        accent: 'text-gray-500',
      };
  }
};

const calcRiskScore = (item: PriceChangeItem) => {
  if (item.status === 'NO_HISTORY' || item.status === 'MASTER_MISSING') return 68;
  if (item.status === 'OUT_OF_RANGE' || item.status === 'INSUFFICIENT') return 52;
  if (item.status === 'UP') return Math.min(99, 50 + Math.abs(item.percent) * 4);
  if (item.status === 'DOWN') return Math.max(8, 35 - Math.abs(item.percent));
  return 22;
};

const tryCallDataManager = async <T,>(
  names: string[],
  fallback: T,
): Promise<T> => {
  const manager = DataManager as any;

  for (const name of names) {
    if (typeof manager[name] === 'function') {
      try {
        const result = await manager[name]();
        if (Array.isArray(result)) return result as T;
      } catch {
        // try next method
      }
    }
  }

  return fallback;
};

const fetchInventoryMaster = async (): Promise<any[]> => {
  const direct = await tryCallDataManager<any[]>(
    [
      'getAllStockItems',
      'getStockItems',
      'getStocks',
      'getAllStocks',
      'getInventoryItems',
      'getAllInventoryItems',
    ],
    [],
  );

  if (direct.length > 0) return direct;

  try {
    const searchResult = await (DataManager as any).searchStockByName?.('');
    if (Array.isArray(searchResult)) return searchResult;
  } catch {
    // ignore
  }

  return [];
};

const fetchPriceHistoryForItem = async (
  itemId: string,
  fallback?: StockPriceHistory,
): Promise<StockPriceHistory | null> => {
  if (fallback) return fallback;

  try {
    const hist = await (DataManager as any).getPriceHistory?.(itemId);
    return hist || null;
  } catch {
    return null;
  }
};

const CostTrendChart = ({
  history,
  unit,
  status,
}: {
  history: PriceHistoryPoint[];
  unit: string;
  status: PriceMonitorStatus;
}) => {
  const cleanHistory = history.filter((h) => Number.isFinite(h.cost));

  if (cleanHistory.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-6 text-center ">
        <Database className="mx-auto mb-2 text-gray-300" size={28} />
        <p className="text-xs font-bold text-gray-400">
          数据点不足，暂时无法生成趋势
        </p>
      </div>
    );
  }

  const meta = getStatusMeta(status);
  const width = 360;
  const height = 150;
  const paddingX = 24;
  const paddingTop = 18;
  const paddingBottom = 30;

  const costs = cleanHistory.map((h) => h.cost);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
  const rawRange = max - min || Math.max(max * 0.1, 1);
  const chartMin = Math.max(0, min - rawRange * 0.18);
  const chartMax = max + rawRange * 0.18;
  const chartRange = chartMax - chartMin || 1;

  const innerW = width - paddingX * 2;
  const innerH = height - paddingTop - paddingBottom;

  const points = cleanHistory.map((h, i) => {
    const x =
      paddingX + (i / Math.max(cleanHistory.length - 1, 1)) * innerW;
    const y =
      paddingTop +
      innerH -
      ((h.cost - chartMin) / chartRange) * innerH;

    return { x, y, cost: h.cost, date: h.date };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`)
    .join(' ');

  const areaPath = `${path} L ${points[points.length - 1].x},${
    height - paddingBottom
  } L ${paddingX},${height - paddingBottom} Z`;

  const avgY =
    paddingTop + innerH - ((avg - chartMin) / chartRange) * innerH;

  const stroke =
    status === 'UP'
      ? '#EF4444'
      : status === 'DOWN'
        ? '#22C55E'
        : status === 'SAME'
          ? '#F59E0B'
          : '#6B7280';

  const gradientId = `costTrend_${history.length}_${Math.round(max * 100)}_${Math.round(
    min * 100,
  )}`;

  const firstDate = cleanHistory[0]?.date || '';
  const lastDate = cleanHistory[cleanHistory.length - 1]?.date || '';

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm ">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            Cost Trend
          </p>
          <p className="mt-1 text-xs font-bold text-gray-600 ">
            {cleanHistory.length} 个价格点 · 平均 {money(avg)} / {unit}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.tone}`}>
          {meta.label}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = paddingTop + innerH * ratio;
          return (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-gray-100 "
              strokeDasharray={ratio === 0.5 ? '4 4' : '0'}
            />
          );
        })}

        <line
          x1={paddingX}
          x2={width - paddingX}
          y1={avgY}
          y2={avgY}
          stroke="#9CA3AF"
          strokeDasharray="4 4"
          opacity="0.55"
        />

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, index) => (
          <g key={`${p.date}-${index}`}>
            <circle cx={p.x} cy={p.y} r="4.5" fill="white" stroke={stroke} strokeWidth="2.5" />
            {index === points.length - 1 && (
              <circle cx={p.x} cy={p.y} r="8" fill={stroke} opacity="0.12" />
            )}
          </g>
        ))}

        <text
          x={paddingX}
          y={height - 8}
          className="fill-gray-400 font-mono text-[9px] font-bold"
        >
          {firstDate.replace('当前 (Now)', 'Now').slice(-10)}
        </text>
        <text
          x={width - paddingX}
          y={height - 8}
          textAnchor="end"
          className="fill-gray-400 font-mono text-[9px] font-bold"
        >
          {lastDate.replace('当前 (Now)', 'Now').slice(-10)}
        </text>
      </svg>
    </div>
  );
};

const EmptyState = ({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) => (
  <div className="rounded-[2rem] border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm ">
    <CheckCircle2 className="mx-auto mb-3 text-gray-300" size={44} />
    <p className="text-sm font-black text-gray-700 ">
      {hasFilters ? '没有符合筛选的库存物品' : '暂时没有库存成本数据'}
    </p>
    <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-gray-400">
      {hasFilters
        ? '可以清空筛选，或扩大扫描范围到全部。'
        : '当库存主档或价格历史建立后，这里会显示成本状态。'}
    </p>
    {hasFilters && (
      <button
        onClick={onReset}
        className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#111111] px-4 py-3 text-xs font-black text-[#FFD200] shadow-sm active:scale-95 "
      >
        <RotateCcw size={14} />
        清空筛选
      </button>
    )}
  </div>
);

export const PriceMonitorModule: React.FC<PriceMonitorModuleProps> = ({
  onClose,
}) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PriceChangeItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    itemId: string;
    itemName: string;
    logId: string;
    date: string;
    cost: number;
    unit: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadMeta, setLoadMeta] = useState({
    masterCount: 0,
    historyCount: 0,
    readMode: 'Smart Scan',
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  const buildCostDashboard = async (range: DateRange) => {
    setLoading(true);

    try {
      const cutoffDate = getCutoffDate(RANGE_DAYS[range]);

      const [recentHistories, suppliers, inventoryMaster] = await Promise.all([
        DataManager.getRecentPriceChanges(cutoffDate),
        DataManager.getSuppliers(),
        fetchInventoryMaster(),
      ]);

      const histories = (recentHistories || []) as StockPriceHistory[];
      const historyMap = new Map<string, StockPriceHistory>();

      histories.forEach((hist: any) => {
        if (hist?.stockId) historyMap.set(hist.stockId, hist);
      });

      const historyStockIds = histories.map((h: any) => h.stockId).filter(Boolean);
      const stocksFromHistory =
        historyStockIds.length > 0
          ? await DataManager.getStockItemsByIds(historyStockIds)
          : [];

      const itemMap = new Map<string, any>();

      inventoryMaster.forEach((item: any) => {
        if (item?.id) itemMap.set(item.id, item);
      });

      (stocksFromHistory || []).forEach((item: any) => {
        if (item?.id && !itemMap.has(item.id)) itemMap.set(item.id, item);
      });

      histories.forEach((hist: any) => {
        if (!itemMap.has(hist.stockId)) {
          itemMap.set(hist.stockId, {
            id: hist.stockId,
            name: hist.stockName || hist.itemName || '未知库存物品',
            category: hist.category || 'GENERAL',
            baseUnit: hist.unit || 'Unit',
            cost: hist.entries?.[hist.entries.length - 1]?.cost || 0,
            __masterMissing: true,
          });
        }
      });

      const allItems = Array.from(itemMap.values());

      const results = await Promise.all(
        allItems.map(async (item: any): Promise<PriceChangeItem> => {
          const itemId = item.id;
          const fallbackHistory = historyMap.get(itemId);
          const fullHistory = await fetchPriceHistoryForItem(itemId, fallbackHistory);

          const entries = ((fullHistory as any)?.entries || [])
            .slice()
            .filter((entry: any) => Number.isFinite(Number(entry.cost)))
            .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

          const unit = getItemUnit(item);
          const currentCost = getItemCurrentCost(item);

          const history: PriceHistoryPoint[] = entries.map((entry: any) => ({
            date: entry.date,
            cost: Number(entry.cost),
            logId: entry.sourceLogId,
          }));

          const lastHistoryCost = history[history.length - 1]?.cost;
          if (currentCost > 0 && lastHistoryCost !== currentCost) {
            history.push({
              date: '当前 (Now)',
              cost: currentCost,
              isCurrent: true,
            });
          }

          const filteredHistory = history.filter((point) => {
            if (!cutoffDate) return true;
            if (point.isCurrent || point.date === '当前 (Now)') return true;
            return String(point.date) >= cutoffDate;
          });

          let status: PriceMonitorStatus = 'NO_HISTORY';
          let lastCost: number | null = null;
          let diff = 0;
          let percent = 0;
          let lastDate = '暂无历史';

          if (item.__masterMissing) {
            status = 'MASTER_MISSING';
          } else if (history.length === 0) {
            status = 'NO_HISTORY';
          } else if (history.length === 1) {
            status = 'INSUFFICIENT';
            lastDate = history[0].date;
          } else if (filteredHistory.length < 2) {
            status = 'OUT_OF_RANGE';
            lastDate = history[history.length - 2]?.date || '超出范围';
          } else {
            const latest = filteredHistory[filteredHistory.length - 1];
            const previous = filteredHistory[filteredHistory.length - 2];

            lastCost = previous.cost;
            diff = latest.cost - previous.cost;
            percent = previous.cost > 0 ? (diff / previous.cost) * 100 : 0;
            lastDate = previous.date;

            if (diff > 0.001) status = 'UP';
            else if (diff < -0.001) status = 'DOWN';
            else status = 'SAME';
          }

          const supplier = (suppliers as any[]).find((s: any) =>
            s.catalog?.some((c: any) => c.linkedStockId === itemId),
          );

          return {
            id: itemId,
            name: item.name || item.stockName || '未命名库存',
            category: item.category || 'GENERAL',
            unit,
            currentCost:
              filteredHistory[filteredHistory.length - 1]?.cost ||
              history[history.length - 1]?.cost ||
              currentCost,
            lastCost,
            diff,
            percent,
            lastDate,
            supplierName: supplier?.name || '未绑定供应商',
            status,
            history,
            source:
              item.__masterMissing
                ? 'PRICE_HISTORY'
                : fallbackHistory
                  ? 'MIXED'
                  : 'INVENTORY_MASTER',
          };
        }),
      );

      const sorted = results.sort((a, b) => {
        const riskA = calcRiskScore(a);
        const riskB = calcRiskScore(b);

        if (riskB !== riskA) return riskB - riskA;
        return Math.abs(b.diff) - Math.abs(a.diff);
      });

      setItems(sorted);
      setLoadMeta({
        masterCount: inventoryMaster.length,
        historyCount: histories.length,
        readMode:
          inventoryMaster.length > 0
            ? 'Master + Price History'
            : 'Price History Fallback',
      });
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    buildCostDashboard(dateRange);
  }, [dateRange]);

  const refresh = async () => {
    haptic([20, 40, 20]);
    await buildCostDashboard(dateRange);
  };

  const resetFilters = () => {
    haptic(20);
    setSearchTerm('');
    setFilterStatus('ALL');
    setFilterCategory('ALL');
    setDateRange(DEFAULT_RANGE);
    setExpandedId(null);
  };

  const handleDeleteHistoryEntry = async () => {
    if (!deleteTarget) return;

    setDeleting(true);

    try {
      await DataManager.removeWrongPriceRecord(
        deleteTarget.logId,
        deleteTarget.itemId,
      );

      haptic([30, 50, 30]);
      setDeleteTarget(null);
      await buildCostDashboard(dateRange);
    } catch (error) {
      console.error(error);
      alert(`删除失败：${(error as Error).message}`);
    } finally {
      setDeleting(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => set.add(item.category || 'GENERAL'));
    return ['ALL', ...Array.from(set)];
  }, [items]);

  const stats = useMemo(() => {
    const up = items.filter((item) => item.status === 'UP').length;
    const down = items.filter((item) => item.status === 'DOWN').length;
    const same = items.filter((item) => item.status === 'SAME').length;
    const gap = items.filter((item) =>
      ['NO_HISTORY', 'INSUFFICIENT', 'OUT_OF_RANGE', 'MASTER_MISSING'].includes(
        item.status,
      ),
    ).length;

    const totalCost = items.reduce((sum, item) => sum + (item.currentCost || 0), 0);
    const avgCost = items.length > 0 ? totalCost / items.length : 0;
    const riskCount = items.filter((item) => calcRiskScore(item) >= 60).length;

    return {
      total: items.length,
      up,
      down,
      same,
      gap,
      avgCost,
      riskCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalized = normalizeSearch(searchTerm);

    return items.filter((item) => {
      const matchesSearch =
        !normalized ||
        normalizeSearch(item.name).includes(normalized) ||
        normalizeSearch(item.supplierName).includes(normalized) ||
        normalizeSearch(item.category).includes(normalized);

      const matchesStatus =
        filterStatus === 'ALL' || statusGroup(item.status) === filterStatus;

      const matchesCategory =
        filterCategory === 'ALL' || item.category === filterCategory;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [items, searchTerm, filterStatus, filterCategory]);

  const hasActiveFilters =
    searchTerm !== '' ||
    filterStatus !== 'ALL' ||
    filterCategory !== 'ALL' ||
    dateRange !== DEFAULT_RANGE;

  const topRiskItem = items[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-0 backdrop-blur-md md:p-4">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#F6F7FB] font-sans text-[#111111] shadow-2xl md:h-[92vh] md:max-w-5xl md:rounded-[2rem]">
        <header className="mobile-safe-header shrink-0 bg-[#111111] border-b-4 border-[#FFD200] px-4 pb-3 md:px-5 md:py-0 min-h-[56px] md:h-16 flex justify-between items-center z-20 sticky top-0 shadow-md text-white">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              onClick={() => { haptic(20); onClose(); }} 
              className="md:hidden w-11 h-11 bg-white/10 hover:bg-red-500 hover:text-white rounded-xl flex items-center justify-center transition-colors text-gray-300 shrink-0"
              aria-label="返回"
            >
              <X size={18}/>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0">💰</span>
              <div className="min-w-0">
                <h2 className="text-sm md:text-xl font-black text-white truncate">库存成本监控</h2>
                <p className="text-[8px] text-gray-400 font-mono tracking-widest uppercase mt-0.5 truncate">Cost Intelligence · KMLK Group</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-gray-200 hover:bg-white/20 transition active:scale-95 disabled:opacity-50"
              aria-label="刷新"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { haptic(20); onClose(); }}
              className="hidden md:flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-red-500 transition active:scale-95"
              aria-label="关闭"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <main
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] md:px-6"
        >
          <section className="mb-4 overflow-hidden rounded-[2rem] bg-[#111111] text-white shadow-sm ">
            <div className="relative p-5 md:p-6">
              <div className="absolute right-[-3rem] top-[-3rem] h-32 w-32 rounded-full bg-[#FFD200]/25 blur-2xl" />
              <div className="absolute bottom-[-4rem] left-[-4rem] h-32 w-32 rounded-full bg-[#FFD200]/10 blur-2xl" />

              <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#FFD200]">
                    <Sparkles size={13} />
                    Smart Cost Scan
                  </div>

                  <h3 className="max-w-xl text-2xl font-black leading-tight tracking-tight md:text-3xl">
                    从“只看涨跌”升级为
                    <span className="text-[#FFD200]"> 全库存成本雷达</span>
                  </h3>

                  <p className="mt-2 max-w-xl text-xs font-medium leading-relaxed text-white/55 md:text-sm">
                    同时检查库存主档、价格历史、供应商绑定与数据缺口。没有涨跌的物品也不会再消失。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:min-w-[420px]">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-white/45">
                      监控物品
                    </p>
                    <p className="mt-1 font-mono text-2xl font-black text-[#FFD200]">
                      {stats.total}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-white/45">
                      风险项
                    </p>
                    <p className="mt-1 font-mono text-2xl font-black">
                      {stats.riskCount}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-white/45">
                      平均成本
                    </p>
                    <p className="mt-1 font-mono text-lg font-black">
                      {money(stats.avgCost)}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-white/45">
                      扫描模式
                    </p>
                    <p className="mt-1 truncate text-[11px] font-black text-[#FFD200]">
                      {loadMeta.readMode}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <button
              onClick={() => setFilterStatus('UP')}
              className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.98] ${
                filterStatus === 'UP'
                  ? 'border-red-300 ring-4 ring-red-100 '
                  : 'border-gray-100 '
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="rounded-2xl bg-red-50 p-2 text-red-500 ">
                  <ArrowUp size={18} />
                </div>
                <span className="font-mono text-xl font-black text-red-500">
                  {stats.up}
                </span>
              </div>
              <p className="text-xs font-black">涨价风险</p>
              <p className="mt-1 text-[10px] font-bold text-gray-400">
                需要检查售价或用量
              </p>
            </button>

            <button
              onClick={() => setFilterStatus('DOWN')}
              className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.98] ${
                filterStatus === 'DOWN'
                  ? 'border-green-300 ring-4 ring-green-100 '
                  : 'border-gray-100 '
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="rounded-2xl bg-green-50 p-2 text-green-600 ">
                  <ArrowDown size={18} />
                </div>
                <span className="font-mono text-xl font-black text-green-600">
                  {stats.down}
                </span>
              </div>
              <p className="text-xs font-black">降价机会</p>
              <p className="mt-1 text-[10px] font-bold text-gray-400">
                可以优化采购价
              </p>
            </button>

            <button
              onClick={() => setFilterStatus('SAME')}
              className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.98] ${
                filterStatus === 'SAME'
                  ? 'border-amber-300 ring-4 ring-amber-100 '
                  : 'border-gray-100 '
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="rounded-2xl bg-amber-50 p-2 text-amber-600 ">
                  <Minus size={18} />
                </div>
                <span className="font-mono text-xl font-black text-amber-600">
                  {stats.same}
                </span>
              </div>
              <p className="text-xs font-black">价格持平</p>
              <p className="mt-1 text-[10px] font-bold text-gray-400">
                稳定但仍可追踪
              </p>
            </button>

            <button
              onClick={() => setFilterStatus('GAP')}
              className={`rounded-3xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.98] ${
                filterStatus === 'GAP'
                  ? 'border-gray-400 ring-4 ring-gray-100 '
                  : 'border-gray-100 '
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="rounded-2xl bg-gray-100 p-2 text-gray-500 ">
                  <Database size={18} />
                </div>
                <span className="font-mono text-xl font-black text-gray-600 ">
                  {stats.gap}
                </span>
              </div>
              <p className="text-xs font-black">数据缺口</p>
              <p className="mt-1 text-[10px] font-bold text-gray-400">
                无历史 / 超范围 / 缺主档
              </p>
            </button>
          </section>

          <section className="sticky top-0 z-20 mb-4 rounded-[1.75rem] border border-gray-100 bg-white/90 p-3 shadow-sm backdrop-blur-xl ">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索库存、供应商、分类，例如：树苗"
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-[#F6F7FB] pl-10 pr-10 text-[16px] font-bold outline-none transition focus:border-[#FFD200] focus:ring-4 focus:ring-[#FFD200]/20 "
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm "
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 rounded-2xl bg-[#F6F7FB] p-1 md:w-[280px]">
                {(Object.keys(RANGE_LABELS) as DateRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => {
                      haptic(12);
                      setDateRange(range);
                    }}
                    className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
                      dateRange === range
                        ? 'bg-[#111111] text-[#FFD200] shadow-sm '
                        : 'text-gray-500'
                    }`}
                  >
                    {RANGE_LABELS[range]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {[
                { id: 'ALL' as FilterStatus, label: '全部', icon: Filter },
                { id: 'UP' as FilterStatus, label: '涨价', icon: TrendingUp },
                { id: 'DOWN' as FilterStatus, label: '降价', icon: TrendingDown },
                { id: 'SAME' as FilterStatus, label: '持平', icon: Minus },
                { id: 'GAP' as FilterStatus, label: '数据缺口', icon: Database },
              ].map((filter) => {
                const Icon = filter.icon;

                return (
                  <button
                    key={filter.id}
                    onClick={() => {
                      haptic(12);
                      setFilterStatus(filter.id);
                    }}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-black transition ${
                      filterStatus === filter.id
                        ? 'border-[#FFD200] bg-[#FFD200] text-[#111111] shadow-sm'
                        : 'border-gray-200 bg-white text-gray-500 '
                    }`}
                  >
                    <Icon size={13} />
                    {filter.label}
                  </button>
                );
              })}

              <div className="mx-1 h-8 w-px shrink-0 bg-gray-200 " />

              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setFilterCategory(category)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-black transition ${
                    filterCategory === category
                      ? 'border-[#111111] bg-[#111111] text-[#FFD200] '
                      : 'border-gray-200 bg-white text-gray-500 '
                  }`}
                >
                  <Tag size={12} />
                  {category === 'ALL' ? '所有分类' : getCategoryLabel(category)}
                </button>
              ))}

              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-2 text-[11px] font-black text-gray-500 transition "
                >
                  <RotateCcw size={12} />
                  重置
                </button>
              )}
            </div>
          </section>

          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-xs font-black text-gray-500 ">
              显示{' '}
              <span className="font-mono text-[#111111] ">
                {filteredItems.length}
              </span>{' '}
              / {items.length} 个库存物品
            </p>
            <p className="text-[10px] font-bold text-gray-400">
              主档 {loadMeta.masterCount} · 历史 {loadMeta.historyCount}
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FFD200] text-[#111111] shadow-[0_12px_35px_rgba(255,210,0,0.35)]">
                <RefreshCw className="animate-spin" size={24} />
              </div>
              <p className="text-sm font-black text-gray-700 ">
                正在重新计算库存成本状态...
              </p>
              <p className="mt-1 text-xs font-bold text-gray-400">
                合并库存主档 + 价格历史 + 供应商资料
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} onReset={resetFilters} />
          ) : (
            <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredItems.map((item) => {
                const meta = getStatusMeta(item.status);
                const StatusIcon = meta.icon;
                const isExpanded = expandedId === item.id;
                const riskScore = Math.round(calcRiskScore(item));

                return (
                  <article
                    key={item.id}
                    className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-sm transition ${meta.cardTone}`}
                  >
                    <button
                      onClick={() => {
                        haptic(12);
                        setExpandedId(isExpanded ? null : item.id);
                      }}
                      className="w-full p-4 text-left active:bg-gray-50 "
                    >
                      <div className="flex gap-3">
                        <div
                          className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border ${meta.tone}`}
                        >
                          <StatusIcon size={23} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-[15px] font-black text-[#111111] ">
                                {item.name}
                              </h3>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full bg-[#F6F7FB] px-2 py-1 text-[9px] font-black text-gray-500 ">
                                  {getCategoryLabel(item.category)}
                                </span>
                                <span className="rounded-full bg-[#FFD200]/20 px-2 py-1 text-[9px] font-black text-[#111111] ">
                                  {item.source === 'PRICE_HISTORY'
                                    ? 'History Only'
                                    : item.source === 'MIXED'
                                      ? 'Master + History'
                                      : 'Master'}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className={`font-mono text-lg font-black ${meta.accent}`}>
                                {money(item.currentCost)}
                              </p>
                              <p className="text-[10px] font-bold text-gray-400">
                                / {item.unit}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-2xl bg-[#F6F7FB] p-2 ">
                              <p className="text-[9px] font-black text-gray-400">
                                上次价格
                              </p>
                              <p className="mt-0.5 truncate font-mono text-xs font-black">
                                {item.lastCost === null ? '-' : money(item.lastCost)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#F6F7FB] p-2 ">
                              <p className="text-[9px] font-black text-gray-400">
                                变动
                              </p>
                              <p
                                className={`mt-0.5 font-mono text-xs font-black ${
                                  item.diff > 0
                                    ? 'text-red-500'
                                    : item.diff < 0
                                      ? 'text-green-600'
                                      : 'text-gray-500'
                                }`}
                              >
                                {item.diff > 0 ? '+' : ''}
                                {item.diff.toFixed(2)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-[#F6F7FB] p-2 ">
                              <p className="text-[9px] font-black text-gray-400">
                                风险分
                              </p>
                              <p className="mt-0.5 font-mono text-xs font-black">
                                {riskScore}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold text-gray-400">
                              <Truck size={12} className="shrink-0" />
                              <span className="truncate">{item.supplierName}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.tone}`}
                              >
                                {meta.label}
                              </span>
                              {isExpanded ? (
                                <ChevronUp size={16} className="text-gray-400" />
                              ) : (
                                <ChevronDown size={16} className="text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-[#FAFAFA] p-4 ">
                        <CostTrendChart
                          history={item.history}
                          unit={item.unit}
                          status={item.status}
                        />

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-3xl border border-gray-100 bg-white p-4 ">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                              Cost Delta
                            </p>
                            <p
                              className={`mt-2 font-mono text-xl font-black ${
                                item.percent > 0
                                  ? 'text-red-500'
                                  : item.percent < 0
                                    ? 'text-green-600'
                                    : 'text-gray-600 '
                              }`}
                            >
                              {item.percent > 0 ? '+' : ''}
                              {item.percent.toFixed(2)}%
                            </p>
                            <p className="mt-1 text-[10px] font-bold text-gray-400">
                              对比 {item.lastDate}
                            </p>
                          </div>

                          <div className="rounded-3xl border border-gray-100 bg-white p-4 ">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                              Diagnosis
                            </p>
                            <p className="mt-2 text-sm font-black text-[#111111] ">
                              {item.status === 'UP' && '成本上涨，需要复查采购价'}
                              {item.status === 'DOWN' && '成本下降，可记录为采购优势'}
                              {item.status === 'SAME' && '价格稳定，可继续观察'}
                              {item.status === 'NO_HISTORY' && '库存有主档，但没有历史记录'}
                              {item.status === 'INSUFFICIENT' && '历史记录不足两个点'}
                              {item.status === 'OUT_OF_RANGE' && '有历史，但不在当前范围内'}
                              {item.status === 'MASTER_MISSING' && '价格历史存在，但库存主档缺失'}
                            </p>
                            <p className="mt-1 text-[10px] font-bold text-gray-400">
                              {item.history.length} price points
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 rounded-3xl border border-gray-100 bg-white p-4 ">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BarChart3 size={15} className="text-gray-400" />
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                                Price History Log
                              </p>
                            </div>
                            <p className="text-[9px] font-bold text-gray-400">
                              错误记录可删除
                            </p>
                          </div>

                          <div className="space-y-2">
                            {item.history
                              .slice()
                              .reverse()
                              .map((point, index) => {
                                const canDelete = Boolean(point.logId);
                                const isLatest = index === 0;

                                return (
                                  <div
                                    key={`${point.date}-${point.logId || index}`}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-[#F6F7FB] p-3 "
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate font-mono text-xs font-black text-[#111111] ">
                                        {isLatest ? '最新 / Current' : point.date}
                                      </p>
                                      <p className="mt-0.5 text-[10px] font-bold text-gray-400">
                                        {point.isCurrent ? '库存主档当前成本' : '进货历史记录'}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <p className="whitespace-nowrap font-mono text-sm font-black">
                                        {money(point.cost)}
                                        <span className="ml-1 text-[10px] text-gray-400">
                                          /{item.unit}
                                        </span>
                                      </p>

                                      {canDelete && (
                                        <button
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            haptic(30);
                                            setDeleteTarget({
                                              itemId: item.id,
                                              itemName: item.name,
                                              logId: point.logId!,
                                              date: point.date,
                                              cost: point.cost,
                                              unit: item.unit,
                                            });
                                          }}
                                          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-300 transition hover:bg-red-50 hover:text-red-500 active:scale-95 "
                                          aria-label="删除价格记录"
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>

                          {item.history.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-gray-200 p-5 text-center ">
                              <p className="text-xs font-bold text-gray-400">
                                暂无历史价格记录
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          )}
        </main>

        {deleteTarget && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm md:items-center md:p-4">
            <div className="w-full overflow-hidden rounded-t-[2rem] bg-white shadow-2xl md:max-w-md md:rounded-[2rem]">
              <div className="border-b border-red-100 bg-red-50 p-5 ">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-white">
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-red-700 ">
                      删除价格记录？
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-400">
                      Delete Price Entry
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-5">
                <div className="rounded-3xl bg-[#F6F7FB] p-4 ">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="font-bold text-gray-400">物品</span>
                    <span className="text-right font-black">{deleteTarget.itemName}</span>
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-xs">
                    <span className="font-bold text-gray-400">日期</span>
                    <span className="font-mono font-black">{deleteTarget.date}</span>
                  </div>
                  <div className="mt-2 flex justify-between gap-3 text-xs">
                    <span className="font-bold text-gray-400">价格</span>
                    <span className="font-mono font-black text-red-500">
                      {money(deleteTarget.cost)} / {deleteTarget.unit}
                    </span>
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-100 bg-orange-50 p-4 ">
                  <p className="text-xs font-bold leading-relaxed text-orange-700 ">
                    删除后会清理该条错误进货价格记录，并重新计算库存成本监控。此操作无法撤销。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                    className="rounded-2xl bg-gray-100 py-3.5 text-sm font-black text-gray-700 transition active:scale-95 disabled:opacity-50 "
                  >
                    取消
                  </button>

                  <button
                    onClick={handleDeleteHistoryEntry}
                    disabled={deleting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 py-3.5 text-sm font-black text-white transition active:scale-95 disabled:opacity-50"
                  >
                    {deleting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        删除中
                      </>
                    ) : (
                      <>
                        <Trash2 size={15} />
                        确认删除
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
