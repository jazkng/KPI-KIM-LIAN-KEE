import { describe, expect, it } from 'vitest';
import { filterLogReport, localDate, logReportSections, logReportSummary } from '../../utils/logbook/reportModel';
import { buildStockCostRows, stockCostEvidence } from '../../utils/inventory/costSnapshot';
import { advisorRequestEvidence } from '../../utils/cockpit/advisorEvidence';
import { sanitizeAdvisorRequest } from '../../server/cockpitAdvisor';
import type { LogEntry, StockItem, StockPriceHistory } from '../../types';

describe('运营讨论报告', () => {
    const logs = [
        { id:'a',date:'2026-10-23',time:'09:00',priority:'HIGH',category:'COMPLAINT',status:'PENDING',issue:'问题甲',action:'跟进甲' },
        { id:'b',date:'2026-10-24',time:'12:00',priority:'NORMAL',category:'REPAIR',status:'RESOLVED',issue:'问题乙',action:'已修好' },
        { id:'c',date:'2026-10-25',time:'12:00',priority:'HIGH',category:'COMPLAINT',status:'PENDING' },
    ] as LogEntry[];
    it('日期含起止日，分类与汇总只用所选资料，不改原始顺序', () => {
        const all = filterLogReport(logs, '2026-10-23','2026-10-24','ALL');
        expect(all.map(l => l.id)).toEqual(['b','a']);
        expect(logReportSummary(all)).toEqual({total:2,open:1,urgent:1,complaints:1});
        expect(filterLogReport(logs,'2026-10-23','2026-10-24','COMPLAINT').map(l => l.id)).toEqual(['a']);
        expect(logs[0].id).toBe('a');
    });
    it('拒绝反向日期；本地凌晨日期不会退到前一天', () => {
        expect(() => filterLogReport(logs,'2026-10-25','2026-10-24','ALL')).toThrow();
        expect(localDate(new Date(2026,9,24,0,5))).toBe('2026-10-24');
    });
    it('长文分段保留中文、换行、回复，不丢字符', () => {
        const issue = '中文🙂\n'.repeat(400);
        const rows = logReportSections([{...logs[0],issue,action:'后续',replies:[{content:'回复'} as any]}]);
        expect(rows.length).toBeGreaterThan(1);
        expect(rows.map(r => r.body).join('')).toBe(`问题：${issue}\n\n处理：后续\n\n跟进：回复`);
    });
});

describe('库存成本的只读证据', () => {
    const stock = [{id:'K1',stockCode:'K0001',name:'鲜鱼',unit:'尾',baseUnit:'尾',cost:0,costPerBaseUnit:12,pricingUnit:'kg',pricePerPricingUnit:18,conversionMode:'ACTUAL_WEIGHT'}, {id:'K2',name:'冰块',baseUnit:'袋',cost:5,consumeOnReceive:true,discontinued:true}] as StockItem[];
    const history = [{stockId:'K1',entries:[{date:'2026-10-24',timestamp:'2026-10-24T12:00:00',sourceLogId:'new',cost:12},{date:'2026-10-24',timestamp:'2026-10-24T09:00:00',sourceLogId:'old',cost:11}]}] as StockPriceHistory[];
    it('区分计价和库存单位，同日收货按时间排序；不捏造历史单位', () => {
        const rows = buildStockCostRows(stock,history,[]);
        expect(rows[0]).toMatchObject({code:'K0001',cost:12,unit:'尾',pricing:'RM 18.00 / kg',sourceLogId:'new'});
        expect(rows[0].gaps).toContain('历史未记录单位，涨跌须核对');
        expect(rows[1].flags).toEqual(['停订','当天用完']);
        const evidence = stockCostEvidence(rows,'2026-10-24');
        expect(evidence).toHaveLength(2);
        expect(evidence[0].note).toContain('不跨单位加总');
        expect(history[0].entries[0].sourceLogId).toBe('new');
    });
    it('未读取供应商不会误报未关联；非法成本不变成零', () => {
        const [row] = buildStockCostRows([{...stock[0],costPerBaseUnit:NaN}],history);
        expect(row.cost).toBeNull(); expect(row.supplier).toBe('未读取');
        expect(row.gaps).not.toContain('未关联供应商');
    });
    it('证据超限时优先当前库存图，编号符合服务端校验', () => {
        const source = Array.from({length:130},(_,i) => ({id:`D${i}`,label:'证据',value:'1'}));
        const rows = advisorRequestEvidence([...source,...stockCostEvidence(buildStockCostRows(stock,history),'2026-10-24')],['ST0','ST1']);
        expect(rows).toHaveLength(120); expect(rows[0].id).toBe('ST0');
        expect(sanitizeAdvisorRequest({question:'核对库存',evidence:rows}).ok).toBe(true);
    });
});
