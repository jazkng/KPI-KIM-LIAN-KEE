/**
 * 资金管理 — 设计 Token
 *
 * 与 styles.css 顶部的全站色板保持一致，不引入任何新色值。
 *   品牌金 #FFD200 (hover #E5C100) / 墨黑 #111111 / 底色 #F6F7FB
 *   卡片 #FFFFFF / 描边 #E5E7EB / 品牌红 #8B0000
 *
 * 规则：
 *   1. 不使用 emoji，一律用 lucide 线性图标
 *   2. 不使用渐变与装饰性大图标
 *   3. 中文为主，英文一律降为小号 mono 副标题
 *   4. 金额一律 tabular-nums 等宽对齐
 */

export const TC = {
  /** 卡片容器 */
  card: "rounded-2xl border border-[#E5E7EB] bg-white",
  cardPad: "p-4 md:p-5",

  /** 内层区块（卡片里的次级容器） */
  inner: "rounded-xl border border-[#E5E7EB] bg-[#F6F7FB]",

  /** 中文主标签 */
  label: "text-xs font-bold text-[#111111]",
  /** 次要说明文字 */
  muted: "text-xs text-stone-500",
  /** 英文副标题（唯一允许出现英文的位置） */
  en: "text-[10px] font-medium uppercase tracking-[0.1em] text-stone-400",

  /** 金额数字 */
  num: "font-mono tabular-nums",

  /** 触控最小尺寸 —— 手机端所有可点元素都要满足 */
  tap: "min-h-[44px]",

  /** 语义色（各只用一个色阶，避免色彩发散） */
  up: "text-emerald-600",
  down: "text-rose-600",
} as const;

/** 金额正负的统一取色 */
export const flowColor = (type: "IN" | "OUT") =>
  type === "IN" ? "text-emerald-600" : "text-rose-600";
