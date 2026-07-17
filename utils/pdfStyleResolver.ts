/**
 * Utility to copy computed styles from original elements to their html2canvas cloned elements.
 * This resolves all Tailwind CSS v4 variables (e.g., var(--color-gray-100)) and dynamic layouts,
 * ensuring high-fidelity color, borders, spacing, and grid/flex alignments in exported PDFs.
 */

const CRITICAL_PROPERTIES = [
    // Layout & Sizing
    'display', 'position', 'top', 'left', 'right', 'bottom',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'box-sizing',
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
    'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'text-align', 'text-transform', 'text-decoration', 'white-space', 'word-break',
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
