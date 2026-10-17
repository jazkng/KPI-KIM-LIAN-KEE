import { describe, expect, it } from 'vitest';
import { DATA_TOOLS, canOpenDataTools } from '../../components/features/system/DataToolsHub';
import type { Employee } from '../../types';

const emp = (o: Partial<Employee>) => ({ id: '100', name: 'x', role: 'Crew', ...o }) as Employee;
const visible = (e: Employee) => DATA_TOOLS.filter(t => t.allowed(e)).map(t => t.id);

describe('数据审查中心权限', () => {
    it('负责人（L1）：全部工具', () => {
        expect(visible(emp({ orgLevel: 'OWNER' }))).toEqual(['PNL_RECON', 'EXPENSE_AUDIT', 'STOCK_CODES']);
    });
    it('分店经理有财务报表权限：只有财务审查，不能整理库存编号', () => {
        expect(visible(emp({ orgLevel: 'BRANCH_MANAGER', allowedModules: ['REPORTS'] as any }))).toEqual(['PNL_RECON', 'EXPENSE_AUDIT']);
    });
    it('系统管理员：可以整理库存编号', () => {
        expect(visible(emp({ id: '002', orgLevel: 'DEPARTMENT_HEAD' }))).toContain('STOCK_CODES');
    });
    it('一般员工：看不到入口', () => {
        expect(canOpenDataTools(emp({ orgLevel: 'CREW' }))).toBe(false);
    });
});
