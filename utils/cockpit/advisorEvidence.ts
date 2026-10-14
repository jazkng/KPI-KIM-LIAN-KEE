// ============================================================================
// AI 经营顾问 · 证据清单（PR F）
// 把驾驶舱已算好的指标、预警、资料完整性整理成有编号的清单，交给 AI；
// AI 每一句都必须引用这些编号，服务端核对后才显示。纯函数，只读。
// ============================================================================
import { COCKPIT_STATUS_LABEL, type CockpitResult, type Kpi } from './cockpitMetrics';
import type { AlertCenter } from './alertRules';

export interface EvidenceItem {
    id: string;
    label: string;
    value: string;
    note?: string;
    /** 前端显示用：点引用时跳到哪里 */
    kpiKey?: string;
}

const rm = (n: number) => `${n < 0 ? '−' : ''}RM ${Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const formatKpiValue = (k: Kpi) => {
    if (k.value === null) return '无法计算';
    if (k.unit === 'PCT') return pct(k.value);
    if (k.unit === 'DAYS') return `${k.value} 天`;
    return rm(k.value);
};

export const buildAdvisorEvidence = (result: CockpitResult, center: AlertCenter | null): EvidenceItem[] => {
    const items: EvidenceItem[] = [];
    result.order.forEach((key, i) => {
        const k = result.kpis[key];
        if (!k) return;
        items.push({
            id: `K${i + 1}`,
            label: k.label,
            value: `${formatKpiValue(k)}（${COCKPIT_STATUS_LABEL[k.status]}）`,
            note: [k.statusNote, k.basis[0]].filter(Boolean).join('；'),
            kpiKey: key,
        });
    });
    (center?.alerts || []).slice(0, 20).forEach((a, i) => {
        items.push({
            id: `A${i + 1}`,
            label: `预警·${a.category}${a.level === 'HIGH' ? '（高优先级）' : ''}`,
            value: a.title,
            note: [a.detail, ...a.evidence].join('；'),
        });
    });
    (center?.skipped || []).forEach((s, i) => {
        items.push({ id: `S${i + 1}`, label: `未检查的规则·${s.rule}`, value: '未检查', note: s.reason });
    });
    result.integrity.forEach((it, i) => {
        items.push({ id: `I${i + 1}`, label: `资料完整性·${it.label}`, value: it.ok ? '正常' : '需留意', note: it.detail });
    });
    const mb = result.extras.monthBaseline;
    const month = (label: string, value: string) => items.push({ id: `M${items.filter(x => x.id.startsWith('M')).length + 1}`, label: `${mb.month} ${label}`, value });
    month('已日结天数', `${mb.settledDays} / ${mb.daysInMonth} 天`);
    month('照日均推估整月营业额', rm(mb.projectedRevenue));
    month('食材采购成本率', pct(mb.foodRate));
    month('外送平台费率', pct(mb.platformRate));
    month('人工成本（不含 OT）', rm(mb.labourExOt));
    month('OT', rm(mb.ot));
    month('租金', rm(mb.rent));
    month('其他固定费用', rm(mb.otherFixed));
    return items;
};
