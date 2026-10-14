#!/usr/bin/env node
// 在本机 Firestore Emulator 建立几张「虚构」网站订单，供订单中心画面测试与验收。
// ⚠️ 只连 Emulator（demo-klk-erp），永远不会写入正式资料库。
// 用法：npm run emulators（另一个终端）→ node scripts/dev/seed-online-orders.mjs [营业日 YYYY-MM-DD]
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PROJECT = 'demo-klk-erp';
if (!PROJECT.startsWith('demo-')) throw new Error('只允许 demo- 项目');
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(HOST)) throw new Error(`只允许连本机 Emulator，目前是 ${HOST}`);

const FS = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const toValue = v => {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
    if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
    return { stringValue: String(v) };
};
const put = async (path, data) => {
    const res = await fetch(`${FS}/${path}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
    });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
};

const date = process.argv[2] || new Date(Date.now() + 8 * 3600e3 - 4 * 3600e3).toISOString().slice(0, 10);
const yymmdd = date.slice(2).replace(/-/g, '');
const line = (itemName, variantLabel, quantity, unitPriceSen, optionLabels = [], note) => ({
    itemId: itemName, variantId: `${itemName}:${variantLabel}`, itemName, variantLabel, optionLabels, quantity, unitPriceSen, lineTotalSen: unitPriceSen * quantity, ...(note ? { note } : {}),
});
const orders = [
    { status: 'PENDING_CONFIRMATION', lines: [line('福建面', '大', 2, 2550, ['少辣'], '不要葱'), line('炸猪肉', '标准', 1, 1800)], name: '测试顾客 A', pickup: { type: 'ASAP' } },
    { status: 'PENDING_CONFIRMATION', lines: [line('福建面', '小', 1, 1390)], name: '测试顾客 B', pickup: { type: 'SCHEDULED', time: `${date}T12:30:00.000Z` } },
    { status: 'PREPARING', lines: [line('汤', '标准', 3, 605)], name: '测试顾客 C', pickup: { type: 'ASAP' } },
    { status: 'READY', lines: [line('福建面', '大', 1, 2550)], name: '测试顾客 D', pickup: { type: 'ASAP' } },
];
let n = 0;
for (const o of orders) {
    n += 1;
    const id = `demo_${yymmdd}_${n}`;
    const subtotal = o.lines.reduce((s, l) => s + l.lineTotalSen, 0);
    await put(`online_orders/${id}`, {
        orderNo: `W-${yymmdd}-${String(n).padStart(3, '0')}`,
        businessDate: date,
        status: o.status,
        paymentStatus: 'UNPAID',
        lines: o.lines,
        totals: { subtotalSen: subtotal, serviceChargeSen: 0, serviceTaxSen: 0, discountSen: 0, roundingSen: 0, totalSen: subtotal },
        customer: { name: o.name, phone: `+60120000${String(n).padStart(4, '0')}` },
        pickup: o.pickup,
        createdAt: new Date(Date.now() - (orders.length - n) * 600e3).toISOString(),
    });
}
console.log(`已在 Emulator 建立 ${orders.length} 张虚构网站订单（营业日 ${date}）`);
