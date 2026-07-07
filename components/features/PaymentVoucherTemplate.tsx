// ============================================================
// PaymentVoucherTemplate.tsx  (v4 — SVG checkmark, 修打勾位置)
// 📁 components/features/PaymentVoucherTemplate.tsx
// ============================================================

import React, { forwardRef } from 'react';
import { PaymentVoucher, COMPANY_INFO } from '../../utils/paymentVoucherUtils';

interface PaymentVoucherTemplateProps {
    voucher: PaymentVoucher;
}

const fmt = (n: number) => Number(n || 0).toFixed(2);

// 👑 v4: SVG 打勾,完美居中,在 html2canvas → PDF 渲染稳定
const CheckMark: React.FC = () => (
    <svg
        viewBox="0 0 16 16"
        className="w-3.5 h-3.5"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="3 8 7 12 13 4" />
    </svg>
);

export const PaymentVoucherTemplate = forwardRef<HTMLDivElement, PaymentVoucherTemplateProps>(
    ({ voucher }, ref) => {
        const rows = [...voucher.particulars];
        const isA5 = rows.length <= 3;
        const minRows = isA5 ? 1 : 5;
        const padCount = Math.max(0, minRows - rows.length);

        const isVoid = voucher.status === 'VOID';
        const isBackdated = voucher.isBackdated === true;
        const isCash = voucher.paymentMethod === 'CASH';
        const isOnline = voucher.paymentMethod === 'BANK_TRANSFER';

        const displayedTitle = voucher.voucherTitle 
            ? voucher.voucherTitle 
            : (isCash ? 'CASH VOUCHER' : 'PAYMENT VOUCHER');

        return (
            <div
                ref={ref}
                className={`w-[794px] bg-white ${isA5 ? 'px-8 py-3' : 'p-12'} text-black font-sans relative border-4 border-double border-gray-300 antialiased flex flex-col justify-between`}
                style={{
                    minHeight: isA5 ? 559 : 1123,
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                    boxSizing: 'border-box',
                    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
                } as React.CSSProperties}
            >
                {/* === Watermarks === */}
                {isVoid && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 50 }}>
                        <span className="text-red-500/15 font-extrabold tracking-widest border-12 border-red-500/15 rounded-2xl px-8 py-4 uppercase" style={{ fontSize: isA5 ? 50 : 80, transform: 'rotate(-20deg)' }}>
                            VOID
                        </span>
                    </div>
                )}
                {!isVoid && isBackdated && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 50 }}>
                        <span className="text-amber-500/15 font-extrabold tracking-widest" style={{ fontSize: isA5 ? 45 : 80, transform: 'rotate(-25deg)' }}>
                            BACKDATED
                        </span>
                    </div>
                )}

                {/* === Top part of flow === */}
                <div className="flex-grow flex flex-col justify-start">
                    {/* === Header === */}
                    <div className={`flex justify-between items-start border-b-2 border-black ${isA5 ? 'pb-1.5 mb-1.5' : 'pb-4 mb-6'}`}>
                        <div className="max-w-[62%]">
                            <h1 className={`${isA5 ? 'text-[20px] mb-0' : 'text-4xl'} font-extrabold uppercase tracking-widest mb-0.5 text-black`}>
                                {displayedTitle}
                            </h1>
                            <p className={`${isA5 ? 'text-sm' : 'text-lg'} font-bold text-gray-700`}>{COMPANY_INFO.name}</p>
                            <p className={`text-gray-500 mt-0.5 ${isA5 ? 'text-[8.5px]' : 'text-[10px]'}`}>Co. Reg. No: {COMPANY_INFO.registrationNo}</p>
                            <p className={`text-gray-500 mt-0.5 leading-snug ${isA5 ? 'text-[8.5px]' : 'text-[10px]'}`}>{COMPANY_INFO.address}</p>
                        </div>
                        <div className="text-right">
                            <p className={`font-bold uppercase text-gray-500 ${isA5 ? 'text-[8px] mb-0' : 'text-[10px]'}`}>Voucher No.</p>
                            <p className={`${isA5 ? 'text-sm font-mono font-bold leading-none' : 'text-xl font-mono font-bold leading-tight'}`}>{voucher.pvNumber}</p>
                            <p className={`font-bold uppercase text-gray-500 mt-1 ${isA5 ? 'text-[8px] mb-0' : 'text-[10px]'}`}>Date</p>
                            <p className={`${isA5 ? 'text-sm font-mono leading-none' : 'text-lg font-mono leading-tight'}`}>
                                {new Date(voucher.date).toLocaleDateString('en-GB')}
                            </p>
                            {voucher.invoiceDateRange && (
                                <div className={`${isA5 ? 'mt-0.5' : 'mt-2'} text-right`}>
                                    <p className="text-[9px] font-bold uppercase text-gray-500 leading-tight">Invoice Range</p>
                                    <p className="text-[11px] font-mono font-bold text-amber-900 bg-amber-50 inline-block px-1.5 py-0.5 rounded border border-amber-200 mt-0.5 whitespace-nowrap">
                                        📅 {voucher.invoiceDateRange}
                                    </p>
                                </div>
                            )}
                            {isBackdated && voucher.backdateGeneratedAt && (
                                <p className="text-[9px] text-amber-700 font-bold uppercase mt-1 leading-tight">
                                    Backdated Entry<br/>
                                    Gen: {new Date(voucher.backdateGeneratedAt).toLocaleDateString('en-GB')}
                                </p>
                            )}
                            {voucher.supportingDocLink && (
                                <div className="mt-1 text-right no-print">
                                    <a 
                                        href={voucher.supportingDocLink} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="inline-flex items-center gap-1 text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-black hover:bg-blue-100 transition-all border border-blue-200"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        🔗 View Doc
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* === Payee + Method === */}
                    <div className={`grid grid-cols-2 gap-4 ${isA5 ? 'mb-1.5' : 'mb-6'}`}>
                        <div className={`border ${isA5 ? 'p-1.5' : 'p-4'} rounded`}>
                            <p className={`font-bold uppercase text-gray-500 mb-0.5 ${isA5 ? 'text-[8.5px]' : 'text-[10px]'}`}>Pay To</p>
                            <p className={`${isA5 ? 'text-sm font-black leading-tight' : 'text-xl font-bold'}`}>{voucher.payeeName}</p>
                            {voucher.payeeId && (
                                <p className="text-[10px] font-mono text-gray-400 mt-0.5 mb-0">ID: {voucher.payeeId}</p>
                            )}
                        </div>
                        {/* 👑 v4: Payment Method - 缩小 label margin, checkbox 居中对齐文字 */}
                        <div className={`border ${isA5 ? 'p-1.5' : 'p-4'} rounded`}>
                            <p className={`font-bold uppercase text-gray-500 mb-0.5 ${isA5 ? 'text-[8.5px]' : 'text-[10px]'}`}>Payment Method</p>
                            <div className="flex gap-4 items-center mt-1">
                                {/* ☑ Cash */}
                                <div className="flex items-center gap-1.5">
                                    <span className={`inline-flex items-center justify-center ${isA5 ? 'w-3.5 h-3.5' : 'w-5 h-5'} border-2 border-black shrink-0 ${isCash ? 'bg-black' : 'bg-white'}`}>
                                        {isCash && <CheckMark />}
                                    </span>
                                    <span className={`leading-none ${isA5 ? 'text-xs font-bold' : 'text-base font-extrabold'} ${isCash ? 'text-black' : 'text-gray-500'}`}>Cash</span>
                                </div>
                                {/* ☑ Online Transfer */}
                                <div className="flex items-center gap-1.5">
                                    <span className={`inline-flex items-center justify-center ${isA5 ? 'w-3.5 h-3.5' : 'w-5 h-5'} border-2 border-black shrink-0 ${isOnline ? 'bg-black' : 'bg-white'}`}>
                                        {isOnline && <CheckMark />}
                                    </span>
                                    <span className={`leading-none ${isA5 ? 'text-xs font-bold' : 'text-base font-extrabold'} ${isOnline ? 'text-black' : 'text-gray-500'}`}>Online Transfer</span>
                                </div>
                            </div>
                            {voucher.bankRef && (
                                <p className="text-[10px] font-mono text-gray-400 mt-1 mb-0">Ref: {voucher.bankRef}</p>
                            )}
                        </div>
                    </div>

                    {/* === Particulars === */}
                    <table className={`w-full text-left ${isA5 ? 'mb-1.5' : 'mb-6'} border border-black`}>
                        <thead className="bg-gray-100">
                            <tr>
                                <th className={`${isA5 ? 'p-1.5 text-xs' : 'p-3 text-sm'} border-r border-black uppercase font-bold w-12 text-center`}>No.</th>
                                <th className={`${isA5 ? 'p-1.5 text-xs' : 'p-3 text-sm'} border-r border-black uppercase font-bold`}>Particulars of Payment</th>
                                <th className={`${isA5 ? 'p-1.5 text-xs' : 'p-3 text-sm'} border-r border-black uppercase font-bold w-36`}>Invoice No.</th>
                                <th className={`${isA5 ? 'p-1.5 text-xs' : 'p-3 text-sm'} uppercase font-bold text-right w-36`}>Amount (RM)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((p, i) => (
                                <tr key={i} className="border-t border-gray-300">
                                    <td className={`${isA5 ? 'p-1 text-xs' : 'p-3 text-sm'} border-r border-black text-center font-mono align-top`}>{i + 1}</td>
                                    <td className={`${isA5 ? 'p-1 text-xs' : 'p-3 text-sm'} border-r border-black align-top`}>
                                        <div className="font-bold">{p.description}</div>
                                    </td>
                                    <td className={`${isA5 ? 'p-1 text-xs font-mono' : 'p-3 text-sm font-mono'} border-r border-black align-top`}>
                                        {p.invoiceRef || '-'}
                                    </td>
                                    <td className={`${isA5 ? 'p-1 text-xs font-semibold' : 'p-3 text-sm'} text-right font-mono align-top`}>{fmt(p.amount)}</td>
                                </tr>
                            ))}
                            {Array.from({ length: padCount }).map((_, i) => (
                                <tr key={`pad-${i}`} className="border-t border-gray-300">
                                    <td className={`${isA5 ? 'p-1 h-5' : 'p-3 h-10'} border-r border-black`}>&nbsp;</td>
                                    <td className="p-1 border-r border-black"></td>
                                    <td className="p-1 border-r border-black"></td>
                                    <td className="p-1"></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-100">
                            <tr>
                                <td colSpan={3} className={`${isA5 ? 'p-1.5 text-xs' : 'p-3 text-sm'} border-r border-black border-t-2 border-t-black font-bold text-right uppercase`}>
                                    Total
                                </td>
                                <td className={`${isA5 ? 'p-1.5 text-sm font-semibold' : 'p-3 text-xl'} border-t-2 border-t-black text-right font-bold font-mono`}>
                                    {fmt(voucher.totalAmount)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* === Bottom part of flow === */}
                <div className="mt-auto">
                    {/* === Signatures === */}
                    <div className={`grid grid-cols-3 gap-8 ${isA5 ? 'mt-1' : 'mt-12'}`}>
                        <div className="text-center">
                            <div className={`border-b border-black mb-1 ${isA5 ? 'h-8' : 'h-16'} flex items-end justify-center pb-0.5`}>
                                <span className="text-xs text-gray-400 font-mono">{voucher.preparedBy || ''}</span>
                            </div>
                            <p className="text-[10px] font-bold uppercase text-gray-500">Prepared By</p>
                        </div>
                        <div className="text-center">
                            <div className={`border-b border-black mb-1 ${isA5 ? 'h-8' : 'h-16'} flex items-end justify-center pb-0.5`}>
                                <span className="text-xs text-gray-400 font-mono">{voucher.checkedBy || ''}</span>
                            </div>
                            <p className="text-[10px] font-bold uppercase text-gray-500">Checked By</p>
                        </div>
                        <div className="text-center">
                            <div className={`border-b border-black mb-1 ${isA5 ? 'h-8' : 'h-16'} flex items-end justify-center pb-0.5`}>
                                <span className="text-xs text-gray-400 font-mono">{voucher.approvedBy || ''}</span>
                            </div>
                            <p className="text-[10px] font-bold uppercase text-gray-500">Approved By</p>
                        </div>
                    </div>

                    <p className={`text-[8px] text-gray-400 ${isA5 ? 'mt-1.5' : 'mt-4'} text-center leading-normal`}>
                        This voucher must be attached with the original supporting documents (invoice / receipt).<br/>
                        Generated by KLK ERP on {new Date(voucher.createdAt).toLocaleString('en-GB')}.
                    </p>
                </div>
            </div>
        );
    }
);

PaymentVoucherTemplate.displayName = 'PaymentVoucherTemplate';
