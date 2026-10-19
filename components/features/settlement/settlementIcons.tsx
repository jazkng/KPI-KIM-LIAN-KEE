import { Users, Receipt, HeartHandshake, Crown, MessageCircle, ShoppingBag, CloudFog, ThermometerSun, Waves, ZapOff, Construction, type LucideIcon } from 'lucide-react';
import type { SpecialCondition } from '../../../types';
import type { SettlementOps } from './settlementOps';

/** 每日结算用的线条 icon（跟老板首页的营运卡片同一套 lucide，不用 emoji） */
export const OPS_ICONS: Record<keyof SettlementOps, LucideIcon> = {
  pax: Users,
  bills: Receipt,
  vipNew: HeartHandshake,
  vipVisits: Crown,
  waJoin: MessageCircle,
  waOrders: ShoppingBag,
};

export const SPECIAL_CONDITION_ICONS: Record<SpecialCondition, LucideIcon> = {
  HAZE: CloudFog,
  HEATWAVE: ThermometerSun,
  FLOOD: Waves,
  POWER_CUT: ZapOff,
  ROAD_CLOSURE: Construction,
};
