import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { Employee } from '../../types';
import { hygieneDocId, saveHygieneCheck } from '../../utils/points/pointsStore';

let env: RulesTestEnvironment;
const actor = (id: string, orgLevel: Employee['orgLevel'], department: Employee['department'] = 'KITCHEN') => ({ id, name: id, role: '', orgLevel, department }) as Employee;

beforeAll(async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy();
    env = await initializeTestEnvironment({ projectId: 'demo-klk-erp', firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        for (const person of [actor('lead', 'TEAM_LEAD'), actor('other', 'DEPARTMENT_HEAD'), actor('staff', 'CREW')]) {
            await setDoc(doc(ctx.firestore(), 'employees', person.id), person);
        }
    });
});
afterAll(async () => { await env?.cleanup(); });

it('L4 最高 3 分、跨区需授权，同周其他检查人不能覆盖原评分', async () => {
    const firestore = env.authenticatedContext('emp_lead', { emp: 'lead', lvl: 'TEAM_LEAD' }).firestore() as unknown as Firestore;
    const lead = actor('lead', 'TEAM_LEAD');
    const other = actor('other', 'DEPARTMENT_HEAD');
    const staff = actor('staff', 'CREW');
    const weekStart = '2026-10-19';
    const data = { employeeId: staff.id, weekStart, score: 3 as const, checkedBy: lead.id, checkedByName: lead.name };
    await expect(saveHygieneCheck({ ...data, score: 4 }, lead, staff, firestore)).rejects.toThrow('没有这项评分权限');
    await saveHygieneCheck(data, lead, staff, firestore);
    await expect(saveHygieneCheck({ ...data, score: 4, checkedBy: other.id, checkedByName: other.name }, other, staff, firestore)).rejects.toThrow('本周已有其他人评分');
    const saved = (await getDoc(doc(firestore, 'hygiene_checks', hygieneDocId(weekStart, staff.id)))).data();
    expect(saved).toMatchObject({ score: 3, checkedBy: lead.id });
});
