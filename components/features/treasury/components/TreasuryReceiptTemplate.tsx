import React from "react";
import { FundTransfer } from "../treasuryTypes";

interface TreasuryReceiptTemplateProps {
  record: FundTransfer | null;
  printRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 收据 PDF 打印模板 (隐藏挂载)
 * ⚠️ 版面刻意维持原样，任何改动都会影响已发出收据的格式一致性。
 */
export const TreasuryReceiptTemplate: React.FC<TreasuryReceiptTemplateProps> = ({
  record,
  printRef,
}) => {
  if (!record) return null;

  const cleanNote = record.note?.replace("[代收] ", "") || "";
  const dashIndex = cleanNote.indexOf(" - ");
  const sourceName =
    dashIndex > -1 ? cleanNote.substring(0, dashIndex) : cleanNote || "N/A";
  const description =
    dashIndex > -1 ? cleanNote.substring(dashIndex + 3) : "Payment";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "0px",
        left: "-100000px",
        width: "148mm",
        height: "210mm",
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <div
        ref={printRef}
        id="treasury-receipt-export-root"
        className="w-[148mm] min-h-[210mm] bg-white p-10 font-sans text-black relative border-8 border-[#111111] flex flex-col justify-between"
        style={{ boxSizing: "border-box" }}
      >
        {/* Top Decorative Gold Bar */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-[#FFD200]" />

        <div>
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-200 pb-6 mb-8">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-widest text-[#111111] mb-1">
                OFFICIAL RECEIPT
              </h1>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#FFD200]" />
                <p className="text-xs font-black text-gray-700 tracking-wider">
                  KIM LIAN KEE (KEPONG)
                </p>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed font-semibold">
                No. 52, Jalan Metro Perdana Barat 13
                <br />
                Kepong, 52100 Kuala Lumpur
              </p>
            </div>
            <div className="text-right flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                  Receipt No
                </p>
                <p className="text-lg font-mono font-black text-[#111111] bg-gray-100 px-3 py-1 rounded-lg border border-gray-200 inline-block">
                  #{record.id.slice(-6).toUpperCase()}
                </p>
              </div>
              <div className="mt-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                  Date Issued
                </p>
                <p className="text-xs font-bold text-gray-700">{record.date}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{" "}
                  Received From (付款人):
                </p>
                <h2 className="text-sm font-black text-[#111111]">{sourceName}</h2>
              </div>
              <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{" "}
                  Payment For (款项用途):
                </p>
                <h2 className="text-sm font-black text-[#111111]">{description}</h2>
              </div>
            </div>

            {/* Amount Banner */}
            <div className="bg-[#111111] text-white p-6 rounded-2xl border-b-4 border-[#FFD200] shadow-xl relative overflow-hidden flex items-center justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD200]/10 rounded-full blur-2xl pointer-events-none" />
              <div className="relative z-10">
                <p className="text-[10px] font-black text-[#FFD200] uppercase tracking-widest mb-1">
                  TOTAL AMOUNT RECEIVED
                </p>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  实收金额 (MYR)
                </p>
              </div>
              <div className="relative z-10 text-right">
                <p className="text-3xl font-mono font-black text-[#FFD200]">
                  RM {record.amount.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Payment metadata */}
            <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex justify-between items-center text-xs font-bold text-stone-600">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] bg-stone-200 text-stone-700 px-2 py-0.5 rounded-md font-black">
                  METHOD
                </span>
                <span className="font-mono uppercase text-stone-900">
                  {record.toAccount}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-black">
                  STATUS
                </span>
                <span className="text-emerald-600 uppercase font-black">
                  PAID (已付)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div>
          <div className="grid grid-cols-2 gap-16">
            <div className="border-t-2 border-gray-200 pt-3">
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                Received By (收款方)
              </p>
              <p className="text-xs font-black text-gray-800">KIM LIAN KEE</p>
            </div>
            <div className="border-t-2 border-[#FFD200] pt-3 relative">
              <p className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest mb-1">
                Authorized Signature (授权签章)
              </p>
              <div className="h-6" />
            </div>
          </div>

          <p className="text-[8px] text-center text-gray-400 mt-10 uppercase tracking-widest font-bold border-t border-gray-100 pt-4">
            This is a computer-generated official receipt • No physical signature
            is required
          </p>
        </div>
      </div>
    </div>
  );
};
