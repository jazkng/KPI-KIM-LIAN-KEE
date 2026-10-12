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
    ['400 16px "Noto Sans SC"', '金莲记结算薪资打卡'],
    ['500 16px "Noto Sans SC"', '金莲记结算薪资打卡'],
    ['600 16px "Noto Sans SC"', '金莲记结算薪资打卡'],
    ['700 16px "Noto Sans SC"', '金莲记结算薪资打卡'],
    ['900 16px "Noto Sans SC"', '金莲记结算薪资打卡'],
];


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
/**
 * 👑 html2canvas 的 clone iframe 专用：等字体真的可以用了再让它量字宽。
 *
 * 为什么需要：html2canvas 先在一个「新 iframe」里复制整页，再用 Range 量每个字的位置，
 * 最后在 canvas 上用 Inter 把字一段一段画到量到的位置。
 * 新 iframe 里的 Google Fonts <link> 要重新载入 —— iPhone Safari 上这时 @font-face 还没生效，
 * document.fonts.ready 会「马上」resolve（因为根本还没有字体在排队），
 * 结果 Range 用后备字体（苹方）量，canvas 却用 Inter 画：
 *   · Inter 的数字比苹方宽 → 「2026-09-28」「SET-…-6924」数字压在一起、连字号被盖掉
 *   · 苹方的「·」是全角宽 → 「Kelvin ·  Advance」中间多出一大块空白
 * 电脑 Chrome 字体有缓存几乎同步可用，所以桌面导出正常、手机才会走位。
 *
 * 做法：① 等 clone 里的样式表载完 ② 用 fonts.load 逐个字重把 Inter / JetBrains Mono / Noto Sans SC 真的拉下来
 *       ③ 强制重排，让之后的 Range 量测用正确字体。整段有逾时保护，最坏情况照旧导出。
 */
export const prepareClonedDocumentForPdf = async (clonedDoc: Document, timeoutMs = 4000): Promise<void> => {
    if (!clonedDoc) return;
    const deadline = new Promise<void>(resolve => setTimeout(resolve, timeoutMs));

    const work = (async () => {
        // ① 样式表（含 Google Fonts 的 @font-face）载完
        const links = Array.from(clonedDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
        await Promise.all(
            links.map(link => {
                try {
                    if (link.sheet) return Promise.resolve();
                } catch {
                    // 跨域样式表读 sheet 可能抛错，但抛错本身就代表已载入
                    return Promise.resolve();
                }
                return new Promise<void>(resolve => {
                    link.addEventListener('load', () => resolve(), { once: true });
                    link.addEventListener('error', () => resolve(), { once: true });
                });
            })
        );

        // ② 真的把每个字重下载 / 解码（样本字串含数字、连字号、间隔号，确保用到的分片都会被拉）
        const fonts = (clonedDoc as any).fonts as FontFaceSet | undefined;
        if (fonts) {
            const latinSample = '0123456789-:·.RMABCabc';
            await Promise.all(
                PDF_FONT_SPECS.map(([spec, sampleText]) =>
                    fonts.load(spec, sampleText || latinSample).catch(() => undefined)
                )
            );
            try { await fonts.ready; } catch { /* ignore */ }
        }

        // ③ 强制重排，后面的 Range 量测才会用新字体
        void clonedDoc.body?.offsetHeight;
        await new Promise<void>(resolve => {
            const win = clonedDoc.defaultView;
            if (win?.requestAnimationFrame) win.requestAnimationFrame(() => resolve());
            else resolve();
        });
    })();

    await Promise.race([work, deadline]);
};
