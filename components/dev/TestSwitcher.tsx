import React, { useEffect, useState } from 'react';
import { FlaskConical, Loader2, RotateCcw, X } from 'lucide-react';
import { PortalRole, type Employee } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { getPortalRole } from '../../utils/orgAccess';

/**
 * 🧪 测试切换（临时，负责人测试完会删除）
 * 只有老板（L1）本人看得到。切换「页面」（老板 / 管理 / 员工）与「用谁的权限」，
 * 只改这个浏览器分页当下的画面，不写入任何资料、不改员工档案；按「返回本人」或重新整理就恢复。
 * 注意：切换期间做的操作是真的，会以被切换的员工名义记录。
 */

interface Props {
    /** 正在测试时：原本登入的老板；没在测试 = null */
    real: Employee | null;
    current: Employee;
    currentRole: PortalRole;
    onApply: (role: PortalRole, employee: Employee) => void;
    onRestore: () => void;
}

const PORTALS: { role: PortalRole; label: string }[] = [
    { role: PortalRole.BOSS, label: '老板' },
    { role: PortalRole.MANAGEMENT, label: '管理' },
    { role: PortalRole.STAFF, label: '员工' },
];
const ROLE_LABEL: Record<string, string> = { BOSS: '老板页', MANAGEMENT: '管理页', STAFF: '员工页' };

export const TestSwitcher: React.FC<Props> = ({ real, current, currentRole, onApply, onRestore }) => {
    const [open, setOpen] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [empId, setEmpId] = useState(current.id);
    const [role, setRole] = useState<PortalRole | 'AUTO'>('AUTO');
    const [busy, setBusy] = useState(false);
    const owner = real || current;

    useEffect(() => {
        if (!open) return;
        setEmpId(current.id);
        setRole('AUTO');
        DataManager.getEmployees()
            .then(list => setEmployees(list.filter(e => !e.isArchived && e.status !== 'TERMINATED').sort((a, b) => a.name.localeCompare(b.name))))
            .catch(() => setEmployees([]));
    }, [open, current.id]);

    const picked = employees.find(e => e.id === empId) || (empId === owner.id ? owner : null);
    const autoRole = picked ? getPortalRole(picked) : currentRole;

    const apply = async () => {
        if (!picked) return;
        setBusy(true);
        // 用资料库最新的那份，避免背景同步又把画面改回去
        const fresh = (await DataManager.getEmployeeById(picked.id).catch(() => null)) || picked;
        setBusy(false);
        setOpen(false);
        onApply(role === 'AUTO' ? getPortalRole(fresh) : role, fresh);
    };

    return <>
        {real ? (
            <div className="fixed top-0 inset-x-0 z-[100001] h-8 bg-orange-500 text-white flex items-center justify-center gap-2 px-2 text-[11px] font-bold shadow">
                <FlaskConical size={13} className="shrink-0" />
                <span className="truncate">测试中：{current.name} · {ROLE_LABEL[currentRole]}</span>
                <button onClick={() => setOpen(true)} className="shrink-0 rounded-full bg-white/20 px-2.5 h-6">切换</button>
                <button onClick={onRestore} className="shrink-0 rounded-full bg-stone-900 text-[#FFD200] px-2.5 h-6 flex items-center gap-1"><RotateCcw size={11} /> 返回本人</button>
            </div>
        ) : (
            <button onClick={() => setOpen(true)} aria-label="测试切换" title="测试切换"
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[100001] w-8 h-10 rounded-l-xl bg-white/95 border border-r-0 border-stone-200 shadow-lg grid place-items-center text-orange-500">
                <FlaskConical size={15} />
            </button>
        )}
        {open && <div className="fixed inset-0 z-[100002] bg-black/50 flex items-end md:items-center justify-center" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div className="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl p-5 space-y-4 shadow-2xl" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                <div className="flex items-center justify-between">
                    <b className="flex items-center gap-2 text-base"><FlaskConical size={17} className="text-orange-500" /> 测试切换</b>
                    <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-xl bg-stone-100 grid place-items-center" aria-label="关闭"><X size={17} /></button>
                </div>

                <label className="block">
                    <span className="block text-xs font-bold text-stone-500 mb-1.5">用谁的权限</span>
                    <select value={empId} onChange={e => setEmpId(e.target.value)}
                        className="w-full min-h-[46px] rounded-xl border border-stone-200 bg-stone-50 px-3 font-bold" style={{ fontSize: 16 }}>
                        <option value={owner.id}>{owner.name}（本人）</option>
                        {employees.filter(e => e.id !== owner.id).map(e => <option key={e.id} value={e.id}>{e.name} · {(e.role || '').split('(')[0].trim()}</option>)}
                    </select>
                </label>

                <div>
                    <span className="block text-xs font-bold text-stone-500 mb-1.5">进哪个页面</span>
                    <div className="grid grid-cols-4 gap-1.5">
                        <button onClick={() => setRole('AUTO')} className={`min-h-[44px] rounded-xl text-xs font-black border ${role === 'AUTO' ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
                            自动<span className="block text-[10px] font-bold opacity-70">{ROLE_LABEL[autoRole]}</span>
                        </button>
                        {PORTALS.map(p => <button key={p.role} onClick={() => setRole(p.role)}
                            className={`min-h-[44px] rounded-xl text-xs font-black border ${role === p.role ? 'bg-stone-900 text-[#FFD200] border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>{p.label}</button>)}
                    </div>
                </div>

                <p className="text-[11px] text-stone-500 leading-relaxed">只改这个画面，不改员工档案。切换后做的操作是真的，会以那位员工的名义记录。重新整理或按「返回本人」就恢复。</p>

                <div className="flex gap-2">
                    {real && <button onClick={() => { setOpen(false); onRestore(); }} className="flex-1 min-h-[48px] rounded-xl bg-stone-100 text-stone-700 text-sm font-black">返回本人</button>}
                    <button onClick={apply} disabled={!picked || busy} className="flex-1 min-h-[48px] rounded-xl bg-orange-500 text-white text-sm font-black disabled:opacity-40 flex items-center justify-center gap-2">
                        {busy && <Loader2 size={15} className="animate-spin" />} 切换
                    </button>
                </div>
            </div>
        </div>}
    </>;
};
