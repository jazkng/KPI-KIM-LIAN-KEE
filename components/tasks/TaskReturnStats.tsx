import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getBusinessDateString } from '../../utils/dateHelper';
import { monthReturnCount } from '../../utils/tasks/staffTaskLogic';
import { listTasksReturnedFor } from '../../utils/tasks/staffTaskStore';

/** 员工档案「记录」：委托任务被退回几次（本月 / 累计），做事认不认真的参考 */
export const TaskReturnStats: React.FC<{ employeeId: string }> = ({ employeeId }) => {
    const [stat, setStat] = useState<{ month: number; total: number } | null>(null);
    useEffect(() => {
        let on = true;
        listTasksReturnedFor(employeeId).then(tasks => {
            if (!on) return;
            const month = getBusinessDateString().slice(0, 7);
            const total = tasks.reduce((n, t) => n + (t.history || []).filter(h => h.action === 'RETURN' && h.employeeId === employeeId).length, 0);
            setStat({ month: monthReturnCount(tasks, employeeId, month), total });
        }).catch(() => on && setStat(null));
        return () => { on = false; };
    }, [employeeId]);
    if (!stat) return null;
    return <div className={`mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${stat.month > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-gray-50 text-gray-500'}`}>
        <RotateCcw size={14} /> 委托任务被退回：本月 {stat.month} 次 · 累计 {stat.total} 次
    </div>;
};
