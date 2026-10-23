import { describe, expect, it } from 'vitest';
import { nextPublished, publishedView } from '../../utils/roster/publishedRoster';

const A = { '2026-10-05': { '101': 'OFF' } };
const B = { '2026-10-05': { '101': 'MORNING' } };
describe('员工只看已发布的排班', () => {
    it('发布时存一份正式版；存草稿时保留上次发布的', () => {
        expect(nextPublished(null, { status: 'PUBLISHED', roster: A, notes: {} })).toEqual({ publishedRoster: A, publishedNotes: {} });
        expect(nextPublished({ status: 'PUBLISHED', roster: A, publishedRoster: A }, { status: 'DRAFT', roster: B, notes: {} })).toEqual({ publishedRoster: A, publishedNotes: {} });
    });
    it('以前已发布、还没有正式版字段的月份：存草稿前的内容就是正式版', () => {
        expect(nextPublished({ status: 'PUBLISHED', roster: A, notes: { x: 'n' } }, { status: 'DRAFT', roster: B, notes: {} })).toEqual({ publishedRoster: A, publishedNotes: { x: 'n' } });
        expect(nextPublished({ roster: A }, { status: 'DRAFT', roster: B, notes: {} })?.publishedRoster).toEqual(A);
    });
    it('从没发布过的草稿：没有正式版', () => {
        expect(nextPublished(null, { status: 'DRAFT', roster: B, notes: {} })).toBeUndefined();
        expect(nextPublished({ status: 'DRAFT', roster: B }, { status: 'DRAFT', roster: B, notes: {} })).toBeUndefined();
    });
    it('员工看的版本', () => {
        expect(publishedView({ status: 'DRAFT', roster: B, publishedRoster: A })).toEqual({ roster: A, notes: {} });
        expect(publishedView({ status: 'PUBLISHED', roster: A })).toEqual({ roster: A, notes: {} });
        expect(publishedView({ roster: A })).toEqual({ roster: A, notes: {} });
        expect(publishedView({ status: 'DRAFT', roster: B })).toBeNull();
    });
});
