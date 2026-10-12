import { html2canvas, loadJsPDF } from '../../utils/lazyLibs';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    Trash2, Check, AlertTriangle, Calculator, Play, Power, History, 
    Wallet, Banknote, CreditCard, X, Calendar, Truck, CheckCircle2, 
    RotateCcw, AlertCircle, Loader2, FileDown, ShieldCheck, Zap, ArrowLeft, Edit3, Save, ListChecks, FileSpreadsheet
} from 'lucide-react';
import { applyResolvedStylesForPdf, waitForPdfFonts, prepareClonedDocumentForPdf } from '../../utils/pdfStyleResolver';
import { SettlementRecord, StoreConfig, WeatherCondition, WEATHER_OPTIONS } from '../../types';
import { guardWrite } from '../../utils/readOnlyMode';
import { DataManager } from '../../utils/dataManager';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
// 🔐 管理员密码：跟资金管理设定同一组（改 treasuryConstants 一处就好）
import { SETTINGS_PASSWORD } from './treasury/treasuryConstants';
import { isChannelReconciled, getReconActual, applyRecon, recalcSettlement, getReconChannels } from '../../utils/settlementRecon';
import { SettlementBatchRecon } from './settlement/SettlementBatchRecon';
import { SettlementExcelExportDialog } from './settlement/SettlementExcelExportDialog';
import { SettlementHistoryTable } from './settlement/SettlementHistoryTable';
import { SettlementOps, EMPTY_OPS, OPS_FIELDS, getOps, hasOps, perPax, perBill, fmtMoneyOrDash } from './settlement/settlementOps';
import { ModuleGuideButton } from '../ui/ModuleGuide';

interface SettlementModuleProps {
    storeConfig: StoreConfig;
    onClose?: () => void;
    isStandalone?: boolean;
}

const getBusinessDateStr = (cutoff: number) => {
    const now = new Date();
    const currentHour = now.getHours();
    if (currentHour < cutoff) {
        now.setDate(now.getDate() - 1);
    }
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getCalendarTodayStr = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// isChannelReconciled / getReconActual 已搬到 utils/settlementRecon.ts（明细、列表、批量核对共用同一份）

// 🟢 ReconItem：补回对账后的手续费/调节费的百分比展示
const ReconItem = ({ 
    label, 
    gross,
    net,
    ads = 0,
    isReconciled,
    actualAmount,
    onReconcile 
}: { 
    label: string, 
    gross: number,
    net?: number,
    ads?: number,
    isReconciled: boolean,
    actualAmount: number | null,
    onReconcile: () => void 
}) => { 
    // 实际应入账标准：如果有 net (且 > 0) 则为 net - ads，否则退回使用 gross - ads
    const effectiveNet = (net !== undefined && Number(net) > 0) ? Number(net) : Number(gross);
    const expected = effectiveNet - ads;
    if (expected <= 0 && gross <= 0) return null;

    const displayActual = actualAmount !== null ? actualAmount : (isReconciled ? expected : null);
    const reconFee = displayActual !== null ? Number((expected - displayActual).toFixed(2)) : null;
    const commission = (gross > 0 && net !== undefined && gross > net) ? Number((gross - net).toFixed(2)) : null;
    
    // 🌟 Grab 专属：计算当班即刻已知的基础抽佣率
    const commRate = (commission !== null && gross > 0) ? ((commission / gross) * 100).toFixed(1) : null;
    
    // 🌟 核心修复：计算对账后产生的手续费/平台调节费的抽水率 (Bank, Panda, Shopee)
    const feeRate = (reconFee !== null && reconFee > 0 && expected > 0) ? ((reconFee / expected) * 100).toFixed(1) : null;
    
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm mt-2 gap-3 md:gap-2">
            <div className="flex-1 min-w-0">
                <div className="flex justify-between md:block items-center mb-1 md:mb-0">
                    <p className="text-xs font-black text-gray-800 truncate pr-2">{label}</p>
                    <div className="flex flex-col items-end md:items-start gap-0.5 mt-1">
                        {commission !== null && (
                            <p className="text-[9px] text-gray-400 font-mono whitespace-nowrap line-through">Gross: RM {gross.toFixed(2)}</p>
                        )}
                        <p className="text-[11px] text-[#111111] font-bold font-mono whitespace-nowrap">预期到账 (Net): RM {expected.toFixed(2)}</p>
                        {ads > 0 && (
                            <p className="text-[9px] text-orange-500 font-bold font-mono whitespace-nowrap">- 已扣除当班广告 RM {ads.toFixed(2)}</p>
                        )}
                    </div>
                </div>
                {isReconciled && displayActual !== null && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 whitespace-nowrap">
                            实际到账: RM {displayActual.toFixed(2)}
                        </span>
                        {commission !== null && commission > 0 && (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 whitespace-nowrap">
                                基础抽佣: RM {commission.toFixed(2)} {commRate && <span className="text-gray-400 ml-0.5">({commRate}%)</span>}
                            </span>
                        )}
                        {/* 🌟 把算好的 feeRate 塞进粉红色的徽章里 */}
                        {reconFee !== null && reconFee > 0 && (
                            <span className="text-[10px] font-bold text-pink-700 bg-pink-50 px-1.5 py-0.5 rounded border border-pink-100 whitespace-nowrap flex items-center gap-1">
                                {['GrabFood', 'FoodPanda', 'ShopeeFood'].includes(label) ? '滞后广告/调节费' : '手续费'}: RM {reconFee.toFixed(2)} {feeRate && <span className="opacity-80 font-black ml-0.5">({feeRate}%)</span>}
                            </span>
                        )}
                    </div>
                )}
            </div>
            
            <div className="flex justify-end shrink-0 w-full md:w-auto">
                {isReconciled ? (
                    <div className="flex items-center gap-1.5 w-full md:w-auto">
                        <span className="flex items-center justify-center flex-1 md:flex-none gap-1 text-[10px] font-black text-green-700 bg-green-100 px-3 py-1.5 rounded-lg border border-green-200">
                            <CheckCircle2 size={14}/> 已过账
                        </span>
                        {/* 👑 已核对也能直接改，不用撤销重来 */}
                        <button onClick={onReconcile}
                            className="flex items-center justify-center gap-1 text-[10px] font-black text-gray-600 bg-white border border-gray-300 px-3 py-1.5 rounded-lg active:scale-95 transition-all shrink-0 min-h-[36px]">
                            <Edit3 size={12}/> 改
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={onReconcile}
                        className="flex items-center justify-center w-full md:w-auto gap-1 text-[11px] font-black text-[#FFD200] bg-[#111111] hover:bg-black px-4 py-2 rounded-lg shadow-md active:scale-95 transition-all"
                    >
                        <ShieldCheck size={14}/> 核对到账
                    </button>
                )}
            </div>
        </div>
    );
};

// 🌟 HistoryDetailModal - 剔除所有无关的%，只在 PDF 的 Grab 抽水旁边加上比率 🌟
const HistoryDetailModal = ({ record, onClose, onDelete, onRefresh, onUndoEdit }: { record: SettlementRecord | null, onClose: () => void, onDelete: (id: string) => void, onRefresh: () => void, onUndoEdit: (record: SettlementRecord) => void }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const [localRecord, setLocalRecord] = useState<SettlementRecord | null>(record);
    
    useEffect(() => {
        setLocalRecord(record);
    }, [record]);

    const [reconTarget, setReconTarget] = useState<{key: string, label: string, expectedAmount: number, grossAmount: number} | null>(null);
    const [reconActual, setReconActual] = useState<string>('');
    const [isProcessingRecon, setIsProcessingRecon] = useState(false);

    // ✏️ 直接编辑整笔结算（不用撤销重来）
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState<Record<string, number>>({});
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    const openEdit = () => {
        const r = localRecord;
        const d = (r.sales.deliveryBreakdown || {}) as any;
        setEditForm({
            openingCash: Number(r.openingCash) || 0,
            closingCash: Number(r.closingCash) || 0,
            ownerWithdrawal: Number((r as any).ownerWithdrawal) || 0,
            cash: Number(r.sales.cash) || 0,
            tng: Number(r.sales.tng) || 0,
            duitnow: Number(r.sales.duitnow) || 0,
            card: Number(r.sales.card) || 0,
            amex: Number(r.sales.amex) || 0,
            grabGross: Number(d.grabGross) || 0,
            grabNet: Number(d.grabNet) || 0,
            grabAds: Number(d.grabAds) || 0,
            pandaGross: Number(d.pandaGross) || 0,
            pandaNet: Number(d.pandaNet) || 0,
            pandaAds: Number(d.pandaAds) || 0,
            shopeeGross: Number(d.shopeeGross) || 0,
            shopeeNet: Number(d.shopeeNet) || 0,
            shopeeAds: Number(d.shopeeAds) || 0,
            lalamove: Number(d.lalamove) || 0,
            // 📊 营运数据
            ...Object.fromEntries(OPS_FIELDS.map(f => [`ops_${f.key}`, getOps(r)[f.key]])),
        });
        setEditMode(true);
    };

    const setEF = (k: string, v: string) => setEditForm(p => ({ ...p, [k]: parseFloat(v) || 0 }));

    const saveEdit = async () => {
        if (!guardWrite('直接编辑结算')) return;
        const f = editForm;
        const before = getReconChannels(localRecord);
        const draft = recalcSettlement({
            ...localRecord,
            openingCash: f.openingCash,
            closingCash: f.closingCash,
            ownerWithdrawal: f.ownerWithdrawal,
            ops: Object.fromEntries(OPS_FIELDS.map(k => [k.key, Math.max(0, Math.round(f[`ops_${k.key}`] || 0))])) as unknown as SettlementOps,
            sales: {
                ...localRecord.sales,
                cash: f.cash, tng: f.tng, duitnow: f.duitnow, card: f.card, amex: f.amex,
                deliveryBreakdown: {
                    ...(localRecord.sales.deliveryBreakdown || {}),
                    grabGross: f.grabGross, grabNet: f.grabNet, grabAds: f.grabAds,
                    pandaGross: f.pandaGross, pandaNet: f.pandaNet, pandaAds: f.pandaAds,
                    shopeeGross: f.shopeeGross, shopeeNet: f.shopeeNet, shopeeAds: f.shopeeAds,
                    lalamove: f.lalamove,
                } as any,
            },
        } as SettlementRecord);

        // 👑 金额改了，原本核对好的通道就对不上了 —— 这些通道要退回「待核对」，
        //    连同它自动记的平账费用一起清掉，不然账会错。
        const after = getReconChannels(draft);
        const resetKeys = before
            .filter(b => b.isReconciled)
            .filter(b => {
                const a = after.find(x => x.key === b.key);
                return a && Math.abs(a.expected - b.expected) > 0.005;
            })
            .map(b => b.key);

        const msg = `确认修改 ${localRecord.date} 的结算？\n\n` +
            `总营业额：RM ${localRecord.sales.total.toFixed(2)} → RM ${draft.sales.total.toFixed(2)}\n` +
            `现金差异：${localRecord.variance.toFixed(2)} → ${draft.variance.toFixed(2)}` +
            (resetKeys.length > 0
                ? `\n\n⚠️ 这几个通道的金额变了，会退回「待核对」并清掉它们的自动平账费用，请重新核对：\n${resetKeys.map(k => before.find(b => b.key === k)?.label).join('、')}`
                : '');
        if (!confirm(msg)) return;

        setIsSavingEdit(true);
        try {
            const rs = { ...((localRecord as any).reconStatus || {}) };
            for (const k of resetKeys) {
                await DataManager.clearReconFees(localRecord.id, k);
                rs[k] = false;
            }
            const finalRecord = { ...draft, reconStatus: rs } as SettlementRecord;
            await DataManager.saveSettlement(finalRecord);
            setLocalRecord(finalRecord);
            setEditMode(false);
            window.dispatchEvent(new Event('klk-settlements-updated'));
            alert(`✅ 已更新 ${localRecord.date} 的结算` + (resetKeys.length > 0 ? `\n${resetKeys.length} 个通道已退回待核对` : ''));
            onRefresh();
        } catch (e) {
            console.error('直接编辑失败', e);
            alert('❌ 保存失败，请重试');
        } finally {
            setIsSavingEdit(false);
        }
    };

    // 点「改」时把原本的实收金额预填进去，不用重打
    useEffect(() => {
        if (!reconTarget) { setReconActual(''); return; }
        const prev = getReconActual((localRecord as any)?.reconStatus || {}, reconTarget.key);
        setReconActual(prev !== null ? String(prev) : '');
    }, [reconTarget]);

    if (!localRecord) return null;

    const deliveryBreakdown = localRecord.sales.deliveryBreakdown || {} as any;
    const reconStatus = (localRecord as any).reconStatus || {};
    
    // 抓取 Grab 专属数据
    const grabGross = Number(deliveryBreakdown.grabGross) || 0;
    const rawGrabNet = Number(deliveryBreakdown.grabNet) || Number(deliveryBreakdown.grab) || 0;
    const grabNet = rawGrabNet > 0 ? rawGrabNet : grabGross;
    const grabAds = Number(deliveryBreakdown.grabAds) || 0;
    const grabExpected = grabNet - grabAds; 
    const grabActual = getReconActual(reconStatus, 'grab');
    const grabReportValue = grabActual !== null ? grabActual : grabExpected;
    
    // FoodPanda 专属数据（若未填写 Net 则自动以 Gross 兜底）
    const rawPandaNet = deliveryBreakdown.pandaNet !== undefined && deliveryBreakdown.pandaNet !== null ? Number(deliveryBreakdown.pandaNet) : (Number(deliveryBreakdown.panda) || 0);
    const pandaGross = Number(deliveryBreakdown.pandaGross) || (rawPandaNet > 0 ? rawPandaNet : (Number(deliveryBreakdown.panda) || 0));
    const pandaNet = rawPandaNet > 0 ? rawPandaNet : pandaGross;
    const pandaAds = Number(deliveryBreakdown.pandaAds) || 0;
    // 👑 判断此笔记录是否含新版拆分栏位（旧记录只有单一 panda 栏位）
    const hasPandaNet = Number(deliveryBreakdown.pandaNet) > 0 || Number(deliveryBreakdown.pandaGross) > 0;
    const pandaExpected = pandaNet - pandaAds;
    const pandaActual = getReconActual(reconStatus, 'panda');
    const pandaReportValue = pandaActual !== null ? pandaActual : pandaExpected;
    
    // 🌟 抓取 Shopee 拆分数据（若未填写 Net 则自动以 Gross 兜底）
    const rawShopeeNet = deliveryBreakdown.shopeeNet !== undefined && deliveryBreakdown.shopeeNet !== null ? Number(deliveryBreakdown.shopeeNet) : (Number(deliveryBreakdown.shopee) || 0);
    const shopeeGross = Number(deliveryBreakdown.shopeeGross) || (rawShopeeNet > 0 ? rawShopeeNet : 0);
    const shopeeNet = rawShopeeNet > 0 ? rawShopeeNet : shopeeGross;
    const shopeeAds = Number(deliveryBreakdown.shopeeAds) || 0;
    const shopeeExpected = shopeeNet - shopeeAds;
    const shopeeActual = getReconActual(reconStatus, 'shopee');
    const shopeeReportValue = shopeeActual !== null ? shopeeActual : shopeeExpected;

    // 🌟 重新计算彻底挤干水分的外卖总额（已核对的通道按实际到账汇总）
    const totalDelivery = grabReportValue + pandaReportValue + shopeeReportValue + (Number(deliveryBreakdown.lalamove) || 0);

    // 🌟 读取历史记录中保存的临时支出和老板抽款（做防空保护）
    const recordExpenses = (localRecord as any).dayExpenses || [];
    const recordWithdrawal = Number((localRecord as any).ownerWithdrawal) || 0;
    const totalRecordExpenses = recordExpenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const totalDebit = (localRecord.sales.duitnow || 0);
    const totalCard = localRecord.sales.card || 0;

    // 🌤️ 天气状况（旧记录没有此字段时不显示）
    const recordWeather = WEATHER_OPTIONS.find(o => o.value === (localRecord as any).weather);

    // 📊 营运数据（旧记录没有 → 全 0）
    const recOps = getOps(localRecord);
    const recHasOps = hasOps(recOps);
    const recPerPax = perPax(localRecord.sales.storeHubTotal, recOps);
    const recPerBill = perBill(localRecord.sales.storeHubTotal, recOps);

    const handleDownloadPDF = async () => {
        const originalElement = printRef.current;
        if (!originalElement) return;
        setIsGenerating(true);
        try {
            // 👑 必须显式加载打印模板用到的每个字重（含 CJK 分片），
            // document.fonts.ready 只等已请求过的字体，隐藏模板的字重根本没发起请求。
            await waitForPdfFonts();
            await new Promise<void>(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });

            const canvas = await html2canvas(originalElement, {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                backgroundColor: "#ffffff",
                logging: false,
                removeContainer: true,
                windowWidth: 794,
                scrollX: 0,
                scrollY: 0,
                onclone: async clonedDocument => {
                    // 👑 clone 在独立 iframe 里，字体需在该文档内「真的载入」后才可量测
                    //    （只等 fonts.ready 在 iPhone 上不够 —— 见 prepareClonedDocumentForPdf 说明）
                    await prepareClonedDocumentForPdf(clonedDocument);
                    const clonedElement = clonedDocument.getElementById("pdf-print-root-content");
                    const clonedWrapper = clonedDocument.getElementById("pdf-print-root");

                    if (clonedWrapper) {
                        clonedWrapper.style.opacity = "1";
                        clonedWrapper.style.visibility = "visible";
                        clonedWrapper.style.zIndex = "0";
                    }

                    if (clonedElement) {
                        applyResolvedStylesForPdf(originalElement, clonedElement);
                        clonedElement.style.visibility = "visible";
                        clonedElement.style.opacity = "1";
                        clonedElement.style.backgroundColor = "#ffffff";
                    }
                }
            });
            // Render a standard A4 report. If a future report has many expense
            // rows, split it into additional A4 pages instead of producing one
            // very long non-standard page.
            const A4_WIDTH_MM = 210;
            const A4_HEIGHT_MM = 297;
            const pdf = new (await loadJsPDF())({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });
            const sourcePageHeight = Math.floor((canvas.width * A4_HEIGHT_MM) / A4_WIDTH_MM);
            let sourceY = 0;
            let pageNumber = 0;

            // html2canvas may leave a 1–2 px white remainder after an otherwise
            // complete A4 page. Do not turn that rounding remainder into a blank PDF page.
            const hasVisibleContent = (page: HTMLCanvasElement) => {
                const pageContext = page.getContext('2d', { willReadFrequently: true });
                if (!pageContext || page.width === 0 || page.height === 0) return false;

                const pixels = pageContext.getImageData(0, 0, page.width, page.height).data;
                const pixelCount = pixels.length / 4;
                const step = Math.max(1, Math.floor(pixelCount / 25000));
                for (let pixel = 0; pixel < pixelCount; pixel += step) {
                    const offset = pixel * 4;
                    const red = pixels[offset];
                    const green = pixels[offset + 1];
                    const blue = pixels[offset + 2];
                    const alpha = pixels[offset + 3];
                    // The report background is pure white. Very light borders/cards
                    // still fall below this threshold and count as actual content.
                    if (alpha > 0 && (red < 250 || green < 250 || blue < 250)) return true;
                }
                return false;
            };

            while (sourceY < canvas.height) {
                const sliceHeight = Math.min(sourcePageHeight, canvas.height - sourceY);
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = sliceHeight;
                const context = pageCanvas.getContext('2d');
                if (!context) throw new Error('Unable to prepare PDF page');

                context.fillStyle = '#FFFFFF';
                context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                context.drawImage(
                    canvas,
                    0, sourceY, canvas.width, sliceHeight,
                    0, 0, pageCanvas.width, pageCanvas.height
                );

                sourceY += sliceHeight;
                if (!hasVisibleContent(pageCanvas)) continue;

                if (pageNumber > 0) pdf.addPage('a4', 'portrait');
                const renderedHeight = (sliceHeight * A4_WIDTH_MM) / canvas.width;
                pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, A4_WIDTH_MM, renderedHeight);

                pageNumber += 1;
            }
            pdf.save(`Settlement_${localRecord.date}.pdf`);
        } catch (error) {
            console.error('PDF Generation Failed:', error);
            alert("生成 PDF 失败，请重试。");
        } finally {
            setIsGenerating(false);
        }
    };

    const executeReconciliation = async (perfectMatch: boolean = false) => {
        if (!reconTarget) return;
        const targetExpected = reconTarget.expectedAmount;
        const actualNum = perfectMatch ? targetExpected : (parseFloat(reconActual) || 0);
        
        if (actualNum > targetExpected) {
            return alert("❌ 实收金额不能大于系统预估记账金额！");
        }

        const diff = Number((targetExpected - actualNum).toFixed(2));
        const wasDone = isChannelReconciled(reconStatus, reconTarget.key);
        if (wasDone && !confirm(`这笔之前核对过（实收 RM ${(getReconActual(reconStatus, reconTarget.key) || 0).toFixed(2)}）。\n\n改成 RM ${actualNum.toFixed(2)}？\n旧的自动平账费用会先清掉再重记，不会重复记账。`)) return;
        setIsProcessingRecon(true);

        try {
            // 👑 统一走 utils/settlementRecon 的 applyRecon：
            //    它会先清掉这个通道旧的自动平账费用（含旧版带时间戳的），再按新差额重记一笔，
            //    所以同一笔可以改几次都不会重复记账。
            const updatedReconStatus = await applyRecon(
                localRecord,
                { key: reconTarget.key, label: reconTarget.label, expected: targetExpected },
                actualNum,
            );
            setLocalRecord({ ...localRecord, reconStatus: updatedReconStatus } as SettlementRecord);

            const matchText = perfectMatch ? '(完美对账)' : '';
            alert(`✅ ${reconTarget.label} ${wasDone ? '已更新' : '核对成功'}！${matchText}\n实际到账 RM ${actualNum.toFixed(2)}${diff > 0 ? `\n自动记入费用 RM ${diff.toFixed(2)}` : ''}`);
            setReconTarget(null);
            setReconActual('');
            onRefresh();
        } catch (e) {
            console.error(e);
            alert("核对失败，请重试");
        } finally {
            setIsProcessingRecon(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in fade-in" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="bg-white w-full max-w-lg rounded-t-[2rem] md:rounded-[2rem] shadow-2xl max-h-[95vh] md:max-h-[90vh] overflow-y-auto flex flex-col custom-scrollbar relative pb-[max(16px,env(safe-area-inset-bottom))]">
                
                {/* 核销弹窗 UI */}
                {reconTarget && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-50 rounded-t-[2rem] md:rounded-[2rem] p-6 flex flex-col items-center justify-center animate-in zoom-in-95">
                        <div className="bg-white p-6 rounded-3xl shadow-2xl border border-gray-200 w-full max-w-sm">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-black text-lg text-blue-900 flex items-center gap-2"><ShieldCheck size={20}/> 银行入账核对</h4>
                                <button onClick={() => { setReconTarget(null); setReconActual(''); }} className="p-1 hover:bg-gray-100 rounded-full"><X size={16}/></button>
                            </div>
                            <p className="text-xs text-gray-500 font-bold mb-4">当前核对: <span className="text-[#111111]">{reconTarget.label}</span></p>
                            
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4 space-y-1">
                                {reconTarget.grossAmount > reconTarget.expectedAmount && (
                                    <div className="flex justify-between text-[10px] font-bold text-gray-400 line-through">
                                        <span>原始账单/当班记账基数</span>
                                        <span>RM {reconTarget.grossAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs font-black text-blue-800">
                                    <span>预期银行到账金额</span>
                                    <span className="whitespace-nowrap">RM {reconTarget.expectedAmount.toFixed(2)}</span>
                                </div>
                            </div>

                            <button onClick={() => executeReconciliation(true)} disabled={isProcessingRecon} className="w-full py-3 mb-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-black shadow-md hover:from-green-600 hover:to-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                                {isProcessingRecon ? <Loader2 size={16} className="animate-spin"/> : <Zap size={16}/>}
                                完美无差额到账
                                <span className="text-[10px] font-bold opacity-80 ml-1 whitespace-nowrap">= RM {reconTarget.expectedAmount.toFixed(2)}</span>
                            </button>

                            <div className="relative flex items-center justify-center mb-4">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                <span className="relative bg-white px-3 text-[10px] font-bold text-gray-400 uppercase">或手动输入实际收到金额</span>
                            </div>

                            <div className="mb-6">
                                <label className="text-[10px] font-black text-blue-600 uppercase mb-2 block">Bank Received (银行实际到账)</label>
                                <input type="number" value={reconActual} onChange={e => setReconActual(e.target.value)} className="w-full p-4 bg-white border-2 border-blue-200 focus:border-blue-500 rounded-xl text-xl font-black font-mono outline-none shadow-inner" placeholder="0.00" />
                                {reconActual && parseFloat(reconActual) < reconTarget.expectedAmount && (
                                    <div className="mt-2 p-2 bg-pink-50 border border-pink-100 rounded-lg">
                                        <p className="text-[10px] text-pink-700 font-bold leading-relaxed">
                                            ⚠️ 差额 <span className="whitespace-nowrap">RM {(reconTarget.expectedAmount - parseFloat(reconActual)).toFixed(2)}</span> 将自动记为
                                            <span className="bg-pink-200 text-pink-900 px-1.5 py-0.5 rounded font-black mx-1 inline-block shadow-sm">
                                                {['grab','panda','shopee'].includes(reconTarget.key) ? '广告/平台调节费' : '银行手续费'}
                                            </span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button onClick={() => executeReconciliation(false)} disabled={!reconActual || isProcessingRecon} className="w-full py-3 bg-[#111111] text-[#FFD200] rounded-xl font-black shadow-md hover:bg-black disabled:opacity-50 flex justify-center items-center gap-2">
                                {isProcessingRecon ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
                                确认实收并平账
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-4 md:p-5 border-b border-gray-100 flex justify-between items-center bg-[#111111] rounded-t-[2rem] md:rounded-t-[2rem] sticky top-0 z-10">
                    <div>
                        <h3 className="font-black text-lg md:text-xl text-[#FFD200]">结算单详情 (Receipt Details)</h3>
                        <p className="text-[10px] md:text-xs text-gray-400 font-mono mt-1 font-bold tracking-widest">{localRecord.date} • {new Date(localRecord.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleDownloadPDF} disabled={isGenerating} className="p-2 bg-[#FFD200] text-black rounded-full hover:bg-white hover:text-black transition-colors shadow-lg disabled:opacity-50" title="导出为 PDF">
                            {isGenerating ? <Loader2 size={18} className="animate-spin"/> : <FileDown size={18}/>}
                        </button>
                        <button onClick={onClose} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20 hover:text-[#FFD200] transition-colors"><X size={18}/></button>
                    </div>
                </div>
                
                {/* 详情区：恢复没有任何 Cash/Bank 的%版本，但引入修改后的 ReconItem */}
                <div className="p-4 md:p-6 space-y-5 md:space-y-6 bg-[#F6F7FB] flex-grow pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-6">
                    <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex flex-col md:flex-row justify-between md:items-end pb-4 border-b border-gray-100 gap-2 bg-[#FFD200]/10 p-4 rounded-xl border border-[#FFD200]/30">
                            <div>
                                <span className="text-xs font-black text-gray-600 uppercase tracking-widest leading-tight">Total Sales (核心总营业额)</span>
                                <p className="text-[10px] text-gray-400 font-bold mt-1">老板视角：已彻底挤干Grab账面水分</p>
                            </div>
                            <div className="flex items-baseline gap-1 text-[#111111] shrink-0 self-end md:self-auto">
                                <span className="text-sm font-bold">RM</span>
                                <span className="text-2xl md:text-3xl font-black font-mono tracking-tighter whitespace-nowrap">{localRecord.sales.total.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        {localRecord.sales.refundTotal && localRecord.sales.refundTotal > 0 ? (
                            <div className="flex justify-between items-center text-xs bg-red-50 p-3 rounded-xl border border-red-100 mb-2 gap-2">
                                <span className="flex items-center gap-2 text-red-600 font-bold shrink-0"><RotateCcw size={14}/> Refunds</span>
                                <span className="font-mono font-bold text-red-700 whitespace-nowrap shrink-0">- RM {localRecord.sales.refundTotal.toFixed(2)}</span>
                            </div>
                        ) : null}

                        <div className="flex justify-between items-center text-sm p-2 gap-2">
                            <span className="flex items-center gap-2 text-gray-600 font-bold shrink-0"><Banknote size={16} className="text-green-600"/> Cash (现金)</span>
                            <span className="font-mono font-bold text-[#111111] text-base md:text-lg whitespace-nowrap shrink-0">RM {localRecord.sales.cash.toFixed(2)}</span>
                        </div>
                        
                        <div className="bg-blue-50/50 p-3 md:p-4 rounded-xl space-y-2 border border-blue-100 overflow-hidden">
                            <p className="text-[10px] font-black text-blue-800 uppercase flex items-center gap-1.5"><CreditCard size={12}/> Digital & POS Payments</p>
                            <ReconItem label="TNG eWallet" gross={localRecord.sales.tng || 0} isReconciled={isChannelReconciled(reconStatus, 'tng')} actualAmount={getReconActual(reconStatus, 'tng')} onReconcile={() => setReconTarget({key: 'tng', label: 'TNG eWallet', expectedAmount: localRecord.sales.tng || 0, grossAmount: localRecord.sales.tng || 0})} />
                            <ReconItem label="Debit / DuitNow" gross={totalDebit} isReconciled={isChannelReconciled(reconStatus, 'debit')} actualAmount={getReconActual(reconStatus, 'debit')} onReconcile={() => setReconTarget({key: 'debit', label: 'Debit / DuitNow', expectedAmount: totalDebit, grossAmount: totalDebit})} />
                            <ReconItem label="Credit Card" gross={totalCard} isReconciled={isChannelReconciled(reconStatus, 'credit')} actualAmount={getReconActual(reconStatus, 'credit')} onReconcile={() => setReconTarget({key: 'credit', label: 'Credit Card', expectedAmount: totalCard, grossAmount: totalCard})} />
                            <ReconItem label="Amex" gross={localRecord.sales.amex || 0} isReconciled={isChannelReconciled(reconStatus, 'amex')} actualAmount={getReconActual(reconStatus, 'amex')} onReconcile={() => setReconTarget({key: 'amex', label: 'Amex', expectedAmount: localRecord.sales.amex || 0, grossAmount: localRecord.sales.amex || 0})} />
                        </div>

                        {totalDelivery > 0 && (
                            <div className="bg-orange-50/50 p-3 md:p-4 rounded-xl space-y-2 border border-orange-100 overflow-hidden">
                                <div className="flex flex-wrap justify-between items-center border-b border-orange-100 pb-2 gap-1">
                                    <p className="text-[10px] font-black text-orange-800 uppercase flex items-center gap-1.5"><Truck size={12}/> Delivery Platforms</p>
                                    <span className="font-mono text-[10px] md:text-xs font-black text-orange-800 whitespace-nowrap bg-orange-100/50 px-2 py-0.5 rounded">记账总额: RM {totalDelivery.toFixed(2)}</span>
                                </div>
                                <ReconItem label="GrabFood" gross={grabGross} net={grabNet} ads={grabAds} isReconciled={isChannelReconciled(reconStatus, 'grab')} actualAmount={getReconActual(reconStatus, 'grab')} onReconcile={() => setReconTarget({key: 'grab', label: 'GrabFood', expectedAmount: grabExpected, grossAmount: grabGross})} />
                                <ReconItem label="FoodPanda" gross={pandaGross} net={pandaNet} ads={pandaAds} isReconciled={isChannelReconciled(reconStatus, 'panda')} actualAmount={getReconActual(reconStatus, 'panda')} onReconcile={() => setReconTarget({key: 'panda', label: 'FoodPanda', expectedAmount: pandaReportValue, grossAmount: pandaGross})} />
                                {/* 🌟 修复：把拆分好的 net 和 ads 属性完美塞进 ShopeeFood 标签，对账期望改为 shopeeExpected */}
                                <ReconItem label="ShopeeFood" gross={shopeeGross} net={shopeeNet} ads={shopeeAds} isReconciled={isChannelReconciled(reconStatus, 'shopee')} actualAmount={getReconActual(reconStatus, 'shopee')} onReconcile={() => setReconTarget({key: 'shopee', label: 'ShopeeFood', expectedAmount: shopeeExpected, grossAmount: shopeeGross})} />
                            </div>
                        )}
                    </div>
                    
                    {/* 📊 营运数据 */}
                    <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                        <p className="text-[10px] font-black text-violet-800 uppercase flex items-center gap-1.5">📊 营运数据 (Operations)</p>
                        {recHasOps ? (
                            <>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                                        <p className="text-[10px] font-black text-violet-700">人均消费</p>
                                        <p className="font-mono font-black text-lg text-violet-900">RM {fmtMoneyOrDash(recPerPax)}</p>
                                    </div>
                                    <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                                        <p className="text-[10px] font-black text-violet-700">单均</p>
                                        <p className="font-mono font-black text-lg text-violet-900">RM {fmtMoneyOrDash(recPerBill)}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    {OPS_FIELDS.map(f => (
                                        <div key={f.key} className="bg-[#F6F7FB] rounded-xl px-2.5 py-2 min-w-0">
                                            <p className="text-[10px] font-bold text-gray-500 truncate">{f.emoji} {f.short}</p>
                                            <p className="font-mono font-black text-[#111111]">{recOps[f.key] || '—'}</p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs font-bold text-gray-400 bg-[#F6F7FB] rounded-xl px-3 py-2.5">这天没有记录人数 / VIP / WhatsApp（可按下面「直接编辑」补填）</p>
                        )}
                    </div>

                    {/* 💸 现金扣除明细 —— 以前只有下载 PDF 才看得到，现在直接显示在画面上 */}
                    <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-center gap-2">
                            <p className="text-[10px] font-black text-red-800 uppercase flex items-center gap-1.5"><Wallet size={12}/> 现金扣除 (Cash Deductions)</p>
                            <span className="font-mono text-xs font-black text-red-700 whitespace-nowrap">- RM {(recordWithdrawal + totalRecordExpenses).toFixed(2)}</span>
                        </div>
                        {recordWithdrawal === 0 && totalRecordExpenses === 0 ? (
                            <p className="text-xs font-bold text-gray-400 bg-[#F6F7FB] rounded-xl px-3 py-2.5">当日没有钱箱现金支出，也没有业主提支</p>
                        ) : (
                            <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                                {recordWithdrawal > 0 && (
                                    <div className="flex justify-between items-center gap-3 px-3 py-2.5 bg-orange-50/60">
                                        <span className="text-sm font-bold text-orange-900">业主提支 <span className="text-[10px] text-orange-600">Owner's Drawings</span></span>
                                        <span className="font-mono font-black text-orange-900 whitespace-nowrap">RM {recordWithdrawal.toFixed(2)}</span>
                                    </div>
                                )}
                                {recordExpenses.map((e: any, idx: number) => (
                                    <div key={e.id || idx} className="flex justify-between items-center gap-3 px-3 py-2.5">
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold text-[#111111] truncate">{e.company || '未知商户'}</span>
                                            <span className="block text-[11px] font-bold text-gray-400 truncate">{e.item || '杂物'}</span>
                                        </span>
                                        <span className="font-mono font-black text-[#111111] whitespace-nowrap">RM {(Number(e.amount) || 0).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl py-2">
                                <p className="text-[10px] font-black text-gray-500">系统应余 Expected</p>
                                <p className="font-mono font-black text-[#111111] text-sm">RM {(localRecord.openingCash + localRecord.sales.cash - recordWithdrawal - totalRecordExpenses).toFixed(2)}</p>
                            </div>
                            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl py-2">
                                <p className="text-[10px] font-black text-blue-600">实际点算 Actual</p>
                                <p className="font-mono font-black text-blue-800 text-sm">RM {localRecord.closingCash.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>

                    <div className={`flex flex-col md:flex-row md:justify-between md:items-center p-4 rounded-xl border-2 gap-2 ${localRecord.variance >= 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                        <div>
                            <span className="font-black uppercase tracking-widest text-xs block mb-1">Cash Variance</span>
                            {localRecord.varianceReason && <span className="text-[10px] text-gray-600 font-bold block md:inline">{localRecord.varianceReason}</span>}
                        </div>
                        <span className="font-mono font-black text-2xl self-end md:self-auto whitespace-nowrap">{localRecord.variance > 0 ? '+' : ''}{localRecord.variance.toFixed(2)}</span>
                    </div>
                    
                    {/* ✏️ 直接编辑：不用撤销重来，改完按确认 */}
                    {editMode ? (
                        <div className="border-2 border-[#FFD200] bg-amber-50/50 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-black text-stone-900 flex items-center gap-1.5"><Edit3 size={14}/> 直接编辑 {localRecord.date}</p>
                                <button onClick={() => setEditMode(false)} className="text-[11px] font-black text-gray-500 px-2 py-1 rounded-lg hover:bg-white min-h-[36px]">取消</button>
                            </div>

                            {(() => {
                                // ⚠️ 一定要用「函数回传 JSX」，不可以在 render 里定义成组件 —— 
                                //    那样每打一个字 React 就会把 input 重新挂载一次，游标会跳走。
                                const numField = (k: string, label: string) => (
                                    <div className="min-w-0" key={k}>
                                        <label className="text-[9px] font-black text-gray-500 uppercase block mb-1 truncate">{label}</label>
                                        <input type="number" inputMode="decimal" step="0.01"
                                            value={editForm[k] ?? 0}
                                            onChange={e => setEF(k, e.target.value)}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-2 font-mono font-black text-stone-900 outline-none focus:border-[#FFD200] focus:ring-2 focus:ring-[#FFD200]/30"
                                            style={{ fontSize: '16px', minHeight: '42px' }} />
                                    </div>
                                );
                                return (
                                    <>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1.5">现金 (Cash)</p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {numField('openingCash', '开班现金')}
                                                {numField('cash', '现金营业额')}
                                                {numField('ownerWithdrawal', '老板提支')}
                                                {numField('closingCash', '收班现金')}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1.5">电子支付 (POS)</p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {numField('tng', 'TNG')}
                                                {numField('duitnow', 'Debit / DuitNow')}
                                                {numField('card', 'Credit Card')}
                                                {numField('amex', 'Amex')}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1.5">外卖 (Delivery) — Gross / Net / 广告费</p>
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-3 gap-2">
                                                    {numField('grabGross', 'Grab Gross')}
                                                    {numField('grabNet', 'Grab Net')}
                                                    {numField('grabAds', 'Grab 广告')}
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {numField('pandaGross', 'Panda Gross')}
                                                    {numField('pandaNet', 'Panda Net')}
                                                    {numField('pandaAds', 'Panda 广告')}
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {numField('shopeeGross', 'Shopee Gross')}
                                                    {numField('shopeeNet', 'Shopee Net')}
                                                    {numField('shopeeAds', 'Shopee 广告')}
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {numField('lalamove', 'Lalamove')}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1.5">营运数据 (Operations)</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {OPS_FIELDS.map(f => numField(`ops_${f.key}`, f.label))}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}

                            <p className="text-[10px] text-amber-800 font-bold flex items-start gap-1 bg-amber-100/60 rounded-lg p-2">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                按确认后系统会重算总营业额和现金差异。已核对过、但金额被改动的通道会退回「待核对」，它的自动平账费用也会一起清掉，请记得重新核对。
                            </p>

                            <button onClick={saveEdit} disabled={isSavingEdit}
                                className="w-full py-3.5 bg-[#111111] text-[#FFD200] rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40">
                                {isSavingEdit ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                确认修改 (Confirm)
                            </button>
                        </div>
                    ) : (
                        <button onClick={openEdit}
                            className="w-full py-3.5 bg-white border-2 border-[#FFD200] text-stone-900 rounded-2xl font-black text-sm hover:bg-amber-50 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm">
                            <Edit3 size={18}/> 直接编辑金额（不用撤销）
                        </button>
                    )}

                    <div className="flex flex-col md:flex-row gap-3">
                        <button onClick={() => onUndoEdit(localRecord)} className="flex-[2] py-3.5 md:py-4 bg-[#111111] border-2 border-[#111111] text-[#FFD200] rounded-2xl font-black text-sm hover:bg-black shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2">
                            <RotateCcw size={18}/> 撤销并重新编辑 (Undo & Edit)
                        </button>
                        <button onClick={() => onDelete(localRecord.id)} className="flex-[1] py-3.5 md:py-4 bg-white border-2 border-red-100 text-red-600 rounded-2xl font-black text-sm hover:bg-red-50 transition-all flex items-center justify-center gap-2 shadow-sm">
                            <Trash2 size={18}/> 仅删除
                        </button>
                    </div>
                </div>

                {/* ========================================================= */}
                {/* 🌟 升级版：高颜值、呼吸感、高质感 P&L Slip 报表模板 🌟 */}
                {/* ========================================================= */}
                {createPortal(
                    <div
                        id="pdf-print-root"
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "210mm",
                            pointerEvents: "none",
                            opacity: 0,
                            zIndex: -9999
                        }}
                    >
                    <div ref={printRef} id="pdf-print-root-content"
                        style={{ fontKerning: 'none', textRendering: 'geometricPrecision', wordSpacing: '0.08em' }}
                        className="w-[794px] min-h-[1123px] bg-[#FFFFFF] px-[53px] py-[45px] font-sans text-[#111111] box-border flex flex-col leading-relaxed">
                        
                        {/* A4 头部：将报告身份、结算日期与编号分开，避免旧版流水号挤在一起。 */}
                        <div className="border-b-2 border-[#111111] pb-3 mb-4 shrink-0">
                            <div className="h-1.5 w-12 bg-[#FFD200] rounded-full mb-2.5" />
                            <div className="flex items-start justify-between gap-6">
                                <div>
                                    <h1 className="text-[21px] leading-none font-black tracking-[0.12em] uppercase text-[#111111] whitespace-nowrap">KIM LIAN KEE GROUP</h1>
                                    <p className="mt-2 text-[9px] leading-3.5 font-black tracking-[0.14em] uppercase text-[#6B7280] whitespace-nowrap">Kepong Branch</p>
                                    <p className="text-[9px] leading-3.5 font-semibold text-[#6B7280]">甲洞分行</p>
                                </div>
                                <div className="text-right shrink-0 text-[9px] leading-4 text-[#6B7280]">
                                    <p className="font-black tracking-[0.1em] uppercase text-[#111111]">Daily Settlement Report</p>
                                    <p className="font-medium">每日结算报告</p>
                                    <p className="whitespace-nowrap"><span className="font-black text-[#111111]">Business date</span>: {localRecord.date}</p>
                                    <p className="whitespace-nowrap"><span className="font-black text-[#111111]">Report no.</span>: SET-{localRecord.date.replace(/-/g, '')}-{new Date(localRecord.timestamp).getTime().toString().slice(-4)}</p>
                                    {recordWeather && (
                                        <p className="whitespace-nowrap"><span className="font-black text-[#111111]">Weather</span>: {recordWeather.en} ({recordWeather.label})</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 核心摘要：先让老板/主管看到最重要的数字，而不是先阅读付款细目。 */}
                        <div className="grid grid-cols-4 border border-[#E5E7EB] rounded-xl overflow-hidden mb-5 shrink-0">
                            <div className="px-4 py-3 border-r border-[#E5E7EB] bg-[#FFFBE6]">
                                <p className="text-[9px] font-black uppercase tracking-wider text-[#6B7280]">Net Revenue</p>
                                <p className="mt-1 font-mono text-base font-black text-[#111111]">RM {localRecord.sales.total.toFixed(2)}</p>
                                <p className="text-[9px] text-[#6B7280]">挤干水分总营业额</p>
                            </div>
                            <div className="px-4 py-3 border-r border-[#BBF7D0] bg-[#F0FDF4]">
                                <p className="text-[9px] font-black uppercase tracking-wider text-[#6B7280]">Cash Sales</p>
                                <p className="mt-1 font-mono text-base font-black text-[#15803D]">RM {localRecord.sales.cash.toFixed(2)}</p>
                                <p className="text-[9px] text-[#6B7280]">今日现金收入</p>
                            </div>
                            <div className="px-4 py-3 border-r border-[#BFDBFE] bg-[#EFF6FF]">
                                <p className="text-[9px] font-black uppercase tracking-wider text-[#6B7280]">Closing Cash</p>
                                <p className="mt-1 font-mono text-base font-black text-[#1D4ED8]">RM {localRecord.closingCash.toFixed(2)}</p>
                                <p className="text-[9px] text-[#6B7280]">实际点算现金</p>
                            </div>
                            <div className={`px-4 py-3 ${localRecord.variance === 0 ? 'bg-[#F6F7FB]' : localRecord.variance > 0 ? 'bg-[#F0FDF4]' : 'bg-[#FEF2F2]'}`}>
                                <p className="text-[9px] font-black uppercase tracking-wider text-[#6B7280]">Cash Variance</p>
                                <p className={`mt-1 font-mono text-base font-black ${localRecord.variance === 0 ? 'text-[#111111]' : localRecord.variance > 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'}`}>{localRecord.variance > 0 ? '+' : ''}RM {localRecord.variance.toFixed(2)}</p>
                                <p className="text-[9px] text-[#6B7280]">对账差异</p>
                            </div>
                        </div>

                        {/* 📊 营运数据：人数 / 人均 / 单均 / VIP / WhatsApp（旧记录没填就不显示这一行） */}
                        {recHasOps && (
                            <div className="grid grid-cols-4 border border-[#DDD6FE] rounded-xl overflow-hidden mb-5 shrink-0 bg-[#F5F3FF]">
                                <div className="px-4 py-2.5 border-r border-[#DDD6FE]">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[#6D28D9]">Pax · Avg Spend</p>
                                    <p className="mt-0.5 font-mono text-sm font-black text-[#111111] whitespace-nowrap">{recOps.pax || '—'} 人 · RM {fmtMoneyOrDash(recPerPax)}</p>
                                    <p className="text-[9px] text-[#6B7280]">顾客人数 · 人均消费</p>
                                </div>
                                <div className="px-4 py-2.5 border-r border-[#DDD6FE]">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[#6D28D9]">Bills · Avg Bill</p>
                                    <p className="mt-0.5 font-mono text-sm font-black text-[#111111] whitespace-nowrap">{recOps.bills || '—'} 单 · RM {fmtMoneyOrDash(recPerBill)}</p>
                                    <p className="text-[9px] text-[#6B7280]">单数 · 单均</p>
                                </div>
                                <div className="px-4 py-2.5 border-r border-[#DDD6FE]">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[#6D28D9]">VIP</p>
                                    <p className="mt-0.5 font-mono text-sm font-black text-[#111111] whitespace-nowrap">+{recOps.vipNew} · {recOps.vipVisits}</p>
                                    <p className="text-[9px] text-[#6B7280]">新会员 · 到店</p>
                                </div>
                                <div className="px-4 py-2.5">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[#6D28D9]">WhatsApp</p>
                                    <p className="mt-0.5 font-mono text-sm font-black text-[#111111] whitespace-nowrap">+{recOps.waJoin} · {recOps.waOrders}</p>
                                    <p className="text-[9px] text-[#6B7280]">新加入 · 订单</p>
                                </div>
                            </div>
                        )}

                        {/* 一页式 A4 结算：左边看收入来源，右边完成现金结算。 */}
                        <div className="grid grid-cols-2 gap-6 text-[10px]">
                            <section className="space-y-3">
                                <div className="border-b border-[#111111] pb-1.5">
                                    <h3 className="flex items-center gap-2 font-black uppercase tracking-widest text-[#111111] text-xs"><span className="h-2 w-2 rounded-full bg-[#FFD200]" />1. Revenue</h3>
                                    <p className="mt-0.5 pl-4 text-[9px] font-medium text-[#6B7280]">营业收入明细</p>
                                </div>
                                <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] overflow-hidden">
                                    <div className="flex justify-between items-center px-3 py-2.5">
                                        <span><span className="block font-black uppercase tracking-wide text-[#111111]">In-Store Revenue</span><span className="block mt-0.5 text-[9px] text-[#6B7280]">店内实收</span></span>
                                        <span className="font-mono font-black text-sm whitespace-nowrap">RM {localRecord.sales.storeHubTotal.toFixed(2)}</span>
                                    </div>
                                    <div className="mx-3 border-t border-[#FDE68A] py-2 space-y-1.5 text-[#6B7280]">
                                        <div className="grid grid-cols-[1fr_auto] gap-3"><span>Cash (现金)</span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {localRecord.sales.cash.toFixed(2)}</span></div>
                                        <div className="grid grid-cols-[1fr_auto] gap-3"><span>TNG eWallet</span><span className="font-mono whitespace-nowrap">RM {(localRecord.sales.tng || 0).toFixed(2)}</span></div>
                                        <div className="grid grid-cols-[1fr_auto] gap-3"><span>Debit Card</span><span className="font-mono whitespace-nowrap">RM {totalDebit.toFixed(2)}</span></div>
                                        <div className="grid grid-cols-[1fr_auto] gap-3"><span>Credit Card</span><span className="font-mono whitespace-nowrap">RM {totalCard.toFixed(2)}</span></div>
                                        {localRecord.sales.amex > 0 && <div className="grid grid-cols-[1fr_auto] gap-3"><span>Amex</span><span className="font-mono whitespace-nowrap">RM {(localRecord.sales.amex || 0).toFixed(2)}</span></div>}
                                    </div>
                                </div>
                                {totalDelivery > 0 && <div className="rounded-xl border border-[#BFDBFE] bg-white overflow-hidden">
                                    <div className="flex justify-between items-center px-3 py-2.5 bg-[#EFF6FF]">
                                        <span><span className="block font-black uppercase tracking-wide text-[#111111]">Delivery Revenue</span><span className="block mt-0.5 text-[9px] text-[#6B7280]">外卖实收</span></span>
                                        <span className="font-mono font-black text-sm whitespace-nowrap">RM {totalDelivery.toFixed(2)}</span>
                                    </div>
                                    <div className="mx-3 py-2 space-y-1.5 text-[#6B7280]">
                                        {grabGross > 0 && <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span>GrabFood <span className="text-[9px] text-[#9CA3AF]">Net {grabNet.toFixed(1)} · Ads -{grabAds.toFixed(1)}</span></span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {grabReportValue.toFixed(2)}</span></div>}
                                        {pandaReportValue > 0 && <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span>FoodPanda <span className="text-[9px] text-[#9CA3AF]">{hasPandaNet ? <>Net {pandaNet.toFixed(1)} · Ads -{pandaAds.toFixed(1)}</> : 'Legacy total'}</span></span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {pandaReportValue.toFixed(2)}</span></div>}
                                        {shopeeGross > 0 && <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span>ShopeeFood <span className="text-[9px] text-[#9CA3AF]">Net {shopeeNet.toFixed(1)} · Ads -{shopeeAds.toFixed(1)}</span></span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {shopeeReportValue.toFixed(2)}</span></div>}
                                        {Number(deliveryBreakdown.lalamove) > 0 && <div className="grid grid-cols-[1fr_auto] gap-3"><span>Lalamove</span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {Number(deliveryBreakdown.lalamove).toFixed(2)}</span></div>}
                                    </div>
                                </div>}
                            </section>

                            <section className="space-y-4">
                                <div className="space-y-2.5">
                                    <div className="border-b border-[#111111] pb-1.5"><h3 className="flex items-center gap-2 font-black uppercase tracking-widest text-[#111111] text-xs"><span className="h-2 w-2 rounded-full bg-[#F97316]" />2. Cash Deductions</h3><p className="mt-0.5 pl-4 text-[9px] font-medium text-[#6B7280]">临时现金扣除</p></div>
                                    {recordWithdrawal > 0 && <div className="flex justify-between items-center rounded-lg border border-[#FDE7C7] bg-[#FFF7ED] px-3 py-2"><span><span className="block font-black text-[#431407] whitespace-nowrap">Owner's Drawings</span><span className="block text-[9px] text-[#9A3412] whitespace-nowrap">业主提支</span></span><span className="font-mono font-black text-[#431407] whitespace-nowrap">- RM {recordWithdrawal.toFixed(2)}</span></div>}
                                    {totalRecordExpenses > 0 && <div className="rounded-lg border border-[#FECACA] overflow-hidden"><div className="flex justify-between items-center bg-[#FEF2F2] px-3 py-2"><span><span className="block font-black text-[#991B1B]">Cash Expenses</span><span className="block text-[9px] text-[#B91C1C]">当日钱箱现金支出</span></span><span className="font-mono font-black text-[#B91C1C] whitespace-nowrap">- RM {totalRecordExpenses.toFixed(2)}</span></div><div className="mx-3 py-2 space-y-1.5 text-[#6B7280]">{recordExpenses.map((e: any, idx: number) => <div key={e.id || idx} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="truncate">{e.company || '未知商户'} · {e.item || '杂物'}</span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {Number(e.amount).toFixed(2)}</span></div>)}</div></div>}
                                    {recordWithdrawal === 0 && totalRecordExpenses === 0 && <p className="rounded-lg bg-[#F6F7FB] px-3 py-2 text-[#6B7280]">今日无任何临时现金支出或业主提支</p>}
                                </div>
                                <div className="space-y-2.5 pt-1">
                                    <div className="border-b border-[#111111] pb-1.5"><h3 className="flex items-center gap-2 font-black uppercase tracking-widest text-[#111111] text-xs"><span className="h-2 w-2 rounded-full bg-[#2563EB]" />3. Cash Counter Balance</h3><p className="mt-0.5 pl-4 text-[9px] font-medium text-[#6B7280]">钱箱结余审计</p></div>
                                    <div className="space-y-1.5 px-1 text-[#6B7280]">
                                        <div className="grid grid-cols-[1fr_auto] gap-3"><span>Opening Float (开班备用金)</span><span className="font-mono font-bold text-[#111111] whitespace-nowrap">RM {localRecord.openingCash.toFixed(2)}</span></div>
                                        <div className="grid grid-cols-[1fr_auto] gap-3"><span>Cash Sales (今日现金收入)</span><span className="font-mono font-bold text-[#22C55E] whitespace-nowrap">+ RM {localRecord.sales.cash.toFixed(2)}</span></div>
                                        {(recordWithdrawal > 0 || totalRecordExpenses > 0) && <div className="grid grid-cols-[1fr_auto] gap-3 text-[#EF4444]"><span>Cash Deductions (现金扣除)</span><span className="font-mono font-bold whitespace-nowrap">- RM {(recordWithdrawal + totalRecordExpenses).toFixed(2)}</span></div>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-2.5"><p className="font-black text-[#111111]">Expected Cash</p><p className="text-[9px] text-[#6B7280]">系统理论应余</p><p className="mt-1 font-mono font-black text-sm">RM {(localRecord.openingCash + localRecord.sales.cash - recordWithdrawal - totalRecordExpenses).toFixed(2)}</p></div><div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-2.5"><p className="font-black text-[#1E40AF]">Actual Cash</p><p className="text-[9px] text-[#3B82F6]">钱箱实际点算</p><p className="mt-1 font-mono font-black text-sm text-[#1D4ED8]">RM {localRecord.closingCash.toFixed(2)}</p></div></div>
                                </div>
                            </section>
                        </div>

                        <div className={`mt-5 flex items-center justify-between rounded-xl border-2 px-4 py-3 ${localRecord.variance === 0 ? 'border-[#111111] bg-[#111111] text-white' : localRecord.variance > 0 ? 'border-[#86EFAC] bg-[#F0FDF4]' : 'border-[#FCA5A5] bg-[#FEF2F2]'}`}>
                            <span><span className={`block font-black uppercase tracking-widest text-xs ${localRecord.variance === 0 ? 'text-white' : 'text-[#111111]'}`}>Cash Variance</span><span className={`block mt-0.5 text-[9px] ${localRecord.variance === 0 ? 'text-white/70' : 'text-[#6B7280]'}`}>对账差异 {localRecord.varianceReason ? `· ${localRecord.varianceReason}` : ''}</span></span>
                            <span className={`font-mono font-black text-lg whitespace-nowrap ${localRecord.variance === 0 ? 'text-white' : localRecord.variance > 0 ? 'text-[#16A34A]' : 'text-[#EF4444]'}`}>{localRecord.variance > 0 ? '+ ' : localRecord.variance < 0 ? '- ' : ''}RM {Math.abs(localRecord.variance).toFixed(2)}</span>
                        </div>

                        {/* 审计页脚：保留系统留痕，也预留了每日关账的人工确认位置。 */}
                        <div className="mt-5 pt-3 border-t border-[#E5E7EB] shrink-0">
                            <div className="grid grid-cols-3 gap-8 text-center text-[9px] text-[#6B7280]">
                                <div><div className="h-4 border-b border-[#9CA3AF] mb-1" /><p>Prepared by</p><p>收银员</p></div>
                                <div><div className="h-4 border-b border-[#9CA3AF] mb-1" /><p>Verified by</p><p>主管</p></div>
                                <div><div className="h-4 border-b border-[#9CA3AF] mb-1" /><p>Approved by</p><p>管理层</p></div>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[8px] text-[#9CA3AF]">
                                <span className="whitespace-nowrap">System-generated internal audit document</span>
                                <span className="whitespace-nowrap">Kepong Branch (甲洞分行)</span>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
                {/* ========================================================= */}
            </div>
        </div>
    );
};

export const SettlementModule: React.FC<SettlementModuleProps> = ({ storeConfig, onClose, isStandalone = true }) => {
    const [activeTab, setActiveTab] = useState<'SHIFT' | 'HISTORY'>('SHIFT');
    const [isShiftOpen, setIsShiftOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [openingTotal, setOpeningTotal] = useState<number>(0);
    // 🔗 开班备用金 = 上一笔结算的「实点 Actual」（closingCash），自动带入并锁定
    const [prevClosing, setPrevClosing] = useState<{ date: string; closingCash: number } | null>(null);
    const [prevClosingLoading, setPrevClosingLoading] = useState(false);
    const [openingUnlocked, setOpeningUnlocked] = useState(false);
    // 营业日期因为「当天已结算」被自动跳到下一天时，记下原本那天给画面提示
    const [autoAdvancedFrom, setAutoAdvancedFrom] = useState<string | null>(null);
    const [showOpeningPin, setShowOpeningPin] = useState(false);
    const [openingPin, setOpeningPin] = useState('');
    const [openingPinError, setOpeningPinError] = useState(false);
    const submitOpeningPin = () => {
        if (openingPin === SETTINGS_PASSWORD) {
            setOpeningUnlocked(true);
            setShowOpeningPin(false);
            setOpeningPin('');
            setOpeningPinError(false);
        } else {
            setOpeningPinError(true);
            setOpeningPin('');
        }
    };
    const [businessDate, setBusinessDate] = useState<string>(getBusinessDateStr(storeConfig.businessDayCutoff || 4));
    
    // 🌟 核心数据模型更新：追加 grab 与 shopee 与 panda 的 Gross/Net/Ads 拆分
    const [salesData, setSalesData] = useState({
        storeHubTotal: 0, refundTotal: 0, cash: 0, tng: 0, duitnow: 0, card: 0, amex: 0, 
        grabGross: 0, grabNet: 0, grabAds: 0, 
        pandaGross: 0, pandaNet: 0, pandaAds: 0, // 👈 新增分拆 FoodPanda
        shopeeGross: 0, shopeeNet: 0, shopeeAds: 0, // 👈 新增分拆
        lalamove: 0,
        // Legacy fields mapping
        grab: 0, panda: 0, shopee: 0
    });

    const [closingCashInput, setClosingCashInput] = useState<number>(0);
    const [varianceReason, setVarianceReason] = useState<string>('');
    const [weather, setWeather] = useState<WeatherCondition | ''>('');
    
    // 🌟 新增：当日 Expected Cash 临时支出列表 (不连外部，仅当班记录)
    const [dayExpenses, setDayExpenses] = useState<{ id: string; company: string; item: string; amount: number }[]>([]);
    // 🌟 新增：老板提早抽走的大额现金
    const [ownerWithdrawal, setOwnerWithdrawal] = useState<number>(0);
    // 📊 营运数据：顾客人数 / 单数 / VIP / WhatsApp
    const [ops, setOps] = useState<SettlementOps>(EMPTY_OPS);
    
    // 🌟 新增：添加一行支出的快捷方法
    const handleAddDayExpense = () => {
        setDayExpenses([...dayExpenses, { id: `day_exp_${Date.now()}`, company: '', item: '', amount: 0 }]);
    };
    // 🌟 新增：删除某行支出的快捷方法
    const handleRemoveDayExpense = (id: string) => {
        setDayExpenses(dayExpenses.filter(exp => exp.id !== id));
    };
    // 🌟 新增：更新支出内容的快捷方法
    const handleUpdateDayExpense = (id: string, field: 'company' | 'item' | 'amount', value: any) => {
        setDayExpenses(dayExpenses.map(exp => exp.id === id ? { ...exp, [field]: value } : exp));
    };

    const [historyRecords, setHistoryRecords] = useState<SettlementRecord[]>([]);
    const [filterMonth, setFilterMonth] = useState<string>(new Date().toISOString().slice(0, 7)); 
    const [selectedRecord, setSelectedRecord] = useState<SettlementRecord | null>(null);
    const [isBatchReconOpen, setIsBatchReconOpen] = useState(false);   // 批量核对
    const [isExcelExportOpen, setIsExcelExportOpen] = useState(false); // 📊 批量导出 Excel
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => { loadData(); }, []);
    useEffect(() => { if (activeTab === 'HISTORY') loadHistory(); }, [activeTab, filterMonth]);
    
    const loadData = async () => {
        setIsLoading(true);
        try {
            const shift = await DataManager.getActiveShift();

            if (shift) {
                setBusinessDate(shift.businessDate || getBusinessDateStr(storeConfig.businessDayCutoff || 4));
                
                const savedCounts = shift.openingCounts || {};
                const savedCoins = shift.openingCoins || 0;
                const calcTotal = Object.entries(savedCounts).reduce((acc, [val, count]) => acc + (parseInt(val) * (Number(count) || 0)), 0) + Number(savedCoins);
                setOpeningTotal(shift.openingTotal ?? calcTotal);
                
                const savedSales = shift.salesData || {};
                setSalesData({
                    storeHubTotal: savedSales.storeHubTotal || 0, refundTotal: savedSales.refundTotal || 0, 
                    cash: savedSales.cash || 0, tng: savedSales.tng || 0, duitnow: savedSales.duitnow || 0, 
                    card: savedSales.card || 0, amex: savedSales.amex || 0, 
                    grabGross: savedSales.grabGross || 0,
                    grabNet: savedSales.grabNet !== undefined ? savedSales.grabNet : (savedSales.grab || 0),
                    grabAds: savedSales.grabAds || 0,
                    pandaGross: savedSales.pandaGross || savedSales.panda || 0,
                    pandaNet: savedSales.pandaNet !== undefined ? savedSales.pandaNet : (savedSales.panda || 0),
                    pandaAds: savedSales.pandaAds || 0,
                    shopeeGross: savedSales.shopeeGross || 0,
                    shopeeNet: savedSales.shopeeNet !== undefined ? savedSales.shopeeNet : (savedSales.shopee || 0), // 👈 新增
                    shopeeAds: savedSales.shopeeAds || 0, // 👈 新增
                    lalamove: savedSales.lalamove || 0,
                    grab: savedSales.grab || 0, panda: savedSales.panda || 0, shopee: savedSales.shopee || 0
                });
                
                setClosingCashInput(shift.closingCashInput || 0);
                setVarianceReason(shift.varianceReason || '');
                setWeather(shift.weather || '');
                if (shift.dayExpenses) setDayExpenses(shift.dayExpenses);
                if (shift.ownerWithdrawal !== undefined) setOwnerWithdrawal(shift.ownerWithdrawal);
                setOps(getOps(shift));
                setIsShiftOpen(true);
            } else {
                setBusinessDate(getBusinessDateStr(storeConfig.businessDayCutoff || 4));
            }
        } catch (error) { console.error(error); } finally { setIsLoading(false); }
    };

    const loadHistory = async () => {
        setIsLoading(true);
        const records = await DataManager.getSettlements(filterMonth);
        records.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setHistoryRecords(records);
        setIsLoading(false);
    };

    useEffect(() => {
        if (isShiftOpen && !isLoading && !isSubmitting && activeTab === 'SHIFT') {
            const shiftData = {
                businessDate: businessDate || getBusinessDateStr(4),
                openingTotal, salesData, 
                closingCashInput, varianceReason: varianceReason || '',
                weather: weather || '',
                dayExpenses, ownerWithdrawal, ops,
                updatedAt: new Date().toISOString()
            };
            DataManager.saveActiveShift(shiftData);
        }
    }, [isShiftOpen, businessDate, openingTotal, salesData, closingCashInput, varianceReason, weather, dayExpenses, ownerWithdrawal, ops, isLoading, activeTab, isSubmitting]);

    // 🌟 核心计算引擎：自动化求和并剔除外卖水分
    const totals = useMemo(() => {
        const s = salesData;
        // 1. 自动汇总 POS 渠道作为 storeHubTotal
        const posSales = (Number(s.cash)||0) + (Number(s.tng)||0) + (Number(s.duitnow)||0) + (Number(s.card)||0) + (Number(s.amex)||0);
        const storeHubTotal = posSales; // 👈 自动求和，不再依赖手动输入
        
        // 2. 扣除广告费后的 Grab(实收) + Panda(实收) + Shopee(实收)（若未单独填写 Net，默认以 Gross 为准）
        const grabNetVal = Number(s.grabNet) > 0 ? Number(s.grabNet) : (Number(s.grabGross) || 0);
        const grabVal = grabNetVal - (Number(s.grabAds) || 0);

        const pandaNetVal = Number(s.pandaNet) > 0 ? Number(s.pandaNet) : (Number(s.pandaGross) || 0);
        const pandaVal = pandaNetVal - (Number(s.pandaAds) || 0);

        const shopeeNetVal = Number(s.shopeeNet) > 0 ? Number(s.shopeeNet) : (Number(s.shopeeGross) || 0);
        const shopeeVal = shopeeNetVal - (Number(s.shopeeAds) || 0);

        const deliverySales = grabVal + pandaVal + shopeeVal + (Number(s.lalamove)||0);
        
        const totalRevenue = posSales + deliverySales;
        
        // 🌟 核心计算更新：汇总当班所有的临时现金支出
        const totalDayExpenses = dayExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
        
        // 🌟 业主视角新公式：应余现金 = 开班现金 + 今日现金营业额 - 临时支出 - 业主提支
        const expectedCash = Number(openingTotal) + Number(s.cash || 0) - totalDayExpenses - Number(ownerWithdrawal); 
        
        const variance = Number(closingCashInput) - expectedCash;
        const salesVariance = 0; 
        return { posSales, deliverySales, totalRevenue, expectedCash, variance, storeHubTotal, salesVariance, totalDayExpenses };
    }, [openingTotal, salesData, closingCashInput, dayExpenses, ownerWithdrawal]); // 👈 别忘了追加依赖项

    // 🔗 还没开班时：找「营业日期之前最近的一笔结算」，把它的实点 Actual 带进来当开班备用金
    //    只读 1 笔（date < 营业日期，按日期倒序 limit 1），单栏位排序不用建复合索引
    useEffect(() => {
        if (isShiftOpen || isLoading || !businessDate) return;
        let cancelled = false;
        setPrevClosingLoading(true);
        (async () => {
            try {
                // 👑 用 <= 营业日期：如果这一天已经结算过（例如凌晨 2 点还在 4 点换日之前，
                //    营业日期还停在昨天），就自动跳到下一天，免得又带出前一天的实点、又开一次同一天
                const q = query(
                    collection(db, 'settlements'),
                    where('date', '<=', businessDate),
                    orderBy('date', 'desc'),
                    limit(1)
                );
                const snap = await getDocs(q);
                if (cancelled) return;
                const last = snap.docs[0]?.data() as SettlementRecord | undefined;
                if (last && last.date === businessDate) {
                    const [y, m, d] = businessDate.split('-').map(Number);
                    const next = new Date(y, m - 1, d + 1);
                    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
                    setAutoAdvancedFrom(businessDate);
                    setBusinessDate(nextStr);   // effect 会用新日期再跑一次，带出刚结算那天的实点
                    return;
                }
                if (last && typeof last.closingCash === 'number') {
                    setPrevClosing({ date: last.date, closingCash: Number(last.closingCash) || 0 });
                    setOpeningTotal(Number(last.closingCash) || 0);
                    setOpeningUnlocked(false);
                } else {
                    // 第一次使用 / 找不到前一天：只能手动输入
                    setPrevClosing(null);
                    setOpeningUnlocked(true);
                }
            } catch (err) {
                console.warn('读取上一笔实点失败，改为手动输入', err);
                if (!cancelled) { setPrevClosing(null); setOpeningUnlocked(true); }
            } finally {
                if (!cancelled) setPrevClosingLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isShiftOpen, isLoading, businessDate]);

    const openingMismatch = !!prevClosing && Math.abs(openingTotal - prevClosing.closingCash) > 0.004;

    const handleStartShift = () => {
        if (openingTotal <= 0 && !confirm("点算总额为 RM 0，确定开班吗？")) return;
        if (openingMismatch && !confirm(
            `⚠️ 开班备用金 RM ${openingTotal.toFixed(2)} 跟 ${prevClosing!.date} 的实点 RM ${prevClosing!.closingCash.toFixed(2)} 不一样` +
            `（相差 RM ${(openingTotal - prevClosing!.closingCash).toFixed(2)}）。\n\n确定要用手动输入的金额开班吗？`
        )) return;
        setIsShiftOpen(true);
    };

    const handleDeleteClick = (id: string) => setShowDeleteConfirm(true);

    const executeDeleteRecord = async () => {
        if (!selectedRecord) return;
        setIsLoading(true);
        try {
            await DataManager.deleteSettlement(selectedRecord.id);
            window.dispatchEvent(new Event('klk-settlements-updated'));
            const records = await DataManager.getSettlements(filterMonth);
            setHistoryRecords(records);
            setShowDeleteConfirm(false);
            setSelectedRecord(null); 
            alert("✅ 记录已删除");
        } catch(e) { console.error(e); alert("Delete Failed"); } finally { setIsLoading(false); }
    };

    const handleUndoAndEdit = async (record: SettlementRecord) => {
        if (!confirm(`⚠️ 确定要撤销并重新编辑 ${record.date} 的结算吗？\n\n系统将删除该历史记录，并把所有数据反填恢复到当班表单中供您修改。`)) return;
        setIsLoading(true);
        try {
            await DataManager.deleteSettlement(record.id);
            window.dispatchEvent(new Event('klk-settlements-updated'));
            setBusinessDate(record.date);
            setOpeningTotal(record.openingCash); 
            
            const bd = record.sales.deliveryBreakdown as any || {};
            setSalesData({
                storeHubTotal: record.sales.storeHubTotal || 0,
                refundTotal: record.sales.refundTotal || 0,
                cash: record.sales.cash || 0, tng: record.sales.tng || 0,
                duitnow: record.sales.duitnow || 0, card: record.sales.card || 0, amex: record.sales.amex || 0,
                grabGross: bd.grabGross || 0,
                grabNet: bd.grabNet !== undefined ? bd.grabNet : (bd.grab || 0),
                grabAds: bd.grabAds || 0,
                pandaGross: bd.pandaGross || bd.panda || 0,
                pandaNet: bd.pandaNet !== undefined ? bd.pandaNet : (bd.panda || 0),
                pandaAds: bd.pandaAds || 0,
                shopeeGross: bd.shopeeGross || 0,
                shopeeNet: bd.shopeeNet !== undefined ? bd.shopeeNet : (bd.shopee || 0), // 👈 新增
                shopeeAds: bd.shopeeAds || 0, // 👈 新增
                lalamove: bd.lalamove || 0,
                grab: 0, panda: 0, shopee: 0
            });
            
            setClosingCashInput(record.closingCash || 0);
            setVarianceReason(record.varianceReason || '');
            setWeather((record as any).weather || '');
            setOwnerWithdrawal(record.ownerWithdrawal || 0);
            setDayExpenses(record.dayExpenses || []);
            setOps(getOps(record));
            
            setIsShiftOpen(true);
            setActiveTab('SHIFT');
            setSelectedRecord(null);
            
            const updatedHistory = await DataManager.getSettlements(filterMonth);
            setHistoryRecords(updatedHistory);
            
            alert("✅ 撤销成功！数据已完全恢复，请直接修改您需要调整的金额。");
        } catch(e) { console.error(e); alert("撤销失败，请检查网络 (Undo Failed)"); } finally { setIsLoading(false); }
    };

    const handleSubmitSettlement = async () => {
        if (!guardWrite('提交结算')) return;
        setIsSubmitting(true);
        const isDuplicate = await DataManager.checkSettlementExists(businessDate);
        if (isDuplicate) {
             alert(`📅 日期 ${businessDate} 已经结算过了！\n若需重新提交，请先在"历史"页面撤销旧记录。`);
             setIsSubmitting(false); return;
        }
        if (!confirm(`⚠️ 确认提交结算？\n日期: ${businessDate}\n记账总额 (真实水分已挤干): RM ${totals.totalRevenue.toFixed(2)}`)) {
            setIsSubmitting(false); return;
        }
        
        const effGrabNet = Number(salesData.grabNet) > 0 ? Number(salesData.grabNet) : (Number(salesData.grabGross) || 0);
        const effPandaNet = Number(salesData.pandaNet) > 0 ? Number(salesData.pandaNet) : (Number(salesData.pandaGross) || 0);
        const effShopeeNet = Number(salesData.shopeeNet) > 0 ? Number(salesData.shopeeNet) : (Number(salesData.shopeeGross) || 0);

        const record: SettlementRecord = {
            id: `settle_${businessDate}_${Date.now()}`, date: businessDate, timestamp: new Date().toISOString(),
            openingCash: openingTotal, closingCash: closingCashInput,
            // 🔗 留底：开班备用金从哪一天的实点带过来（手动改过就会对不上，方便以后查）
            ...(prevClosing ? { openingCarriedFrom: prevClosing.date, openingCarriedAmount: prevClosing.closingCash } : {}),
            sales: {
                total: totals.totalRevenue, storeHubTotal: totals.storeHubTotal, refundTotal: salesData.refundTotal || 0,
                cash: salesData.cash || 0, tng: salesData.tng || 0, duitnow: salesData.duitnow || 0, 
                card: salesData.card || 0, amex: salesData.amex || 0,
                deliveryBreakdown: {
                    grabGross: Number(salesData.grabGross) || 0,
                    grabNet: effGrabNet,
                    grabAds: Number(salesData.grabAds) || 0,
                    grab: effGrabNet - (Number(salesData.grabAds) || 0),       
                    pandaGross: Number(salesData.pandaGross) || 0,
                    pandaNet: effPandaNet,
                    pandaAds: Number(salesData.pandaAds) || 0,
                    panda: effPandaNet - (Number(salesData.pandaAds) || 0),     
                    shopeeGross: Number(salesData.shopeeGross) || 0,
                    shopeeNet: effShopeeNet,
                    shopeeAds: Number(salesData.shopeeAds) || 0,
                    shopee: effShopeeNet - (Number(salesData.shopeeAds) || 0), 
                    lalamove: Number(salesData.lalamove) || 0
                }
            },
            expenses: [], // 保持原样不改动外部接口
            variance: totals.variance, varianceReason: varianceReason,
            weather: (weather || '') as any,  
            submittedBy: 'Manager', isClosed: true,
            dayExpenses: dayExpenses, 
            ops: ops,
            ownerWithdrawal: ownerWithdrawal,
            reconStatus: { tng: false, debit: false, credit: false, amex: false, grab: false, panda: false, shopee: false } as any
        };
        
        try {
            await DataManager.executeSettlementTransaction(record);
            window.dispatchEvent(new Event('klk-settlements-updated'));
            setBusinessDate(getBusinessDateStr(storeConfig.businessDayCutoff || 4));
            setOpeningTotal(0);
            setSalesData({ storeHubTotal: 0, refundTotal: 0, cash: 0, tng: 0, duitnow: 0, card: 0, amex: 0, grabGross: 0, grabNet: 0, grabAds: 0, pandaGross: 0, pandaNet: 0, pandaAds: 0, shopeeGross: 0, shopeeNet: 0, shopeeAds: 0, lalamove: 0, grab: 0, panda: 0, shopee: 0 });
            setClosingCashInput(0); setVarianceReason(''); setWeather('');
            setOwnerWithdrawal(0);
            setDayExpenses([]);
            setOps(EMPTY_OPS);
            setIsShiftOpen(false);
            alert("✅ 结算成功！数据已转入历史记录，请移步历史列表进行数字对账。");
            setActiveTab('HISTORY'); loadHistory();
        } catch (error: any) { 
            console.error("Settlement Error", error); 
            const msg = error?.message || String(error);          // 👑 防止 error.message 为 undefined 再炸一次
            if (msg.includes('DATE_ALREADY_SETTLED')) alert("❌ 提交被拦截：该日期刚刚已被其他设备结算！");
            else if (msg.includes('permission')) alert("❌ 权限不足：登录状态可能已失效，请重新整理页面");
            else alert(`❌ 提交失败\n[${error?.code || 'UNKNOWN'}] ${msg}`); 
        } finally { setIsSubmitting(false); }
    };

    const handleForceToday = () => {
        const todayStr = getCalendarTodayStr();
        if(businessDate !== todayStr && confirm(`确定将日期修改为今天 (${todayStr}) 吗？`)) setBusinessDate(todayStr);
    };

    const renderSummarySection = () => (
        <div className="bg-[#111111] p-6 text-white shadow-2xl flex flex-col justify-between shrink-0 rounded-[2rem] md:rounded-none md:rounded-l-[2rem] h-auto overflow-visible md:h-full md:overflow-y-auto select-none">
            <div className="space-y-6">
                <h3 className="text-sm font-black text-[#FFD200] uppercase tracking-widest flex items-center gap-2"><Calculator size={18}/> 现金对账 (Reconciliation)</h3>
                <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Opening Float</span><span className="font-mono text-[#FFD200]">RM {openingTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Cash Sales</span><span className="font-mono text-green-400">+ RM {(salesData?.cash || 0).toFixed(2)}</span></div>
                    
                    {/* 🌟 1. 业主提支 (Owner's Drawings) - 极简高雅重构 */}
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block font-sans">业主提支 (Owner's Drawings)</label>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-500 font-black text-xs font-sans">RM</span>
                            <input 
                                type="number" 
                                placeholder="0.00 (提取今日营业款)" 
                                className="w-full bg-black/60 border border-orange-500/25 rounded-xl p-3.5 pl-10 text-xs font-mono font-black text-orange-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 transition-all min-h-[44px]" 
                                value={ownerWithdrawal || ''} 
                                onChange={e => setOwnerWithdrawal(parseFloat(e.target.value) || 0)} 
                            />
                        </div>
                    </div>

                    {/* 🌟 2. 临时支出项目 (买杂物/动态新增) —— 换成红色专业英文支出 (CASH EXPENSES) */}
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center bg-transparent">
                            <div className="flex flex-col">
                                <span className="text-xs font-black text-red-500 tracking-wider">当日钱箱支出</span>
                                <span className="text-[10px] font-black text-red-400/80 uppercase tracking-widest font-mono">CASH EXPENSES</span>
                            </div>
                            <button 
                                onClick={handleAddDayExpense} 
                                className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 font-semibold px-3 py-1.5 rounded-xl active:bg-red-500/40 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 hover:bg-red-500/30"
                            >
                                + 新增支出
                            </button>
                        </div>
                        
                        {dayExpenses.map((exp) => (
                            <div key={exp.id} className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-2 animate-in slide-in-from-top-1 duration-150 relative">
                                <div className="grid grid-cols-2 gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="公司/商户名" 
                                        className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-red-500 min-h-[40px] focus:ring-1 focus:ring-red-500/20" 
                                        value={exp.company} 
                                        onChange={e => handleUpdateDayExpense(exp.id, 'company', e.target.value)} 
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="购买内容" 
                                        className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-red-500 min-h-[40px] focus:ring-1 focus:ring-red-500/20" 
                                        value={exp.item} 
                                        onChange={e => handleUpdateDayExpense(exp.id, 'item', e.target.value)} 
                                    />
                                </div>
                                <div className="flex gap-2 items-center">
                                    <div className="relative flex-1">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs text-red-400/50">RM</span>
                                        <input 
                                            type="number" 
                                            placeholder="金额" 
                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 pl-9 text-xs font-mono text-red-400 outline-none focus:border-red-500 min-h-[40px] focus:ring-1 focus:ring-red-500/20 font-black" 
                                            value={exp.amount || ''} 
                                            onChange={e => handleUpdateDayExpense(exp.id, 'amount', parseFloat(e.target.value) || 0)} 
                                        />
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveDayExpense(exp.id)} 
                                        className="w-[44px] h-[40px] flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 active:scale-95 transition-all cursor-pointer"
                                        aria-label="删除"
                                    >
                                        <X size={16}/>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {dayExpenses.length > 0 && (
                            <div className="flex justify-between text-[10px] text-gray-400 px-1 pt-0.5">
                                <span>支出汇总:</span>
                                <span className="font-mono text-red-400 font-extrabold">- RM {totals.totalDayExpenses.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="flex justify-between items-center"><span className="text-xs font-black text-[#FFD200] uppercase">Expected Cash</span><span className="text-xl font-mono font-black text-white">RM {totals.expectedCash.toFixed(2)}</span></div>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <label className="text-[10px] font-black text-[#FFD200] uppercase block mb-2 tracking-widest">今日天气 (Weather)</label>
                    <div className="grid grid-cols-4 gap-2">
                        {WEATHER_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setWeather(prev => prev === opt.value ? '' : opt.value)}
                                className={`py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 border ${
                                    weather === opt.value
                                        ? 'bg-[#FFD200] text-black border-[#FFD200]'
                                        : 'bg-black/30 text-white/60 border-white/10'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="bg-white/10 p-6 rounded-[2rem] border border-white/10 relative">
                    <label className="text-[10px] font-black text-[#FFD200] uppercase block mb-3 text-center tracking-widest">钱箱实际结余 (Actual Closing Cash)</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-black text-2xl">RM</span>
                        <input type="number" value={closingCashInput || ''} onChange={e => setClosingCashInput(parseFloat(e.target.value) || 0)} className="w-full p-4 pl-14 bg-black/40 border-2 border-[#FFD200]/30 rounded-2xl text-center font-black text-4xl text-white outline-none focus:border-[#FFD200] transition-all shadow-inner" placeholder="0.00" />
                    </div>
                    <div className={`mt-4 p-3 rounded-xl text-center border transition-all ${totals.variance >= 0 ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1">现金差异 (Variance)</p>
                        <p className="text-xl font-black font-mono">RM {totals.variance.toFixed(2)}</p>
                    </div>
                </div>
                {Math.abs(totals.variance) > 0.5 && (
                    <div className="animate-in slide-in-from-bottom-2">
                        <label className="text-[10px] font-black text-red-400 uppercase block mb-2 flex items-center gap-2"><AlertCircle size={12}/> 差异说明 (Reason)</label>
                        <textarea value={varianceReason} onChange={e => setVarianceReason(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-white/30 focus:border-red-400 outline-none h-20 resize-none" placeholder="请输入原因 (e.g. 找赎错误)..."/>
                    </div>
                )}
            </div>
            <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
                <div className="flex justify-between items-end">
                    <div><p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Total Sales (已去水分)</p><p className="text-2xl font-black font-mono text-[#FFD200]">RM {totals.totalRevenue.toFixed(2)}</p></div>
                    <div><p className="text-[9px] text-gray-500 uppercase font-black tracking-widest text-right">POS Sales Only</p><p className="text-lg font-black font-mono text-white text-right">RM {totals.posSales.toFixed(2)}</p></div>
                </div>
                <button onClick={handleSubmitSettlement} disabled={isSubmitting} className="w-full py-4 bg-[#FFD200] text-black rounded-2xl font-black text-lg shadow-[0_10px_30px_rgba(255,210,0,0.3)] hover:bg-white active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isSubmitting ? <Loader2 size={24} className="animate-spin"/> : <Check size={24} strokeWidth={4}/>}
                    {isSubmitting ? '提交中...' : '完成结算 (Submit)'}
                </button>
            </div>
        </div>
    );

    return (
        <div className={isStandalone ? "fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-0 md:p-4 backdrop-blur-sm animate-in zoom-in duration-200" : "w-full h-full flex flex-col relative animate-in fade-in"}>
            <div className={isStandalone ? "bg-[#F6F7FB] w-full h-[100dvh] md:max-w-7xl md:h-[95vh] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl font-sans relative" : "flex-grow flex flex-col overflow-hidden font-sans relative"}>
                <div className="bg-[#111111] px-4 py-3 md:py-4 pt-[max(env(safe-area-inset-top,12px),12px)] flex items-center justify-between text-white shrink-0 border-b-4 border-[#FFD200] relative z-50 shadow-md">
                    <div className="flex items-center gap-2 md:gap-3">
                        {onClose && (
                            <button 
                                onClick={onClose} 
                                className="mr-0.5 p-1.5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center text-white shrink-0"
                                aria-label="Back"
                                id="settlement-back-btn"
                                style={{ minWidth: '40px', minHeight: '40px' }}
                            >
                                <ArrowLeft size={18} className="stroke-[2.5]" />
                            </button>
                        )}
                        <div className="bg-[#FFD200] text-black p-2 rounded-xl shadow-lg shrink-0"><Calculator size={20} className="md:w-6 md:h-6"/></div>
                        <div><h3 className="font-serif font-black text-sm md:text-xl tracking-wide">每日结算中心</h3><p className="text-[8px] md:text-[10px] text-gray-400 font-mono uppercase tracking-widest mt-0.5">SETTLEMENT & CASH CONTROL</p></div>
                    </div>
                    <div className="flex items-center gap-2 relative z-50">
                        <div className="hidden md:flex bg-white/10 p-1 rounded-xl justify-center cursor-pointer relative z-50">
                            <button onClick={() => setActiveTab('SHIFT')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap relative z-50 ${activeTab === 'SHIFT' ? 'bg-[#FFD200] text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}>当班 (Shift)</button>
                            <button onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap relative z-50 ${activeTab === 'HISTORY' ? 'bg-[#FFD200] text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}>历史 (History)</button>
                        </div>
                        <div className="flex gap-2 relative z-50 items-center">
                            <ModuleGuideButton module="SETTLEMENT" />
                            {onClose && (
                                <button 
                                    onClick={onClose} 
                                    className="w-[44px] h-[44px] flex items-center justify-center bg-white/10 active:bg-red-600 rounded-xl transition-colors text-white relative z-50 cursor-pointer shadow-sm" 
                                    title="关闭/退出 (Exit)"
                                >
                                    <X size={20}/>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-hidden bg-[#F6F7FB]">
                    {activeTab === 'SHIFT' ? (
                        !isShiftOpen ? (
                            <div className="h-full overflow-y-auto bg-[#F6F7FB]">
                                <div className="min-h-full p-4 md:p-6 flex flex-col items-center justify-center">
                                    <div className="max-w-xs md:max-w-md w-full bg-white p-5 md:p-8 rounded-3xl shadow-lg text-center border-t-8 border-[#FFD200]">
                                        <Power size={48} className="mx-auto text-gray-200 mb-4 md:mb-6"/>
                                        <h2 className="text-xl md:text-2xl font-black text-[#111111] mb-1 md:mb-2">准备开班?</h2>
                                        <div className="mb-4 md:mb-6 bg-gray-50 p-3 md:p-4 rounded-2xl border border-gray-100">
                                            <label className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase mb-1.5 block tracking-widest flex items-center gap-2 justify-center"><Calendar size={12}/> 营业日期 (Business Date)</label>
                                            <div className="flex items-center gap-2">
                                                <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="w-full p-2.5 md:p-3 bg-white border-2 border-gray-200 rounded-xl font-black text-[#111111] outline-none focus:border-[#FFD200] text-center text-base md:text-lg shadow-sm min-h-[44px]"/>
                                                <button onClick={handleForceToday} className="w-[44px] h-[44px] flex items-center justify-center bg-white border-2 border-gray-200 rounded-xl hover:border-[#FFD200] hover:text-[#FFD200] transition-colors"><RotateCcw size={18}/></button>
                                            </div>
                                            {autoAdvancedFrom && autoAdvancedFrom !== businessDate && (
                                                <p className="mt-2 text-[11px] font-bold text-emerald-700 text-center">✅ {autoAdvancedFrom} 已经结算过，自动跳到 {businessDate}</p>
                                            )}
                                        </div>
                                        <div className="bg-gray-50 p-4 md:p-6 rounded-2xl mb-6 md:mb-8 border border-gray-100 text-left">
                                            <label className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-widest">开班现金金额 (Opening Float)</label>
                                            {prevClosingLoading ? (
                                                <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm font-bold"><Loader2 size={16} className="animate-spin"/> 读取上一天的实点…</div>
                                            ) : prevClosing && !openingUnlocked ? (
                                                /* 🔗 锁定：直接用上一天的实点，不给改，就不会错 */
                                                <div>
                                                    <div className="flex items-center justify-between gap-2 bg-white border-2 border-emerald-300 rounded-xl px-4 py-3 min-h-[48px]">
                                                        <span className="text-gray-400 font-black text-xl md:text-2xl">RM</span>
                                                        <span className="font-mono text-2xl md:text-3xl font-black text-[#111111]">{openingTotal.toFixed(2)}</span>
                                                    </div>
                                                    <p className="mt-2 text-[11px] font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13}/> 自动带入 {prevClosing.date} 的实点 Actual</p>
                                                    <button type="button" onClick={() => { setShowOpeningPin(true); setOpeningPin(''); setOpeningPinError(false); }} className="mt-1 text-[11px] font-bold text-gray-400 underline min-h-[36px]">钱箱数目不对？手动修改（需管理员密码）</button>
                                                    {showOpeningPin && (
                                                        <div className="mt-2 bg-white border-2 border-[#111111] rounded-xl p-3 space-y-2">
                                                            <p className="text-[11px] font-black text-[#111111] flex items-center gap-1"><ShieldCheck size={13}/> 请输入管理员密码</p>
                                                            <div className="flex gap-2">
                                                                <input type="password" inputMode="numeric" autoComplete="off" autoFocus value={openingPin}
                                                                    onChange={e => { setOpeningPin(e.target.value); setOpeningPinError(false); }}
                                                                    onKeyDown={e => { if (e.key === 'Enter') submitOpeningPin(); }}
                                                                    className={`flex-1 min-w-0 px-3 bg-gray-50 border-2 rounded-lg text-center font-black tracking-[0.4em] outline-none ${openingPinError ? 'border-red-400' : 'border-gray-200 focus:border-[#FFD200]'}`}
                                                                    style={{ fontSize: '18px', minHeight: '44px' }} placeholder="••••" />
                                                                <button type="button" onClick={submitOpeningPin} className="px-4 bg-[#111111] text-[#FFD200] rounded-lg font-black text-sm min-h-[44px] active:scale-95">解锁</button>
                                                                <button type="button" onClick={() => { setShowOpeningPin(false); setOpeningPin(''); setOpeningPinError(false); }} className="w-11 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center min-h-[44px] active:scale-95" aria-label="取消"><X size={16}/></button>
                                                            </div>
                                                            {openingPinError && <p className="text-[11px] font-bold text-red-600">密码错误</p>}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xl md:text-2xl">RM</span>
                                                        <input type="number" inputMode="decimal" value={openingTotal || ''} onChange={e => setOpeningTotal(parseFloat(e.target.value) || 0)} className={`w-full pl-12 pr-4 py-3 md:py-4 bg-white border-2 rounded-xl font-mono text-2xl md:text-3xl font-black text-[#111111] outline-none focus:border-[#FFD200] transition-all shadow-sm min-h-[48px] ${openingMismatch ? 'border-red-300' : 'border-gray-200'}`} style={{ fontSize: '24px' }} placeholder="0.00" />
                                                    </div>
                                                    {prevClosing ? (
                                                        <div className="mt-2 space-y-1">
                                                            {openingMismatch && (
                                                                <p className="text-[11px] font-bold text-red-600 flex items-start gap-1"><AlertTriangle size={13} className="shrink-0 mt-0.5"/> 跟 {prevClosing.date} 实点 RM {prevClosing.closingCash.toFixed(2)} 相差 RM {(openingTotal - prevClosing.closingCash).toFixed(2)}</p>
                                                            )}
                                                            <button type="button" onClick={() => { setOpeningTotal(prevClosing.closingCash); setOpeningUnlocked(false); }} className="text-[11px] font-bold text-emerald-700 underline min-h-[36px]">↩ 改回 {prevClosing.date} 的实点 RM {prevClosing.closingCash.toFixed(2)}</button>
                                                        </div>
                                                    ) : (
                                                        <p className="mt-2 text-[11px] font-bold text-gray-400">找不到之前的结算记录，请手动点算输入（之后每天会自动带入前一天的实点）</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={handleStartShift} className="w-full bg-[#FFD200] active:bg-yellow-500 text-black py-3.5 md:py-4 rounded-xl font-black text-sm md:text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"><Play size={18} fill="currentColor"/> 确认开班 (Start)</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col md:flex-row overflow-hidden animate-in fade-in">
                                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                                    <div className="flex justify-between items-end border-b pb-4 border-gray-200">
                                        <div><h2 className="text-2xl font-black text-[#111111]">{new Date(businessDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</h2><p className="text-xs font-bold text-gray-400">Business Date (Settlement Date)</p></div>
                                        <div className="text-right"><p className="text-[10px] font-bold text-gray-400 uppercase">Opening Float</p><p className="text-lg font-mono font-black text-blue-600">RM {openingTotal.toFixed(2)}</p></div>
                                    </div>
                                    
                                    {/* 📦 StoreHub POS Total - 极简高雅栏目（右侧直接显示金额，已去除退款记录） */}
                                    <div className="bg-blue-50/65 p-4 rounded-2xl border border-blue-200/80 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-1.5 h-6 rounded-full bg-blue-600 shrink-0"></div>
                                            <div>
                                                <label className="text-xs font-black text-blue-900 uppercase block tracking-wider font-sans">StoreHub POS Total</label>
                                                <p className="text-[9px] text-blue-500 font-black mt-1 uppercase tracking-wider">系统已自动求和 (Auto Calculated)</p>
                                            </div>
                                        </div>
                                        <div className="font-mono text-xl md:text-2xl font-black text-blue-950 whitespace-nowrap">
                                            RM {totals.storeHubTotal.toFixed(2)}
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                                            <h4 className="text-xs font-bold text-[#111111] uppercase border-b pb-3 mb-3">POS Payment Methods (In-Store)</h4>
                                            
                                            {/* Cash (现金) */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 shrink-0 shadow-sm border border-green-200/50 group-hover:scale-105 transition-transform"><Banknote size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Cash (现金)</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-green-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-green-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.cash || ''} 
                                                        onChange={e => setSalesData({...salesData, cash: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* TNG eWallet */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 shrink-0 shadow-sm border border-cyan-200/50 group-hover:scale-105 transition-transform"><Wallet size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">TNG eWallet</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-cyan-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-cyan-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.tng || ''} 
                                                        onChange={e => setSalesData({...salesData, tng: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Debit Card */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 shadow-sm border border-indigo-200/50 group-hover:scale-105 transition-transform"><CreditCard size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Debit Card</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-indigo-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.duitnow || ''} 
                                                        onChange={e => setSalesData({...salesData, duitnow: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Credit Card */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0 shadow-sm border border-purple-200/50 group-hover:scale-105 transition-transform"><CreditCard size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Credit Card</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-purple-400 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-purple-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.card || ''} 
                                                        onChange={e => setSalesData({...salesData, card: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Amex */}
                                            <div className="flex items-center gap-2.5 mb-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 shadow-sm border border-blue-200/50 group-hover:scale-105 transition-transform"><CreditCard size={18}/></div>
                                                <span className="text-xs font-black text-gray-700 w-24 shrink-0 whitespace-nowrap">Amex</span>
                                                <div className="relative flex-grow">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="0.00"
                                                        className="w-full p-3 pl-10 bg-gray-50/50 border border-gray-200 focus:border-blue-500 rounded-xl text-right font-mono font-black text-sm text-gray-950 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all tabular-nums shadow-inner min-h-[44px]" 
                                                        value={salesData.amex || ''} 
                                                        onChange={e => setSalesData({...salesData, amex: parseFloat(e.target.value)})} 
                                                    />
                                                </div>
                                            </div>
                                            <div className="pt-3 mt-3 border-t border-gray-100 flex justify-between items-center text-xs font-bold"><span>POS Total</span><span className="font-mono text-blue-600 text-base">RM {totals.posSales.toFixed(2)}</span></div>
                                        </div>
                                        
                                        <div className="space-y-3 bg-orange-50/50 p-5 rounded-3xl border border-orange-100 shadow-sm">
                                            <div className="flex justify-between items-center border-b border-orange-200 pb-3 mb-3">
                                                <h4 className="text-xs font-bold text-orange-800 uppercase">Delivery Platforms</h4>
                                            </div>
                                            
                                            {/* 🌟 GRAB专属三列输入区域 - 美化 */}
                                            <div className="bg-white p-3.5 md:p-4 rounded-2xl border border-green-200/60 mb-4 shadow-sm animate-in fade-in-50">
                                                <div className="flex justify-between items-center mb-2 px-1">
                                                    <span className="text-xs font-black text-green-700 font-sans">GrabFood (精确记账)</span>
                                                    <span className="text-[9px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Auto Calc</span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">原价 (Gross)</label>
                                                        <input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-green-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-green-100 shadow-inner min-h-[44px] tabular-nums" 
                                                            value={salesData.grabGross || ''} 
                                                            onChange={e => setSalesData({...salesData, grabGross: parseFloat(e.target.value) || 0})} 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">净额 (Net)</label>
                                                        <input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-green-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-green-100 shadow-inner min-h-[44px] tabular-nums" 
                                                            value={salesData.grabNet || ''} 
                                                            onChange={e => setSalesData({...salesData, grabNet: parseFloat(e.target.value) || 0})} 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-orange-500 block mb-1 text-center">广告 (Ads)</label>
                                                        <input 
                                                            type="number" 
                                                            placeholder="0.00" 
                                                            className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner text-orange-600 min-h-[44px] tabular-nums" 
                                                            value={salesData.grabAds || ''} 
                                                            onChange={e => setSalesData({...salesData, grabAds: parseFloat(e.target.value) || 0})} 
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 🌟 Panda / Shopee 极简与三列模式 */}
                                            <div className="space-y-4">
                                                {/* 🌟 FoodPanda 三列高精准输入区域 - 美化 */}
                                                <div className="bg-white p-3.5 md:p-4 rounded-2xl border border-pink-200 shadow-sm animate-in fade-in-50">
                                                    <div className="flex justify-between items-center mb-2 px-1">
                                                        <span className="text-xs font-black text-pink-700 font-sans">FoodPanda (精确记账)</span>
                                                        <span className="text-[9px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Net to Sum</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">原价 (Gross)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-pink-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-pink-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.pandaGross || ''} 
                                                                onChange={e => setSalesData({...salesData, pandaGross: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">净额 (Net)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-pink-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-pink-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.pandaNet || ''} 
                                                                onChange={e => setSalesData({...salesData, pandaNet: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-pink-500 block mb-1 text-center">广告 (Ads)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-pink-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-pink-100 shadow-inner text-pink-600 min-h-[44px] tabular-nums" 
                                                                value={salesData.pandaAds || ''} 
                                                                onChange={e => setSalesData({...salesData, pandaAds: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 🌟 ShopeeFood 三列高精准输入区域 - 美化 */}
                                                <div className="bg-white p-3.5 md:p-4 rounded-2xl border border-orange-200 shadow-sm animate-in fade-in-50">
                                                    <div className="flex justify-between items-center mb-2 px-1">
                                                        <span className="text-xs font-black text-orange-700 font-sans">ShopeeFood (精确记账)</span>
                                                        <span className="text-[9px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Net to Sum</span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">原价 (Gross)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.shopeeGross || ''} 
                                                                onChange={e => setSalesData({...salesData, shopeeGross: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-gray-400 block mb-1 text-center">净额 (Net)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner min-h-[44px] tabular-nums" 
                                                                value={salesData.shopeeNet || ''} 
                                                                onChange={e => setSalesData({...salesData, shopeeNet: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-orange-500 block mb-1 text-center">广告 (Ads)</label>
                                                            <input 
                                                                type="number" 
                                                                placeholder="0.00" 
                                                                className="w-full px-2 py-2.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-orange-400 rounded-xl text-center font-mono font-black text-sm outline-none focus:ring-2 focus:ring-orange-100 shadow-inner text-orange-600 min-h-[44px] tabular-nums" 
                                                                value={salesData.shopeeAds || ''} 
                                                                onChange={e => setSalesData({...salesData, shopeeAds: parseFloat(e.target.value) || 0})} 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Lalamove - 美化 */}
                                            <div className="flex items-center gap-3 pt-3 border-t border-orange-100/50 mt-3">
                                                <div className="w-[100px] shrink-0 border-2 rounded-xl py-2.5 flex items-center justify-center shadow-sm text-blue-700 bg-blue-50 border-blue-100 font-extrabold text-xs">
                                                    Lalamove
                                                </div>
                                                <div className="flex-1 relative">
                                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-gray-300 text-xs font-bold pointer-events-none">RM</span>
                                                    <input 
                                                        type="number" 
                                                        placeholder="填入实收到账 (Net)" 
                                                        className="w-full p-3 pl-10 bg-gray-50 border border-gray-200 focus:border-blue-400 rounded-xl text-right font-mono font-black text-base text-gray-900 outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 shadow-inner min-h-[44px] tabular-nums" 
                                                        value={salesData.lalamove || ''} 
                                                        onChange={e => setSalesData({...salesData, lalamove: parseFloat(e.target.value) || 0})} 
                                                    />
                                                </div>
                                            </div>

                                            <div className="pt-3.5 mt-3.5 border-t border-orange-200/65 space-y-1 flex flex-col items-end">
                                                <div className="flex justify-between items-center text-xs font-black w-full">
                                                    <span className="text-gray-600 font-sans tracking-wide uppercase">Delivery Mix Total</span>
                                                    <span className="font-mono text-orange-600 text-lg">RM {totals.deliverySales.toFixed(2)}</span>
                                                </div>
                                                <p className="text-[9px] text-orange-700 font-black tracking-wide font-sans mt-0.5">Grab(Net) + FoodPanda(Net) + ShopeeFood(Net)</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`p-5 rounded-2xl border flex justify-between items-center shadow-sm ${Math.abs(totals.salesVariance) < 1 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                        <div>
                                            <p className={`text-xs font-black uppercase ${Math.abs(totals.salesVariance) < 1 ? 'text-green-700' : 'text-red-700'}`}>{Math.abs(totals.salesVariance) < 1 ? 'POS Match (Perfect)' : 'POS Variance Detected'}</p>
                                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">Calc POS: RM {totals.posSales.toFixed(2)} vs Report: RM {totals.storeHubTotal.toFixed(2)}</p>
                                        </div>
                                        <div className={`text-xl font-black font-mono ${Math.abs(totals.salesVariance) < 1 ? 'text-green-700' : 'text-red-700'}`}>{totals.salesVariance > 0 ? '+' : ''}{totals.salesVariance.toFixed(2)}</div>
                                    </div>
                                    
                                    {/* 📊 营运数据：顾客人数 / 单数 / VIP / WhatsApp —— 自动算人均消费、单均 */}
                                    <div className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-xs font-black text-[#111111] uppercase flex items-center gap-2"><span className="w-1.5 h-5 rounded-full bg-violet-500"></span>营运数据 (Operations)</h4>
                                            <span className="text-[10px] font-bold text-gray-400">选填</span>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                                            {OPS_FIELDS.map(f => (
                                                <div key={f.key} className="min-w-0">
                                                    <label className="text-[10px] font-black text-gray-500 block mb-1 truncate">{f.emoji} {f.label}</label>
                                                    <input type="number" inputMode="numeric" min={0} step={1}
                                                        value={ops[f.key] || ''}
                                                        onChange={e => setOps(prev => ({ ...prev, [f.key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                                                        className="w-full px-3 bg-gray-50 border border-gray-200 focus:border-violet-400 rounded-xl text-right font-mono font-black text-[#111111] outline-none"
                                                        style={{ fontSize: '16px', minHeight: '44px' }} placeholder="0" />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                                                <p className="text-[10px] font-black text-violet-700">人均消费 (店内实收 ÷ 人数)</p>
                                                <p className="font-mono font-black text-lg text-violet-900">RM {fmtMoneyOrDash(perPax(totals.storeHubTotal, ops))}</p>
                                            </div>
                                            <div className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                                                <p className="text-[10px] font-black text-violet-700">单均 (店内实收 ÷ 单数)</p>
                                                <p className="font-mono font-black text-lg text-violet-900">RM {fmtMoneyOrDash(perBill(totals.storeHubTotal, ops))}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="md:hidden pb-[calc(5rem+env(safe-area-inset-bottom,16px))]">{renderSummarySection()}</div>
                                </div>
                                <div className="hidden md:block md:w-[350px] lg:w-[400px] h-full overflow-hidden">{renderSummarySection()}</div>
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col bg-[#F6F7FB]">
                            <div className="p-3 md:p-6 bg-white border-b border-gray-200 shadow-sm shrink-0">
                                <div className="max-w-4xl mx-auto flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-2 md:gap-3">
                                        <div className="bg-[#111111] p-1.5 md:p-2 rounded-xl text-[#FFD200] shadow-md"><Calendar className="w-5 h-5 md:w-5 md:h-5"/></div>
                                        <div>
                                            <h4 className="font-black text-[#111111] text-base md:text-lg">历史账单</h4>
                                            <p className="hidden md:block text-[10px] text-gray-400 font-bold uppercase mt-0.5">Archive & Reconciliation History</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setIsExcelExportOpen(true)}
                                            className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all shrink-0 min-h-[44px] md:min-h-0"
                                            title="批量导出 Excel：选日期范围，每日汇总 + 现金支出明细 + 外卖明细">
                                            <FileSpreadsheet size={15}/> <span className="hidden sm:inline">导出 Excel</span>
                                        </button>
                                        <button onClick={() => setIsBatchReconOpen(true)}
                                            className="flex items-center gap-1.5 bg-[#111111] text-[#FFD200] px-3 py-2 rounded-xl text-xs font-black shadow-md active:scale-95 transition-all shrink-0 min-h-[44px] md:min-h-0"
                                            title="批量核对：整个月的账目摊开来对，也可以只对 TNG">
                                            <ListChecks size={15}/> <span className="hidden sm:inline">批量核对</span>
                                        </button>
                                        <div className="flex items-center gap-2 bg-gray-50 p-1.5 md:p-2 rounded-xl border border-gray-200">
                                            <span className="hidden md:inline text-xs font-black text-gray-400 px-2">月份:</span>
                                            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-transparent font-black text-[#111111] text-sm md:text-base outline-none w-[110px] md:w-auto" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-[calc(6rem+env(safe-area-inset-bottom,16px))]">
                                {/* 🧾 电脑：Excel 式表格；手机：下面的卡片 */}
                                {!isLoading && historyRecords.length > 0 && (
                                    <div className="hidden md:block">
                                        <SettlementHistoryTable records={historyRecords} onSelect={setSelectedRecord} />
                                    </div>
                                )}
                                <div className={`max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 ${!isLoading && historyRecords.length > 0 ? 'md:hidden' : ''}`}>
                                    {isLoading ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 lg:col-span-2">
                                            <Loader2 size={48} className="animate-spin mb-4 text-[#FFD200]"/>
                                            <p className="font-bold">正在拉取 {filterMonth} 的账单...</p>
                                        </div>
                                    ) : historyRecords.length === 0 ? (
                                        <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-200 lg:col-span-2">
                                            <History size={64} className="mx-auto mb-4 opacity-10 text-[#111111]"/>
                                            <p className="font-black text-[#111111]">{filterMonth} 暂无历史数据</p>
                                        </div>
                                    ) : (
                                        historyRecords.map(record => {
                                            const debit = record.sales.duitnow || 0; const credit = record.sales.card || 0;
                                            const tng = record.sales.tng || 0; const amex = record.sales.amex || 0;
                                            const cash = record.sales.cash || 0;
                                            const rs = (record as any).reconStatus || {};
                                            const deliveryBreakdown = record.sales.deliveryBreakdown || {} as any;
                                            const grabGross = Number(deliveryBreakdown.grabGross) || 0;
                                            const rawGrabNet = Number(deliveryBreakdown.grabNet) || Number(deliveryBreakdown.grab) || 0;
                                            const grabNet = rawGrabNet > 0 ? rawGrabNet : grabGross;
                                            const grabAds = Number(deliveryBreakdown.grabAds) || 0;
                                            const grabExpected = grabNet - grabAds;
                                            const grabActual = getReconActual(rs, 'grab');
                                            const grabVal = grabActual !== null ? grabActual : grabExpected;
                                            
                                            const pandaGross = Number(deliveryBreakdown.pandaGross) || Number(deliveryBreakdown.panda) || 0;
                                            const rawPandaNet = deliveryBreakdown.pandaNet !== undefined && deliveryBreakdown.pandaNet !== null ? Number(deliveryBreakdown.pandaNet) : (Number(deliveryBreakdown.panda) || 0);
                                            const pandaNet = rawPandaNet > 0 ? rawPandaNet : pandaGross;
                                            const pandaAds = Number(deliveryBreakdown.pandaAds) || 0;
                                            const pandaExpected = pandaNet - pandaAds;
                                            const pandaActual = getReconActual(rs, 'panda');
                                            const pandaVal = pandaActual !== null ? pandaActual : pandaExpected;

                                            const shopeeGross = Number(deliveryBreakdown.shopeeGross) || Number(deliveryBreakdown.shopee) || 0;
                                            const rawShopeeNet = deliveryBreakdown.shopeeNet !== undefined && deliveryBreakdown.shopeeNet !== null ? Number(deliveryBreakdown.shopeeNet) : (Number(deliveryBreakdown.shopee) || 0);
                                            const shopeeNet = rawShopeeNet > 0 ? rawShopeeNet : shopeeGross;
                                            const shopeeAds = Number(deliveryBreakdown.shopeeAds) || 0;
                                            const shopeeExpected = shopeeNet - shopeeAds;
                                            const shopeeActual = getReconActual(rs, 'shopee');
                                            const shopeeVal = shopeeActual !== null ? shopeeActual : shopeeExpected;

                                            const lalamoveVal = deliveryBreakdown.lalamove || 0;
                                            
                                            const totalDeliveryVal = grabVal + pandaVal + shopeeVal + lalamoveVal;
                                            const totalCardVal = debit + credit + amex;

                                            let hasPending = false;
                                            if (tng > 0 && !isChannelReconciled(rs, 'tng')) hasPending = true;
                                            if (debit > 0 && !isChannelReconciled(rs, 'debit')) hasPending = true;
                                            if (credit > 0 && !isChannelReconciled(rs, 'credit')) hasPending = true;
                                            if (amex > 0 && !isChannelReconciled(rs, 'amex')) hasPending = true;
                                            if (grabExpected > 0 && !isChannelReconciled(rs, 'grab')) hasPending = true;
                                            if (pandaExpected > 0 && !isChannelReconciled(rs, 'panda')) hasPending = true;
                                            if (shopeeExpected > 0 && !isChannelReconciled(rs, 'shopee')) hasPending = true;

                                            return (
                                                <div key={record.id} onClick={() => setSelectedRecord(record)} className={`bg-white p-5 md:p-6 rounded-2xl border ${hasPending ? 'border-amber-200 border-l-4 border-l-amber-500 shadow-sm bg-gradient-to-br from-white to-amber-50/[0.01]' : 'border-gray-200 border-l-4 border-l-emerald-500 shadow-sm'} hover:shadow-md hover:border-r-gray-300 hover:border-t-gray-300 hover:border-b-gray-300 active:scale-[0.98] transition-all cursor-pointer flex flex-col gap-4`}>
                                                    {/* Card Header Info */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3.5">
                                                            {/* Date Box - Omitted month as requested, only showing day */}
                                                            <div className="w-12 h-12 bg-gray-50 border border-gray-200/85 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                                                                <span className="text-xl font-extrabold text-gray-950 font-mono tracking-tight">{record.date.split('-')[2]}</span>
                                                            </div>
                                                            {/* Totals Title & Value */}
                                                            <div>
                                                                <div className="text-xs font-bold text-gray-400">当日总营业额</div>
                                                                <div className="text-lg md:text-xl font-black text-gray-95" style={{ color: '#111111' }}>RM {record.sales.total.toFixed(2)}</div>
                                                                {(() => {
                                                                    const exps = ((record as any).dayExpenses || []) as any[];
                                                                    const expTotal = exps.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
                                                                    const wd = Number((record as any).ownerWithdrawal) || 0;
                                                                    if (expTotal <= 0 && wd <= 0) return null;
                                                                    return (
                                                                        <div className="text-[11px] font-bold text-red-600 mt-0.5">
                                                                            {expTotal > 0 && <>现金支出 RM {expTotal.toFixed(2)} · {exps.length} 笔</>}
                                                                            {expTotal > 0 && wd > 0 && ' · '}
                                                                            {wd > 0 && <>提支 RM {wd.toFixed(2)}</>}
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {(() => {
                                                                    const o = getOps(record);
                                                                    if (!o.pax) return null;
                                                                    const avg = perPax(record.sales.storeHubTotal, o);
                                                                    return (
                                                                        <div className="text-[11px] font-bold text-violet-700 mt-0.5">
                                                                            👥 {o.pax} 人 · 人均 RM {fmtMoneyOrDash(avg)}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                        {/* Right side Status Badges */}
                                                        <div className="flex flex-col items-end gap-1.5">
                                                            {hasPending ? (
                                                                 <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-300/80 px-2 py-0.5 rounded-lg shrink-0 shadow-sm">
                                                                     <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                                     待核对
                                                                 </span>
                                                             ) : (
                                                                 <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-300/80 px-2 py-0.5 rounded-lg shrink-0">
                                                                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                     已核对
                                                                 </span>
                                                             )}
                                                            <div className={`text-xs font-extrabold font-mono px-2 py-0.5 rounded-md leading-none ${record.variance >= 0 ? 'text-emerald-700 bg-emerald-50 border border-emerald-300' : 'text-rose-700 bg-rose-50 border border-rose-200'}`}>
                                                                {record.variance >= 0 ? '+' : ''}{record.variance.toFixed(2)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 4-Column breakdown grid - Single line, Math.round to avoid decimals */}
                                                    <div className="grid grid-cols-4 gap-2">
                                                        <div className="bg-slate-50/80 p-2 text-center flex flex-col justify-center rounded-xl border border-slate-100/70">
                                                            <div className="text-[10px] text-gray-400 font-bold truncate">💵 Cash</div>
                                                            <div className="text-xs md:text-[13px] font-black font-mono text-gray-950 mt-1 whitespace-nowrap">RM {Math.round(cash)}</div>
                                                        </div>
                                                        <div className="bg-slate-50/80 p-2 text-center flex flex-col justify-center rounded-xl border border-slate-100/70">
                                                            <div className="text-[10px] text-gray-400 font-bold truncate">🔵 TNG</div>
                                                            <div className="text-xs md:text-[13px] font-black font-mono text-gray-950 mt-1 whitespace-nowrap">RM {Math.round(tng)}</div>
                                                        </div>
                                                        <div className="bg-slate-50/80 p-2 text-center flex flex-col justify-center rounded-xl border border-slate-100/70">
                                                            <div className="text-[10px] text-gray-400 font-bold truncate">💳 Card</div>
                                                            <div className="text-xs md:text-[13px] font-black font-mono text-gray-950 mt-1 whitespace-nowrap">RM {Math.round(totalCardVal)}</div>
                                                        </div>
                                                        <div className="bg-amber-50/70 p-2 text-center flex flex-col justify-center rounded-xl border border-amber-100">
                                                            <div className="text-[10px] text-amber-800 font-bold truncate">🛵 Delivery</div>
                                                            <div className="text-xs md:text-[13px] font-black font-mono text-amber-900 mt-1 whitespace-nowrap">RM {Math.round(totalDeliveryVal)}</div>
                                                        </div>
                                                    </div>

                                                    {/* Delivery Detail Badges - Color dot representation, no text labels, no decimals */}
                                                    {totalDeliveryVal > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 px-0.5">
                                                            {grabVal > 0 && (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                                    <span className="font-mono font-extrabold">RM {Math.round(grabVal)}</span>
                                                                </span>
                                                            )}
                                                            {pandaVal > 0 && (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-pink-900 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0"></span>
                                                                    <span className="font-mono font-extrabold">RM {Math.round(pandaVal)}</span>
                                                                </span>
                                                            )}
                                                            {shopeeVal > 0 && (
                                                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-950 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></span>
                                                                    <span className="font-mono font-extrabold">RM {Math.round(shopeeVal)}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                            <HistoryDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} onDelete={handleDeleteClick} onRefresh={loadHistory} onUndoEdit={handleUndoAndEdit} />
                            <SettlementExcelExportDialog
                                isOpen={isExcelExportOpen}
                                onClose={() => setIsExcelExportOpen(false)}
                                defaultMonth={filterMonth}
                            />
                            {isBatchReconOpen && (
                                <SettlementBatchRecon
                                    isOpen={isBatchReconOpen}
                                    onClose={() => { setIsBatchReconOpen(false); loadHistory(); }}
                                    defaultMonth={filterMonth}
                                    onChanged={loadHistory}
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* 📱 iOS/Mobile Premium Bottom Navigation Tab Bar */}
                <div className="md:hidden block bg-white border-t border-gray-100 shrink-0 select-none pb-[env(safe-area-inset-bottom,16px)] z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
                    <div className="flex h-16 items-center justify-around">
                        <button 
                            id="mobile-tab-shift"
                            onClick={() => setActiveTab('SHIFT')} 
                            className={`flex flex-col items-center justify-center flex-1 h-full text-center transition-all cursor-pointer ${
                                activeTab === 'SHIFT' 
                                    ? 'text-[#111111] font-black scale-105' 
                                    : 'text-gray-400 font-bold active:text-gray-600'
                            }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all ${
                                activeTab === 'SHIFT' 
                                    ? 'bg-[#FFD200] text-black shadow-sm' 
                                    : 'bg-transparent text-gray-400'
                            }`}>
                                <Calculator size={18} strokeWidth={2.5}/>
                            </div>
                            <span className="text-[10px] tracking-wide mt-1">当班结算 (Shift)</span>
                        </button>
                        <button 
                            id="mobile-tab-history"
                            onClick={() => setActiveTab('HISTORY')} 
                            className={`flex flex-col items-center justify-center flex-1 h-full text-center transition-all cursor-pointer ${
                                activeTab === 'HISTORY' 
                                    ? 'text-[#111111] font-black scale-105' 
                                    : 'text-gray-400 font-bold active:text-gray-600'
                            }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all ${
                                activeTab === 'HISTORY' 
                                    ? 'bg-[#FFD200] text-black shadow-sm' 
                                    : 'bg-transparent text-gray-400'
                            }`}>
                                <History size={18} strokeWidth={2.5}/>
                            </div>
                            <span className="text-[10px] tracking-wide mt-1">历史账单 (History)</span>
                        </button>
                    </div>
                </div>

                {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center border-t-8 border-red-600 animate-in zoom-in-95">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce"><Trash2 size={32} className="text-red-600"/></div>
                            <h3 className="font-black text-2xl text-[#111111] mb-2">严重警告</h3>
                            <p className="text-sm text-gray-500 font-bold mb-2">确定要仅删除 <span className="text-red-600">{selectedRecord?.date}</span> 的结算记录吗？</p>
                            <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg mb-6 border border-red-100">
                                <AlertTriangle size={12} className="inline mr-1"/> 如果你想修改数据，请使用“撤销并重新编辑”按钮。此操作将永久清空记录。
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setShowDeleteConfirm(false)} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-200 transition-colors">取消</button>
                                <button onClick={executeDeleteRecord} className="py-3 bg-red-600 text-white font-bold rounded-xl text-sm hover:bg-red-700 shadow-xl active:scale-95 transition-transform flex items-center justify-center gap-2">
                                    <Trash2 size={16}/> 确认删除
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>
    );
};