import type { LogEntry } from '../../types';
import { html2canvas, loadJsPDF } from '../lazyLibs';
import { prepareClonedDocumentForPdf, waitForPdfFonts } from '../pdfStyleResolver';
import { logReportSections, logReportSummary } from './reportModel';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const status = (value: string) => ({ RESOLVED: '已解决', IN_PROGRESS: '处理中', PENDING: '待处理' }[value] || value);

export const exportLogbookReport = async (logs: LogEntry[], start: string, end: string, filterLabel: string) => {
    if (!logs.length) throw new Error('所选日期和分类没有日志可导出。');
    const summary = logReportSummary(logs);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:white;z-index:-1;';
    document.body.appendChild(host);
    const pages: HTMLElement[] = [];
    const addPage = () => {
        const page = document.createElement('section');
        page.style.cssText = 'width:794px;height:1123px;box-sizing:border-box;padding:40px 44px;background:white;color:#24201c;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.65;position:relative;';
        page.innerHTML = `<header style="border-bottom:3px solid #8d1520;padding-bottom:14px;margin-bottom:18px"><b style="font-size:24px">金莲记EPR · 运营问题讨论</b><div>${esc(start)} 至 ${esc(end)} · ${esc(filterLabel)} · ${summary.total} 项</div><div style="font-size:12px;color:#666">待跟进 ${summary.open} · 紧急 ${summary.urgent} · 客诉 ${summary.complaints} · 按报告生成时的记录状态</div></header><div data-report-body></div><footer style="position:absolute;bottom:30px;left:44px;right:44px;border-top:1px solid #ddd;padding-top:8px;font-size:11px;color:#777">内部讨论资料 · 不含附件照片 · 第 ${pages.length + 1} 页</footer>`;
        host.appendChild(page); pages.push(page); return page;
    };
    let page = addPage();
    try {
        await waitForPdfFonts();
        for (const section of logReportSections(logs)) {
            const { log } = section;
            const card = document.createElement('article');
            card.style.cssText = 'margin-bottom:16px;padding:15px 18px;border:1px solid #dcd5cd;border-radius:10px;break-inside:avoid;';
            card.innerHTML = `<div style="font-size:16px;font-weight:800;color:#8d1520">${section.number}. ${esc(log.date)} ${esc(log.time)} · ${esc(status(log.status))}${log.priority === 'HIGH' ? ' · 紧急' : ''}${section.parts > 1 ? `（${section.part}/${section.parts}）` : ''}</div><div style="font-size:12px;color:#666;margin:5px 0 10px">记录：${esc(log.creatorName)} · 跟进：${esc(log.assignedEmployeeName || '未指派')} · 编号 ${esc(log.id)}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65">${esc(section.body)}</div><div style="margin-top:18px;font-size:12px;color:#666">讨论决定／负责人／完成日期：</div><div style="height:26px;border-bottom:1px dotted #bbb"></div>`;
            let body = page.querySelector('[data-report-body]')!;
            body.appendChild(card);
            if (card.getBoundingClientRect().bottom - page.getBoundingClientRect().top > 1035) {
                card.remove(); page = addPage(); body = page.querySelector('[data-report-body]')!; body.appendChild(card);
            }
            if (card.getBoundingClientRect().bottom - page.getBoundingClientRect().top > 1035) throw new Error('日志内容超出打印页面，请缩短单条内容后重试。');
        }
        const pdf = new (await loadJsPDF())('p', 'mm', 'a4');
        for (let i = 0; i < pages.length; i++) {
            const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#fff', onclone: (cloned: Document) => prepareClonedDocumentForPdf(cloned) });
            if (i) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', .94), 'JPEG', 0, 0, 210, 297);
        }
        return { pdf, name: `金莲记-运营问题-${start}-${end}.pdf`, pages: pages.length };
    } finally { host.remove(); }
};
