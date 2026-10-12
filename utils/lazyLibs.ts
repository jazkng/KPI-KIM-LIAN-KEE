// ============================================================================
// 📦 大型导出工具「要用才下载」
// ----------------------------------------------------------------------------
// jsPDF / html2canvas / ExcelJS / XLSX / pdf.js 加起来约 1.6MB。
// 以前在文件开头直接 import → 一打开 App 就要全部下载、解析（iPhone 特别慢）。
// 现在只有按「导出 / 打印 / 读档」时才下载，第一次稍等一下，之后有缓存就很快。
// ============================================================================

/** 跟 html2canvas 一样的用法：await html2canvas(el, options) */
export const html2canvas = async (element: HTMLElement, options?: any): Promise<HTMLCanvasElement> => {
    const mod = await import('html2canvas-pro');
    return mod.default(element, options);
};

/** const JsPDF = await loadJsPDF(); new JsPDF(...) */
export const loadJsPDF = async () => (await import('jspdf')).jsPDF;

/** const ExcelJS = await loadExcelJS(); new ExcelJS.Workbook() */
export const loadExcelJS = async () => {
    const mod: any = await import('exceljs');
    return (mod.default || mod) as typeof import('exceljs');
};

export const loadXLSX = () => import('xlsx');

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
export const loadPdfjs = () => {
    if (!pdfjsPromise) {
        pdfjsPromise = import('pdfjs-dist').then(m => {
            m.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${m.version}/pdf.worker.min.mjs`;
            return m;
        });
    }
    return pdfjsPromise;
};
