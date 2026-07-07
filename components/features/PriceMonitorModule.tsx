import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    TrendingUp, TrendingDown, Search, X, 
    ArrowUp, ArrowDown, CheckCircle2,
    Truck, Mic, MicOff, ChevronUp, Package,
    Activity, AlertTriangle, BarChart3, Volume2,
    Trash2, RefreshCw, Zap, Clock,
    SlidersHorizontal, RotateCcw, Tag
} from 'lucide-react';
import { DataManager } from '../../utils/dataManager';
import { StockPriceHistory } from '../../types';

interface PriceMonitorModuleProps {
    onClose: () => void;
}

interface PriceHistory {
    date: string;
    cost: number;
    logId?: string;
}

interface PriceChangeItem {
    id: string;
    name: string;
    category: string;
    unit: string;
    currentCost: number;
    lastCost: number;
    diff: number;
    percent: number;
    lastDate: string;
    supplierName: string;
    status: 'UP' | 'DOWN' | 'SAME';
    history: PriceHistory[];
}

type DateRange = '30' | '90' | '180' | 'ALL';
const RANGE_DAYS: Record<DateRange, number | null> = { '30': 30, '90': 90, '180': 180, 'ALL': null };
const RANGE_LABELS: Record<DateRange, string> = { '30': '1M', '90': '3M', '180': '6M', 'ALL': '全部' };
const DEFAULT_RANGE: DateRange = '90';

const CATEGORY_LABELS: Record<string, string> = {
    'FRESH': '生鲜 (Fresh)', 'MEAT': '肉类 (Meat)', 'SEAFOOD': '海鲜 (Seafood)', 'VEG': '蔬果 (Veg)',
    'NOODLE': '面食 (Noodle)', 'SAUCE': '酱料 (Sauce)', 'DRY': '干货 (Dry)', 'HQ': '总店 (HQ)',
    'TEA': '茶叶 (Tea)', 'FRUIT': '水果 (Fruit)', 'RTD': '罐装饮料 (Drinks)',
    'GENERAL': '杂项 (General)', 'FUEL': '燃料 (Fuel)', 'PACKAGING': '包装 (Pack)',
    'CLEANING': '清洁 (Clean)', 'TOOLS': '工具 (Tools)', 'WASTE': '消耗品 (Waste)',
    'DAIRY': '奶制品 (Dairy)', 'BEVERAGE': '饮料 (Beverage)', 'FROZEN': '冷冻 (Frozen)',
    'GRAIN': '谷物 (Grain)', 'SPICE': '香料 (Spice)', 'OIL': '油类 (Oil)',
    'CONDIMENT': '调味品 (Condiment)',
};

const haptic = (pattern: number | number[] = 30) => {
    try { if ('vibrate' in navigator) navigator.vibrate(pattern); } catch {}
};

const getCutoffDate = (daysAgo: number | null): string | undefined => {
    if (daysAgo === null) return undefined;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
};

// ============ Enhanced Price Trend ============
const EnhancedPriceTrend = ({ history, unit, status }: { 
    history: PriceHistory[]; unit: string; status: 'UP' | 'DOWN' | 'SAME';
}) => {
    if (history.length < 2) {
        return (
            <div className="text-xs text-gray-400 py-6 flex items-center justify-center bg-white rounded-xl border border-dashed border-gray-200">
                数据点不足，无法生成趋势 (Insufficient data)
            </div>
        );
    }

    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

    // Default selection to the last (newest) item when history loads or changes
    useEffect(() => {
        setSelectedIdx(history.length - 1);
    }, [history]);

    const color = status === 'UP' ? '#EF4444' : '#10B981';
    
    // Optimized canvas width/height ratio and padding for zero overlap
    const width = 380, height = 175;
    const paddingLeft = 56, paddingRight = 48, paddingTop = 28, paddingBottom = 30;
    const innerWidth = width - paddingLeft - paddingRight;
    const innerHeight = height - paddingTop - paddingBottom;

    const costs = history.map(h => h.cost);
    const max = Math.max(...costs);
    const min = Math.min(...costs);
    const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
    const range = max - min || max * 0.1 || 1;
    const paddedMin = Math.max(0, min - range * 0.2);
    const paddedMax = max + range * 0.2;
    const paddedRange = paddedMax - paddedMin;

    // Strict maximum and minimum first occurrences to prevent overlapping labels!
    const firstMaxIndex = history.findIndex(h => h.cost === max);
    const firstMinIndex = history.findIndex(h => h.cost === min);

    const points = history.map((h, i) => {
        const x = paddingLeft + (i / (history.length - 1)) * innerWidth;
        const y = paddingTop + innerHeight - ((h.cost - paddedMin) / paddedRange) * innerHeight;
        return { 
            x, 
            y, 
            cost: h.cost, 
            date: h.date, 
            isMax: i === firstMaxIndex && max !== min, 
            isMin: i === firstMinIndex && max !== min 
        };
    });

    const yTicks = [0, 0.33, 0.66, 1].map(ratio => ({
        y: paddingTop + innerHeight - ratio * innerHeight,
        value: paddedMin + ratio * paddedRange,
    }));

    const avgY = paddingTop + innerHeight - ((avg - paddedMin) / paddedRange) * innerHeight;
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x},${paddingTop + innerHeight} L ${paddingLeft},${paddingTop + innerHeight} Z`;
    const gradientId = `grad_${Math.random().toString(36).substring(2, 9)}`;
    const volatility = ((max - min) / avg * 100).toFixed(1);
    const totalChange = ((costs[costs.length - 1] - costs[0]) / costs[0] * 100);

    // Active hovered/clicked details
    const activeIdx = selectedIdx !== null && selectedIdx >= 0 && selectedIdx < points.length ? selectedIdx : points.length - 1;
    const activePt = points[activeIdx];
    const itemDate = history[activeIdx].date;
    const itemCost = activePt.cost;

    // Calculate percent deviation of the active point from average
    const deviationFromAvg = avg > 0 ? ((itemCost - avg) / avg * 100) : 0;

    // Categorized stability rating based on Volatility
    const volNum = parseFloat(volatility);
    let stabilityRating = "稳健 (Stable)";
    let stabilityColor = "bg-green-100 text-green-800 border-green-200";
    if (volNum > 25) {
        stabilityRating = "高频率波动 (High Volatility)";
        stabilityColor = "bg-red-100 text-red-800 border-red-200 animate-pulse";
    } else if (volNum > 10) {
        stabilityRating = "中度浮动 (Moderate)";
        stabilityColor = "bg-orange-100 text-orange-850 border-orange-200";
    }

    return (
        <div className="bg-white rounded-2xl p-3 md:p-4 border border-gray-100 shadow-sm space-y-3 md:space-y-4">
            {/* 顶栏：简易专业标签 */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">价格走势健康度:</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${stabilityColor}`}>
                        {stabilityRating}
                    </span>
                </div>
                <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                    <Clock size={10}/>
                    <span>滑动或点击点位查看分析</span>
                </div>
            </div>

            {/* SVG 趋势图线区 - 移除 min-width 防止手机端拉伸变形 */}
            <div className="relative">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                            <stop offset="50%" stopColor={color} stopOpacity="0.08" />
                            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                        </linearGradient>
                    </defs>

                    {/* Y 轴刻度背景线 */}
                    {yTicks.map((tick, i) => (
                        <g key={`y-${i}`}>
                            <line x1={paddingLeft} y1={tick.y} x2={width - paddingRight} y2={tick.y}
                                stroke="#F3F4F6" strokeWidth="1"
                                strokeDasharray={i === 0 || i === 3 ? '0' : '3,3'} />
                            <text x={paddingLeft - 8} y={tick.y + 3.5} textAnchor="end" className="fill-gray-400 select-none font-mono"
                                style={{ fontSize: '9px', fontWeight: 600 }}>
                                {tick.value.toFixed(2)}
                            </text>
                        </g>
                    ))}

                    {/* 均线 (AVG Line) */}
                    <line x1={paddingLeft} y1={avgY} x2={width - paddingRight} y2={avgY}
                        stroke="#9CA3AF" strokeWidth="1" strokeDasharray="4,4" opacity="0.45" />
                    <text x={width - paddingRight - 4} y={avgY - 4} textAnchor="end" className="fill-gray-400 select-none font-mono"
                        style={{ fontSize: '8.5px', fontWeight: 700 }}>
                        AVG RM {avg.toFixed(2)}
                    </text>

                    {/* 区域阴影与主要折线 */}
                    <path d={areaPath} fill={`url(#${gradientId})`} />
                    <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                    {/* 选中的点位的关联虚线 (Focus Dotted Line) */}
                    {selectedIdx !== null && activePt && (
                        <g>
                            <line x1={activePt.x} y1={paddingTop} x2={activePt.x} y2={paddingTop + innerHeight}
                                stroke={color} strokeWidth="1" strokeDasharray="2,2" opacity="0.6"/>
                            <circle cx={activePt.x} cy={activePt.y} r="7" fill={color} opacity="0.15" />
                        </g>
                    )}

                    {/* 唯一极值标签渲染 (依据索引动态调整对齐参数，绝不越界、绝不碰触刻度值) */}
                    {points.map((p, i) => {
                        const isCurrentActive = selectedIdx === i;
                        // 头尾采用两侧偏置对齐，中央点用居中对齐，杜绝与左侧刻度和右侧底边重叠
                        const align: { anchor: "start" | "middle" | "end"; dx: number } = i === 0 
                            ? { anchor: "start", dx: 6 } 
                            : i === points.length - 1 
                                ? { anchor: "end", dx: -6 } 
                                : { anchor: "middle", dx: 0 };

                        return (
                            <g key={`pt-${i}`}>
                                {p.isMax && (
                                    <g>
                                        <circle cx={p.x} cy={p.y} r="8" fill="#EF4444" opacity="0.1" />
                                        <text 
                                            x={p.x} 
                                            y={p.y - 12} 
                                            dx={align.dx}
                                            textAnchor={align.anchor} 
                                            fill="#EF4444"
                                            className="font-black select-none font-sans"
                                            style={{ fontSize: '8.5px', fontWeight: 900 }}
                                        >
                                            ▲ MAX {p.cost.toFixed(2)}
                                        </text>
                                    </g>
                                )}
                                {p.isMin && (
                                    <g>
                                        <circle cx={p.x} cy={p.y} r="8" fill="#10B981" opacity="0.1" />
                                        <text 
                                            x={p.x} 
                                            y={p.y + 16} 
                                            dx={align.dx}
                                            textAnchor={align.anchor} 
                                            fill="#10B981"
                                            className="font-black select-none font-sans"
                                            style={{ fontSize: '8.5px', fontWeight: 900 }}
                                        >
                                            ▼ MIN {p.cost.toFixed(2)}
                                        </text>
                                    </g>
                                )}

                                {/* 点位圆圈 */}
                                <circle 
                                    cx={p.x} 
                                    cy={p.y} 
                                    r={isCurrentActive ? 5 : 3.5}
                                    fill={isCurrentActive ? color : "white"} 
                                    stroke={color} 
                                    strokeWidth={isCurrentActive ? 2 : 1.5} 
                                />

                                {/* 隐藏的高触控半径圆圈 (让移动端及PC极易点击) */}
                                <circle 
                                    cx={p.x} 
                                    cy={p.y} 
                                    r="16" 
                                    fill="transparent" 
                                    className="cursor-pointer"
                                    onClick={() => {
                                        haptic(20);
                                        setSelectedIdx(i);
                                    }}
                                    onMouseEnter={() => setSelectedIdx(i)}
                                />
                            </g>
                        );
                    })}

                    {/* X 轴日期刻度标签（头、尾、中） */}
                    {[0, Math.floor(points.length / 2), points.length - 1].map(idx => {
                        if (idx >= points.length) return null;
                        const p = points[idx];
                        const label = history[idx].date.replace('当前 (Now)', 'Now').slice(-5);
                        return (
                            <text key={`x-${idx}`} x={p.x} y={height - 6}
                                textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
                                className="fill-gray-400 font-mono font-bold select-none"
                                style={{ fontSize: '8.5px' }}>
                                {label}
                            </text>
                        );
                    })}
                </svg>
            </div>

            {/* 💡精致 HUD：选中的点位的交互明细和深度分析 (包含移动端触碰反馈) */}
            <div className="bg-gray-50/80 rounded-2xl p-3.5 border border-gray-100/80 shadow-inner">
                <div className="flex justify-between items-center mb-2.5">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-3.5 bg-indigo-500 rounded-full"></div>
                        <h5 className="text-[11px] font-black text-gray-700 tracking-wider">点位深度分析 (Selected HUD)</h5>
                    </div>
                    <span className="text-[9px] font-mono text-gray-400 border border-gray-100 bg-white px-2 py-0.5 rounded-full">
                        批次 {activeIdx + 1}/{points.length}
                    </span>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex flex-col justify-between">
                        <span className="text-[8px] text-gray-400 font-bold block">入账日期</span>
                        <span className="text-xs font-black text-gray-800 font-mono block mt-0.5 truncate">{itemDate}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex flex-col justify-between">
                        <span className="text-[8px] text-gray-400 font-bold block">进货单价</span>
                        <span className="text-xs font-black text-[#1A1A1A] font-mono block mt-0.5 whitespace-nowrap">
                            RM <span className="text-sm font-black text-indigo-600">{itemCost.toFixed(2)}</span>
                            <span className="text-[8.5px] text-gray-400 font-black">/{unit}</span>
                        </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-gray-100 flex flex-col justify-between">
                        <span className="text-[8px] text-gray-400 font-bold block">浮动偏离度</span>
                        <span className={`text-xs font-black font-mono block mt-0.5 truncate ${
                            deviationFromAvg > 0 ? 'text-red-500 font-extrabold' : deviationFromAvg < 0 ? 'text-green-600 font-extrabold' : 'text-gray-500'
                        }`}>
                            {deviationFromAvg > 0 ? '+' : ''}{deviationFromAvg.toFixed(1)}% {deviationFromAvg > 0 ? '🔺' : deviationFromAvg < 0 ? '🟢' : '➖'}
                        </span>
                    </div>
                </div>
            </div>

            {/* 底部 4 列极值和平均数大盘统计 */}
            <div className="grid grid-cols-4 gap-2 pt-1">
                <div className="text-center p-2.5 bg-red-50/30 rounded-xl border border-red-100/20">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">周期最高</p>
                    <p className="text-xs font-black font-mono text-red-500 mt-0.5">RM {max.toFixed(2)}</p>
                </div>
                <div className="text-center p-2.5 bg-green-50/30 rounded-xl border border-green-100/20">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">周期最低</p>
                    <p className="text-xs font-black font-mono text-green-500 mt-0.5">RM {min.toFixed(2)}</p>
                </div>
                <div className="text-center p-2.5 bg-gray-50/50 rounded-xl border border-gray-100/50">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">全期平均</p>
                    <p className="text-xs font-black font-mono text-gray-700 mt-0.5">RM {avg.toFixed(2)}</p>
                </div>
                <div className="text-center p-2.5 bg-orange-50/30 rounded-xl border border-orange-100/20">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">波动幅度</p>
                    <p className={`text-xs font-black font-mono mt-0.5 ${parseFloat(volatility) > 15 ? 'text-orange-600 font-black' : 'text-gray-700'}`}>
                        {volatility}%
                    </p>
                </div>
            </div>

            {/* Total change badge */}
            <div className={`px-3 py-2.5 rounded-xl flex items-center justify-between border ${
                totalChange > 0 
                ? 'bg-red-50/40 border-red-100 text-red-800' 
                : totalChange < 0 
                ? 'bg-green-50/40 border-green-100 text-green-800' 
                : 'bg-gray-50 border-gray-100 text-gray-700'
            }`}>
                <div className="flex items-center gap-1.5">
                    <Activity size={12} className={totalChange > 0 ? 'text-red-500' : 'text-green-500'} />
                    <span className="text-[10.5px] font-bold">区间累计变动 (Total Delta):</span>
                </div>
                <span className={`text-xs font-black font-mono ${totalChange > 0 ? 'text-red-600' : totalChange < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {totalChange > 0 ? '价格上涨 +' : totalChange < 0 ? '价格下调 ' : ''}{totalChange.toFixed(2)}%
                </span>
            </div>
        </div>
    );
};

export const PriceMonitorModule: React.FC<PriceMonitorModuleProps> = ({ onClose }) => {
    const [loading, setLoading] = useState(true);
    const [analysisData, setAnalysisData] = useState<PriceChangeItem[]>([]);
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'UP' | 'DOWN'>('ALL');
    const [filterCategory, setFilterCategory] = useState<string>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    
    const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE);
    const [scannedItemsCount, setScannedItemsCount] = useState(0);
    const [readsCount, setReadsCount] = useState(0);
    
    // 👑 V4 新增：抽屉状态
    const [drawerOpen, setDrawerOpen] = useState(false);
    
    const cacheRef = useRef<Record<DateRange, PriceChangeItem[] | undefined>>({
        '30': undefined, '90': undefined, '180': undefined, 'ALL': undefined
    });
    const cacheCountRef = useRef<Record<DateRange, { items: number; reads: number }>>({
        '30': { items: 0, reads: 0 }, '90': { items: 0, reads: 0 },
        '180': { items: 0, reads: 0 }, 'ALL': { items: 0, reads: 0 }
    });
    
    const [isListening, setIsListening] = useState(false);
    const [interimText, setInterimText] = useState('');
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<{
        itemId: string; itemName: string; logId: string; date: string; cost: number; unit: string;
    } | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [showScrollTop, setShowScrollTop] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const hasInitLoadedRef = useRef(false);

    useEffect(() => {
        if (!hasInitLoadedRef.current) {
            hasInitLoadedRef.current = true;
            loadAndAnalyze(dateRange);
        }
        return () => {
            if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
            if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (!hasInitLoadedRef.current) return;
        const cached = cacheRef.current[dateRange];
        if (cached) {
            setAnalysisData(cached);
            setScannedItemsCount(cacheCountRef.current[dateRange].items);
            setReadsCount(cacheCountRef.current[dateRange].reads);
            setLoading(false);
        } else {
            loadAndAnalyze(dateRange);
        }
    }, [dateRange]);

    const loadAndAnalyze = async (range: DateRange, forceRefresh = false) => {
        if (!forceRefresh && cacheRef.current[range]) {
            setAnalysisData(cacheRef.current[range]!);
            setScannedItemsCount(cacheCountRef.current[range].items);
            setReadsCount(cacheCountRef.current[range].reads);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const daysAgo = RANGE_DAYS[range];
            const cutoffDate = getCutoffDate(daysAgo);
            
            const [kStock, bStock, gStock, fStock, priceHistories, suppliers] = await Promise.all([
                DataManager.getStock('KITCHEN'), DataManager.getStock('BAR'),
                DataManager.getStock('GENERAL'), DataManager.getStock('FUEL'),
                DataManager.getRecentPriceChanges(cutoffDate),
                DataManager.getSuppliers()
            ]);
            
            const allStock = [...kStock, ...bStock, ...gStock, ...fStock];
            const stockMap = new Map(allStock.map((s: any) => [s.id, s]));
            const estimatedReads = allStock.length + priceHistories.length + suppliers.length;

            const results: PriceChangeItem[] = [];

            (priceHistories as StockPriceHistory[]).forEach(hist => {
                const item = stockMap.get(hist.stockId) as any;
                if (!item) return;
                
                const entries = (hist.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date));
                if (entries.length === 0) return;
                
                const history: PriceHistory[] = entries.map(e => ({
                    date: e.date, cost: e.cost, logId: e.sourceLogId
                }));
                
                const lastEntry = history[history.length - 1];
                if (!lastEntry || lastEntry.cost !== item.cost) {
                    history.push({ date: '当前 (Now)', cost: item.cost });
                }
                
                if (history.length < 2) return;
                
                const lastCost = history[history.length - 1].cost;
                const prevCost = history[history.length - 2].cost;
                const diff = lastCost - prevCost;
                const percent = prevCost > 0 ? (diff / prevCost) * 100 : 0;
                
                let status: 'UP' | 'DOWN' | 'SAME' = 'SAME';
                if (diff > 0.001) status = 'UP';
                else if (diff < -0.001) status = 'DOWN';
                
                if (status === 'SAME') return;
                
                const supplier = (suppliers as any[]).find(s => 
                    s.catalog?.some((c: any) => c.linkedStockId === item.id)
                );
                
                results.push({
                    id: item.id, name: item.name, category: item.category,
                    unit: item.unit || 'Unit',
                    currentCost: lastCost, lastCost: prevCost, diff, percent,
                    lastDate: history[history.length - 2].date,
                    supplierName: supplier?.name || '未绑定供应商',
                    status, history
                });
            });

            const sorted = results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
            
            cacheRef.current[range] = sorted;
            cacheCountRef.current[range] = { items: priceHistories.length, reads: estimatedReads };
            
            setAnalysisData(sorted);
            setScannedItemsCount(priceHistories.length);
            setReadsCount(estimatedReads);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        haptic([20, 50, 20]);
        cacheRef.current = { '30': undefined, '90': undefined, '180': undefined, 'ALL': undefined };
        await loadAndAnalyze(dateRange, true);
    };

    const handleDeleteHistoryEntry = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await DataManager.removeWrongPriceRecord(deleteTarget.logId, deleteTarget.itemId);
            haptic([30, 50, 30]);
            cacheRef.current = { '30': undefined, '90': undefined, '180': undefined, 'ALL': undefined };
            setDeleteTarget(null);
            await loadAndAnalyze(dateRange, true);
        } catch (e) {
            console.error(e);
            alert('删除失败 (Delete failed)：' + (e as Error).message);
        } finally {
            setDeleting(false);
        }
    };

    const handleVoiceSearch = () => {
        if (isListening && recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch {}
            return;
        }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setVoiceError('您的浏览器不支持语音输入\n请使用 iOS Safari (HTTPS) 或 Chrome');
            setTimeout(() => setVoiceError(null), 3500);
            return;
        }
        try {
            haptic([30, 50, 30]);
            setIsListening(true);
            setInterimText('');
            setVoiceError(null);
            const recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.interimResults = true;
            recognition.continuous = false;
            recognition.maxAlternatives = 1;
            recognitionRef.current = recognition;
            voiceTimeoutRef.current = setTimeout(() => {
                try { recognition.stop(); } catch {}
            }, 8000);
            recognition.onresult = (event: any) => {
                let finalText = '', interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) finalText += transcript;
                    else interim += transcript;
                }
                if (interim) setInterimText(interim);
                if (finalText) {
                    setSearchTerm(finalText.replace(/[。，、！？.,!?\s]/g, ''));
                    setInterimText('');
                    haptic(80);
                }
            };
            recognition.onerror = (event: any) => {
                const errMap: Record<string, string> = {
                    'no-speech': '没有检测到语音 (No speech)',
                    'audio-capture': '麦克风无法访问 (Mic blocked)',
                    'not-allowed': '请允许麦克风权限 (Permission denied)',
                    'network': '网络错误 (Network error)',
                };
                setVoiceError(errMap[event.error] || `识别错误: ${event.error}`);
                setIsListening(false);
                setInterimText('');
                setTimeout(() => setVoiceError(null), 3000);
                haptic([100, 50, 100]);
            };
            recognition.onend = () => {
                setIsListening(false);
                setInterimText('');
                if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
            };
            recognition.start();
        } catch {
            setIsListening(false);
            setVoiceError('启动语音识别失败');
            setTimeout(() => setVoiceError(null), 2500);
        }
    };

    const handleScroll = () => {
        if (scrollContainerRef.current) {
            setShowScrollTop(scrollContainerRef.current.scrollTop > 300);
        }
    };

    const scrollToTop = () => {
        haptic(20);
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const filteredList = useMemo(() => {
        return analysisData.filter(item => {
            const matchesSearch = !searchTerm || 
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.supplierName.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
            const matchesCat = filterCategory === 'ALL' || item.category === filterCategory;
            return matchesSearch && matchesStatus && matchesCat;
        });
    }, [analysisData, searchTerm, filterStatus, filterCategory]);

    const uniqueCategories = useMemo(() => 
        ['ALL', ...Array.from(new Set(analysisData.map(i => i.category)))],
        [analysisData]
    );

    const stats = useMemo(() => ({
        up: analysisData.filter(i => i.status === 'UP').length,
        down: analysisData.filter(i => i.status === 'DOWN').length,
        total: analysisData.length,
    }), [analysisData]);

    // 👑 V4 新增：是否有任何激活的筛选（非默认）
    const hasActiveFilters = useMemo(() => 
        searchTerm !== '' || 
        filterStatus !== 'ALL' || 
        filterCategory !== 'ALL' ||
        dateRange !== DEFAULT_RANGE,
        [searchTerm, filterStatus, filterCategory, dateRange]
    );

    // 👑 V4 新增：一键重置筛选
    const resetAllFilters = () => {
        haptic([20, 30, 20]);
        setSearchTerm('');
        setFilterStatus('ALL');
        setFilterCategory('ALL');
        setDateRange(DEFAULT_RANGE);
    };

    const openDrawer = () => { haptic(15); setDrawerOpen(true); };
    const closeDrawer = () => { haptic(15); setDrawerOpen(false); };

    // 👑 FAB 徽章显示的数字
    const fabBadgeNumber = filteredList.length;
    const fabBadgeText = fabBadgeNumber > 99 ? '99+' : String(fabBadgeNumber);

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center md:p-4 backdrop-blur-sm animate-in zoom-in duration-200">
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-4xl md:h-[90vh] md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative font-sans">
                
                {/* ============ 顶部黑栏（极简化） ============ */}
                <div className="bg-[#1A1A1A] px-5 pb-4 pt-[max(env(safe-area-inset-top,20px),1.25rem)] flex justify-between items-center text-white shrink-0 shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD700] text-black p-2.5 rounded-xl shadow-[0_0_15px_rgba(255,215,0,0.4)]">
                            <TrendingUp size={20}/>
                        </div>
                        <div>
                            <h3 className="font-black text-lg tracking-wide">库存成本监控</h3>
                            <p className="text-[9px] text-gray-400 font-mono uppercase mt-0.5 tracking-[0.2em]">
                                Cost Monitor · v4
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleRefresh} disabled={loading}
                            className="p-3 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
                            aria-label="刷新数据">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''}/>
                        </button>
                        <button onClick={() => { haptic(20); onClose(); }} 
                            className="p-3 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                            <X size={20}/>
                        </button>
                    </div>
                </div>

                {/* ============ 主列表区（占满剩余空间） ============ */}
                <div ref={scrollContainerRef} onScroll={handleScroll}
                    className="flex-grow overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom,20px)+6rem)] space-y-3 bg-[#F5F7FA] overscroll-contain">
                    
                    {/* 👑 极简头部状态条 - 仅显示关键信息 */}
                    {!loading && (
                        <div className="bg-white px-3 py-2 rounded-xl border border-gray-200 flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] font-black bg-[#1A1A1A] text-[#FFD700] px-2 py-1 rounded-md whitespace-nowrap">
                                    {RANGE_LABELS[dateRange]}
                                </span>
                                <span className="text-[11px] text-gray-600 font-bold truncate">
                                    显示 <span className="font-black text-[#1A1A1A]">{filteredList.length}</span> / {analysisData.length} 个商品
                                </span>
                            </div>
                            {hasActiveFilters && (
                                <button 
                                    onClick={resetAllFilters}
                                    className="text-[10px] font-black text-blue-600 underline whitespace-nowrap ml-2 px-2 py-1 active:bg-blue-50 rounded"
                                >
                                    清空筛选
                                </button>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1A1A1A] mb-4"></div>
                            <p className="text-sm font-bold animate-pulse">分析价格历史中...</p>
                            <p className="text-[10px] text-gray-300 mt-1 font-mono">
                                {RANGE_LABELS[dateRange]} · price_history
                            </p>
                        </div>
                    ) : filteredList.length === 0 ? (
                        <div className="py-20 text-center flex flex-col items-center opacity-70">
                            <CheckCircle2 size={48} className="text-gray-400 mb-3"/>
                            <p className="text-gray-500 font-bold mb-2">
                                {hasActiveFilters ? '没有匹配的商品' : '没有检测到价格波动'}
                            </p>
                            <p className="text-[11px] text-gray-400 mb-4">
                                {hasActiveFilters ? 'No items match current filters' : 'No price fluctuations in range'}
                            </p>
                            {hasActiveFilters ? (
                                <button onClick={resetAllFilters}
                                    className="px-4 py-2 bg-[#1A1A1A] text-[#FFD700] rounded-xl text-xs font-black flex items-center gap-1.5">
                                    <RotateCcw size={12}/>
                                    清空所有筛选 (Reset)
                                </button>
                            ) : dateRange !== 'ALL' && (
                                <button onClick={() => { haptic(15); setDateRange('ALL'); }}
                                    className="px-4 py-2 bg-[#1A1A1A] text-[#FFD700] rounded-xl text-xs font-black">
                                    扩大到全部范围 (Expand to All)
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredList.map(item => (
                            <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                                <button onClick={() => { haptic(15); setExpandedId(expandedId === item.id ? null : item.id); }}
                                    className="w-full p-4 flex items-center gap-3 active:bg-gray-50 transition-colors text-left min-h-[76px]">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shrink-0 shadow-inner ${
                                        item.status === 'UP' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-600 border border-green-100'
                                    }`}>
                                        {item.status === 'UP' ? <TrendingUp size={24}/> : <TrendingDown size={24}/>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h4 className="font-black text-[#1A1A1A] text-[15px] truncate max-w-full">{item.name}</h4>
                                            <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
                                                {CATEGORY_LABELS[item.category] || item.category}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium mt-1">
                                            <Truck size={12} className="shrink-0"/> 
                                            <span className="truncate">{item.supplierName}</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="flex items-baseline justify-end gap-1">
                                            <span className={`text-lg font-black font-mono tracking-tight ${item.status === 'UP' ? 'text-red-600' : 'text-green-600'}`}>
                                                RM{item.currentCost.toFixed(2)}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">/{item.unit}</span>
                                        </div>
                                        <div className={`text-[11px] font-black flex items-center justify-end gap-0.5 mt-0.5 ${item.status === 'UP' ? 'text-red-500' : 'text-green-500'}`}>
                                            {item.status === 'UP' ? <ArrowUp size={10}/> : <ArrowDown size={10}/>}
                                            {Math.abs(item.diff).toFixed(2)} ({item.percent.toFixed(1)}%)
                                        </div>
                                    </div>
                                </button>

                                {expandedId === item.id && (
                                    <div className="bg-[#FAFAFA] border-t border-gray-100 p-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="mb-4">
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-1.5">
                                                    <BarChart3 size={14} className="text-gray-500"/>
                                                    <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase">
                                                        历史价格走势 (Price Trend)
                                                    </p>
                                                </div>
                                                <p className="text-[9px] text-gray-400 font-mono">{item.history.length} pts</p>
                                            </div>
                                            <EnhancedPriceTrend history={item.history} unit={item.unit} status={item.status}/>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 mb-2">
                                                <Package size={14} className="text-gray-500"/>
                                                <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase">
                                                    变动明细 (Change Log)
                                                </p>
                                                <span className="text-[9px] text-gray-400 ml-auto">点击垃圾桶删除错误记录</span>
                                            </div>
                                            {item.history.slice().reverse().map((hist, idx) => {
                                                const isCurrent = idx === 0;
                                                const canDelete = !isCurrent && hist.logId;
                                                return (
                                                    <div key={`${idx}-${hist.logId || 'cur'}`}
                                                        className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                        <span className={`font-mono text-xs font-bold ${isCurrent ? 'text-[#1A1A1A]' : 'text-gray-500'}`}>
                                                            {isCurrent ? '🕒 最新 (Current)' : hist.date}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-mono text-sm font-black ${
                                                                isCurrent ? (item.status === 'UP' ? 'text-red-600' : 'text-green-600') : 'text-gray-600'
                                                            }`}>
                                                                RM {hist.cost.toFixed(2)} 
                                                                <span className="text-[10px] text-gray-400 ml-0.5">/{item.unit}</span>
                                                            </span>
                                                            {canDelete && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        haptic(30);
                                                                        setDeleteTarget({
                                                                            itemId: item.id, itemName: item.name,
                                                                            logId: hist.logId!, date: hist.date,
                                                                            cost: hist.cost, unit: item.unit,
                                                                        });
                                                                    }}
                                                                    className="p-2 -m-1 text-gray-300 hover:text-red-500 hover:bg-red-50 active:bg-red-100 rounded-lg transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
                                                                    aria-label="删除此价格记录">
                                                                    <Trash2 size={14}/>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <p className="text-[10px] text-gray-400 italic pt-1 px-1">
                                                💡 删除会同时清理进货记录和价格历史（无法撤销）
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* ============ FAB 组（右下角竖排） ============ */}
                {!drawerOpen && (
                    <>
                        {/* 回顶 FAB - 仅滚动时出现 */}
                        {showScrollTop && (
                            <button onClick={scrollToTop}
                                className="absolute right-5 w-12 h-12 bg-white border border-gray-200 text-gray-700 rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-20 animate-in fade-in slide-in-from-bottom-2"
                                style={{ bottom: 'calc(env(safe-area-inset-bottom, 20px) + 6.5rem)' }}
                                aria-label="回到顶部">
                                <ChevronUp size={20}/>
                            </button>
                        )}

                        {/* 筛选 FAB - 常驻 */}
                        <button onClick={openDrawer}
                            className={`absolute right-5 w-16 h-16 bg-[#1A1A1A] text-[#FFD700] rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-all z-20 ${
                                hasActiveFilters ? 'ring-4 ring-[#FFD700]/40 animate-pulse-slow' : ''
                            }`}
                            style={{ bottom: 'calc(env(safe-area-inset-bottom, 20px) + 1.5rem)' }}
                            aria-label="打开筛选">
                            <SlidersHorizontal size={24}/>
                            
                            {/* 徽章：显示当前列表条数 */}
                            <span className={`absolute -top-1 -right-1 min-w-[26px] h-[26px] px-1.5 ${
                                hasActiveFilters ? 'bg-[#FFD700] text-black' : 'bg-white text-[#1A1A1A]'
                            } rounded-full text-[11px] font-black flex items-center justify-center shadow-md border-2 border-[#1A1A1A]`}>
                                {fabBadgeText}
                            </span>

                            {/* 激活筛选时左上角小红点 */}
                            {hasActiveFilters && (
                                <span className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1A1A1A]">
                                    <span className="absolute inset-0 bg-red-400 rounded-full animate-ping"/>
                                </span>
                            )}
                        </button>
                    </>
                )}

                {/* ============ 底部抽屉 ============ */}
                {drawerOpen && (
                    <div className="absolute inset-0 z-30 flex items-end animate-in fade-in duration-150">
                        {/* 半透明遮罩 */}
                        <div onClick={closeDrawer} className="absolute inset-0 bg-black/50"/>
                        
                        {/* 抽屉本体 */}
                        <div className="relative w-full bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh] animate-in slide-in-from-bottom duration-300">
                            
                            {/* 拖拽手柄（点击关闭）*/}
                            <button onClick={closeDrawer} className="w-full flex justify-center pt-3 pb-1 active:bg-gray-50/50">
                                <div className="w-12 h-1.5 bg-gray-300 rounded-full"/>
                            </button>
                            
                            {/* 抽屉头部 */}
                            <div className="px-5 pb-3 flex items-center justify-between border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <SlidersHorizontal size={18} className="text-[#1A1A1A]"/>
                                    <div>
                                        <h3 className="font-black text-base text-[#1A1A1A]">筛选与设置</h3>
                                        <p className="text-[9px] text-gray-400 font-mono uppercase tracking-widest">
                                            Filters & Settings
                                        </p>
                                    </div>
                                </div>
                                <button onClick={closeDrawer}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 rounded-full min-w-[40px] min-h-[40px] flex items-center justify-center">
                                    <X size={18}/>
                                </button>
                            </div>

                            {/* 抽屉内容（可滚动）*/}
                            <div className="overflow-y-auto px-5 py-4 space-y-5 pb-[calc(env(safe-area-inset-bottom,20px)+1.5rem)]">
                                
                                {/* === 搜索 === */}
                                <div>
                                    <div className="flex gap-2">
                                        <div className="relative flex-grow">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                                            <input type="text" 
                                                placeholder="搜索食材或供应商... (Search)" 
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                                autoFocus
                                                className="w-full pl-10 pr-9 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-[#FFD700] focus:border-[#FFD700] outline-none transition-all"
                                                style={{ fontSize: '16px' }} />
                                            {searchTerm && (
                                                <button onClick={() => { haptic(20); setSearchTerm(''); }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition-colors">
                                                    <X size={14} className="text-gray-400"/>
                                                </button>
                                            )}
                                        </div>
                                        <button onClick={handleVoiceSearch}
                                            className={`p-3 rounded-xl border transition-all flex items-center justify-center min-w-[48px] min-h-[48px] shadow-sm relative ${
                                                isListening ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 active:bg-gray-100'
                                            }`}
                                            aria-label={isListening ? '停止录音' : '语音搜索'}>
                                            {isListening ? (
                                                <>
                                                    <MicOff size={20} />
                                                    <span className="absolute inset-0 rounded-xl border-2 border-red-400 animate-ping opacity-75"></span>
                                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-pulse"></span>
                                                </>
                                            ) : <Mic size={20} />}
                                        </button>
                                    </div>

                                    {(isListening || interimText) && (
                                        <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 animate-in slide-in-from-top-1">
                                            <Volume2 size={14} className="text-red-500 animate-pulse shrink-0"/>
                                            <span className="text-xs font-bold text-red-700 flex-1">
                                                {interimText ? `识别中: ${interimText}` : '正在聆听... (Listening)'}
                                            </span>
                                        </div>
                                    )}

                                    {voiceError && (
                                        <div className="mt-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-2">
                                            <AlertTriangle size={14} className="text-orange-500 shrink-0"/>
                                            <span className="text-xs font-bold text-orange-700 whitespace-pre-line">{voiceError}</span>
                                        </div>
                                    )}
                                </div>

                                {/* === 扫描范围 - 大号 Segmented Control === */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Clock size={14} className="text-gray-400"/>
                                        <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase">
                                            扫描范围 Scan Range
                                        </p>
                                    </div>
                                    <div className="bg-gray-100 rounded-2xl p-1.5 flex gap-1 relative">
                                        {(Object.keys(RANGE_LABELS) as DateRange[]).map(r => (
                                            <button key={r}
                                                onClick={() => { haptic(15); setDateRange(r); }}
                                                className={`flex-1 py-3.5 rounded-xl text-sm font-black transition-all relative z-10 ${
                                                    dateRange === r 
                                                        ? 'bg-[#1A1A1A] text-[#FFD700] shadow-md' 
                                                        : 'text-gray-500 active:bg-white/50'
                                                }`}>
                                                {RANGE_LABELS[r]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* === 价格趋势 - 可点击的统计卡片 === */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Activity size={14} className="text-gray-400"/>
                                        <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase">
                                            价格趋势 Status
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {/* 全部 */}
                                        <button onClick={() => { haptic(15); setFilterStatus('ALL'); }}
                                            className={`p-3 rounded-2xl border-2 transition-all min-h-[78px] relative ${
                                                filterStatus === 'ALL' 
                                                    ? 'bg-[#1A1A1A] border-[#FFD700] shadow-lg' 
                                                    : 'bg-white border-gray-200 active:bg-gray-50'
                                            }`}>
                                            <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${
                                                filterStatus === 'ALL' ? 'text-gray-400' : 'text-gray-500'
                                            }`}>
                                                总波动 Total
                                            </p>
                                            <p className={`text-2xl font-black font-mono leading-none ${
                                                filterStatus === 'ALL' ? 'text-[#FFD700]' : 'text-gray-700'
                                            }`}>
                                                {stats.total}
                                            </p>
                                            {filterStatus === 'ALL' && (
                                                <CheckCircle2 size={14} className="absolute top-2 right-2 text-[#FFD700]"/>
                                            )}
                                        </button>

                                        {/* 涨价 */}
                                        <button onClick={() => { haptic(15); setFilterStatus('UP'); }}
                                            className={`p-3 rounded-2xl border-2 transition-all min-h-[78px] relative ${
                                                filterStatus === 'UP' 
                                                    ? 'bg-red-500 border-red-300 shadow-lg shadow-red-200' 
                                                    : 'bg-red-50 border-red-100 active:bg-red-100'
                                            }`}>
                                            <p className={`text-[9px] font-black uppercase tracking-wider mb-1 flex items-center gap-0.5 ${
                                                filterStatus === 'UP' ? 'text-red-100' : 'text-red-600'
                                            }`}>
                                                <ArrowUp size={10}/>涨 Up
                                            </p>
                                            <p className={`text-2xl font-black font-mono leading-none ${
                                                filterStatus === 'UP' ? 'text-white' : 'text-red-600'
                                            }`}>
                                                {stats.up}
                                            </p>
                                            {filterStatus === 'UP' && (
                                                <CheckCircle2 size={14} className="absolute top-2 right-2 text-white"/>
                                            )}
                                        </button>

                                        {/* 降价 */}
                                        <button onClick={() => { haptic(15); setFilterStatus('DOWN'); }}
                                            className={`p-3 rounded-2xl border-2 transition-all min-h-[78px] relative ${
                                                filterStatus === 'DOWN' 
                                                    ? 'bg-green-500 border-green-300 shadow-lg shadow-green-200' 
                                                    : 'bg-green-50 border-green-100 active:bg-green-100'
                                            }`}>
                                            <p className={`text-[9px] font-black uppercase tracking-wider mb-1 flex items-center gap-0.5 ${
                                                filterStatus === 'DOWN' ? 'text-green-100' : 'text-green-600'
                                            }`}>
                                                <ArrowDown size={10}/>降 Down
                                            </p>
                                            <p className={`text-2xl font-black font-mono leading-none ${
                                                filterStatus === 'DOWN' ? 'text-white' : 'text-green-600'
                                            }`}>
                                                {stats.down}
                                            </p>
                                            {filterStatus === 'DOWN' && (
                                                <CheckCircle2 size={14} className="absolute top-2 right-2 text-white"/>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* === 分类 === */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Tag size={14} className="text-gray-400"/>
                                        <p className="text-[10px] font-black text-gray-500 tracking-widest uppercase">
                                            分类 Category
                                        </p>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                                        {uniqueCategories.map(cat => (
                                            <button key={cat}
                                                onClick={() => { haptic(15); setFilterCategory(cat); }}
                                                className={`whitespace-nowrap px-4 py-2.5 rounded-full text-[11px] font-bold transition-all min-h-[40px] ${
                                                    filterCategory === cat 
                                                        ? 'bg-[#FFD700] text-black shadow-sm ring-2 ring-[#FFD700] ring-offset-1' 
                                                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 active:bg-gray-100'
                                                }`}>
                                                {cat === 'ALL' ? '所有分类 (All)' : (CATEGORY_LABELS[cat] || cat)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* === Firestore 流量信息（小字脚注）=== */}
                                {!loading && (
                                    <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
                                        <Zap size={12} className="text-green-700 shrink-0"/>
                                        <span className="text-[10px] font-bold text-green-800 flex-1">
                                            已扫描 <span className="font-black font-mono">{scannedItemsCount}</span> 个商品 · 仅 <span className="font-black font-mono">{readsCount}</span> 次 Firestore 读取
                                        </span>
                                    </div>
                                )}

                                {/* === 清空筛选 + 确认 === */}
                                <div className="flex gap-2 pt-1">
                                    {hasActiveFilters && (
                                        <button onClick={resetAllFilters}
                                            className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-colors">
                                            <RotateCcw size={14}/>
                                            清空筛选 (Reset)
                                        </button>
                                    )}
                                    <button onClick={closeDrawer}
                                        className="flex-1 py-3.5 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-sm shadow-lg active:scale-95 transition-transform">
                                        查看结果 ({filteredList.length})
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ 删除确认弹窗 ============ */}
                {deleteTarget && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-end md:items-center justify-center animate-in fade-in duration-150">
                        <div className="bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">
                            <div className="bg-red-50 border-b border-red-100 p-5 flex items-center gap-3">
                                <div className="bg-red-500 text-white p-2.5 rounded-xl shrink-0">
                                    <AlertTriangle size={20}/>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-black text-red-700 text-base">删除价格记录？</h3>
                                    <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-0.5">
                                        Delete Price Entry
                                    </p>
                                </div>
                            </div>
                            <div className="p-5 space-y-3">
                                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 font-bold">食材 Item:</span>
                                        <span className="text-[#1A1A1A] font-black">{deleteTarget.itemName}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 font-bold">日期 Date:</span>
                                        <span className="text-[#1A1A1A] font-mono font-black">{deleteTarget.date}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 font-bold">价格 Price:</span>
                                        <span className="text-red-600 font-mono font-black">
                                            RM {deleteTarget.cost.toFixed(2)} /{deleteTarget.unit}
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex gap-2">
                                    <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5"/>
                                    <p className="text-[11px] text-orange-700 font-bold leading-relaxed">
                                        将同时清理：① 原始进货记录中的该条目 ② 价格历史。<br/>
                                        <span className="text-[10px] opacity-75">Removes from both inventory_logs AND stock_price_history.</span>
                                    </p>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={() => { haptic(15); setDeleteTarget(null); }}
                                        disabled={deleting}
                                        className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 rounded-xl font-black text-sm transition-colors disabled:opacity-50">
                                        取消 (Cancel)
                                    </button>
                                    <button onClick={handleDeleteHistoryEntry}
                                        disabled={deleting}
                                        className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl font-black text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                        {deleting ? (
                                            <>
                                                <RefreshCw size={14} className="animate-spin"/>
                                                删除中...
                                            </>
                                        ) : (
                                            <>
                                                <Trash2 size={14}/>
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