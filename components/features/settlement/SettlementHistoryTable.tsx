import React, { useMemo } from "react";
import type { SettlementRecord } from "../../../types";
import { getSettlementFigures } from "./settlementExcelExport";
import { getOps, perPax } from "./settlementOps";
import { getReconChannels } from "../../../utils/settlementRecon";

/**
 * 🧾 历史账单 —— 电脑版 Excel 式表格（一天一行，最下面合计）
 * 手机屏幕太窄，继续用原本的卡片（由 SettlementModule 控制 md:hidden / hidden md:block）。
 * 数字全部来自 getSettlementFigures，跟结算单 PDF / 导出 Excel 同一套算法。
 */

interface Props {
  records: SettlementRecord[];
  onSelect: (record: SettlementRecord) => void;
}

const m = (v: number) =>
  (Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v: number) => (Math.abs(v) < 0.005 ? "—" : m(v));

export const SettlementHistoryTable: React.FC<Props> = ({ records, onSelect }) => {
  const rows = useMemo(
    () =>
      records.map((r) => {
        const f = getSettlementFigures(r);
        const ops = getOps(r);
        const pending = getReconChannels(r).filter((c) => c.expected > 0 && !c.isReconciled).length;
        return { r, f, ops, avg: perPax(f.storeHubTotal, ops), pending };
      }),
    [records],
  );

  const tot = useMemo(() => {
    const t = { net: 0, store: 0, cash: 0, tng: 0, card: 0, delivery: 0, pax: 0, bills: 0, vipNew: 0, waJoin: 0, exp: 0, wd: 0, variance: 0 };
    rows.forEach(({ f, ops }) => {
      t.net += f.netRevenue;
      t.store += f.storeHubTotal;
      t.cash += f.cash;
      t.tng += f.tng;
      t.card += f.debit + f.credit + f.amex;
      t.delivery += f.totalDelivery;
      t.exp += f.cashExpenses;
      t.wd += f.ownerWithdrawal;
      t.variance += f.variance;
      t.pax += ops.pax;
      t.bills += ops.bills;
      t.vipNew += ops.vipNew;
      t.waJoin += ops.waJoin;
    });
    // 人均只用「有填人数的那几天」的店内实收来算，没填人数的日子不拉低平均
    const storeWithPax = rows.filter((x) => x.ops.pax > 0).reduce((s, x) => s + x.f.storeHubTotal, 0);
    return { ...t, avg: t.pax > 0 ? storeWithPax / t.pax : null };
  }, [rows]);

  const th = "px-2.5 py-2.5 text-[10px] font-black uppercase tracking-wide text-gray-500 whitespace-nowrap";
  const td = "px-2.5 py-2 font-mono text-[12px] text-right whitespace-nowrap";

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-[#F6F7FB] sticky top-0 z-10">
            <tr className="border-b border-gray-200">
              <th className={`${th} text-left`}>日期</th>
              <th className={`${th} text-right`}>总营业额</th>
              <th className={`${th} text-right`}>店内实收</th>
              <th className={`${th} text-right`}>现金</th>
              <th className={`${th} text-right`}>TNG</th>
              <th className={`${th} text-right`}>刷卡</th>
              <th className={`${th} text-right`}>外卖</th>
              <th className={`${th} text-right text-violet-700`}>人数</th>
              <th className={`${th} text-right text-violet-700`}>人均</th>
              <th className={`${th} text-right text-violet-700`}>熟客</th>
              <th className={`${th} text-right text-violet-700`}>WA新</th>
              <th className={`${th} text-right text-red-600`}>现金支出</th>
              <th className={`${th} text-right text-orange-600`}>提支</th>
              <th className={`${th} text-right text-blue-700`}>实点</th>
              <th className={`${th} text-right`}>差异</th>
              <th className={`${th} text-center`}>核对</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, f, ops, avg, pending }, i) => {
              const weekend = f.weekday === "周六" || f.weekday === "周日";
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className={`border-b border-gray-100 cursor-pointer hover:bg-[#FFFBE6] transition-colors ${i % 2 ? "bg-[#FAFAFC]" : "bg-white"}`}
                >
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <span className="font-mono font-black text-[#111111] text-sm">{f.date.slice(8, 10)}</span>
                    <span className={`ml-1.5 text-[11px] font-bold ${weekend ? "text-amber-600" : "text-gray-400"}`}>{f.weekday}</span>
                    {f.weather && <span className="ml-1 text-[10px] text-gray-400">{f.weather}</span>}
                    {f.holiday && <span className="ml-1 rounded bg-pink-50 px-1 text-[10px] font-bold text-pink-600" title="马来西亚公共假日">{f.holiday}</span>}
                  </td>
                  <td className={`${td} font-black text-[#111111]`}>{m(f.netRevenue)}</td>
                  <td className={td}>{m(f.storeHubTotal)}</td>
                  <td className={td}>{dash(f.cash)}</td>
                  <td className={td}>{dash(f.tng)}</td>
                  <td className={td}>{dash(f.debit + f.credit + f.amex)}</td>
                  <td className={td}>{dash(f.totalDelivery)}</td>
                  <td className={`${td} text-violet-800`}>{ops.pax || "—"}</td>
                  <td className={`${td} text-violet-800 font-bold`}>{avg === null ? "—" : avg.toFixed(2)}</td>
                  <td className={`${td} text-violet-800`}>{ops.vipNew || "—"}</td>
                  <td className={`${td} text-violet-800`}>{ops.waJoin || "—"}</td>
                  <td className={`${td} text-red-600`} title={f.expenses.map((e) => `${e.company} · ${e.item} RM${e.amount.toFixed(2)}`).join("\n")}>
                    {dash(f.cashExpenses)}
                    {f.expenses.length > 0 && <span className="ml-1 text-[10px] text-red-400">({f.expenses.length})</span>}
                  </td>
                  <td className={`${td} text-orange-600`}>{dash(f.ownerWithdrawal)}</td>
                  <td className={`${td} text-blue-700 font-bold`}>{m(f.closingCash)}</td>
                  <td className={`${td} font-black ${f.variance < 0 ? "text-red-600" : f.variance > 0 ? "text-emerald-600" : "text-gray-400"}`}>
                    {f.variance > 0 ? "+" : ""}
                    {f.variance.toFixed(2)}
                  </td>
                  <td className="px-2.5 py-2 text-center whitespace-nowrap">
                    {pending > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-md">
                        待核 {pending}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-emerald-700">✓</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#FFF4B3] border-t-2 border-[#111111]">
              <td className="px-2.5 py-2.5 text-[11px] font-black whitespace-nowrap">合计 {rows.length} 天</td>
              <td className={`${td} font-black`}>{m(tot.net)}</td>
              <td className={`${td} font-black`}>{m(tot.store)}</td>
              <td className={`${td} font-black`}>{m(tot.cash)}</td>
              <td className={`${td} font-black`}>{m(tot.tng)}</td>
              <td className={`${td} font-black`}>{m(tot.card)}</td>
              <td className={`${td} font-black`}>{m(tot.delivery)}</td>
              <td className={`${td} font-black text-violet-800`}>{tot.pax || "—"}</td>
              <td className={`${td} font-black text-violet-800`}>{tot.avg === null ? "—" : tot.avg.toFixed(2)}</td>
              <td className={`${td} font-black text-violet-800`}>{tot.vipNew || "—"}</td>
              <td className={`${td} font-black text-violet-800`}>{tot.waJoin || "—"}</td>
              <td className={`${td} font-black text-red-600`}>{m(tot.exp)}</td>
              <td className={`${td} font-black text-orange-600`}>{m(tot.wd)}</td>
              <td className={td}></td>
              <td className={`${td} font-black ${tot.variance < 0 ? "text-red-600" : "text-[#111111]"}`}>{tot.variance.toFixed(2)}</td>
              <td></td>
            </tr>
            <tr className="bg-white">
              <td className="px-2.5 py-2 text-[11px] font-bold text-gray-400 whitespace-nowrap">日均</td>
              <td className={`${td} text-gray-500`}>{rows.length ? m(tot.net / rows.length) : "—"}</td>
              <td className={`${td} text-gray-500`}>{rows.length ? m(tot.store / rows.length) : "—"}</td>
              <td colSpan={14}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] font-bold text-gray-400 border-t border-gray-100">
        点任何一行打开结算单详情 · 人均 = 店内实收 ÷ 顾客人数 · 鼠标停在「现金支出」上可看每一笔
      </p>
    </div>
  );
};

export default SettlementHistoryTable;
