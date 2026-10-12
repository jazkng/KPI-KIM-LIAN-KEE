import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileSpreadsheet, Loader2 } from "lucide-react";
import { DataManager } from "../../../utils/dataManager";
import { exportSettlementsExcel } from "./settlementExcelExport";

/**
 * 📊 批量导出结算单 Excel —— 选日期范围 → 一次导出
 *
 * 读资料库：按月份拉 settlements（一个月最多 31 笔），范围跨几个月就读几次，
 * 一年大约 365 次读取，不会全表扫描。
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 历史页目前选的月份，预设导出这个月 */
  defaultMonth: string;
}

const pad = (v: number) => String(v).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthStart = (m: string) => `${m}-01`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${pad(new Date(y, mo, 0).getDate())}`;
};
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/** 范围内涉及的每一个 YYYY-MM */
const monthsBetween = (from: string, to: string) => {
  const out: string[] = [];
  let m = from.slice(0, 7);
  const end = to.slice(0, 7);
  let guard = 0;
  while (m <= end && guard < 60) {
    out.push(m);
    m = shiftMonth(m, 1);
    guard++;
  }
  return out;
};

export const SettlementExcelExportDialog: React.FC<Props> = ({ isOpen, onClose, defaultMonth }) => {
  const [from, setFrom] = useState(monthStart(defaultMonth));
  const [to, setTo] = useState(monthEnd(defaultMonth));
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFrom(monthStart(defaultMonth));
      setTo(monthEnd(defaultMonth));
      setProgress("");
    }
  }, [isOpen, defaultMonth]);

  // iOS：打开时锁住背景滚动
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const thisMonth = ymd(new Date()).slice(0, 7);
  const presets = useMemo(
    () => [
      { label: "本月", from: monthStart(thisMonth), to: ymd(new Date()) },
      { label: "上个月", from: monthStart(shiftMonth(thisMonth, -1)), to: monthEnd(shiftMonth(thisMonth, -1)) },
      { label: "最近 3 个月", from: monthStart(shiftMonth(thisMonth, -2)), to: ymd(new Date()) },
      { label: "今年", from: `${thisMonth.slice(0, 4)}-01-01`, to: ymd(new Date()) },
    ],
    [thisMonth],
  );

  const months = from && to && from <= to ? monthsBetween(from, to) : [];
  const invalid = !from || !to || from > to;
  const tooLong = months.length > 24;

  const handleExport = async () => {
    if (invalid || tooLong || isExporting) return;
    setIsExporting(true);
    try {
      const all: any[] = [];
      for (let i = 0; i < months.length; i++) {
        setProgress(`读取 ${months[i]}（${i + 1}/${months.length}）…`);
        const list = await DataManager.getSettlements(months[i]);
        all.push(...list);
      }
      // 去重（同一个 id 只留一笔）+ 限定在日期范围内
      const seen = new Set<string>();
      const records = all.filter((r) => {
        if (!r?.date || r.date < from || r.date > to) return false;
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      if (records.length === 0) {
        setProgress("");
        alert(`⚠️ ${from} ~ ${to} 没有任何结算记录`);
        return;
      }
      setProgress(`正在产生 Excel（${records.length} 天）…`);
      await exportSettlementsExcel(records, { from, to });
      setProgress(`✅ 已导出 ${records.length} 天`);
    } catch (err) {
      console.error("Settlement Excel export failed", err);
      alert("❌ 导出失败，请检查网络后重试");
      setProgress("");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm"
      onClick={() => !isExporting && onClose()}
    >
      <div
        className="bg-[#F6F7FB] w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4"
        style={{ maxHeight: "92dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600 text-white p-2 rounded-xl">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-[#111111]">批量导出结算单</h3>
              <p className="text-[10px] font-bold text-gray-400">选日期范围，一次导出成 Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-500 bg-white border border-gray-200 active:scale-90 disabled:opacity-40"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 pb-4 space-y-4">
          {/* 快速选择 */}
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => {
              const active = p.from === from && p.to === to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                  className={`rounded-xl border-2 font-black text-sm min-h-[48px] active:scale-95 transition-all ${
                    active ? "bg-[#111111] border-[#111111] text-[#FFD200]" : "bg-white border-gray-200 text-gray-700"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* 自订范围 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">从</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                style={{ fontSize: "16px", minHeight: "48px" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">到</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-gray-200 bg-white font-bold outline-none focus:border-[#111111]"
                style={{ fontSize: "16px", minHeight: "48px" }}
              />
            </div>
          </div>

          {invalid && <p className="text-xs font-bold text-red-600">「从」不能晚于「到」</p>}
          {tooLong && <p className="text-xs font-bold text-red-600">一次最多导出 24 个月</p>}

          <div className="bg-white rounded-xl border border-gray-200 p-3 text-[11px] font-bold text-gray-500 leading-relaxed">
            Excel 里有 4 张表：
            <b className="text-[#111111]"> 每日汇总</b>（一天一行，含合计与日均）、
            <b className="text-[#111111]">月度汇总</b>、
            <b className="text-[#111111]">现金支出明细</b>、
            <b className="text-[#111111]">外卖明细</b>（Gross / Net / Ads / 核对状态）。
            数字跟每日结算单 PDF 同一套算法。
          </div>
        </div>

        <div
          className="bg-white border-t border-gray-200 px-4 pt-3 shrink-0 md:rounded-b-2xl"
          style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
        >
          {progress && <p className="text-xs font-bold text-gray-500 text-center mb-2">{progress}</p>}
          <button
            onClick={handleExport}
            disabled={invalid || tooLong || isExporting}
            className="w-full bg-emerald-600 text-white rounded-xl font-black text-base flex items-center justify-center gap-2 min-h-[52px] active:scale-[0.98] disabled:opacity-40 shadow-md"
          >
            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
            导出 Excel · {invalid ? "—" : `${months.length} 个月`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SettlementExcelExportDialog;
