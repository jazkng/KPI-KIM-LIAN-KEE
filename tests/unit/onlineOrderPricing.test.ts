import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../../types';
import { INITIAL_MENU_ITEMS } from '../../constants/menu';
import {
  buildPublicMenu,
  parseOptionSurchargeSen,
  priceOrder,
  roundToNearestFiveSen,
  toSen,
  variantIdFor,
  type PricingSettings,
} from '../../utils/onlineOrders/pricing';

const MENU: MenuItem[] = [
  {
    id: 'hokkien-mee',
    name: '福建面',
    category: 'NOODLES',
    image: 'https://example.com/hkm.jpg',
    options: ['少辣', '加蛋'],
    variants: [
      { label: '小', price: 13.9, cost: 4.1, recipe: [{ name: 'secret' } as any], method: '内部做法', youtubeUrl: 'https://internal' },
      { label: '大', price: 25.5, cost: 7.2 },
    ],
  },
  { id: 'soup', name: '汤', category: 'SOUP', options: [], variants: [{ label: '标准', price: 6.05, cost: 1 }] },
  { id: 'empty', name: '没有规格', category: 'X', options: [], variants: [] },
];
const NO_FEES: PricingSettings = { serviceChargeBps: 0, serviceTaxBps: 0, roundToFiveSen: false };

describe('buildPublicMenu（公开菜单）', () => {
  const menu = buildPublicMenu(MENU);

  it('只输出公开栏位，成本、配方、做法、视频绝不外流', () => {
    const json = JSON.stringify(menu);
    for (const leak of ['cost', 'recipe', 'secret', '内部做法', 'youtube', 'internal', 'overhead']) {
      expect(json.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it('价格以仙为单位，规格 ID 稳定', () => {
    expect(menu[0].variants).toEqual([
      { id: 'hokkien-mee:小', label: '小', priceSen: 1390 },
      { id: 'hokkien-mee:大', label: '大', priceSen: 2550 },
    ]);
    expect(variantIdFor('hokkien-mee', ' 小 ')).toBe('hokkien-mee:小');
  });

  it('现有字串选项转为不加价的选项组；没有规格的菜标为不供应', () => {
    expect(menu[0].optionGroups[0].choices.map(c => [c.label, c.priceDeltaSen])).toEqual([['少辣', 0], ['加蛋', 0]]);
    expect(menu[1].optionGroups).toEqual([]);
    expect(menu[2].available).toBe(false);
  });

  it('同名规格加序号，ID 不重复', () => {
    const dup = buildPublicMenu([{ id: 'x', name: 'X', category: 'C', options: [], variants: [{ label: '大', price: 1, cost: 0 }, { label: '大 ', price: 2, cost: 0 }] }]);
    expect(dup[0].variants.map(v => v.id)).toEqual(['x:大', 'x:大~2']);
  });

  it('可由设定标记暂停供应的菜', () => {
    expect(buildPublicMenu(MENU, new Set(['soup']))[1].available).toBe(false);
  });
});

describe('加价选项与无效规格（防止少收钱）', () => {
  const ITEMS: MenuItem[] = [
    { id: 'pork', name: '猪肉', category: 'C', options: ['少辣', '加生蛋 (+RM1.00)', '加面底 (+RM11.00)'], variants: [{ label: '标准', price: 10, cost: 0 }] },
    { id: 'set', name: '套餐', category: 'C', options: ['2位以上每位加RM1.50'], variants: [{ label: '标准', price: 30, cost: 0 }] },
    { id: 'single', name: '单一规格', category: 'C', options: [], variants: [{ label: 'S', price: 8, cost: 0 }, { label: 'M', price: 0, cost: 0 }, { label: 'L', price: -1, cost: 0 }] },
    { id: 'zero', name: '全部 0 元', category: 'C', options: [], variants: [{ label: 'S', price: 0, cost: 0 }] },
  ];
  const menu = buildPublicMenu(ITEMS);

  it('解析「(+RMx.xx)」加价；无法确定的加价说明回 null', () => {
    expect(parseOptionSurchargeSen('加生蛋 (+RM1.00)')).toBe(100);
    expect(parseOptionSurchargeSen('加面底 (+RM11.00)')).toBe(1100);
    expect(parseOptionSurchargeSen('少辣')).toBe(0);
    expect(parseOptionSurchargeSen('2位以上每位加RM1.50')).toBeNull();
  });

  it('加价选项计入单价', () => {
    expect(menu[0].optionGroups[0].choices.map(c => c.priceDeltaSen)).toEqual([0, 100, 1100]);
    const r = priceOrder(menu, [{ itemId: 'pork', variantId: 'pork:标准', quantity: 2, optionChoiceIds: [menu[0].optionGroups[0].choices[1].id, menu[0].optionGroups[0].choices[2].id] }], NO_FEES);
    if (!r.ok) throw new Error('should price');
    expect(r.order.lines[0].unitPriceSen).toBe(1000 + 100 + 1100);
    expect(r.order.totalSen).toBe(4400);
  });

  it('有无法计价的加价说明时，整道菜不开放', () => {
    expect(menu[1].available).toBe(false);
    expect(menu[1].optionGroups).toEqual([]);
  });

  it('价格不是正数的规格不公开；ID 不受过滤影响', () => {
    expect(menu[2].variants).toEqual([{ id: 'single:s', label: 'S', priceSen: 800 }]);
    expect(menu[3].available).toBe(false);
    const r = priceOrder(menu, [{ itemId: 'single', variantId: 'single:m', quantity: 1 }], NO_FEES);
    expect(r.ok).toBe(false);
  });

  it('定价时再次检查：被篡改为 0 元或负加价的菜单一律拒绝', () => {
    const tampered = JSON.parse(JSON.stringify(menu));
    tampered[2].variants[0].priceSen = 0;
    const r1 = priceOrder(tampered, [{ itemId: 'single', variantId: 'single:s', quantity: 1 }], NO_FEES);
    if (r1.ok === false) expect(r1.errors[0].code).toBe('ITEM_UNAVAILABLE'); else throw new Error('should reject');
    tampered[0].optionGroups[0].choices[1].priceDeltaSen = -100;
    const r2 = priceOrder(tampered, [{ itemId: 'pork', variantId: 'pork:标准', quantity: 1, optionChoiceIds: [tampered[0].optionGroups[0].choices[1].id] }], NO_FEES);
    if (r2.ok === false) expect(r2.errors[0].code).toBe('ITEM_UNAVAILABLE'); else throw new Error('should reject');
  });

  it('现有菜单：所有开放的选项，名称含金额者都有对应加价', () => {
    for (const item of buildPublicMenu(INITIAL_MENU_ITEMS)) {
      if (!item.available) continue;
      for (const v of item.variants) expect(v.priceSen).toBeGreaterThan(0);
      for (const c of item.optionGroups.flatMap(g => g.choices)) {
        if (/RM\s*\d/i.test(c.label)) expect(c.priceDeltaSen).toBeGreaterThan(0);
      }
    }
  });
});

describe('priceOrder（服务器端定价）', () => {
  const menu = buildPublicMenu(MENU);

  it('按菜单计算小计，并保留名称与价格快照', () => {
    const r = priceOrder(menu, [
      { itemId: 'hokkien-mee', variantId: 'hokkien-mee:大', quantity: 2, optionChoiceIds: ['hokkien-mee:opt:少辣'], note: ' 不要葱 ' },
      { itemId: 'soup', variantId: 'soup:标准', quantity: 1 },
    ], NO_FEES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.lines[0]).toMatchObject({ itemName: '福建面', variantLabel: '大', optionLabels: ['少辣'], unitPriceSen: 2550, lineTotalSen: 5100, note: '不要葱' });
    expect(r.order.subtotalSen).toBe(5100 + 605);
    expect(r.order.totalSen).toBe(5705);
  });

  it('服务费与服务税以整数仙计算，税按（小计 + 服务费）', () => {
    const r = priceOrder(menu, [{ itemId: 'soup', variantId: 'soup:标准', quantity: 3 }], { serviceChargeBps: 1000, serviceTaxBps: 600, roundToFiveSen: false });
    if (!r.ok) throw new Error('should price');
    // 小计 1815；服务费 10% = 181.5 → 182；税 6% × 1997 = 119.82 → 120；合计 2117
    expect(r.order).toMatchObject({ subtotalSen: 1815, serviceChargeSen: 182, serviceTaxSen: 120, roundingSen: 0, totalSen: 2117 });
  });

  it('马来西亚 5 仙进位', () => {
    expect([2111, 2112, 2113, 2114, 2116, 2117, 2118, 2119].map(roundToNearestFiveSen)).toEqual([2110, 2110, 2115, 2115, 2115, 2115, 2120, 2120]);
    const r = priceOrder(menu, [{ itemId: 'soup', variantId: 'soup:标准', quantity: 3 }], { serviceChargeBps: 1000, serviceTaxBps: 600, roundToFiveSen: true });
    if (!r.ok) throw new Error('should price');
    expect(r.order.totalSen).toBe(2115);
    expect(r.order.roundingSen).toBe(-2);
  });

  it('客户端无法影响价格：请求里多送的价格栏位会被忽略', () => {
    const r = priceOrder(menu, [{ itemId: 'soup', variantId: 'soup:标准', quantity: 1, unitPriceSen: 1, priceSen: 1 } as any], NO_FEES);
    if (!r.ok) throw new Error('should price');
    expect(r.order.totalSen).toBe(605);
  });

  it.each([
    [[], 'EMPTY_ORDER'],
    [[{ itemId: 'nope', variantId: 'x', quantity: 1 }], 'ITEM_NOT_FOUND'],
    [[{ itemId: 'empty', variantId: 'x', quantity: 1 }], 'ITEM_UNAVAILABLE'],
    [[{ itemId: 'soup', variantId: 'soup:大', quantity: 1 }], 'VARIANT_NOT_FOUND'],
    [[{ itemId: 'soup', variantId: 'soup:标准', quantity: 0 }], 'INVALID_QUANTITY'],
    [[{ itemId: 'soup', variantId: 'soup:标准', quantity: 1.5 }], 'INVALID_QUANTITY'],
    [[{ itemId: 'soup', variantId: 'soup:标准', quantity: 51 }], 'INVALID_QUANTITY'],
    [[{ itemId: 'hokkien-mee', variantId: 'hokkien-mee:小', quantity: 1, optionChoiceIds: ['soup:opt:x'] }], 'OPTION_NOT_FOUND'],
    [[{ itemId: 'hokkien-mee', variantId: 'hokkien-mee:小', quantity: 1, optionChoiceIds: ['hokkien-mee:opt:少辣', 'hokkien-mee:opt:少辣'] }], 'OPTION_DUPLICATED'],
    [[{ itemId: 'soup', variantId: 'soup:标准', quantity: 1, note: 'x'.repeat(101) }], 'NOTE_TOO_LONG'],
  ])('拒绝无效订单 %#', (lines, code) => {
    const r = priceOrder(menu, lines as any, NO_FEES);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.errors[0].code).toBe(code);
  });

  it('超过 30 行拒绝', () => {
    const lines = Array.from({ length: 31 }, () => ({ itemId: 'soup', variantId: 'soup:标准', quantity: 1 }));
    const r = priceOrder(menu, lines, NO_FEES);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.errors[0].code).toBe('TOO_MANY_LINES');
  });

  it('toSen 处理浮点误差', () => {
    expect(toSen(13.9)).toBe(1390);
    expect(toSen(0.1 + 0.2)).toBe(30);
    expect(toSen(Number.NaN)).toBe(0);
  });
});
