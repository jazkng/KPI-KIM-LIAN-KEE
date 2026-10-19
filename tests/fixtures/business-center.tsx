import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BusinessCenter } from '../../components/BusinessCenter';
import { loadBusinessCenterWith } from '../../utils/businessCenter';
import type { CockpitDataSource } from '../../utils/cockpit/cockpitLoader';
import type { Employee, SettlementRecord } from '../../types';
import { addDays } from '../../utils/cockpit/periods';
import '../../styles.css';

const employee = { id: 'qa-owner', name: '演示老板', orgLevel: 'OWNER' } as Employee;
const fixtureLoader: typeof loadBusinessCenterWith = (_source, month, today) => {
    const end = month === today.slice(0, 7) ? addDays(today, -1) : `${month}-28`;
    const records = Array.from({ length: 42 }, (_, i) => {
        const date = addDays(end, -i), cash = [3950, 5200, 6900, 4200, 3800, 4500, 8100][i % 7];
        return { id: date, date, isClosed: true, specialConditions: i === 0 ? ['HAZE'] : [], weather: i % 3 ? 'SUNNY' : 'HEAVY_RAIN', sales: { cash, storeHubTotal: cash, total: cash + 600, deliveryBreakdown: { grabGross: 600, grabNet: 450, grabAds: 30, grabOrders: 15, pandaGross: 200, pandaOrders: 5 } }, ops: { bills: 140, pax: 230 } } as SettlementRecord;
    });
    const source: CockpitDataSource = {
        getPnLRawRange: async () => ({ settlements: records, billPayments: [], standaloneExpenses: [{ id: 'qa-food', time: `${month}-03T12:00:00`, category: 'INGREDIENT_MEAT', amount: 18000, paymentStatus: 'UNPAID' }, { id: 'qa-rent', time: `${month}-01T12:00:00`, category: 'RENT', amount: 6000 }] as never[] }),
        getEmployees: async () => [], getPayrollRecords: async () => [], getAttendanceReviewsByMonth: async () => [], getStandaloneExpensesByIds: async () => [],
    };
    return loadBusinessCenterWith(source, month, today);
};
const Preview = () => {
    const [readonlyReports, setReadonlyReports] = useState(false);
    const [section, setSection] = useState<'PRIORITY' | 'HR' | 'FUNCTIONS'>('PRIORITY');
    return <><div style={{ padding: 8, background: '#fff1ca', fontSize: 11, textAlign: 'center' }}>隔离验收 · 全部模拟资料 · 不连接正式数据库 <button style={{ marginLeft: 12 }} onClick={() => setReadonlyReports(v => !v)}>切换报表权限</button></div><BusinessCenter currentEmployee={readonlyReports ? { ...employee, orgLevel: 'BRANCH_MANAGER', allowedModules: [] } : employee} section={section === 'HR' ? 'hr' : 'business'} onSection={setSection} onNavigate={() => window.alert('隔离验收不打开真实业务模块')} onOpenConfig={() => window.alert('设置沿用原系统')} onLogout={() => window.alert('登录沿用原系统')} loadData={fixtureLoader} /></>;
};
createRoot(document.getElementById('root')!).render(<Preview />);
