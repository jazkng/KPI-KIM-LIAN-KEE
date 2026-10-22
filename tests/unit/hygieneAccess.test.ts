import { describe, expect, it } from 'vitest';
import { canScoreHygiene, hygieneNoteRequired, mondayOf } from '../../utils/points/hygieneAccess';

const e = (id: string, orgLevel: string, department = 'KITCHEN') => ({ id, orgLevel, department, role: '' }) as any;
describe('卫生评分权限', () => {
    it('主管评自己部门的一般员工；主管由 HR 评；不能评自己', () => {
        expect(canScoreHygiene(e('h', 'DEPARTMENT_HEAD'), e('c', 'CREW'))).toBe(true);
        expect(canScoreHygiene(e('h', 'DEPARTMENT_HEAD'), e('c', 'CREW', 'FLOOR'))).toBe(false);
        expect(canScoreHygiene(e('h', 'DEPARTMENT_HEAD'), e('t', 'TEAM_LEAD'))).toBe(false);
        expect(canScoreHygiene(e('o', 'OWNER'), e('h', 'DEPARTMENT_HEAD'))).toBe(true);
        expect(canScoreHygiene(e('m', 'BRANCH_MANAGER'), e('m', 'BRANCH_MANAGER'))).toBe(false);
        expect(canScoreHygiene(e('c', 'CREW'), e('d', 'CREW'))).toBe(false);
    });
    it('星期一与备注规则', () => {
        expect(mondayOf('2026-10-22')).toBe('2026-10-19');
        expect(mondayOf('2026-10-19')).toBe('2026-10-19');
        expect(mondayOf('2026-10-25')).toBe('2026-10-19');
        expect([1, 2, 3, 4, 5].map(hygieneNoteRequired)).toEqual([true, true, false, true, true]);
    });
});
