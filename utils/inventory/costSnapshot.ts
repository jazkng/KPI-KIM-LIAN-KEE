import type { StockItem, StockPriceHistory, Supplier } from '../../types';
import type { EvidenceItem } from '../cockpit/advisorEvidence';

export interface StockCostRow {
    id: string; code: string; name: string; subName: string; unit: string; cost: number | null;
    supplier: string; pricing: string; receiptDate: string; sourceLogId: string;
    flags: string[]; gaps: string[]; discontinued: boolean;
}
const amount = (n: unknown): number | null => n !== undefined && n !== null && n !== '' && Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : null;
export const buildStockCostRows = (stock: StockItem[], histories: StockPriceHistory[], suppliers?: Supplier[]): StockCostRow[] => {
    const history = new Map(histories.map(h => [h.stockId, h]));
    return stock.map(item => {
        const latest = [...(history.get(item.id)?.entries || [])].sort((a, b) => `${a.date} ${a.timestamp || ''}`.localeCompare(`${b.date} ${b.timestamp || ''}`)).slice(-1)[0];
        const linked = suppliers?.filter(s => s.catalog?.some(c => c.linkedStockId === item.id)) || [];
        const pricingCost = amount(item.pricePerPricingUnit);
        const unit = item.baseUnit || item.unit || '';
        const cost = amount(item.costPerBaseUnit ?? item.cost);
        const flags = [item.discontinued ? '停订' : '', item.consumeOnReceive ? '当天用完' : '', item.conversionMode === 'ACTUAL_WEIGHT' ? '实际重量' : ''].filter(Boolean);
        const gaps = [!item.stockCode ? '未编库存编号' : '', !unit ? '缺库存单位' : '', cost === null ? '缺成本' : '', !suppliers ? '供应商来源未读取' : !linked.length ? '未关联供应商' : '', !latest ? '无收货价格历史' : '历史未记录单位，涨跌须核对'].filter(Boolean);
        return { id: item.id, code: item.stockCode || item.id, name: item.name, subName: item.subName || '', unit: unit || '未设', cost,
            supplier: !suppliers ? '未读取' : linked.map(s => s.name).join('、') || '未关联',
            pricing: item.pricingUnit ? `${pricingCost === null ? '未填价格' : `RM ${pricingCost.toFixed(2)}`} / ${item.pricingUnit}` : `按 ${unit || '未设单位'} 计价`,
            receiptDate: latest?.date || '', sourceLogId: latest?.sourceLogId || '', flags, gaps, discontinued: item.discontinued === true };
    }).sort((a, b) => Number(a.discontinued) - Number(b.discontinued) || b.gaps.length - a.gaps.length || a.code.localeCompare(b.code));
};
export const stockCostEvidence = (rows: StockCostRow[], asOf: string): EvidenceItem[] => {
    const active = rows.filter(r => !r.discontinued);
    const coverage: EvidenceItem = { id: 'ST0', label: '库存成本资料覆盖', value: `${rows.length} 项库存，${active.length} 项在用`, note: `${asOf} 当前主档快照，不是所选月份的历史库存。详情最多前40项，优先待核对项。不跨单位加总单价，不把库存金额当月费用。历史价格未存单位，不推算涨幅。` };
    return [coverage, ...active.slice(0, 40).map((r, i) => ({ id: `ST${i + 1}`, label: `库存成本·${r.code} ${r.name}`, value: r.cost === null ? '成本未填' : `RM ${r.cost.toFixed(2)} / ${r.unit}`, note: `${asOf} 主档；供应商 ${r.supplier}；${r.pricing}；最近收货 ${r.receiptDate || '未记录'}；来源 ${r.sourceLogId || '未记录'}；${r.flags.join('、')}；${r.gaps.join('、')}` }))];
};
