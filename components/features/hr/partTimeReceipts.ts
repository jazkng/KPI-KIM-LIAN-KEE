import { html2canvas, loadJsPDF } from '../../../utils/lazyLibs';
import { ExpenseItem } from '../../../types';
import { waitForPdfFonts } from '../../../utils/pdfStyleResolver';

export async function exportPartTimeReceipts(records: ExpenseItem[], size: 'a5' | 'a4' = 'a5') {
  if (!records.length) throw new Error('请先勾选要导出的账目');
  await waitForPdfFonts();
  const pdf = new (await loadJsPDF())({ orientation: 'portrait', unit: 'mm', format: size });
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:560px;background:#fff;color:#111;font:16px "Noto Sans SC","PingFang SC",sans-serif;';
  document.body.appendChild(host);
  try {
    for (const [index, record] of records.entries()) {
      host.replaceChildren();
      const page = document.createElement('div');
      page.style.cssText = 'padding:32px;box-sizing:border-box;background:#fff;';
      host.appendChild(page);
      const line = (text: string, style = '') => {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin-bottom:12px;' + style;
        page.appendChild(el);
      };
      line('kim lian kee Group', 'font-size:22px;font-weight:700;border-bottom:6px solid #FFD200;padding-bottom:12px;');
      line(record.paymentStatus === 'PAID' ? '兼职工资收据 / Wage Receipt' : '兼职工资记录 / Payment Pending', 'font-size:23px;font-weight:700;');
      line(`收据编号：${record.id}`, 'font-size:12px;color:#555;');
      line(`收款人：${record.company || '未填写'}\n工作日期：${record.time?.slice(0, 10) || '未记录'}\n付款日期：${record.paymentDate || '未记录'}\n付款方式：${record.paymentMethod || '未记录'}\n付款状态：${record.paymentStatus === 'PAID' ? '已付' : record.paymentStatus || '未记录'}`);
      if (record.partTime) {
        const p = record.partTime;
        line(`工时：${p.hours} 小时 × RM ${Number(p.rate).toFixed(2)}\n另加：RM ${Number(p.extra || 0).toFixed(2)}${p.extraNote ? `（${p.extraNote}）` : ''}`);
      }
      line(`金额 RM ${Number(record.amount).toFixed(2)}`, 'font-size:28px;font-weight:700;background:#F6F7FB;padding:16px;');
      if (record.note) line(`备注：${record.note}`, 'font-size:14px;');
      if (record.partTimeRevisions?.length) line(`已更正 ${record.partTimeRevisions.length} 次 · 此收据反映当前账目`, 'font-size:12px;color:#555;');
      line('收款人签名：__________________\n\n经办人签名：__________________', 'margin-top:32px;');
      const canvas = await html2canvas(page, { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (index) pdf.addPage(size, 'portrait');
      const width = pdf.internal.pageSize.getWidth() - 16;
      const height = pdf.internal.pageSize.getHeight() - 16;
      const scale = width / canvas.width;
      const sliceHeight = Math.floor(height / scale);
      for (let offset = 0; offset < canvas.height; offset += sliceHeight) {
        if (offset) pdf.addPage(size, 'portrait');
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.min(sliceHeight, canvas.height - offset);
        const context = slice.getContext('2d');
        if (!context) throw new Error('无法生成收据，请重试');
        context.drawImage(canvas, 0, offset, slice.width, slice.height, 0, 0, slice.width, slice.height);
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', 8, 8, width, slice.height * scale);
      }
    }
    pdf.save(`兼职收据_${size.toUpperCase()}_${records.length}笔.pdf`);
  } finally { host.remove(); }
}
