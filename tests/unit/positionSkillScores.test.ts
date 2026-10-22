import { describe, expect, it } from 'vitest';
import { positionSkillScores } from '../../constants/skillCatalog';
import { classifyJob } from '../../components/features/assessmentConfig';

describe('positionSkillScores', () => {
    it('主职、副职各自算平均星，没评过的职位不出现', () => {
        const main = 'Kitchen Cook (厨师)', second = 'Runner (马王)', third = 'Cashier (收银)';
        const catalog = [
            { id: 'a', name: 'A', categories: [classifyJob(main)] },
            { id: 'b', name: 'B', categories: [classifyJob(main)] },
            { id: 'c', name: 'C', categories: [classifyJob(second)] },
            { id: 'd', name: 'D', categories: [classifyJob(third)] },
        ] as any;
        const emp = { role: main, secondaryRoles: [second, third], skillRatings: { a: { level: 3 }, b: { level: 4 }, c: { level: 2 } } } as any;
        const s = positionSkillScores(emp, catalog);
        expect(s[main]).toBe(3.5);
        expect(s[second]).toBe(2);
        expect(s[third]).toBeUndefined();
    });
});
