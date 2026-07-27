/**
 * Utility to copy computed styles from original elements to their html2canvas cloned elements.
 * This resolves all Tailwind CSS v4 variables (e.g., var(--color-gray-100)) and dynamic layouts,
 * ensuring high-fidelity color, borders, spacing, and grid/flex alignments in exported PDFs.
 */

/**
 * 打印模板会用到的字体 / 字重组合。
 *
 * `document.fonts.ready` 只等待「已经被请求过」的字体，而打印模板通常是隐藏渲染的，
 * 屏幕上没出现过的字重可能压根没发起请求。html2canvas 会先量文字宽度再画，
 * 一旦量的时候用的是后备字体、画的时候换成了真字体（或反过来），
 * 宽度就对不上——表现就是单词间空格被吃掉、文字挤出换行、换行后压到下一行元素上。
 * 所以导出前要显式把这些组合都加载一遍。
 */
const PDF_FONT_SPECS: ReadonlyArray<readonly [spec: string, sampleText?: string]> = [
    ['400 16px Inter'],
    ['500 16px Inter'],
    ['600 16px Inter'],
    ['700 16px Inter'],
    ['800 16px Inter'],
    ['900 16px Inter'],
    ['400 16px "JetBrains Mono"'],
    ['500 16px "JetBrains Mono"'],
    ['700 16px "JetBrains Mono"'],
    ['800 16px "JetBrains Mono"'],
    // CJK 字体按 unicode-range 分片下载，必须给样本文字才会拉取对应分片
    ['700 16px "Noto Serif SC"', '金莲记结算薪资打卡'],
    ['900 16px "Noto Serif SC"', '金莲记结算薪资打卡'],
];

/**
 * 在调用 html2canvas 之前等待字体就绪。字体加载失败不阻断导出——
 * 退回系统字体的 PDF 也好过导不出来。
 */
export const waitForPdfFonts = async (): Promise<void> => {
    if (typeof document === 'undefined' || !document.fonts) return;
    try {
        await Promise.all(
            PDF_FONT_SPECS.map(([spec, sampleText]) =>
                document.fonts.load(spec, sampleText).catch(() => undefined)
            )
        );
        await document.fonts.ready;
    } catch {
        // 忽略：字体没准备好也继续导出
    }
};

const CRITICAL_PROPERTIES = [
    // Layout & Sizing
    'display', 'position', 'top', 'left', 'right', 'bottom',
    // 刻意不复制 `height`：getComputedStyle 返回的是原始 DOM 的实测高度（像素）。
    // 一旦克隆体里文字比原始 DOM 宽一点点而多折了一行，被锁死的高度就装不下，
    // 多出来的那行会溢出去压在下一个元素上——结算单标题压住 KEPONG BRANCH、
    // 「Owner's Drawings」压住业主提支，都是这么来的。
    // 高度交给内容自己撑；固定高度的元素本来就有 Tailwind 的 h-* 类在克隆体里生效。
    'width', 'min-width', 'min-height', 'max-width', 'max-height', 'box-sizing',
    // Flexbox
    'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
    'justify-content', 'align-items', 'align-self', 'align-content',
    // Grid
    'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
    'gap', 'row-gap', 'column-gap',
    // Spacing
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    // Backgrounds
    'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    // Borders
    'border', 'border-style', 'border-width', 'border-color', 'border-radius',
    'border-top', 'border-bottom', 'border-left', 'border-right',
    'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color',
    'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width',
    'border-top-style', 'border-bottom-style', 'border-left-style', 'border-right-style',
    // Typography
    // 注意：凡是会影响「文字实际占多宽」的属性都必须复制，漏一个就会让克隆体里的
    // 排版和原始 DOM 对不上，进而挤出换行或吃掉空格。
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
    'line-height', 'letter-spacing', 'word-spacing',
    'font-variant-numeric', 'font-feature-settings', 'font-kerning',
    'text-align', 'text-transform', 'text-decoration', 'text-indent',
    'white-space', 'word-break', 'overflow-wrap', 'hyphens',
    // Tables
    'border-collapse', 'border-spacing', 'table-layout', 'vertical-align',
    // Other Visuals
    'box-shadow', 'opacity', 'visibility', 'z-index', 'overflow', 'transform'
];

export const applyResolvedStylesForPdf = (originalRoot: HTMLElement, clonedRoot: HTMLElement) => {
    if (!originalRoot || !clonedRoot) return;

    // html2canvas calls onclone only after clonedDocument has already been created.
    // Adding IDs to the original DOM here is therefore too late: those IDs will
    // never exist in the clone. html2canvas preserves the element order, so pair
    // the original and cloned trees by index instead.
    const originalElements = [originalRoot, ...Array.from(originalRoot.querySelectorAll<HTMLElement>('*'))];
    const clonedElements = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>('*'))];

    const pairCount = Math.min(originalElements.length, clonedElements.length);
    for (let index = 0; index < pairCount; index += 1) {
        const originalEl = originalElements[index];
        const clonedEl = clonedElements[index];
        const computedStyle = window.getComputedStyle(originalEl);

        CRITICAL_PROPERTIES.forEach(prop => {
            const val = computedStyle.getPropertyValue(prop);
            if (val) {
                clonedEl.style.setProperty(prop, val, computedStyle.getPropertyPriority(prop));
            }
        });
    }

    // Keep the captured root visible without replacing the copied flex/grid layout.
    clonedRoot.style.position = 'relative';
    clonedRoot.style.left = '0';
    clonedRoot.style.top = '0';
    if (window.getComputedStyle(originalRoot).display === 'none') {
        clonedRoot.style.display = 'block';
    }
    clonedRoot.style.visibility = 'visible';
    clonedRoot.style.opacity = '1';
    clonedRoot.style.backgroundColor = '#ffffff';
};
