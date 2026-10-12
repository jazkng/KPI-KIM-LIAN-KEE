import { html2canvas, loadJsPDF } from '../../../utils/lazyLibs';
import type { jsPDF } from 'jspdf';
import type { Employee, ExpenseItem } from '../../../types';
import { waitForPdfFonts, prepareClonedDocumentForPdf } from '../../../utils/pdfStyleResolver';

/**
 * 🖨 预支 / 兼职 —— A5 签收单
 *   · 单据：一笔一张（员工、主管、人事三方签名）
 *   · 汇总：一人一张（选定期间内这个人的全部预支 / 兼职，签一次）
 * 纯 inline style 画 HTML → html2canvas → jsPDF(A5)，跟画面无关，打印出来每次都一样。
 */

const PAGE_W = 559; // A5 148mm @96dpi
const PAGE_H = 794; // A5 210mm @96dpi
const FONT = `'Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif`;
const INK = '#111111';

export type StaffCashKind = 'ADVANCE' | 'PARTTIME';

export const kindOf = (e: ExpenseItem): StaffCashKind => (e.category === 'STAFF_ADVANCE' ? 'ADVANCE' : 'PARTTIME');

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateOf = (e: ExpenseItem) => String(e.paymentDate || e.time || '').slice(0, 10);

// ---------------------------------------------------------------------------
// 金额英文大写（Ringgit Malaysia ... Only）
// ---------------------------------------------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const words999 = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const parts: string[] = [];
    if (h) parts.push(`${ONES[h]} Hundred`);
    if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ' ' + ONES[r % 10] : ''}`);
    return parts.join(' ');
};
const intWords = (n: number): string => {
    if (n === 0) return 'Zero';
    const units = ['', ' Thousand', ' Million'];
    const out: string[] = [];
    let i = 0;
    while (n > 0 && i < units.length) {
        const chunk = n % 1000;
        if (chunk) out.unshift(words999(chunk) + units[i]);
        n = Math.floor(n / 1000);
        i++;
    }
    return out.join(' ');
};
export const amountInWords = (amt: number) => {
    const cents = Math.round((Number(amt) || 0) * 100);
    const rm = Math.floor(cents / 100);
    const sen = cents % 100;
    return `Ringgit Malaysia ${intWords(rm)}${sen ? ` and Sen ${intWords(sen)}` : ''} Only`;
};

// ---------------------------------------------------------------------------
// 共用零件
// ---------------------------------------------------------------------------

const DEPT_ZH: Record<string, string> = { KITCHEN: '厨房', FLOOR: '楼面', BAR: '水吧', DISHWASH: '洗碗', BACK_OFFICE: '后勤', OWNER: '老板', OTHER: '其他' };

export const findEmployee = (e: ExpenseItem, employees: Employee[]): Employee | undefined => {
    const id = (e as any).employeeId || e.partTime?.employeeId;
    if (id) {
        const hit = employees.find(x => x.id === id);
        if (hit) return hit;
    }
    return employees.find(x => x.name === e.company);
};

const pageOpen = `<div class="a5" style="width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;padding:26px 28px;background:#fff;color:${INK};font-family:${FONT};display:flex;flex-direction:column;">`;

const header = (titleZh: string, titleEn: string, rightTop: string, rightBottom: string) => `
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid ${INK};padding-bottom:8px;">
    <div>
      <div style="font-size:10px;font-weight:800;color:#888;letter-spacing:1.5px;">金莲记 KIM LIAN KEE · KEPONG</div>
      <div style="font-size:20px;font-weight:900;margin-top:2px;">${esc(titleZh)}</div>
      <div style="font-size:10.5px;font-weight:800;color:#666;letter-spacing:0.5px;">${esc(titleEn)}</div>
    </div>
    <div style="text-align:right;font-size:11px;font-weight:700;color:#444;line-height:1.5;">
      ${rightTop}<br/>${rightBottom}
    </div>
  </div>`;

const infoGrid = (rows: [string, string][]) => `
  <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:12px;">
    ${rows
        .reduce<string[]>((acc, r, i) => {
            if (i % 2 === 0) acc.push('');
            acc[acc.length - 1] += `<td style="padding:5px 6px;color:#777;font-weight:700;width:16%;border-bottom:1px solid #eee;white-space:nowrap;">${esc(r[0])}</td><td style="padding:5px 6px;font-weight:900;width:34%;border-bottom:1px solid #eee;">${esc(r[1]) || '&nbsp;'}</td>`;
            return acc;
        }, [])
        .map(tr => `<tr>${tr}</tr>`)
        .join('')}
  </table>`;

const signatures = (supervisorName?: string) => {
    const box = (zh: string, en: string, preset?: string) => `
      <div style="flex:1;border:1.5px solid ${INK};border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;">
        <div style="font-size:10.5px;font-weight:900;">${zh} <span style="color:#888;font-weight:700;">${en}</span></div>
        <div style="flex:1;min-height:52px;"></div>
        <div style="border-top:1px solid #999;padding-top:3px;font-size:9.5px;color:#555;line-height:1.6;">
          姓名 Name：<span style="font-weight:800;color:${INK};">${esc(preset || '')}</span><br/>日期 Date：
        </div>
      </div>`;
    return `<div style="display:flex;gap:8px;margin-top:auto;">
      ${box('员工签收', 'Employee')}
      ${box('主管', 'Supervisor', supervisorName)}
      ${box('人事', 'HR')}
    </div>`;
};

const footer = (text: string) => `<div style="margin-top:8px;font-size:8.5px;color:#aaa;display:flex;justify-content:space-between;"><span>${esc(text)}</span><span>Yushan ERP</span></div>`;

// ---------------------------------------------------------------------------
// 一笔一张
// ---------------------------------------------------------------------------

export const buildVoucher = (e: ExpenseItem, employees: Employee[]): string => {
    const kind = kindOf(e);
    const emp = findEmployee(e, employees);
    const d = dateOf(e);
    const by = (e as any).recordedBy?.name || '';
    // 单号：类别-日期-id 尾 4 码（id 结尾通常是时间戳；不是数字就用字母数字）
    const tail = (String(e.id).match(/(\d{4})\D*$/)?.[1] || String(e.id).replace(/[^a-z0-9]/gi, '').slice(-4)).toUpperCase();
    const no = `${kind === 'ADVANCE' ? 'ADV' : 'PT'}-${d.replace(/-/g, '').slice(2)}-${tail}`;
    const method = e.paymentMethod === 'BANK_TRANSFER' ? '银行转账 Bank Transfer' : e.paymentMethod === 'DUITNOW' ? 'DuitNow' : '现金 Cash';
    const reason = String(e.note || '')
        .replace(/^预支薪水\s*-\s*/, '')
        .replace(/^\[Part-Time\]\s*/, '')
        .trim();

    const rows: [string, string][] = [
        ['姓名 Name', emp?.name || e.company],
        ['工号 ID', emp?.id || '—'],
        ['部门 Dept', emp?.department ? DEPT_ZH[emp.department] || emp.department : '—'],
        ['职位 Position', (emp?.role || (kind === 'PARTTIME' ? '兼职 Part-time' : '')).split('(')[0].trim()],
    ];

    let detail = '';
    if (kind === 'ADVANCE') {
        const [y, m] = d.split('-');
        detail = `
          <div style="font-size:12px;line-height:1.9;margin-top:10px;">
            <div><b>付款方式 Method：</b>${esc(method)}</div>
            <div><b>原因 Reason：</b>${esc(reason || '—')}</div>
            <div><b>扣还 Deduction：</b>将从 <b>${esc(y)} 年 ${esc(Number(m))} 月</b> 薪资中一次扣除</div>
          </div>`;
    } else {
        const pt = e.partTime;
        detail = `
          <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">
            <tr style="background:#F6F7FB;"><td style="padding:6px;font-weight:800;">工作日期 Date</td><td style="padding:6px;">${esc(d)}</td></tr>
            ${pt?.clockIn && pt?.clockOut ? `<tr><td style="padding:6px;font-weight:800;">上下班 Time</td><td style="padding:6px;">${esc(pt.clockIn)} – ${esc(pt.clockOut)}</td></tr>` : ''}
            ${pt ? `<tr style="background:#F6F7FB;"><td style="padding:6px;font-weight:800;">工时 × 时薪</td><td style="padding:6px;">${esc(pt.hours)} h × RM ${money(pt.rate)} = RM ${money(pt.hours * pt.rate)}</td></tr>` : ''}
            ${pt?.extra ? `<tr><td style="padding:6px;font-weight:800;">另加 ${esc(pt.extraNote || 'Extra')}</td><td style="padding:6px;">RM ${money(pt.extra)}</td></tr>` : ''}
            <tr><td style="padding:6px;font-weight:800;">付款方式 Method</td><td style="padding:6px;">${esc(method)}</td></tr>
            ${!pt && reason ? `<tr><td style="padding:6px;font-weight:800;">备注 Note</td><td style="padding:6px;">${esc(reason)}</td></tr>` : ''}
          </table>`;
    }

    return `${pageOpen}
      ${header(kind === 'ADVANCE' ? '预支薪水单' : '兼职工资单', kind === 'ADVANCE' ? 'SALARY ADVANCE VOUCHER' : 'PART-TIME WAGES VOUCHER', `单号 No. <b style="color:${INK};">${esc(no)}</b>`, `日期 Date <b style="color:${INK};">${esc(d)}</b>`)}
      ${infoGrid(rows)}
      <div style="margin-top:14px;border:2px solid ${INK};border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="font-size:12px;font-weight:900;">金额<br/><span style="font-size:10px;color:#777;">AMOUNT</span></div>
        <div style="text-align:right;">
          <div style="font-size:28px;font-weight:900;font-family:ui-monospace,Menlo,monospace;">RM ${money(e.amount)}</div>
          <div style="font-size:10px;font-weight:700;color:#555;">${esc(amountInWords(e.amount))}</div>
        </div>
      </div>
      ${detail}
      <div style="margin-top:12px;font-size:10.5px;color:#444;line-height:1.6;background:#FAFAFA;border-radius:8px;padding:8px 10px;">
        本人确认已收到上述款项${kind === 'ADVANCE' ? '，并同意从当月薪资中扣除' : ''}。<br/>
        I hereby acknowledge receipt of the above amount${kind === 'ADVANCE' ? ' and agree that it will be deducted from my salary' : ''}.
      </div>
      ${signatures(by)}
      ${footer(`记录 ${String(e.createdAt || '').slice(0, 16).replace('T', ' ')}${by ? ` · ${by}` : ''} · ${e.id}`)}
    </div>`;
};

// ---------------------------------------------------------------------------
// 一人一张汇总（太多笔自动分页）
// ---------------------------------------------------------------------------

const ROWS_FIRST = 13;
const ROWS_NEXT = 18;

export interface PersonGroup {
    key: string;
    name: string;
    emp?: Employee;
    items: ExpenseItem[];
}

export const groupByPerson = (items: ExpenseItem[], employees: Employee[]): PersonGroup[] => {
    const map = new Map<string, PersonGroup>();
    items.forEach(e => {
        const emp = findEmployee(e, employees);
        const key = emp?.id || `name:${e.company}`;
        if (!map.has(key)) map.set(key, { key, name: emp?.name || e.company, emp, items: [] });
        map.get(key)!.items.push(e);
    });
    return Array.from(map.values())
        .map(g => ({ ...g, items: g.items.sort((a, b) => dateOf(a).localeCompare(dateOf(b))) }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

export const buildSummaryPages = (g: PersonGroup, period: string): string[] => {
    const pages: ExpenseItem[][] = [];
    let i = 0;
    while (i < g.items.length || pages.length === 0) {
        const size = pages.length === 0 ? ROWS_FIRST : ROWS_NEXT;
        pages.push(g.items.slice(i, i + size));
        i += size;
    }
    const adv = g.items.filter(e => kindOf(e) === 'ADVANCE').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const pt = g.items.filter(e => kindOf(e) === 'PARTTIME').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const total = adv + pt;
    const supervisors = Array.from(new Set(g.items.map(e => (e as any).recordedBy?.name).filter(Boolean))).join(' / ');

    return pages.map((rows, pi) => {
        const last = pi === pages.length - 1;
        const tr = rows
            .map((e, k) => {
                const isAdv = kindOf(e) === 'ADVANCE';
                const desc = isAdv
                    ? String(e.note || '').replace(/^预支薪水\s*-\s*/, '') || '预支'
                    : e.partTime
                      ? `${e.partTime.hours}h × RM${money(e.partTime.rate)}${e.partTime.extra ? ` + RM${money(e.partTime.extra)}` : ''}`
                      : String(e.note || '').replace(/^\[Part-Time\]\s*/, '');
                return `<tr style="${k % 2 ? 'background:#FAFAFA;' : ''}">
                  <td style="padding:5px 6px;border-bottom:1px solid #eee;white-space:nowrap;">${esc(dateOf(e).slice(5))}</td>
                  <td style="padding:5px 6px;border-bottom:1px solid #eee;white-space:nowrap;font-weight:800;color:${isAdv ? '#1D4ED8' : '#047857'};">${isAdv ? '预支' : '兼职'}</td>
                  <td style="padding:5px 6px;border-bottom:1px solid #eee;">${esc(desc)}</td>
                  <td style="padding:5px 6px;border-bottom:1px solid #eee;text-align:right;font-family:ui-monospace,Menlo,monospace;font-weight:800;">${money(e.amount)}</td>
                </tr>`;
            })
            .join('');
        return `${pageOpen}
          ${header('预支 / 兼职 签收汇总', 'ADVANCE & PART-TIME SUMMARY', `期间 Period <b style="color:${INK};">${esc(period)}</b>`, pages.length > 1 ? `第 ${pi + 1} / ${pages.length} 页` : `共 ${g.items.length} 笔`)}
          ${pi === 0 ? infoGrid([
              ['姓名 Name', g.name],
              ['工号 ID', g.emp?.id || '—'],
              ['部门 Dept', g.emp?.department ? DEPT_ZH[g.emp.department] || g.emp.department : '—'],
              ['职位 Position', (g.emp?.role || '').split('(')[0].trim() || '—'],
          ]) : `<div style="margin-top:10px;font-size:12px;font-weight:900;">${esc(g.name)} <span style="color:#888;">（续 cont.）</span></div>`}
          <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11.5px;">
            <thead><tr style="background:${INK};color:#fff;">
              <th style="padding:6px;text-align:left;width:14%;">日期</th>
              <th style="padding:6px;text-align:left;width:12%;">类别</th>
              <th style="padding:6px;text-align:left;">内容</th>
              <th style="padding:6px;text-align:right;width:22%;">金额 RM</th>
            </tr></thead>
            <tbody>${tr}</tbody>
          </table>
          ${last ? `
          <div style="margin-top:10px;border:2px solid ${INK};border-radius:10px;padding:8px 12px;">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:800;color:#444;">
              <span>预支 Advance：RM ${money(adv)}</span><span>兼职 Part-time：RM ${money(pt)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;">
              <span style="font-size:12px;font-weight:900;">合计 TOTAL</span>
              <span style="font-size:22px;font-weight:900;font-family:ui-monospace,Menlo,monospace;">RM ${money(total)}</span>
            </div>
            <div style="font-size:9.5px;font-weight:700;color:#555;text-align:right;">${esc(amountInWords(total))}</div>
          </div>
          <div style="margin-top:8px;font-size:10px;color:#444;line-height:1.5;">
            本人确认已收到以上各笔款项${adv > 0 ? '，预支部分同意从当月薪资中扣除' : ''}。I acknowledge receipt of all amounts listed above.
          </div>
          ${signatures(supervisors)}` : '<div style="margin-top:auto;"></div>'}
          ${footer(`打印 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`)}
        </div>`;
    });
};

// ---------------------------------------------------------------------------
// HTML → A5 PDF
// ---------------------------------------------------------------------------

export const renderA5Pdf = async (pagesHtml: string[], onProgress?: (done: number, total: number) => void): Promise<jsPDF> => {
    await waitForPdfFonts();
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;pointer-events:none;z-index:-1;`;
    document.body.appendChild(host);
    const pdf = new (await loadJsPDF())('p', 'mm', 'a5');
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    try {
        for (let i = 0; i < pagesHtml.length; i++) {
            host.innerHTML = pagesHtml[i];
            const page = host.firstElementChild as HTMLElement;
            const canvas = await html2canvas(page, {
                scale: 2.5,
                backgroundColor: '#ffffff',
                onclone: async doc => {
                    await prepareClonedDocumentForPdf(doc);
                },
            });
            if (i > 0) pdf.addPage('a5', 'p');
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
            onProgress?.(i + 1, pagesHtml.length);
        }
    } finally {
        host.remove();
    }
    return pdf;
};
