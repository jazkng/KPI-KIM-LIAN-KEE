import { describe, expect, it, vi } from 'vitest';
vi.mock('../../firebaseConfig', () => ({ db: {} }));
import { buildInboxItems, rosterSignals } from '../../utils/management/managerInbox';

describe('buildInboxItems', () => {
    it('只列有读到的项目，有数字的排前面', () => {
        const items = buildInboxItems({ settlementDrafts: 0, poToReceive: 2, inventoryTasks: 1, absences: [{ name: 'Ali', status: 'MC' }] }, 'zh');
        expect(items.map(i => [i.key, i.count])).toEqual([['absences', 1], ['poToReceive', 2], ['inventoryTasks', 1], ['settlementDrafts', 0]]);
        expect(items[1]).toMatchObject({ title: '采购单待收货', sub: '2 张已订货，到货后要按收货', target: 'PROCUREMENT' });
        expect(items[0].people).toEqual([{ name: 'Ali', status: 'MC' }]);
    });
    it('没权限（undefined）的不出现；缅文', () => {
        const items = buildInboxItems({ lowStock: 3 }, 'my');
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('ပစ္စည်း နည်းနေ');
    });
});

describe('rosterSignals', () => {
    const rosters = {
        '2026-10-22': { a: 'MC', b: 'MORNING', c: 'PENDING', d: 'LEAVE' },
        '2026-10-25': { a: 'PENDING', b: 'PENDING' },
        '2026-10-30': { a: 'PENDING' }, // 超过 7 天不算
    };
    it('今天缺席 + 未来 7 天待定', () => {
        const r = rosterSignals(rosters, '2026-10-22', () => true);
        expect(r.absences.map(([id]) => id)).toEqual(['a', 'd']);
        expect(r.pending).toBe(3);
    });
    it('L3 只算自己部门', () => {
        const r = rosterSignals(rosters, '2026-10-22', id => id === 'a');
        expect(r.absences).toHaveLength(1);
        expect(r.pending).toBe(1);
    });
});
