import { html2canvas, loadJsPDF } from '../../../../utils/lazyLibs';
import type { jsPDF } from 'jspdf';
import type { Employee } from '../../../../types';
import {
    STAR_LEVELS,
    MAX_STAR_FOR_SUPERVISOR,
    SkillItem,
    categoryLabel,
    getEmployeePositions,
    itemsForCategory,
} from '../../../../constants/skillCatalog';
import { classifyJob, JobCategory } from '../../assessmentConfig';
import { waitForPdfFonts, prepareClonedDocumentForPdf } from '../../../../utils/pdfStyleResolver';

/**
 * 🖨 纸本评分表（PDF，A4 直式）
 *  - 个人评分表：一人一张，主职 + 副职全部项目，圈 1–5
 *  - 部门总表：一个职位一张，员工一行、项目一格，直接写数字
 * 纸上的顺序跟系统画面一样，填完照着输入最快。
 * 纯 inline style（不靠 Tailwind），html2canvas 截图再放进 jsPDF。
 */

const PAGE_W = 794; // A4 @96dpi
const PAGE_H = 1123;
const FONT = `'Noto Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif`;

const esc = (s: any) =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const shortTitle = (t?: string) => (t ? t.split('(')[0].trim() || t : '');

const pageOpen = `<div class="skp" style="width:${PAGE_W}px;min-height:${PAGE_H}px;box-sizing:border-box;padding:44px 48px;background:#fff;color:#111;font-family:${FONT};">`;

const header = (title: string, period: string, sub = '') => `
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111;padding-bottom:10px;margin-bottom:14px;">
    <div>
      <div style="font-size:12px;font-weight:700;color:#888;letter-spacing:2px;">金莲记 KIM LIAN KEE</div>
      <div style="font-size:24px;font-weight:900;margin-top:2px;">${esc(title)}</div>
      ${sub ? `<div style="font-size:13px;font-weight:700;color:#555;margin-top:2px;">${sub}</div>` : ''}
    </div>
    <div style="text-align:right;font-size:13px;font-weight:700;">
      <div style="color:#888;font-size:11px;">评分期间</div>
      <div style="font-size:18px;font-weight:900;">${esc(period) || '________'}</div>
    </div>
  </div>`;

const legend = () => `
  <div style="display:flex;gap:6px;flex-wrap:wrap;background:#F6F7FB;border:1px solid #ddd;border-radius:8px;padding:8px 10px;margin-bottom:14px;font-size:11.5px;">
    ${STAR_LEVELS.map(
        s => `<span style="white-space:nowrap;"><b style="display:inline-block;width:18px;height:18px;line-height:18px;border:1.5px solid #111;border-radius:50%;text-align:center;font-size:11px;">${s.level}</b> <b>${s.zh}</b> <span style="color:#666;">${esc(s.desc)}</span></span>`,
    ).join('<span style="color:#ccc;">|</span>')}
  </div>`;

const circles = (lockedAbove?: number) =>
    [1, 2, 3, 4, 5]
        .map(
            n =>
                `<span style="display:inline-block;width:26px;height:26px;line-height:25px;border:1.5px solid ${lockedAbove && n > lockedAbove ? '#bbb' : '#111'};border-radius:50%;text-align:center;font-size:13px;font-weight:800;margin:0 3px;color:${lockedAbove && n > lockedAbove ? '#999' : '#111'};">${n}</span>`,
        )
        .join('');

const prevCell = (emp: Partial<Employee>, id: string) => {
    const r = emp.skillRatings?.[id];
    if (!r) return `<span style="color:#bbb;">—</span>`;
    return `<span style="color:#777;font-weight:800;">${r.level}</span><span style="color:#aaa;font-size:10px;"> ${esc(r.ratedAt?.slice(2) || '')}</span>`;
};

const footerSign = (extra = '') => `
  <div style="margin-top:18px;font-size:12.5px;">
    <div style="font-weight:800;margin-bottom:6px;">备注</div>
    <div style="border-bottom:1px solid #999;height:26px;"></div>
    <div style="border-bottom:1px solid #999;height:26px;"></div>
    <div style="display:flex;gap:24px;margin-top:22px;">
      <div style="flex:1;">评分人：<span style="display:inline-block;border-bottom:1px solid #111;width:70%;height:18px;vertical-align:bottom;"></span></div>
      <div style="flex:1;">日期：<span style="display:inline-block;border-bottom:1px solid #111;width:70%;height:18px;vertical-align:bottom;"></span></div>
      ${extra}
    </div>
    <div style="color:#999;font-size:10.5px;margin-top:10px;">※ 主管最多评到 ${MAX_STAR_FOR_SUPERVISOR} 分；4、5 分需要老板确认。「上次」为系统目前的分数，供参考。</div>
  </div>`;

// ---------------------------------------------------------------------------
// 个人评分表
// ---------------------------------------------------------------------------

export const buildPersonalSheet = (emp: Partial<Employee>, catalog: SkillItem[], period: string): string => {
    const positions = getEmployeePositions(emp, catalog);
    const printed = new Set<string>();
    const th = 'padding:7px 8px;font-size:11px;color:#666;font-weight:800;text-align:left;border-bottom:2px solid #111;';

    const sections = positions
        .map(pos => {
            const rows = pos.items
                .map(item => {
                    if (printed.has(item.id)) {
                        return `<tr><td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:13.5px;color:#aaa;">${esc(item.name)}</td><td colspan="3" style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:11.5px;color:#aaa;">↑ 同一项，上方已评</td></tr>`;
                    }
                    printed.add(item.id);
                    return `<tr>
            <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:14px;font-weight:800;">${esc(item.name)}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e5e5;font-size:13px;text-align:center;white-space:nowrap;">${prevCell(emp, item.id)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #e5e5e5;text-align:center;white-space:nowrap;">${circles()}</td>
            <td style="padding:8px;border-bottom:1px solid #e5e5e5;"><div style="border-bottom:1px dotted #bbb;height:16px;"></div></td>
          </tr>`;
                })
                .join('');
            return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:900;padding:2px 7px;border-radius:4px;${pos.isPrimary ? 'background:#111;color:#FFD200;' : 'background:#eee;color:#555;'}">${pos.isPrimary ? '★ 主职' : '副职'}</span>
            <span style="font-size:16px;font-weight:900;">${esc(shortTitle(pos.title))}</span>
            <span style="font-size:11.5px;color:#888;font-weight:700;">${esc(categoryLabel(pos.category))}</span>
          </div>
          ${
              pos.items.length === 0
                  ? `<div style="font-size:12px;color:#999;padding:8px;border:1px dashed #ccc;border-radius:6px;">这个职位还没有设定工作项目</div>`
                  : `<table style="width:100%;border-collapse:collapse;">
              <thead><tr>
                <th style="${th}width:34%;">工作项目</th>
                <th style="${th}width:12%;text-align:center;">上次</th>
                <th style="${th}width:34%;text-align:center;">本次（圈一个）</th>
                <th style="${th}">备注</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>`
          }
        </div>`;
        })
        .join('');

    const sub = `${esc(emp.name)}　<span style="color:#999;">#${esc(emp.id)}</span>${emp.joinDate ? `　<span style="color:#999;font-size:12px;">入职 ${esc(emp.joinDate)}</span>` : ''}`;

    return `${pageOpen}
    ${header('工作能力评分表', period, sub)}
    ${legend()}
    ${positions.length ? sections : '<div style="color:#999;font-size:13px;">还没设定职位</div>'}
    ${footerSign()}
  </div>`;
};

// ---------------------------------------------------------------------------
// 部门总表（一个职位类别一张）
// ---------------------------------------------------------------------------

export interface DeptRow {
    emp: Partial<Employee>;
    isPrimary: boolean;
}

export const employeesForCategory = (employees: Partial<Employee>[], cat: JobCategory): DeptRow[] => {
    const rows: DeptRow[] = [];
    employees.forEach(emp => {
        if (emp.role && classifyJob(emp.role) === cat) rows.push({ emp, isPrimary: true });
        else if ((emp.secondaryRoles || []).some(t => classifyJob(t) === cat)) rows.push({ emp, isPrimary: false });
    });
    // 主职在前
    return rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || String(a.emp.name).localeCompare(String(b.emp.name)));
};

const ROWS_PER_DEPT_PAGE = 16;

export const buildDepartmentSheets = (
    employees: Partial<Employee>[],
    catalog: SkillItem[],
    cat: JobCategory,
    period: string,
): string[] => {
    const items = itemsForCategory(catalog, cat);
    const rows = employeesForCategory(employees, cat);
    const blanks = 3;
    const all: (DeptRow | null)[] = [...rows, ...Array(blanks).fill(null)];
    const pages: (DeptRow | null)[][] = [];
    for (let i = 0; i < all.length; i += ROWS_PER_DEPT_PAGE) pages.push(all.slice(i, i + ROWS_PER_DEPT_PAGE));
    const colW = items.length ? Math.floor(64 / items.length) : 64;
    const th = 'padding:6px 4px;font-size:11.5px;font-weight:900;border:1px solid #111;background:#F6F7FB;';

    return pages.map((chunk, pi) => {
        const body = chunk
            .map(r => {
                const nameCell = r
                    ? `<div style="font-size:13.5px;font-weight:900;">${esc(r.emp.name)}</div><div style="font-size:10px;color:#888;font-weight:700;">${r.isPrimary ? '主职' : '副职'} · #${esc(r.emp.id)}</div>`
                    : `<div style="height:30px;"></div>`;
                const cells = items
                    .map(it => {
                        const prev = r?.emp.skillRatings?.[it.id]?.level;
                        return `<td style="border:1px solid #111;height:44px;position:relative;text-align:center;">${
                            prev ? `<span style="position:absolute;top:2px;right:4px;font-size:10px;color:#aaa;font-weight:800;">上次 ${prev}</span>` : ''
                        }</td>`;
                    })
                    .join('');
                return `<tr><td style="border:1px solid #111;padding:4px 8px;">${nameCell}</td>${cells}</tr>`;
            })
            .join('');
        return `${pageOpen}
      ${header('工作能力评分表 · 部门总表', period, `${esc(categoryLabel(cat))}${pages.length > 1 ? `　<span style="color:#999;font-size:12px;">第 ${pi + 1}/${pages.length} 页</span>` : ''}`)}
      ${legend()}
      ${
          items.length === 0
              ? '<div style="color:#999;font-size:13px;">这个职位还没有设定工作项目</div>'
              : `<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <thead><tr>
            <th style="${th}width:36%;text-align:left;padding-left:8px;">员工</th>
            ${items.map(it => `<th style="${th}width:${colW}%;">${esc(it.name)}</th>`).join('')}
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
        <div style="font-size:11px;color:#888;margin-top:6px;">每格写 1–5；不会 / 没做过的留空。</div>`
      }
      ${footerSign()}
    </div>`;
    });
};

// ---------------------------------------------------------------------------
// HTML → PDF
// ---------------------------------------------------------------------------

export const renderSheetsToPdf = async (
    pagesHtml: string[],
    onProgress?: (done: number, total: number) => void,
): Promise<jsPDF> => {
    await waitForPdfFonts();
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;pointer-events:none;z-index:-1;`;
    document.body.appendChild(host);
    const pdf = new (await loadJsPDF())('p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    try {
        for (let i = 0; i < pagesHtml.length; i++) {
            host.innerHTML = pagesHtml[i];
            const page = host.firstElementChild as HTMLElement;
            const canvas = await html2canvas(page, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                onclone: async clonedDoc => {
                    await prepareClonedDocumentForPdf(clonedDoc);
                },
            });
            const img = canvas.toDataURL('image/jpeg', 0.92);
            // 内容太长就等比缩小塞进一页
            const hMm = (canvas.height / canvas.width) * pw;
            const scale = hMm > ph ? ph / hMm : 1;
            const w = pw * scale;
            if (i > 0) pdf.addPage();
            pdf.addImage(img, 'JPEG', (pw - w) / 2, 0, w, hMm * scale);
            onProgress?.(i + 1, pagesHtml.length);
        }
    } finally {
        host.remove();
    }
    return pdf;
};

const isMobileShare = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod|Android/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
};

/**
 * 手机：用分享面板（里面有「打印」/「存到文件」）
 * 电脑：直接下载
 * 回传 false = 分享被浏览器挡了（iOS 要求刚点过按钮），画面要给一个按钮让用户再点一次。
 */
export const deliverPdf = async (pdf: jsPDF, fileName: string): Promise<boolean> => {
    if (isMobileShare() && typeof File !== 'undefined') {
        const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
        const nav: any = navigator;
        if (nav.canShare?.({ files: [file] })) {
            try {
                await nav.share({ files: [file], title: fileName });
                return true;
            } catch (err: any) {
                if (err?.name === 'AbortError') return true; // 用户自己关掉
                if (err?.name === 'NotAllowedError') return false;
            }
        }
    }
    pdf.save(fileName);
    return true;
};
