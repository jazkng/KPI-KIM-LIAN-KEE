import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, RotateCcw, ShieldCheck, Warehouse, X } from 'lucide-react';
import {
    Employee,
    InventoryAccessConfig,
    InventoryPermission,
    InventoryScope,
    PortalRole,
} from '../../../types';
import {
    getDefaultInventoryAccess,
    INVENTORY_PERMISSION_LABELS,
    INVENTORY_PERMISSIONS,
    INVENTORY_SCOPE_LABELS,
    INVENTORY_SCOPES,
    resolveInventoryAccess,
} from '../../../utils/inventoryAccess';
import { getPortalRole, isSystemAdminAccount } from '../../../utils/orgAccess';

interface InventoryAccessModalProps {
    isOpen: boolean;
    employee: Employee;
    onClose: () => void;
    onApply: (config: InventoryAccessConfig) => void;
}

const DAILY_PERMISSIONS: InventoryPermission[] = [
    'VIEW_STOCK',
    'EXECUTE_STOCKTAKE',
    'ADD_ITEM',
    'EDIT_BASIC_INFO',
    'EDIT_MIN_LEVEL',
];

const SETTING_PERMISSIONS: InventoryPermission[] = [
    'EDIT_COUNT_UNIT_CONVERSION',
    'EDIT_PURCHASE_UNIT_CONVERSION',
    'EDIT_BASE_UNIT',
    'EDIT_COST',
    'DEACTIVATE_ITEM',
];

const PERMISSION_DESCRIPTIONS: Record<InventoryPermission, string> = {
    VIEW_STOCK: '查看库存数量、低库存状态与物品资料',
    EXECUTE_STOCKTAKE: '接收并提交盘点任务',
    ADD_ITEM: '在库存中建立新物品',
    EDIT_BASIC_INFO: '修改名称、分类、图片等基本资料',
    EDIT_MIN_LEVEL: '修改低库存警戒线',
    EDIT_COUNT_UNIT_CONVERSION: '设置员工盘点时使用的单位关系',
    EDIT_PURCHASE_UNIT_CONVERSION: '设置供应商采购规格的单位关系',
    EDIT_BASE_UNIT: '更改系统计算库存与成本的基础单位',
    EDIT_COST: '直接修改库存成本资料',
    DEACTIVATE_ITEM: '将物品停用，不再用于日常操作',
};

const cloneConfig = (config: InventoryAccessConfig): InventoryAccessConfig => ({
    version: 1,
    scopes: [...config.scopes],
    permissions: { ...config.permissions },
});

const Toggle = ({ enabled }: { enabled: boolean }) => (
    <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
        aria-hidden="true"
    >
        <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
        />
    </span>
);

export const InventoryAccessModal: React.FC<InventoryAccessModalProps> = ({
    isOpen,
    employee,
    onClose,
    onApply,
}) => {
    const portalRole = getPortalRole(employee);
    const isProtectedAccount = portalRole === PortalRole.BOSS || isSystemAdminAccount(employee);
    const [draft, setDraft] = useState<InventoryAccessConfig>(() =>
        cloneConfig(resolveInventoryAccess(employee, portalRole)),
    );

    useEffect(() => {
        if (!isOpen) return;
        setDraft(cloneConfig(resolveInventoryAccess(employee, portalRole)));
    }, [employee, isOpen, portalRole]);

    const enabledPermissionCount = useMemo(
        () => INVENTORY_PERMISSIONS.filter(permission => draft.permissions[permission]).length,
        [draft.permissions],
    );

    if (!isOpen) return null;

    const toggleScope = (scope: InventoryScope) => {
        if (isProtectedAccount) return;
        setDraft(current => ({
            ...current,
            scopes: current.scopes.includes(scope)
                ? current.scopes.filter(item => item !== scope)
                : [...current.scopes, scope],
        }));
    };

    const togglePermission = (permission: InventoryPermission) => {
        if (isProtectedAccount) return;
        setDraft(current => ({
            ...current,
            permissions: {
                ...current.permissions,
                [permission]: !current.permissions[permission],
            },
        }));
    };

    const restoreRoleDefault = () => {
        if (isProtectedAccount) return;
        setDraft(cloneConfig(getDefaultInventoryAccess(portalRole, employee)));
    };

    const apply = () => {
        const next = isProtectedAccount
            ? getDefaultInventoryAccess(PortalRole.BOSS, employee)
            : draft;
        onApply(cloneConfig(next));
        onClose();
    };

    const renderPermissionGroup = (
        title: string,
        subtitle: string,
        permissions: InventoryPermission[],
        warning = false,
    ) => (
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className={`border-b px-4 py-3 ${warning ? 'border-amber-100 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                <h4 className={`text-sm font-black ${warning ? 'text-amber-900' : 'text-gray-900'}`}>{title}</h4>
                <p className={`mt-0.5 text-[11px] font-medium ${warning ? 'text-amber-700' : 'text-gray-500'}`}>{subtitle}</p>
            </div>
            <div className="divide-y divide-gray-100">
                {permissions.map(permission => {
                    const enabled = Boolean(draft.permissions[permission]);
                    return (
                        <button
                            key={permission}
                            type="button"
                            disabled={isProtectedAccount}
                            onClick={() => togglePermission(permission)}
                            className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-gray-100 disabled:cursor-default disabled:opacity-80"
                            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                            aria-pressed={enabled}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-black text-gray-900">{INVENTORY_PERMISSION_LABELS[permission]}</div>
                                <div className="mt-0.5 text-[11px] leading-4 text-gray-500">{PERMISSION_DESCRIPTIONS[permission]}</div>
                            </div>
                            <Toggle enabled={enabled} />
                        </button>
                    );
                })}
            </div>
        </section>
    );

    return (
        <div className="fixed inset-0 z-[220] flex items-end bg-black/70 backdrop-blur-sm md:items-center md:justify-center md:p-4">
            <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F6F7FB] shadow-2xl md:h-auto md:max-h-[92vh] md:max-w-2xl md:rounded-3xl">
                <header className="safe-area-top shrink-0 border-b border-white/10 bg-[#111111] px-4 pb-4 text-white md:pt-4">
                    <div className="flex min-h-[48px] items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFD200] text-black">
                            <Warehouse size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-black">库存权限</h3>
                            <p className="truncate text-[11px] font-bold text-white/55">{employee.name} · {employee.id}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
                            aria-label="关闭库存权限设置"
                        >
                            <X size={21} />
                        </button>
                    </div>
                </header>

                <main className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 md:p-5">
                    {isProtectedAccount ? (
                        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                            <ShieldCheck className="mt-0.5 shrink-0" size={20} />
                            <div>
                                <p className="text-sm font-black">老板／超级管理员保持完整库存权限</p>
                                <p className="mt-1 text-[11px] font-medium leading-5 text-emerald-700">为了避免误锁定管理账号，此处只显示权限，不允许关闭。</p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-900">
                            <p className="text-xs font-black">这里控制进入库存后的操作</p>
                            <p className="mt-1 text-[11px] font-medium leading-5 text-blue-700">员工是否能进入库存模块，仍由上一张“系统权限”卡控制。两项都开启后才会生效。</p>
                        </div>
                    )}

                    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                            <div>
                                <h4 className="text-sm font-black text-gray-900">管理范围</h4>
                                <p className="mt-0.5 text-[11px] font-medium text-gray-500">选择这个员工可以处理的库存区域</p>
                            </div>
                            <span className="rounded-full bg-gray-200 px-2.5 py-1 text-[10px] font-black text-gray-600">{draft.scopes.length}/4</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 p-3">
                            {INVENTORY_SCOPES.map(scope => {
                                const enabled = draft.scopes.includes(scope);
                                return (
                                    <button
                                        key={scope}
                                        type="button"
                                        disabled={isProtectedAccount}
                                        onClick={() => toggleScope(scope)}
                                        className={`flex min-h-[54px] items-center justify-between rounded-xl border-2 px-3 text-left transition-all active:scale-[0.98] ${enabled ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-gray-100 bg-white text-gray-500'} disabled:active:scale-100`}
                                        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                                        aria-pressed={enabled}
                                    >
                                        <span className="text-sm font-black">{INVENTORY_SCOPE_LABELS[scope]}</span>
                                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${enabled ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-transparent'}`}>
                                            <Check size={15} strokeWidth={3} />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {renderPermissionGroup('日常库存操作', '适合盘点、补货与日常资料维护', DAILY_PERMISSIONS)}
                    {renderPermissionGroup('重要设置', '这些操作会影响单位换算、成本或物品状态', SETTING_PERMISSIONS, true)}

                    {!isProtectedAccount && draft.scopes.length === 0 && enabledPermissionCount > 0 && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold leading-5 text-red-700">
                            尚未选择管理范围。即使开启了操作权限，该员工也无法处理任何库存区域。
                        </div>
                    )}

                    {!isProtectedAccount && (
                        <button
                            type="button"
                            onClick={restoreRoleDefault}
                            className="flex min-h-[48px] w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 shadow-sm active:bg-gray-100"
                            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                        >
                            <span className="flex items-center gap-2"><RotateCcw size={17} /> 恢复该身份的默认权限</span>
                            <ChevronRight size={18} className="text-gray-300" />
                        </button>
                    )}
                </main>

                <footer
                    className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3"
                    style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
                >
                    <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-bold text-gray-400">
                        <span>{draft.scopes.length} 个区域</span>
                        <span>{enabledPermissionCount} 项操作权限</span>
                    </div>
                    <button
                        type="button"
                        onClick={apply}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#111111] text-sm font-black text-[#FFD200] shadow-lg active:scale-[0.99]"
                        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                    >
                        <Check size={18} strokeWidth={3} /> 应用到员工档案
                    </button>
                    <p className="mt-2 text-center text-[10px] font-bold text-gray-400">应用后，请再按员工档案顶部的“保存”</p>
                </footer>
            </div>
        </div>
    );
};
