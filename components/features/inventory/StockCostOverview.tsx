import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { StockCostRow } from '../../../utils/inventory/costSnapshot';

export const StockCostOverview = ({ rows }: { rows: StockCostRow[] }) => {
    const [search, setSearch] = useState('');
    const [gapsOnly, setGapsOnly] = useState(false);
    const visible = useMemo(() => rows.filter(r => (!gapsOnly || r.gaps.length) && `${r.code} ${r.name} ${r.subName} ${r.supplier}`.toLowerCase().includes(search.toLowerCase())), [rows, search, gapsOnly]);
    const exportCsv = () => {
        const cell = (s: unknown) => `"${String(s ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
        const data = [['库存编号','品名','状态','成本(RM)','库存单位','计价','供应商','最近收货','来源记录','待核对'], ...visible.map(r => [r.code,r.name,r.flags.join('、'),r.cost ?? '',r.unit,r.pricing,r.supplier,r.receiptDate,r.sourceLogId,r.gaps.join('；')])];
        const url = URL.createObjectURL(new Blob(['\uFEFF' + data.map(row => row.map(cell).join(',')).join('\r\n')], { type:'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href=url; a.download='库存成本核对表.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    return <section className="mb-5 rounded-2xl border border-stone-200 bg-white p-4">
        <div className="ops-toolbar"><div><h2>库存成本核对</h2><p>编号 → 单位 → 供应商 → 收货来源</p></div><button type="button" className="ops-primary" disabled={!visible.length} onClick={exportCsv}><Download size={16}/>导出核对表</button></div>
        <div className="ops-summary"><div><small>在用库存</small><strong>{rows.filter(r => !r.discontinued).length}</strong></div><div><small>需补资料</small><strong>{rows.filter(r => r.gaps.length && !r.discontinued).length}</strong></div><div><small>当天用完</small><strong>{rows.filter(r => r.flags.includes('当天用完')).length}</strong></div><div><small>已停订</small><strong>{rows.filter(r => r.discontinued).length}</strong></div></div>
        <div className="flex flex-wrap items-center gap-3 mb-3"><label className="flex flex-1 items-center gap-2 min-w-40"><Search size={17}/><input aria-label="搜索库存成本" className="w-full rounded-xl border p-2" placeholder="编号、品名、供应商" value={search} onChange={e => setSearch(e.target.value)}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gapsOnly} onChange={e => setGapsOnly(e.target.checked)}/>只看待核对</label></div>
        <div className="overflow-x-auto max-h-96"><table className="stock-cost-table"><thead><tr><th>库存</th><th>成本／单位</th><th>来源与待办</th></tr></thead><tbody>{visible.map(r => <tr key={r.id}><td><small>{r.code} · {r.flags.join(' / ') || '在用'}</small><b>{r.name}</b>{r.subName && <small>{r.subName}</small>}</td><td><b>{r.cost === null ? '未填写' : `RM ${r.cost.toFixed(2)}`}</b><small>/ {r.unit}</small><small>{r.pricing}</small></td><td><b>{r.supplier}</b><small>{r.receiptDate || '无收货记录'} {r.sourceLogId}</small><small>{r.gaps.join('；') || '资料齐全'}</small></td></tr>)}</tbody></table>{!visible.length && <p className="p-6 text-center text-stone-500">没有符合条件的库存。</p>}</div>
        <p className="ops-notice mt-3">这份快照会作为 AI 经营顾问的库存证据。历史价格未保存单位，涨跌仅供核对；停订／当天用完不代表缺货。此处不修改价格或库存。</p>
    </section>;
};
