import { describe, expect, it } from 'vitest';
import { freezeBlockReason, isFrozenBill, withoutFrozen } from '../../utils/ap/frozenBills';

describe('frozenBills', () => {
    it('只有完全未付的账单能冻结', () => {
        expect(freezeBlockReason({ paymentStatus: 'UNPAID', totalBillAmount: 100, outstandingAmount: 100 })).toBeNull();
        expect(freezeBlockReason({ paymentStatus: 'UNPAID', amount: 50 })).toBeNull();
        expect(freezeBlockReason({ paymentStatus: 'PARTIAL', totalBillAmount: 100, outstandingAmount: 40 })).toContain('完全未付');
        expect(freezeBlockReason({ paymentStatus: 'PAID', totalBillAmount: 100, outstandingAmount: 0 })).toContain('完全未付');
        expect(freezeBlockReason({ paymentStatus: 'UNPAID', totalBillAmount: 100, outstandingAmount: 60 })).toContain('已有付款');
        expect(freezeBlockReason({ paymentStatus: 'UNPAID', totalBillAmount: 100, outstandingAmount: 100, paymentDate: '2026-10-01' })).toContain('付款日期');
        expect(freezeBlockReason({ paymentStatus: 'UNPAID', frozen: true })).toBe('已经冻结');
    });
    it('财务计算排除冻结的账单；解冻（frozen=false）照常计算', () => {
        const list = [{ id: 'a', frozen: true }, { id: 'b', frozen: false }, { id: 'c' }];
        expect(withoutFrozen(list).map(x => x.id)).toEqual(['b', 'c']);
        expect(isFrozenBill({ frozen: 'true' })).toBe(false);
        expect(isFrozenBill(undefined)).toBe(false);
    });
});
