// ==========================================
// 📒 传统账目 (Classic P&L) — 分页组件
// ------------------------------------------
// 给习惯看传统 Excel 账本的人（老板 / 会计）看的版面。
// 资料来源：
//   · SHOP LOT / 品类细分 → StoreHub CSV 导入 (collection: storehubSales)
//   · PLATFORM SALES      → 每日结算填的平台 Gross
//   · COST / PERSONAL / OPERATION → 系统支出分类，映射表见 constants/classicPnLCostMap.ts
// ==========================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Upload, RefreshCw, AlertTriangle, CheckCircle2, Trash2,
    ChevronDown, ChevronRight, FileText, Download, Columns2, Info, X, Settings2, Eye, EyeOff, Search,
} from 'lucide-react';
import { SalesRulesSettings } from './classic/SalesRulesSettings';
import { setActiveSalesRules } from '../../constants/salesRulesRuntime';
import { DataManager } from '../../utils/dataManager';
import {
    planBatchImport,
    BatchFileInput,
    StorehubMonthlySales,
} from '../../utils/storehubImport';
import { SALES_CATEGORY_LABELS } from '../../constants/salesCategoryRules';
import {
    buildClassicPnL,
    buildCategoryMargins,
    checkRatioSanity,
    isFullMonthRange,
    rangeLabel,
    ClassicPnLData,
    CostByCategory,
    PlatformGross,
    LaborByDept,
} from '../../utils/classicPnLBuilder';
import { exportClassicPnLToExcel, downloadBlob, buildClassicPnLCsv, downloadCsv } from '../../utils/classicPnLExport';
import { PNL_STATUS_LABEL, type PnLEngineResult } from '../../utils/pnl/engine/pnlEngine';

interface ClassicPnLTabProps {
    /** 'YYYY-MM' — 跟着报表上方的日期区间走 */
    month: string;
    /** 上一期 'YYYY-MM'，用于并排比较的预设值 */
    prevMonth: string;
    /** 每日结算填的平台 Gross（未扣任何平台费用） */
    platformGross: PlatformGross;
    /** 当期各支出分类金额 (catKey → 金额) */
    costByCategory: CostByCategory;
    /** 上期各支出分类金额，并排比较用 */
    prevCostByCategory: CostByCategory;
    /** 上期平台 Gross */
    prevPlatformGross: PlatformGross;
    /** 当期部门薪资（department → 金额） */
    laborByDept: LaborByDept;
    /** 上期部门薪资 */
    prevLaborByDept: LaborByDept;
    /** 部门归类品质：多少笔是靠职位名称猜的 */
    laborDeptMeta: { guessedCount: number; guessedAmount: number; totalCount: number };
    /** 旧「虾和Sotong」混合类别的金额，>0 时画面提示虾类成本偏高 */
    mixedSeafoodLegacyAmount?: number;
    /** 当期每日结算的店内收款净额 — SHOP LOT SALES 的权威来源 */
    inStoreSales: number;
    /** 上期店内收款净额 */
    prevInStoreSales: number;
    /** 当期实际日期区间（用来显示正确标题、判断是否整月） */
    currentRange: { start: string; end: string };
    /** 对照期实际日期区间 */
    prevRange: { start: string; end: string };
    /** 唯一盈亏引擎的状态与待核对原因（有的话在最上方显示） */
    pnlStatus?: Pick<PnLEngineResult, 'status' | 'reasons' | 'netProfit'>;
}

const fmt = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

export const ClassicPnLTab: React.FC<ClassicPnLTabProps> = ({
    month, prevMonth, platformGross, costByCategory, prevCostByCategory, prevPlatformGross,
    laborByDept, prevLaborByDept, laborDeptMeta,
    inStoreSales, prevInStoreSales, currentRange, prevRange,
    mixedSeafoodLegacyAmount = 0,
    pnlStatus,
}) => {
    const isFullMonth = isFullMonthRange(currentRange.start, currentRange.end);
    const prevIsFullMonth = isFullMonthRange(prevRange.start, prevRange.end);
    const currentLabel = rangeLabel(currentRange.start, currentRange.end);
    const prevLabel = rangeLabel(prevRange.start, prevRange.end);
    const [record, setRecord] = useState<StorehubMonthlySales | null>(null);
    const [prevRecord, setPrevRecord] = useState<StorehubMonthlySales | null>(null);
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [importMsg, setImportMsg] = useState<{ type: 'ok' | 'warn' | 'err'; text: string }[]>([]);

    // 版面开关
    const [viewMode, setViewMode] = useState<'SIMPLE' | 'DETAILED'>('SIMPLE');
    // 📌 「全渠道」已移除（2026-09）：StoreHub 的 SKU 报表含平台单，
    //    跟上面的 PLATFORM SALES 重叠，收入会算两次，老板决定不要了。
    //    固定走「店内推算」——品类按比例缩放，加总 = 每日结算的店内收款。
    //    builder 仍然支援两种模式，以后要开回来只需把这里改成 state。
    const channelMode = 'IN_STORE' as const;
    const [showCompare, setShowCompare] = useState(false);
    const [showSkuDetail, setShowSkuDetail] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    /** 成本明细：合计 / 细分（海鲜展开成鱼虾苏东啦啦加工品） */
    const [costDetailMode, setCostDetailMode] = useState<'SUMMARY' | 'DETAILED'>('SUMMARY');
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [exportFormat, setExportFormat] = useState<'CSV' | 'EXCEL'>('CSV');

    const fileRef = useRef<HTMLInputElement>(null);

    // 销售分类规则：进来先从 Firestore 载入自订规则，读不到就用内建
    const [hideZeroRows, setHideZeroRows] = useState(true);   // 0 的行预设收起来
    // SKU 明细的筛选 —— 用来查「某个分类为什么是 0，那些产品跑去哪了」
    const [skuFilterCat, setSkuFilterCat] = useState<string>('ALL');
    const [skuSearch, setSkuSearch] = useState('');
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [rulesVersion, setRulesVersion] = useState(0);   // 变动时强制重算报表
    const [, setRulesReady] = useState(false);   // 只用来确保载入完成后重绘一次
    useEffect(() => {
        let cancelled = false;
        DataManager.getSalesRulesConfig()
            .then(cfg => { if (!cancelled) { setActiveSalesRules(cfg); setRulesVersion(v => v + 1); } })
            .catch(() => { /* 失败就维持内建规则 */ })
            .finally(() => { if (!cancelled) setRulesReady(true); });
        return () => { cancelled = true; };
    }, []);

    // ==========================================
    // 载入
    // ==========================================
    const load = async () => {
        setLoading(true);
        try {
            const r = await DataManager.getStorehubSales(month);
            setRecord(r);
        } catch (e) {
            console.error('[ClassicPnL] 载入失败', e);
            setRecord(null);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, [month]);

    // 只有打开并排比较时才去读上个月，省 Firestore 读取
    useEffect(() => {
        if (!showCompare) return;
        let cancelled = false;
        DataManager.getStorehubSales(prevMonth)
            .then(r => { if (!cancelled) setPrevRecord(r); })
            .catch(() => { if (!cancelled) setPrevRecord(null); });
        return () => { cancelled = true; };
    }, [showCompare, prevMonth]);

    // ==========================================
    // 批次导入（可一次丢 1–6 月所有档案）
    // ==========================================
    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setImporting(true);
        setImportMsg([]);

        try {
            const inputs: BatchFileInput[] = [];
            for (const f of Array.from(files)) {
                inputs.push({ name: f.name, text: await f.text() });
            }

            const plan = planBatchImport(inputs, month);
            const msgs: { type: 'ok' | 'warn' | 'err'; text: string }[] = [];

            plan.fileLog.forEach(l => {
                if (l.ok) {
                    msgs.push({
                        type: 'ok',
                        text: `${l.name} → ${l.month}，${l.kind === 'SKU_SALES' ? 'SKU 销售' : '付款方式销售'}，${l.rows} 行`,
                    });
                } else {
                    msgs.push({ type: 'err', text: `${l.name}：${l.reason}，已跳过` });
                }
            });

            if (plan.months.length === 0) {
                setImportMsg([...msgs, { type: 'err', text: '没有读到任何有效资料，没有储存。' }]);
                setImporting(false);
                return;
            }

            // 逐月存进 Firestore
            const nowIso = new Date().toISOString();
            for (const m of plan.months) {
                const existing = await DataManager.getStorehubSales(m.month);
                const toSave: StorehubMonthlySales = {
                    month: m.month,
                    // 这次没上传的那一种报表，沿用已存在的资料，不要被清空
                    skuRows: m.skuRows.length > 0 ? m.skuRows : (existing?.skuRows || []),
                    paymentRows: m.paymentRows.length > 0 ? m.paymentRows : (existing?.paymentRows || []),
                    categoryTotals: m.categoryTotals,
                    totals: m.totals,
                    importedAt: nowIso,
                    sourceFiles: Array.from(new Set([
                        ...(existing?.sourceFiles || []),
                        ...plan.fileLog.filter(l => l.month === m.month && l.ok).map(l => l.name),
                    ])),
                };

                // 沿用旧资料时要重算合计，否则 totals 会跟内容对不上
                if (m.skuRows.length === 0 && (existing?.skuRows.length || 0) > 0) {
                    msgs.push({ type: 'warn', text: `[${m.month}] 这次没上传 SKU 销售，沿用先前导入的 ${existing!.skuRows.length} 项产品。` });
                    toSave.categoryTotals = existing!.categoryTotals;
                    toSave.totals = {
                        ...m.totals,
                        allChannelNet: existing!.totals.allChannelNet,
                    };
                }

                await DataManager.saveStorehubSales(toSave);
                msgs.push({ type: 'ok', text: `✅ ${m.month} 已存入，合计 RM ${fmt(m.totals.allChannelNet || toSave.totals.allChannelNet)}` });
            }

            plan.warnings.forEach(w => msgs.push({ type: 'warn', text: w }));

            if (plan.months.length > 1) {
                msgs.push({
                    type: 'ok',
                    text: `📦 这次一共导入 ${plan.months.length} 个月：${plan.months.map(m => m.month).join('、')}。切换上方日期就能看各月。`,
                });
            }

            setImportMsg(msgs);
            await load();
            if (showCompare) {
                const pr = await DataManager.getStorehubSales(prevMonth);
                setPrevRecord(pr);
            }
        } catch (e: any) {
            console.error('[ClassicPnL] 导入失败', e);
            setImportMsg([{ type: 'err', text: `导入失败：${e?.message || e}` }]);
        } finally {
            setImporting(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`确定要删除 ${month} 的 StoreHub 导入资料吗？删了要重新上传 CSV。`)) return;
        await DataManager.deleteStorehubSales(month);
        setRecord(null);
        setImportMsg([{ type: 'ok', text: `已删除 ${month} 的资料` }]);
    };

    // ==========================================
    // 建表
    // ==========================================
    const current: ClassicPnLData = useMemo(() => buildClassicPnL({
        month, storehub: record, platformGross, costByCategory, viewMode, channelMode, laborByDept, inStoreSales, costDetailMode,
    }), [month, record, platformGross, costByCategory, viewMode, channelMode, laborByDept, inStoreSales, costDetailMode, rulesVersion]);

    const compare: ClassicPnLData | null = useMemo(() => {
        if (!showCompare) return null;
        return buildClassicPnL({
            month: prevMonth,
            storehub: prevRecord,
            platformGross: prevPlatformGross,
            costByCategory: prevCostByCategory,
            viewMode,
            channelMode,
            laborByDept: prevLaborByDept,
            inStoreSales: prevInStoreSales,
            costDetailMode,
        });
    }, [showCompare, prevMonth, prevRecord, prevPlatformGross, prevCostByCategory, viewMode, channelMode, prevLaborByDept, prevInStoreSales, costDetailMode, rulesVersion]);

    /** 品类毛利：果汁 / 茶 / 罐装水 / 酒 / 饮料 各自赚多少 */
    const categoryMargins = useMemo(
        () => buildCategoryMargins(record, costByCategory, costDetailMode),
        [record, costByCategory, costDetailMode]
    );

    // 口径检查：每日结算店内收款 vs SKU 报表合计
    const ratioSanity = useMemo(
        () => (record ? checkRatioSanity(inStoreSales, record.totals.allChannelNet) : null),
        [record, inStoreSales]
    );

    // ==========================================
    // 平台加价率核对
    // ------------------------------------------
    // StoreHub 的平台付款方式记的是「店内价」（Grab/Shopee/Panda 都按店价打单），
    // 每日结算填的是平台后台的真实 Gross（店家在平台上标的价，通常高 20-30%）。
    // 两者相除 = 加价率。跑出合理区间代表有一边填错了。
    // ==========================================
    const MARKUP_MIN = 0.10;
    const MARKUP_MAX = 0.40;

    const markupCheck = useMemo(() => {
        if (!record || record.paymentRows.length === 0) return null;

        const shGet = (ch: 'GRAB' | 'SHOPEE' | 'PANDA') =>
            record.paymentRows.filter(p => p.channel === ch).reduce((s, p) => s + p.netSales, 0);

        const lines = ([
            { id: 'GRAB',   label: 'Grab',       settle: platformGross.grab,   storehub: shGet('GRAB') },
            { id: 'SHOPEE', label: 'ShopeeFood', settle: platformGross.shopee, storehub: shGet('SHOPEE') },
            { id: 'PANDA',  label: 'FoodPanda',  settle: platformGross.panda,  storehub: shGet('PANDA') },
        ]).map(l => {
            const markup = l.storehub > 0 ? (l.settle / l.storehub) - 1 : null;
            // 两边都是 0 → 该平台当月没生意，不算异常
            const bothZero = l.storehub === 0 && l.settle === 0;
            const abnormal = !bothZero && (markup === null || markup < MARKUP_MIN || markup > MARKUP_MAX);
            return { ...l, markup, abnormal, bothZero };
        });

        const totalSettle = lines.reduce((s, l) => s + l.settle, 0);
        const totalStorehub = lines.reduce((s, l) => s + l.storehub, 0);
        const totalMarkup = totalStorehub > 0 ? (totalSettle / totalStorehub) - 1 : null;

        return {
            lines,
            totalSettle,
            totalStorehub,
            totalMarkup,
            hasAbnormal: lines.some(l => l.abnormal),
        };
    }, [record, platformGross]);

    // 付款方式报表现在是「可选的对账工具」，不是必需 —— SHOP LOT 金额来自每日结算。
    const hasPaymentReport = !!record && record.paymentRows.length > 0;
    /** 每日结算的店内收款 vs StoreHub POS 实收，差太多代表有天漏结算或填错 */
    const settlementVsPos = useMemo(() => {
        if (!hasPaymentReport || !record) return null;
        const pos = record.totals.inStoreNet;
        const diff = inStoreSales - pos;
        const diffPct = pos > 0 ? Math.abs(diff) / pos : 0;
        return { pos, settle: inStoreSales, diff, diffPct, ok: diffPct <= 0.01 };
    }, [hasPaymentReport, record, inStoreSales]);

    const compareMap = useMemo(() => {
        const m: Record<string, { amount: number; ratio: number | null }> = {};
        compare?.rows.forEach(r => { m[r.id] = { amount: r.amount, ratio: r.ratio }; });
        return m;
    }, [compare]);

    /**
     * 「隐藏 0 的行」：
     *  - 段落标题 (isSection) 一律保留，不然表会散掉
     *  - 开了对照时，两边都是 0 才隐藏 —— 只有一边是 0 反而是重点，要看得到
     */
    const visibleRows = useMemo(() => {
        if (!hideZeroRows) return current.rows;
        return current.rows.filter(r => {
            if (r.isSection) return true;
            const cur = Number(r.amount || 0);
            const prev = showCompare ? Number(compareMap[r.id]?.amount || 0) : 0;
            return Math.abs(cur) > 0.005 || Math.abs(prev) > 0.005;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current, hideZeroRows, showCompare, compareMap]);

    const hiddenZeroCount = current.rows.length - visibleRows.length;

    /** SKU 明细：每个分类的产品数与金额，用来查「海鲜为什么是 0」 */
    const skuCatSummary = useMemo(() => {
        const m: Record<string, { count: number; amount: number }> = {};
        (record?.skuRows || []).forEach(r => {
            const k = r.category;
            if (!m[k]) m[k] = { count: 0, amount: 0 };
            m[k].count++;
            m[k].amount += r.netSales;
        });
        return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount);
    }, [record]);

    const filteredSkuRows = useMemo(() => {
        const q = skuSearch.trim().toLowerCase();
        return [...(record?.skuRows || [])]
            .filter(r => skuFilterCat === 'ALL' || r.category === skuFilterCat)
            .filter(r => !q || r.productName.toLowerCase().includes(q) || (r.sku || '').toLowerCase().includes(q) || (r.resolvedCode || '').toLowerCase().includes(q))
            .sort((a, b) => b.netSales - a.netSales);
    }, [record, skuFilterCat, skuSearch]);

    // ==========================================
    // 导出 Excel
    // ==========================================
    const handleExport = async () => {
        setExporting(true);
        try {
            const suffix = `${currentLabel}${compare ? `_vs_${prevLabel}` : ''}_${costDetailMode === 'DETAILED' ? '细分' : '合计'}`;
            if (exportFormat === 'CSV') {
                const csv = buildClassicPnLCsv({
                    current,
                    compare,
                    currentLabel,
                    compareLabel: prevLabel,
                    margins: categoryMargins.map(m => ({
                        label: m.label, sales: m.sales, cost: m.cost, profit: m.profit, marginPct: m.marginPct,
                    })),
                });
                downloadCsv(csv, `传统账目_P&L_${suffix}.csv`);
            } else {
                const blob = await exportClassicPnLToExcel({
                    current, compare, currentLabel, compareLabel: prevLabel,
                });
                downloadBlob(blob, `传统账目_P&L_${suffix}.xlsx`);
            }
            setShowExportDialog(false);
        } catch (e: any) {
            console.error('[ClassicPnL] 导出失败', e);
            setImportMsg([{ type: 'err', text: `导出失败：${e?.message || e}` }]);
        } finally {
            setExporting(false);
        }
    };

    // ==========================================
    // 版面
    // ==========================================
    if (loading) {
        return (
            <div className="flex items-center justify-center py-16 text-[#6B7280]">
                <RefreshCw size={18} className="animate-spin mr-2" />
                <span className="text-sm font-bold">载入 {month} 资料中…</span>
            </div>
        );
    }

    const blockingReasons = pnlStatus ? pnlStatus.reasons.filter(r => r.level === 'BLOCKING') : [];
    return (
        <div className="space-y-3">
            {pnlStatus && (
                <div className={`rounded-2xl border p-3 text-xs leading-relaxed ${pnlStatus.status === 'CONFIRMED' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                    <div className="font-black text-sm">
                        经营盈亏：{PNL_STATUS_LABEL[pnlStatus.status]} · NET PROFIT RM {fmt(pnlStatus.netProfit)}
                    </div>
                    <div className="mt-0.5">与老板驾驶舱同一套计算（权责发生制）：采购以应付账款为准，薪资以 Payroll 为准，每日结算的钱箱支出不计入。</div>
                    {blockingReasons.length > 0 && (
                        <ul className="mt-1 list-disc pl-4">
                            {blockingReasons.slice(0, 6).map((r, i) => <li key={i}>{r.label}{r.amount !== undefined ? `（RM ${fmt(r.amount)}）` : ''}</li>)}
                            {blockingReasons.length > 6 && <li>另有 {blockingReasons.length - 6} 项，详见「盈亏对账」</li>}
                        </ul>
                    )}
                </div>
            )}
            {/* ━━━━━━━ 导入 / 导出列 ━━━━━━━ */}
            <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-3 md:p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                        <div className="font-black text-sm text-[#111111] flex items-center gap-2">
                            <FileText size={16} className="text-[#FFD200]" />
                            StoreHub 资料 — {month}
                        </div>
                        {record ? (
                            <div className="text-[11px] text-[#6B7280] mt-0.5 font-mono truncate">
                                {record.skuRows.length} 项产品 · {record.paymentRows.length} 种付款方式 ·
                                合计 RM {fmt(record.totals.allChannelNet)}
                            </div>
                        ) : (
                            <div className="text-[11px] text-[#6B7280] mt-0.5">
                                只需要「SKU 销售」CSV（用来拆品类，金额本身来自每日结算）。可一次选多个月，照档名自动分月。
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,text/csv"
                            multiple
                            className="hidden"
                            onChange={e => handleFiles(e.target.files)}
                        />
                        <button
                            type="button"
                            disabled={importing}
                            onClick={() => fileRef.current?.click()}
                            className="flex-1 md:flex-none min-h-[40px] px-4 rounded-xl bg-[#FFD200] text-[#111111] text-xs font-black flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                            {importing ? '处理中…' : '上传 CSV'}
                        </button>
                        <button
                            type="button"
                            disabled={exporting}
                            onClick={() => setShowExportDialog(true)}
                            className="flex-1 md:flex-none min-h-[40px] px-4 rounded-xl bg-[#111111] text-[#FFD200] text-xs font-black flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                            {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                            导出
                        </button>
                        {record && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="min-h-[40px] px-3 rounded-xl bg-[#F6F7FB] text-[#DC2626] text-xs font-black flex items-center active:scale-95"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {importMsg.length > 0 && (
                    <div className="mt-3 space-y-1.5 max-h-[220px] overflow-auto">
                        {importMsg.map((m, i) => (
                            <div
                                key={i}
                                className={`text-[11px] leading-relaxed px-2.5 py-2 rounded-lg flex items-start gap-1.5 ${
                                    m.type === 'ok' ? 'bg-[#ECFDF5] text-[#065F46]'
                                    : m.type === 'warn' ? 'bg-[#FFFBEB] text-[#92400E]'
                                    : 'bg-[#FEF2F2] text-[#991B1B]'
                                }`}
                            >
                                {m.type === 'ok'
                                    ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                                    : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
                                <span className="break-all">{m.text}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ━━━━━━━ 显示模式 ━━━━━━━ */}
            <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                    <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1 px-1">明细层级</div>
                    <div className="flex bg-[#F6F7FB] p-1 rounded-xl gap-1">
                        {([{ id: 'SIMPLE', label: '简易' }, { id: 'DETAILED', label: '详细' }] as const).map(o => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => setViewMode(o.id)}
                                className={`flex-1 min-h-[34px] rounded-lg text-[10px] font-black transition-all active:scale-95 ${
                                    viewMode === o.id ? 'bg-[#FFD200] text-[#111111] shadow-sm' : 'text-[#6B7280]'
                                }`}
                            >{o.label}</button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1 px-1">成本明细</div>
                    <div className="flex bg-[#F6F7FB] p-1 rounded-xl gap-1">
                        {([{ id: 'SUMMARY', label: '合计' }, { id: 'DETAILED', label: '细分' }] as const).map(o => (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => setCostDetailMode(o.id)}
                                title={o.id === 'DETAILED' ? '海鲜展开成 鱼/虾/Sotong/Lala/加工品' : '海鲜显示一行合计'}
                                className={`flex-1 min-h-[34px] rounded-lg text-[10px] font-black transition-all active:scale-95 ${
                                    costDetailMode === o.id ? 'bg-[#FFD200] text-[#111111] shadow-sm' : 'text-[#6B7280]'
                                }`}
                            >{o.label}</button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1 px-1">并排比较</div>
                    <button
                        type="button"
                        onClick={() => setShowCompare(v => !v)}
                        className={`w-full min-h-[42px] rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                            showCompare ? 'bg-[#FFD200] text-[#111111]' : 'bg-[#F6F7FB] text-[#6B7280]'
                        }`}
                    >
                        <Columns2 size={13} />
                        {showCompare ? `对照 ${prevLabel}` : '开启对照上期'}
                    </button>
                </div>
            </div>

            {/* ━━━━━━━ 传统账目表 ━━━━━━━ */}
            <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] overflow-hidden">
                <div className="px-3 md:px-4 py-3 border-b border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="font-black text-sm md:text-base text-[#111111] uppercase tracking-wide">
                            Profit &amp; Loss
                        </div>
                        <div className="text-[10px] text-[#6B7280] font-mono mt-0.5">
                            {currentLabel}{showCompare ? ` vs ${prevLabel}` : ''}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setHideZeroRows(v => !v)}
                            className={`min-h-[32px] px-2.5 rounded-lg text-[10px] font-black flex items-center gap-1 active:scale-95 ${
                                hideZeroRows ? 'bg-[#FFD200] text-[#111111]' : 'bg-[#F6F7FB] text-[#6B7280]'
                            }`}
                            title={hideZeroRows ? `已隐藏 ${hiddenZeroCount} 行金额为 0 的项目` : '目前显示全部行，包含金额 0'}
                        >
                            {hideZeroRows ? <EyeOff size={12} /> : <Eye size={12} />}
                            {hideZeroRows ? `隐藏 0 (${hiddenZeroCount})` : '显示全部'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsRulesOpen(true)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-[#F6F7FB] text-[#6B7280] text-[10px] font-black flex items-center gap-1 active:scale-95"
                            title="自己设定 SKU 归哪个分类、报表摆哪几行"
                        >
                            <Settings2 size={12} /> 分类设置
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowNotes(v => !v)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-[#F6F7FB] text-[#6B7280] text-[10px] font-black flex items-center gap-1 active:scale-95"
                        >
                            <Info size={12} /> 科目说明
                        </button>
                    </div>
                </div>

                {/* 🚨 日期区间不是整月 → 跟整月的 SKU 报表口径对不上 */}
                {!isFullMonth && record && (
                    <div className="px-3 md:px-4 py-2.5 bg-[#FEF2F2] border-b-2 border-[#DC2626] flex items-start gap-2">
                        <AlertTriangle size={15} className="text-[#DC2626] mt-0.5 shrink-0" />
                        <div className="text-[11px] text-[#991B1B] leading-relaxed">
                            <b>上方选的日期区间不是完整的一个月。</b>
                            金额（PLATFORM / SHOP LOT）是该区间的，但 StoreHub SKU 报表是<b>整月</b>的，
                            两者口径不同 —— 品类明细的比例会算错。
                            请把日期改成整月（{month}-01 到月底）再看。
                        </div>
                    </div>
                )}

                {/* 🚨 对照期不是整月 */}
                {showCompare && !prevIsFullMonth && (
                    <div className="px-3 md:px-4 py-2.5 bg-[#FFFBEB] border-b-2 border-[#F59E0B] flex items-start gap-2">
                        <AlertTriangle size={15} className="text-[#D97706] mt-0.5 shrink-0" />
                        <div className="text-[11px] text-[#92400E] leading-relaxed">
                            <b>对照期是 {prevLabel}，不是完整的一个月。</b>
                            系统的对照期永远是「往前推一段同样长度的时间」—— 你现在选的区间不是整月，
                            所以对照的也不是整月，两边数字不能当成月对月来看。
                            要月对月，请把上方日期设成整月。
                        </div>
                    </div>
                )}

                {/* 🚨 比例异常 */}
                {isFullMonth && ratioSanity && !ratioSanity.ok && (
                    <div className="px-3 md:px-4 py-2.5 bg-[#FFFBEB] border-b-2 border-[#F59E0B] flex items-start gap-2">
                        <AlertTriangle size={15} className="text-[#D97706] mt-0.5 shrink-0" />
                        <div className="text-[11px] text-[#92400E] leading-relaxed">
                            <b>品类比例看起来不对（{((ratioSanity.ratio || 0) * 100).toFixed(1)}%）。</b>
                            {ratioSanity.reason}
                            金额本身仍以每日结算为准，是对的；有问题的只有底下的品类拆解。
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-[12px] md:text-[13px]">
                        <thead>
                            <tr className="bg-[#F6F7FB] text-[#6B7280]">
                                <th className="text-left px-3 md:px-4 py-2 font-black text-[10px] uppercase sticky left-0 bg-[#F6F7FB]">项目</th>
                                <th className="text-right px-2 md:px-3 py-2 font-black text-[10px] uppercase whitespace-nowrap">{currentLabel}</th>
                                <th className="text-right px-2 md:px-3 py-2 font-black text-[10px] uppercase">%</th>
                                {showCompare && (
                                    <>
                                        <th className="text-right px-2 md:px-3 py-2 font-black text-[10px] uppercase whitespace-nowrap border-l border-[#E5E7EB]">{prevLabel}</th>
                                        <th className="text-right px-2 md:px-3 py-2 font-black text-[10px] uppercase">%</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map(r => {
                                const cmp = compareMap[r.id];
                                const indentCls = r.level === 2 ? 'pl-7 md:pl-10' : r.level === 1 ? 'pl-5 md:pl-6' : 'pl-3 md:pl-4';
                                return (
                                    <tr
                                        key={r.id}
                                        className={`${
                                            r.isSection
                                                ? 'bg-[#FFFBEB] border-y-2 border-[#FFD200] font-black text-[#111111]'
                                                : 'border-b border-[#F9FAFB]'
                                        } ${r.level === 2 ? 'text-[#6B7280]' : ''} ${
                                            (!isFullMonth || (ratioSanity && !ratioSanity.ok)) && r.id.startsWith('SL_')
                                                ? 'bg-[#FEF2F2]' : ''
                                        }`}
                                    >
                                        <td className={`${indentCls} pr-2 py-${r.isSection ? '2.5' : '1.5'} sticky left-0 ${r.isSection ? 'bg-[#FFFBEB]' : 'bg-[#FFFFFF]'}`}>
                                            <span className={r.level === 1 && !r.isSection ? 'font-bold text-[#111111]' : ''}>{r.label}</span>
                                            {r.warn && (
                                                <span className="ml-1 text-[#F59E0B]" title={r.note}>⚠</span>
                                            )}
                                        </td>
                                        <td className={`px-2 md:px-3 py-${r.isSection ? '2.5' : '1.5'} text-right font-mono ${r.level === 2 ? '' : 'font-bold'}`}>
                                            {fmt(r.amount)}
                                        </td>
                                        <td className="px-2 md:px-3 py-1.5 text-right font-mono text-[#9CA3AF]">{fmtPct(r.ratio)}</td>
                                        {showCompare && (
                                            <>
                                                <td className={`px-2 md:px-3 py-1.5 text-right font-mono border-l border-[#F3F4F6] ${r.level === 2 ? '' : 'font-bold'}`}>
                                                    {cmp ? fmt(cmp.amount) : '—'}
                                                </td>
                                                <td className="px-2 md:px-3 py-1.5 text-right font-mono text-[#9CA3AF]">
                                                    {cmp ? fmtPct(cmp.ratio) : '—'}
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* 註记 */}
                <div className="px-3 md:px-4 py-2.5 bg-[#FAFAFA] border-t border-[#E5E7EB] space-y-1">
                    <div className="text-[10px] text-[#6B7280] leading-relaxed">
                        · <b>金额一律以每日结算为准</b>：PLATFORM SALES 取平台 Gross（未扣任何平台费用），
                        SHOP LOT SALES 取店内收款净额。StoreHub 只负责把 SHOP LOT 拆成品类，不决定金额。
                    </div>
                    {channelMode === 'IN_STORE' && record && current.inStoreRatio !== null && (
                        <div className="text-[10px] text-[#92400E] leading-relaxed">
                            · <b>品类明细为推算值</b>：StoreHub 的 SKU 报表没有渠道栏位，平台单和店内单混在一起。
                            按 <b>{(current.inStoreRatio * 100).toFixed(2)}%</b>（每日结算店内收款 ÷ SKU 报表合计）缩放，
                            让明细加总 = SHOP LOT SALES，不会跟上面的 PLATFORM SALES 重复计算。
                        </div>
                    )}
                    {!record && (
                        <div className="text-[10px] text-[#92400E] leading-relaxed">
                            · ⚠️ 这个月还没导入 StoreHub SKU 报表。<b>SALES / COST / 净利 全部正确</b>（来自每日结算），
                            只是 SHOP LOT 底下没有 MEE / RICE / FOOD 的品类拆解。
                        </div>
                    )}
                    <div className="text-[10px] text-[#6B7280] leading-relaxed">
                        · <b>CAPEX</b>（装修、设备）不计入净利，另段列出。
                    </div>
                    <div className="text-[10px] text-[#6B7280] leading-relaxed">
                        · <b>部门薪资</b>是 LABOUR CHARGES 的拆解，<b>不另外加进</b> PERSONAL EXPENSES，不会重复算。
                    </div>
                    {laborDeptMeta.guessedCount > 0 && (
                        <div className="text-[10px] text-[#92400E] leading-relaxed">
                            · ⚠️ 有 <b>{laborDeptMeta.guessedCount}</b> 位员工（共 RM {fmt(laborDeptMeta.guessedAmount)}）的档案没填部门，
                            是靠职位名称推断的。去「员工档案」补上 department 就会准确。
                        </div>
                    )}
                    {laborDeptMeta.totalCount === 0 && (
                        <div className="text-[10px] text-[#92400E] leading-relaxed">
                            · ⚠️ {month} 还没有已过账的薪资单，部门明细全是 0。
                        </div>
                    )}
                </div>
            </div>

            {/* ━━━━━━━ 科目说明 ━━━━━━━ */}
            {showNotes && (
                <div className="bg-[#FFFBEB] rounded-2xl border border-[#FDE68A] p-3 md:p-4 space-y-2">
                    <div className="font-black text-xs text-[#92400E]">科目对应说明（有 ⚠ 的行要注意）</div>
                    {current.rows.filter(r => r.note).map(r => (
                        <div key={r.id} className="text-[11px] text-[#92400E] leading-relaxed">
                            <b>{r.label}</b>：{r.note}
                        </div>
                    ))}
                    <div className="text-[10px] text-[#92400E] pt-1 border-t border-[#FDE68A]">
                        要改哪个支出分类归到哪一行 → 改 <code className="font-mono">constants/classicPnLCostMap.ts</code>
                    </div>
                </div>
            )}

            {/* ━━━━━━━ 导出对话框 ━━━━━━━ */}
            {showExportDialog && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-0 md:p-6">
                    <div className="bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
                            <div className="font-black text-sm text-[#111111] flex items-center gap-2">
                                <Download size={16} className="text-[#FFD200]" /> 导出传统账目
                            </div>
                            <button onClick={() => setShowExportDialog(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* 期间 */}
                            <div>
                                <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1.5">导出期间</div>
                                <div className="bg-[#F6F7FB] rounded-xl px-3 py-2.5 text-xs font-bold text-[#111111]">
                                    {currentLabel}{compare ? `　对照　${prevLabel}` : ''}
                                </div>
                                <p className="text-[10px] text-[#6B7280] mt-1 leading-relaxed">
                                    期间跟着报表上方的日期区间走。要导别的月份，先改上方日期再回来导出。
                                </p>
                            </div>

                            {/* 成本明细 */}
                            <div>
                                <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1.5">成本明细</div>
                                <div className="flex bg-[#F6F7FB] p-1 rounded-xl gap-1">
                                    {([
                                        { id: 'SUMMARY', label: '合计', desc: '海鲜一行' },
                                        { id: 'DETAILED', label: '细分', desc: '鱼/虾/苏东/啦啦' },
                                    ] as const).map(o => (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => setCostDetailMode(o.id)}
                                            className={`flex-1 min-h-[46px] rounded-lg text-[11px] font-black flex flex-col items-center justify-center leading-tight ${
                                                costDetailMode === o.id ? 'bg-[#FFD200] text-[#111111] shadow-sm' : 'text-[#6B7280]'
                                            }`}
                                        >
                                            {o.label}
                                            <span className="text-[9px] font-normal opacity-70">{o.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 品类层级 */}
                            <div>
                                <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1.5">销售品类层级</div>
                                <div className="flex bg-[#F6F7FB] p-1 rounded-xl gap-1">
                                    {([
                                        { id: 'SIMPLE', label: '简易', desc: 'MEE/RICE/FOOD' },
                                        { id: 'DETAILED', label: '详细', desc: '全展开' },
                                    ] as const).map(o => (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => setViewMode(o.id)}
                                            className={`flex-1 min-h-[46px] rounded-lg text-[11px] font-black flex flex-col items-center justify-center leading-tight ${
                                                viewMode === o.id ? 'bg-[#FFD200] text-[#111111] shadow-sm' : 'text-[#6B7280]'
                                            }`}
                                        >
                                            {o.label}
                                            <span className="text-[9px] font-normal opacity-70">{o.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 格式 */}
                            <div>
                                <div className="text-[9px] font-black text-[#9CA3AF] uppercase mb-1.5">档案格式</div>
                                <div className="flex bg-[#F6F7FB] p-1 rounded-xl gap-1">
                                    {([
                                        { id: 'CSV', label: 'CSV', desc: '自己加工用' },
                                        { id: 'EXCEL', label: 'Excel', desc: '给会计看' },
                                    ] as const).map(o => (
                                        <button
                                            key={o.id}
                                            type="button"
                                            onClick={() => setExportFormat(o.id)}
                                            className={`flex-1 min-h-[46px] rounded-lg text-[11px] font-black flex flex-col items-center justify-center leading-tight ${
                                                exportFormat === o.id ? 'bg-[#FFD200] text-[#111111] shadow-sm' : 'text-[#6B7280]'
                                            }`}
                                        >
                                            {o.label}
                                            <span className="text-[9px] font-normal opacity-70">{o.desc}</span>
                                        </button>
                                    ))}
                                </div>
                                {exportFormat === 'CSV' && (
                                    <p className="text-[10px] text-[#6B7280] mt-1.5 leading-relaxed">
                                        CSV 会一并附上「品类毛利」区块。已加 UTF-8 BOM，Excel 打开中文不会乱码。
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-[#E5E7EB] flex gap-2">
                            <button
                                onClick={() => setShowExportDialog(false)}
                                className="px-4 min-h-[44px] rounded-xl bg-[#F6F7FB] text-[#6B7280] text-xs font-black"
                            >取消</button>
                            <button
                                onClick={handleExport}
                                disabled={exporting}
                                className="flex-grow min-h-[44px] rounded-xl bg-[#111111] text-[#FFD200] text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                                导出 {exportFormat === 'CSV' ? 'CSV' : 'Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ━━━━━━━ 品类毛利（果汁/茶/罐装水/酒/饮料）━━━━━━━ */}
            <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] overflow-hidden">
                <div className="px-3 md:px-4 py-2.5 border-b border-[#E5E7EB] bg-[#FAFAFA]">
                    <div className="font-black text-xs text-[#111111]">水吧品类毛利 — {currentLabel}</div>
                    <div className="text-[10px] text-[#6B7280] mt-0.5">销售取全渠道数字，对上各自的进货成本</div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                        <thead>
                            <tr className="bg-[#F6F7FB] text-[#6B7280]">
                                <th className="text-left px-3 md:px-4 py-1.5 font-black text-[9px] uppercase">类别</th>
                                <th className="text-right px-2 py-1.5 font-black text-[9px] uppercase">销售</th>
                                <th className="text-right px-2 py-1.5 font-black text-[9px] uppercase">成本</th>
                                <th className="text-right px-2 py-1.5 font-black text-[9px] uppercase">毛利</th>
                                <th className="text-right px-3 py-1.5 font-black text-[9px] uppercase">毛利率</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categoryMargins.map(m => (
                                <tr key={m.id} className={`border-b border-[#F9FAFB] ${m.warn ? 'bg-[#FFFBEB]' : ''}`}>
                                    <td className="px-3 md:px-4 py-2 font-bold text-[#111111]">
                                        {m.label}
                                        {m.warn && <span className="ml-1 text-[#D97706]" title={m.warnReason}>⚠</span>}
                                    </td>
                                    <td className="px-2 py-2 text-right font-mono">{fmt(m.sales)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-[#6B7280]">{fmt(m.cost)}</td>
                                    <td className={`px-2 py-2 text-right font-mono font-bold ${m.profit < 0 ? 'text-[#DC2626]' : ''}`}>
                                        {fmt(m.profit)}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono font-black ${
                                        m.marginPct === null ? 'text-[#9CA3AF]'
                                        : m.marginPct < 0 ? 'text-[#DC2626]'
                                        : m.marginPct >= 0.6 ? 'text-[#059669]'
                                        : 'text-[#111111]'
                                    }`}>
                                        {m.marginPct === null ? '—' : `${(m.marginPct * 100).toFixed(1)}%`}
                                    </td>
                                </tr>
                            ))}
                            {(() => {
                                const tS = categoryMargins.reduce((s, m) => s + m.sales, 0);
                                const tC = categoryMargins.reduce((s, m) => s + m.cost, 0);
                                const tP = tS - tC;
                                return (
                                    <tr className="bg-[#F6F7FB] font-black">
                                        <td className="px-3 md:px-4 py-2">合计</td>
                                        <td className="px-2 py-2 text-right font-mono">{fmt(tS)}</td>
                                        <td className="px-2 py-2 text-right font-mono">{fmt(tC)}</td>
                                        <td className={`px-2 py-2 text-right font-mono ${tP < 0 ? 'text-[#DC2626]' : ''}`}>{fmt(tP)}</td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            {tS > 0 ? `${((tP / tS) * 100).toFixed(1)}%` : '—'}
                                        </td>
                                    </tr>
                                );
                            })()}
                        </tbody>
                    </table>
                </div>

                <div className="px-3 md:px-4 py-2.5 bg-[#FAFAFA] border-t border-[#E5E7EB] space-y-1">
                    <div className="text-[10px] text-[#6B7280] leading-relaxed">
                        · 销售用<b>全渠道</b>数字（含平台单），因为进货成本本来就涵盖所有渠道卖出去的东西。
                        用店内推算的销售去比全部成本，毛利率会被低估。
                    </div>
                    <div className="text-[10px] text-[#6B7280] leading-relaxed">
                        · <b>果汁</b>的成本用「食材-水果」，那一行同时含厨房用的水果，所以果汁毛利率偏保守。
                    </div>
                    {mixedSeafoodLegacyAmount > 0 && (
                        <div className="text-[10px] text-[#92400E] leading-relaxed">
                            · ⚠️ 这个区间有 <b>RM {fmt(mixedSeafoodLegacyAmount)}</b> 是旧的「虾和Sotong」混合类别账单。
                            系统无法得知虾和 Sotong 各占多少，<b>已全部算进虾类成本</b>，所以虾类毛利率会偏低、Sotong 偏高。
                            要精准的话，去应付账款把那几张单用「拆分成多个科目」拆开。
                        </div>
                    )}
                    {categoryMargins.filter(m => m.warn).map(m => (
                        <div key={m.id} className="text-[10px] text-[#92400E] leading-relaxed">
                            · ⚠️ <b>{m.label}</b>：{m.warnReason}
                        </div>
                    ))}
                </div>
            </div>

            {/* ━━━━━━━ 平台加价率核对 ━━━━━━━ */}
            {markupCheck && (
                <div className={`bg-[#FFFFFF] rounded-2xl border overflow-hidden ${
                    markupCheck.hasAbnormal ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                }`}>
                    <div className={`px-3 md:px-4 py-2.5 border-b flex items-center gap-2 ${
                        markupCheck.hasAbnormal
                            ? 'bg-[#FEF2F2] border-[#FECACA]'
                            : 'bg-[#FAFAFA] border-[#E5E7EB]'
                    }`}>
                        {markupCheck.hasAbnormal
                            ? <AlertTriangle size={14} className="text-[#DC2626]" />
                            : <CheckCircle2 size={14} className="text-[#059669]" />}
                        <span className={`font-black text-xs ${markupCheck.hasAbnormal ? 'text-[#991B1B]' : 'text-[#111111]'}`}>
                            平台加价率核对 — {month}
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead>
                                <tr className="bg-[#F6F7FB] text-[#6B7280]">
                                    <th className="text-left px-3 md:px-4 py-1.5 font-black text-[9px] uppercase">平台</th>
                                    <th className="text-right px-2 py-1.5 font-black text-[9px] uppercase">每日结算 Gross</th>
                                    <th className="text-right px-2 py-1.5 font-black text-[9px] uppercase">StoreHub 店内价</th>
                                    <th className="text-right px-3 py-1.5 font-black text-[9px] uppercase">加价率</th>
                                </tr>
                            </thead>
                            <tbody>
                                {markupCheck.lines.map(l => (
                                    <tr key={l.id} className={`border-b border-[#F9FAFB] ${l.abnormal ? 'bg-[#FEF2F2]' : ''}`}>
                                        <td className="px-3 md:px-4 py-1.5 font-bold text-[#111111]">{l.label}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{fmt(l.settle)}</td>
                                        <td className="px-2 py-1.5 text-right font-mono text-[#6B7280]">{fmt(l.storehub)}</td>
                                        <td className={`px-3 py-1.5 text-right font-mono font-black ${
                                            l.bothZero ? 'text-[#9CA3AF]' : l.abnormal ? 'text-[#DC2626]' : 'text-[#059669]'
                                        }`}>
                                            {l.bothZero ? '—' : l.markup === null ? '无法计算' : `${(l.markup * 100).toFixed(1)}%`}
                                            {l.abnormal && !l.bothZero && ' ⚠'}
                                        </td>
                                    </tr>
                                ))}
                                <tr className="bg-[#F6F7FB] font-black">
                                    <td className="px-3 md:px-4 py-2">合计</td>
                                    <td className="px-2 py-2 text-right font-mono">{fmt(markupCheck.totalSettle)}</td>
                                    <td className="px-2 py-2 text-right font-mono text-[#6B7280]">{fmt(markupCheck.totalStorehub)}</td>
                                    <td className="px-3 py-2 text-right font-mono">
                                        {markupCheck.totalMarkup === null ? '—' : `${(markupCheck.totalMarkup * 100).toFixed(1)}%`}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className={`px-3 md:px-4 py-2.5 border-t space-y-1 ${
                        markupCheck.hasAbnormal ? 'bg-[#FEF2F2] border-[#FECACA]' : 'bg-[#FAFAFA] border-[#E5E7EB]'
                    }`}>
                        {markupCheck.hasAbnormal ? (
                            <div className="text-[10px] text-[#991B1B] leading-relaxed">
                                <b>⚠️ 有平台的加价率跑出 {(MARKUP_MIN * 100).toFixed(0)}–{(MARKUP_MAX * 100).toFixed(0)}% 这个合理区间。</b>
                                常见原因：每日结算把 <b>Net 填成 Gross</b>（加价率会偏低甚至变负数）、
                                该平台当月有单但每日结算漏填（无法计算）、
                                或 StoreHub 那边的平台付款方式记错。
                                请对一下 Grab Merchant / Shopee Partner 后台的数字。
                            </div>
                        ) : (
                            <div className="text-[10px] text-[#065F46] leading-relaxed">
                                ✓ 各平台加价率都在 {(MARKUP_MIN * 100).toFixed(0)}–{(MARKUP_MAX * 100).toFixed(0)}% 的合理区间内。
                            </div>
                        )}
                        <div className="text-[10px] text-[#6B7280] leading-relaxed">
                            · 你的 StoreHub 平台付款方式记的是<b>店内价</b>（还没调整成平台价），
                            每日结算填的是<b>平台后台的真实 Gross</b>。两者相除就是平台加价幅度。
                        </div>
                        <div className="text-[10px] text-[#6B7280] leading-relaxed">
                            · 报表的 PLATFORM SALES <b>只取每日结算的 Gross</b>，StoreHub 这栏只拿来算加价率和店内占比，不会进 SALES。
                        </div>
                    </div>
                </div>
            )}

            {/* ━━━━━━━ 渠道对账 ━━━━━━━ */}
            {record && record.paymentRows.length > 0 && (
                <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] overflow-hidden">
                    <div className="px-3 md:px-4 py-2.5 border-b border-[#E5E7EB] bg-[#FAFAFA] font-black text-xs text-[#111111]">
                        StoreHub 付款方式对账 — {month}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <tbody>
                                {record.paymentRows.map(p => (
                                    <tr key={p.method} className="border-b border-[#F9FAFB]">
                                        <td className="px-3 md:px-4 py-1.5">
                                            {p.method}
                                            <span className={`ml-2 text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                p.channel === 'IN_STORE' ? 'bg-[#F3F4F6] text-[#6B7280]' : 'bg-[#FEF3C7] text-[#92400E]'
                                            }`}>
                                                {p.channel === 'IN_STORE' ? '店内' : '平台'}
                                            </span>
                                        </td>
                                        <td className="px-3 md:px-4 py-1.5 text-right font-mono text-[#6B7280]">{p.txCount} 单</td>
                                        <td className="px-3 md:px-4 py-1.5 text-right font-mono font-bold">{fmt(p.netSales)}</td>
                                    </tr>
                                ))}
                                <tr className="bg-[#F6F7FB] font-black">
                                    <td className="px-3 md:px-4 py-2">合计</td>
                                    <td />
                                    <td className="px-3 md:px-4 py-2 text-right font-mono">{fmt(record.totals.paymentNet)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    {/* 每日结算 vs POS 实收 — 抓漏结算的日子 */}
                    {settlementVsPos && (
                        <div className={`px-3 md:px-4 py-2.5 border-t ${
                            settlementVsPos.ok
                                ? 'bg-[#ECFDF5] border-[#A7F3D0]'
                                : 'bg-[#FFFBEB] border-[#FDE68A]'
                        }`}>
                            <div className={`text-[11px] font-black mb-1 ${settlementVsPos.ok ? 'text-[#065F46]' : 'text-[#92400E]'}`}>
                                {settlementVsPos.ok ? '✓ 每日结算与 POS 实收对得上' : '⚠️ 每日结算与 POS 实收对不上'}
                            </div>
                            <div className="text-[10px] text-[#6B7280] font-mono">
                                每日结算店内收款 {fmt(settlementVsPos.settle)} · StoreHub POS 实收 {fmt(settlementVsPos.pos)} ·
                                差 {settlementVsPos.diff >= 0 ? '+' : ''}{fmt(settlementVsPos.diff)}
                                （{(settlementVsPos.diffPct * 100).toFixed(2)}%）
                            </div>
                            {!settlementVsPos.ok && (
                                <div className="text-[10px] text-[#92400E] leading-relaxed mt-1">
                                    {settlementVsPos.diff < 0
                                        ? '每日结算比 POS 少 — 很可能有几天忘了做结算，那几天的销售没进报表。'
                                        : '每日结算比 POS 多 — 可能某天重复结算，或手动加了 POS 以外的收入。'}
                                    报表金额仍以每日结算为准（照你的设定），这里只是提醒你去查。
                                </div>
                            )}
                        </div>
                    )}
                    <div className="px-3 md:px-4 py-2 bg-[#FAFAFA] border-t border-[#E5E7EB] text-[10px] text-[#6B7280]">
                        POS 店内 RM {fmt(record.totals.inStoreNet)} · POS 平台(店内价) RM {fmt(record.totals.platformNet)}
                        {Math.abs(record.totals.allChannelNet - record.totals.paymentNet) < 1 && (
                            <span className="text-[#065F46] font-black ml-1">✓ 与 SKU 报表分毫不差</span>
                        )}
                    </div>
                </div>
            )}

            {/* ━━━━━━━ SKU 明细 ━━━━━━━ */}
            {record && record.skuRows.length > 0 && (
                <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowSkuDetail(v => !v)}
                        className="w-full px-3 md:px-4 py-2.5 flex items-center justify-between text-left active:bg-[#FAFAFA]"
                    >
                        <span className="font-black text-xs text-[#111111]">
                            SKU 明细与分类核对（{record.skuRows.length} 项）
                            <span className="font-bold text-[#6B7280] ml-1">— 查某个分类为什么是 0，就点下面的分类</span>
                        </span>
                        {showSkuDetail ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {showSkuDetail && (
                        <div className="px-3 md:px-4 py-2.5 border-t border-[#E5E7EB] bg-[#FAFAFA] space-y-2">
                            <div className="flex flex-wrap gap-1">
                                <button
                                    type="button"
                                    onClick={() => setSkuFilterCat('ALL')}
                                    className={`px-2 py-1 rounded-lg text-[9px] font-black border ${skuFilterCat === 'ALL' ? 'bg-[#111111] text-[#FFD200] border-[#111111]' : 'bg-white text-[#6B7280] border-[#E5E7EB]'}`}
                                >全部 ({record.skuRows.length})</button>
                                {skuCatSummary.map(([cat, v]) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setSkuFilterCat(cat)}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-black border ${
                                            skuFilterCat === cat ? 'bg-[#111111] text-[#FFD200] border-[#111111]'
                                            : cat === 'UNCLASSIFIED' ? 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                                            : 'bg-white text-[#6B7280] border-[#E5E7EB]'
                                        }`}
                                    >
                                        {SALES_CATEGORY_LABELS[cat as keyof typeof SALES_CATEGORY_LABELS]?.zh || cat} ({v.count}) · {fmt(v.amount)}
                                    </button>
                                ))}
                            </div>
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-2.5 text-[#9CA3AF]" />
                                <input
                                    value={skuSearch}
                                    onChange={e => setSkuSearch(e.target.value)}
                                    placeholder="搜产品名称或 SKU（例如：鱼、虾、E01）"
                                    className="w-full pl-8 pr-3 h-9 bg-white border border-[#E5E7EB] rounded-xl text-xs font-bold outline-none focus:border-[#FFD200]"
                                />
                            </div>
                            <div className="text-[10px] text-[#6B7280] font-bold">
                                显示 {filteredSkuRows.length} 项
                                {skuCatSummary.every(([c]) => c !== 'FISH' && c !== 'PRAWN' && c !== 'SOTONG' && c !== 'LALA' && c !== 'SEAFOOD_PROCESSED') && (
                                    <span className="text-[#B45309]"> · 这个月完全没有产品被归到海鲜类，搜「鱼 / 虾 / 苏东 / 啦啦」看它们现在算在哪</span>
                                )}
                            </div>
                        </div>
                    )}
                    {showSkuDetail && (
                        <div className="max-h-[420px] overflow-auto border-t border-[#E5E7EB]">
                            <table className="w-full text-[11px]">
                                <thead className="sticky top-0 bg-[#F6F7FB]">
                                    <tr className="text-[#6B7280]">
                                        <th className="text-left px-3 py-1.5 font-black text-[9px] uppercase">产品</th>
                                        <th className="text-left px-2 py-1.5 font-black text-[9px] uppercase">Code</th>
                                        <th className="text-left px-2 py-1.5 font-black text-[9px] uppercase">归类</th>
                                        <th className="text-right px-3 py-1.5 font-black text-[9px] uppercase">净销售额</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSkuRows.map((r, i) => (
                                        <tr key={`${r.sku}-${i}`} className={`border-b border-[#F9FAFB] ${r.category === 'UNCLASSIFIED' ? 'bg-[#FEF2F2]' : ''}`}>
                                            <td className="px-3 py-1 text-[#111111] max-w-[200px] truncate">{r.productName}</td>
                                            <td className="px-2 py-1 font-mono text-[#9CA3AF]">{r.resolvedCode || '—'}</td>
                                            <td className="px-2 py-1">
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                                    r.category === 'UNCLASSIFIED' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#F3F4F6] text-[#4B5563]'
                                                }`}>
                                                    {SALES_CATEGORY_LABELS[r.category].en}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1 text-right font-mono">{fmt(r.netSales)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* 销售分类设置 */}
            {isRulesOpen && (
                <SalesRulesSettings
                    isOpen={isRulesOpen}
                    onClose={() => setIsRulesOpen(false)}
                    onSaved={cfg => {
                        setActiveSalesRules(cfg);
                        setRulesVersion(v => v + 1);
                        load();          // 重新读这个月，拿到可能被重算过的资料
                    }}
                />
            )}
        </div>
    );
};

export default ClassicPnLTab;
