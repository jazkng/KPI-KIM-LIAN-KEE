// ============================================================================
// 📦 按需载入的大型模块
// ----------------------------------------------------------------------------
// 以前所有仪表板与功能模块都打包进同一个 4MB 的主程序，iPhone / iPad Safari
// 必须整包下载、解析完才看得到登录画面。这里把它们改为「用到才下载」：
//   - 登录画面只需要主程序；登录后按角色载入对应的仪表板；
//   - 各功能模块（薪资、财务、应付、库存……）在打开时才下载。
// 名称与原组件相同，使用处的 JSX 不需要改。
// ============================================================================
import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

/** 模块下载期间的占位画面 */
const ModuleLoading: React.FC = () => (
    <div className="flex min-h-[40vh] w-full items-center justify-center p-8 text-stone-400">
        <Loader2 size={28} className="animate-spin" />
        <span className="ml-3 text-sm font-semibold">载入中…</span>
    </div>
);

/** 弹窗类模块：载入期间不显示任何东西，避免在页面上闪出占位块 */
const Silent: React.FC = () => null;

const RELOAD_KEY = 'klk_chunk_reload_at';

/**
 * 下载模块失败时的处理：
 * 通常是部署了新版本、而这个页面还是旧版（旧档名已不存在）→ 自动重新载入一次取得新版。
 * 60 秒内已经重新载入过（例如真的断网），或无法保存重载标记，就不再重试，把错误交给 AppErrorBoundary 显示。
 */
const loadWithReloadOnce = async <M,>(loader: () => Promise<M>): Promise<M> => {
    try {
        return await loader();
    } catch (error) {
        // 只有在「重载标记确实存得下来」时才重新载入；
        // sessionStorage 被禁用（私密模式、受管控 WebView）时直接显示错误，避免无限重载。
        let shouldReload = false;
        try {
            const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
            if (Date.now() - last > 60_000) {
                const stamp = String(Date.now());
                sessionStorage.setItem(RELOAD_KEY, stamp);
                shouldReload = sessionStorage.getItem(RELOAD_KEY) === stamp;
            }
        } catch {
            shouldReload = false;
        }
        if (shouldReload) {
            window.location.reload();
            return new Promise<M>(() => {}); // 等待重新载入，不显示错误
        }
        throw error;
    }
};

/**
 * 把具名导出的组件包成按需载入的版本，保留原本的 props 类型。
 */
function lazyNamed<M, K extends keyof M>(
    loader: () => Promise<M>,
    name: K,
    fallback: React.ReactNode = <ModuleLoading />,
) {
    type Props = M[K] extends React.ComponentType<infer P> ? P : never;
    const LazyComponent = lazy(async () => ({ default: (await loadWithReloadOnce(loader))[name] as unknown as React.ComponentType<Props> }));
    const Wrapped = (props: Props) => (
        <Suspense fallback={fallback}>
            <LazyComponent {...(props as any)} />
        </Suspense>
    );
    Wrapped.displayName = `Lazy(${String(name)})`;
    return Wrapped;
}

// ── 仪表板（登录后按角色载入） ──────────────────────────────────────────────
export const BossDashboard = lazyNamed(() => import('./BossDashboard'), 'BossDashboard');
export const BossPriorityDashboard = lazyNamed(() => import('./BossPriorityDashboard'), 'BossPriorityDashboard');
export const ManagerDashboard = lazyNamed(() => import('./AdminDashboard'), 'ManagerDashboard');
export const StaffDashboard = lazyNamed(() => import('./StaffDashboard'), 'StaffDashboard');
export const ManagementPortal = lazyNamed(() => import('./management/ManagementPortal'), 'ManagementPortal');
export const DeviceScreenPortal = lazyNamed(() => import('./features/device/DeviceScreenPortal'), 'DeviceScreenPortal');

// ── 弹窗 ────────────────────────────────────────────────────────────────────
export const StoreConfigModal = lazyNamed(() => import('./features/StoreConfigModal'), 'StoreConfigModal', <Silent />);
export const AIOperationsAssistant = lazyNamed(() => import('./features/AIOperationsAssistant'), 'AIOperationsAssistant', <Silent />);
export const WhatsNewModal = lazyNamed(() => import('./ui/WhatsNewModal'), 'WhatsNewModal', <Silent />);
export const DailyBusinessReportModal = lazyNamed(() => import('./features/DailyBusinessReportModal'), 'DailyBusinessReportModal', <Silent />);

// ── 功能模块（打开时才载入） ────────────────────────────────────────────────
export const HRSystem = lazyNamed(() => import('./features/HRSystem'), 'HRSystem');
export const MenuManagement = lazyNamed(() => import('./features/MenuManagement'), 'MenuManagement');
export const RecurringBillsModule = lazyNamed(() => import('./features/RecurringBillsModule'), 'RecurringBillsModule');
export const OrgChart = lazyNamed(() => import('./features/OrgChart'), 'OrgChart');
export const FinancialReport = lazyNamed(() => import('./features/FinancialReport'), 'FinancialReport');
export const AttendanceConsole = lazyNamed(() => import('./features/AttendanceConsole'), 'AttendanceConsole');
export const LabourProfitDashboard = lazyNamed(() => import('./features/labour/LabourProfitDashboard'), 'LabourProfitDashboard');
export const AccountsPayableModule = lazyNamed(() => import('./features/ap/AccountsPayableModule'), 'AccountsPayableModule');
export const TreasuryModule = lazyNamed(() => import('./features/TreasuryModule'), 'TreasuryModule');
export const WarrantyModule = lazyNamed(() => import('./features/WarrantyModule'), 'WarrantyModule');
export const EventsPlanningModule = lazyNamed(() => import('./features/EventsPlanningModule'), 'EventsPlanningModule');
export const PriceMonitorModule = lazyNamed(() => import('./features/PriceMonitorModule'), 'PriceMonitorModule');
export const EmployeeAssessmentModule = lazyNamed(() => import('./features/EmployeeAssessmentModule'), 'EmployeeAssessmentModule');
export const TranslationManager = lazyNamed(() => import('./features/TranslationManager'), 'TranslationManager');
export const SelfInvoiceModule = lazyNamed(() => import('./features/SelfInvoiceModule'), 'SelfInvoiceModule');
export const SettlementModule = lazyNamed(() => import('./features/SettlementModule'), 'SettlementModule');
export const RosterModule = lazyNamed(() => import('./features/RosterModule'), 'RosterModule');
export const LogbookModule = lazyNamed(() => import('./features/LogbookModule'), 'LogbookModule');
export const InventoryModule = lazyNamed(() => import('./features/inventory/InventoryModule'), 'InventoryModule');
export const SOPInspection = lazyNamed(() => import('./features/SOPInspection'), 'SOPInspection');
export const QueueManager = lazyNamed(() => import('./features/QueueManager'), 'QueueManager');
export const SupplierModule = lazyNamed(() => import('./features/supplier/SupplierModule'), 'SupplierModule');
export const ProcurementModule = lazyNamed(() => import('./features/ProcurementModule'), 'ProcurementModule');
export const KitchenAlertModule = lazyNamed(() => import('./features/kitchen/KitchenAlertModule'), 'KitchenAlertModule');
export const StaffCashModule = lazyNamed(() => import('./features/staffcash/StaffCashModule'), 'StaffCashModule');
