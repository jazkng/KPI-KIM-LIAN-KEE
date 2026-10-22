import type { Employee } from '../../types';
import { getOrgLevel } from '../orgAccess';
import { normDept } from '../tasks/staffTaskLogic';

type Who = Pick<Employee, 'id' | 'orgLevel' | 'rank' | 'role' | 'department'>;

/** HR（老板、L2 门店管理、L2S 幕僚）评所有人，包括主管 */
export const isHygieneHr = (e: Who) => ['OWNER', 'BRANCH_MANAGER', 'STAFF_SUPPORT'].includes(getOrgLevel(e));
/** 主管（L3 部门负责人、L4 组长）评自己部门的一般员工 */
export const isHygieneSupervisor = (e: Who) => ['DEPARTMENT_HEAD', 'TEAM_LEAD'].includes(getOrgLevel(e));

/** 卫生每周由主管评；主管本人由 HR 评（负责人 2026-10-22） */
export const canScoreHygiene = (actor: Who, target: Who) => {
    if (actor.id === target.id) return false;
    if (isHygieneHr(actor)) return true;
    if (!isHygieneSupervisor(actor)) return false;
    return getOrgLevel(target) === 'CREW' && normDept(target.department) === normDept(actor.department);
};

/** 那一周的星期一 */
export const mondayOf = (date: string) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
};

export const HYGIENE_STANDARD = [
    '制服 / 围裙整洁',
    '发网完整覆盖头发',
    '双手 / 指甲保持清洁',
    '上岗前已洗手及消毒',
    '不戴影响食品安全的饰物，伤口妥善包扎',
    '切菜、切配或把食物切小块时戴一次性手套',
];
export const HYGIENE_LEVELS: Record<number, { label: string; desc: string }> = {
    1: { label: '很差', desc: '明显不合格 / 严重卫生问题' },
    2: { label: '需要进步', desc: '有不合格，经提醒才改善' },
    3: { label: '标准', desc: '全部符合标准（正常最高分）' },
    4: { label: '很好', desc: '达标 + 主动提醒他人卫生' },
    5: { label: '非常好', desc: '4 分条件 + 提出可执行改善建议' },
};
/** 1–2 分要写问题，4–5 分要写实际行为 / 建议 */
export const hygieneNoteRequired = (score: number) => score !== 3;
