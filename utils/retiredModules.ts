// ============================================================================
// V2 已停用的模组（负责人 2026-10-13 确认已停止使用）
// ----------------------------------------------------------------------------
// - KITCHEN_ALERT：厨房通知 / 独立厨房屏。
// - ASSESSMENT：员工考核 / 季度评分（负责人 2026-10-19 决定不再使用，员工能力只看岗位技能 ★1–5）。
// - QUEUE_MANAGER / QUEUE：排队叫号与排队大屏（负责人 2026-10-21 决定不需要）。
// V2 画面一律不再显示、不再提供开启或进入；但：
//   - 员工资料里 allowedModules 仍可能有这个值（V1 写入），照原样保留，不改写、不清除；
//   - Firestore 的 kitchen_alerts 历史记录与设备户口不删除；
//   - V1 网站不受影响。
// ============================================================================
import type { AppModule } from '../types';

export const RETIRED_MODULES: ReadonlySet<string> = new Set<AppModule>(['KITCHEN_ALERT', 'ASSESSMENT', 'QUEUE_MANAGER', 'QUEUE']);

export const isRetiredModule = (module: string): boolean => RETIRED_MODULES.has(module);

/** 用于画面显示与进入：去掉已停用模组（不改动原始资料） */
export const withoutRetiredModules = <T extends string>(modules: readonly T[] | undefined | null): T[] =>
    (modules || []).filter(m => !isRetiredModule(m));
