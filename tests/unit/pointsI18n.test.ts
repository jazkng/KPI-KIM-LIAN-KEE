import { describe, expect, it } from 'vitest';
import { pointsLabel, pointsLine } from '../../utils/points/pointsI18n';

describe('employee points language', () => {
    it('renders fixed labels and score details in Burmese', () => {
        expect(pointsLabel('tasks', 'my')).not.toMatch(/[\u3400-\u9fff]/);
        expect(pointsLine('完成 30 / 30 个任务', 'my')).not.toMatch(/[\u3400-\u9fff]/);
        expect(pointsLine('卫生 3 分（主管）', 'en')).toContain('Hygiene 3 points');
    });
});
