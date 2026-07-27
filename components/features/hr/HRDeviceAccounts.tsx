import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChefHat,
    Clock3,
    ExternalLink,
    Eye,
    EyeOff,
    KeyRound,
    ListOrdered,
    MapPin,
    MonitorSmartphone,
    Pencil,
    Plus,
    Power,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    ShieldOff,
    X,
} from 'lucide-react';
import { DeviceAccount, DeviceAccountActor, DeviceScreen, Employee } from '../../../types';
import { DeviceAccountService } from '../../../utils/deviceAccountService';

const noTap: React.CSSProperties = {
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
};

const STORE_ID = 'KEPONG';

const SCREEN_OPTIONS: Array<{
    id: DeviceScreen;
    label: string;
    description: string;
    Icon: typeof ChefHat;
}> = [
    {
        id: 'KITCHEN_ALERT',
        label: '厨房急单荧幕',
        description: '接收楼面催菜、注意事项和已解决通知',
        Icon: ChefHat,
    },
    {
        id: 'QUEUE_DISPLAY',
        label: '等待／叫号荧幕',
        description: '显示顾客等待号码和叫号状态',
        Icon: ListOrdered,
    },
];

interface HRDeviceAccountsProps {
    currentEmployee?: Employee | null;
}

interface DeviceFormState {
    deviceCode: string;
    deviceName: string;
    storeId: string;
    location: string;
    pin: string;
    confirmPin: string;
    allowedScreens: DeviceScreen[];
    defaultScreen: DeviceScreen;
    notes: string;
}

type ModalMode = 'CREATE' | 'EDIT' | 'PIN' | null;

interface NoticeState {
    type: 'success' | 'error';
    message: string;
}

const createEmptyForm = (): DeviceFormState => ({
    deviceCode: '',
    deviceName: '',
    storeId: STORE_ID,
    location: '',
    pin: '',
    confirmPin: '',
    allowedScreens: ['KITCHEN_ALERT'],
    defaultScreen: 'KITCHEN_ALERT',
    notes: '',
});

const formatDateTime = (value?: string): string => {
    if (!value) return '从未登录';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间不明';
    return new Intl.DateTimeFormat('zh-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
};

const getScreenLabel = (screen?: DeviceScreen): string => {
    if (!screen) return '未进入画面';
    return SCREEN_OPTIONS.find(option => option.id === screen)?.label || screen;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return '操作失败，请检查网络后再试';
};

export const HRDeviceAccounts: React.FC<HRDeviceAccountsProps> = ({ currentEmployee }) => {
    const [devices, setDevices] = useState<DeviceAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncError, setSyncError] = useState('');
    const [search, setSearch] = useState('');
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [editingDevice, setEditingDevice] = useState<DeviceAccount | null>(null);
    const [form, setForm] = useState<DeviceFormState>(createEmptyForm);
    const [showPin, setShowPin] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
    const [notice, setNotice] = useState<NoticeState | null>(null);

    const actor = useMemo<DeviceAccountActor>(() => ({
        id: currentEmployee?.id || 'SYSTEM_ADMIN',
        name: currentEmployee?.name || 'System Admin',
    }), [currentEmployee]);

    useEffect(() => {
        setLoading(true);
        const unsubscribe = DeviceAccountService.subscribeDeviceAccounts(
            nextDevices => {
                setDevices(nextDevices);
                setLoading(false);
                setSyncError('');
            },
            {
                storeId: STORE_ID,
                onError: error => {
                    console.error('Device account subscription failed:', error);
                    setSyncError('无法读取设备户口，请检查网络或 Firestore 权限。');
                    setLoading(false);
                },
            },
        );
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(null), 4000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const stats = useMemo(() => ({
        total: devices.length,
        active: devices.filter(device => device.status === 'ACTIVE').length,
        kitchen: devices.filter(device => device.status === 'ACTIVE' && device.allowedScreens.includes('KITCHEN_ALERT')).length,
        disabled: devices.filter(device => device.status === 'DISABLED').length,
    }), [devices]);

    const filteredDevices = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        if (!keyword) return devices;
        return devices.filter(device => [
            device.deviceCode,
            device.deviceName,
            device.location,
            device.notes,
        ].some(value => value?.toLowerCase().includes(keyword)));
    }, [devices, search]);

    const showNotice = (type: NoticeState['type'], message: string) => {
        setNotice({ type, message });
    };

    const closeModal = () => {
        if (saving) return;
        setNotice(null);
        setModalMode(null);
        setEditingDevice(null);
        setForm(createEmptyForm());
        setShowPin(false);
    };

    const openCreate = () => {
        setNotice(null);
        setEditingDevice(null);
        setForm(createEmptyForm());
        setShowPin(false);
        setModalMode('CREATE');
    };

    const openEdit = (device: DeviceAccount) => {
        setNotice(null);
        setEditingDevice(device);
        setForm({
            deviceCode: device.deviceCode,
            deviceName: device.deviceName,
            storeId: device.storeId,
            location: device.location || '',
            pin: '',
            confirmPin: '',
            allowedScreens: device.allowedScreens,
            defaultScreen: device.defaultScreen,
            notes: device.notes || '',
        });
        setModalMode('EDIT');
    };

    const openPin = (device: DeviceAccount) => {
        setNotice(null);
        setEditingDevice(device);
        setForm({
            ...createEmptyForm(),
            deviceCode: device.deviceCode,
            deviceName: device.deviceName,
        });
        setShowPin(false);
        setModalMode('PIN');
    };

    const updateForm = <K extends keyof DeviceFormState>(key: K, value: DeviceFormState[K]) => {
        setForm(previous => ({ ...previous, [key]: value }));
    };

    const toggleScreen = (screen: DeviceScreen) => {
        setForm(previous => {
            const exists = previous.allowedScreens.includes(screen);
            const allowedScreens = exists
                ? previous.allowedScreens.filter(item => item !== screen)
                : [...previous.allowedScreens, screen];
            const defaultScreen = allowedScreens.includes(previous.defaultScreen)
                ? previous.defaultScreen
                : allowedScreens[0] || previous.defaultScreen;
            return { ...previous, allowedScreens, defaultScreen };
        });
    };

    const validatePinFields = () => {
        if (!/^\d{4,8}$/.test(form.pin.trim())) {
            throw new Error('设备 PIN 必须是 4 至 8 位数字');
        }
        if (form.pin !== form.confirmPin) {
            throw new Error('两次输入的 PIN 不一致');
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            if (modalMode === 'CREATE') {
                if (!form.deviceCode.trim()) {
                    throw new Error('请填写设备编号 / 登入 ID');
                }
                if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(form.deviceCode.trim().toUpperCase())) {
                    throw new Error('设备编号必须是 3 至 40 位英文字母、数字、横线（-）或底线（_）');
                }
                if (!form.deviceName.trim()) {
                    throw new Error('请填写设备名称');
                }
                if (!form.storeId.trim()) {
                    throw new Error('请填写门店编号');
                }
                validatePinFields();
                if (form.allowedScreens.length === 0) throw new Error('请至少选择一个可使用画面');
                await DeviceAccountService.createDeviceAccount({
                    deviceCode: form.deviceCode,
                    deviceName: form.deviceName,
                    storeId: form.storeId,
                    pin: form.pin,
                    allowedScreens: form.allowedScreens,
                    defaultScreen: form.defaultScreen,
                    location: form.location,
                    notes: form.notes,
                    createdBy: actor,
                });
                showNotice('success', `设备户口 ${form.deviceCode.trim().toUpperCase()} 已建立`);
            } else if (modalMode === 'EDIT' && editingDevice) {
                if (!form.deviceName.trim()) {
                    throw new Error('请填写设备名称');
                }
                if (!form.storeId.trim()) {
                    throw new Error('请填写门店编号');
                }
                if (form.allowedScreens.length === 0) throw new Error('请至少选择一个可使用画面');
                await DeviceAccountService.updateDeviceAccount(
                    editingDevice.id,
                    {
                        deviceName: form.deviceName,
                        storeId: form.storeId,
                        location: form.location,
                        allowedScreens: form.allowedScreens,
                        defaultScreen: form.defaultScreen,
                        notes: form.notes,
                    },
                    actor,
                );
                showNotice('success', `${editingDevice.deviceName} 的资料已更新`);
            } else if (modalMode === 'PIN' && editingDevice) {
                validatePinFields();
                await DeviceAccountService.changePin(editingDevice.id, form.pin, actor);
                showNotice('success', `${editingDevice.deviceName} 的 PIN 已更换，旧登录已失效`);
            }
            setModalMode(null);
            setEditingDevice(null);
            setForm(createEmptyForm());
        } catch (error) {
            showNotice('error', getErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const handleStatusChange = async (device: DeviceAccount) => {
        const enabling = device.status === 'DISABLED';
        const message = enabling
            ? `确定重新启用「${device.deviceName}」？`
            : `确定停用「${device.deviceName}」？这台设备现有的登录会立即失效。`;
        if (!window.confirm(message)) return;

        try {
            setBusyDeviceId(device.id);
            await DeviceAccountService.setStatus(
                device.id,
                enabling ? 'ACTIVE' : 'DISABLED',
                actor,
            );
            showNotice('success', enabling ? '设备户口已启用' : '设备户口已停用');
        } catch (error) {
            showNotice('error', getErrorMessage(error));
        } finally {
            setBusyDeviceId(null);
        }
    };

    const handleRevokeSessions = async (device: DeviceAccount) => {
        if (!window.confirm(`确定撤销「${device.deviceName}」的所有登录？设备必须重新输入编号和 PIN。`)) return;
        try {
            setBusyDeviceId(device.id);
            await DeviceAccountService.revokeSessions(device.id, actor);
            showNotice('success', `${device.deviceName} 的登录已全部撤销`);
        } catch (error) {
            showNotice('error', getErrorMessage(error));
        } finally {
            setBusyDeviceId(null);
        }
    };

    const openScreen = (screen: DeviceScreen) => {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('mode', DeviceAccountService.getScreenMode(screen));
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="h-full overflow-y-auto bg-[#F5F7FA]" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b px-4 md:px-6 py-4">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h4 className="font-black text-xl flex items-center gap-2">
                            <MonitorSmartphone className="text-[#8B0000]" /> 设备户口
                        </h4>
                        <p className="text-xs text-gray-500 font-bold mt-1">
                            管理厨房急单与等待荧幕；不会计入员工、考勤或薪资。
                        </p>
                    </div>
                    <button
                        style={noTap}
                        onClick={openCreate}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FFD700] text-black font-black flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-transform"
                    >
                        <Plus size={18} /> 新增设备户口
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
                {notice && (
                    <div className={`rounded-2xl px-4 py-3 flex items-start gap-3 font-bold text-sm shadow-sm ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        {notice.type === 'success' ? <CheckCircle2 size={20} className="shrink-0" /> : <AlertTriangle size={20} className="shrink-0" />}
                        <span className="flex-1">{notice.message}</span>
                        <button onClick={() => setNotice(null)} className="p-1" aria-label="关闭提示"><X size={16} /></button>
                    </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: '全部设备', value: stats.total, Icon: MonitorSmartphone, color: 'text-gray-900', bg: 'bg-white' },
                        { label: '已启用', value: stats.active, Icon: ShieldCheck, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                        { label: '厨房荧幕', value: stats.kitchen, Icon: ChefHat, color: 'text-amber-700', bg: 'bg-amber-50' },
                        { label: '已停用', value: stats.disabled, Icon: ShieldOff, color: 'text-gray-500', bg: 'bg-gray-100' },
                    ].map(item => (
                        <div key={item.label} className={`${item.bg} rounded-2xl border p-4 shadow-sm`}>
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <p className="text-[11px] font-black text-gray-500 uppercase tracking-wide">{item.label}</p>
                                    <p className={`text-3xl font-black mt-1 ${item.color}`}>{item.value}</p>
                                </div>
                                <item.Icon size={20} className={item.color} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-2xl border shadow-sm p-3 md:p-4">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="搜索设备编号、名称、位置或备注"
                            className="w-full min-h-[44px] rounded-xl bg-gray-100 border border-transparent focus:border-[#FFD700] focus:bg-white outline-none pl-10 pr-4 font-bold text-sm"
                        />
                    </div>
                </div>

                {syncError && (
                    <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-start gap-3">
                        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black">设备资料暂时无法同步</p>
                            <p className="text-sm font-bold mt-1">{syncError}</p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="min-h-[240px] flex flex-col items-center justify-center text-gray-500">
                        <RefreshCw className="animate-spin mb-3" />
                        <p className="font-black">正在读取设备户口...</p>
                    </div>
                ) : filteredDevices.length === 0 ? (
                    <div className="bg-white min-h-[260px] rounded-3xl border border-dashed flex flex-col items-center justify-center text-center px-6">
                        <MonitorSmartphone size={44} className="text-gray-300 mb-3" />
                        <p className="font-black text-lg">{search ? '找不到符合的设备' : '还没有设备户口'}</p>
                        <p className="text-sm text-gray-500 font-bold mt-1">
                            {search ? '请尝试其他关键词。' : '先建立厨房或等待荧幕的专用设备户口。'}
                        </p>
                        {!search && (
                            <button onClick={openCreate} className="mt-5 bg-[#FFD700] px-5 py-2.5 min-h-[44px] rounded-xl font-black flex items-center gap-2">
                                <Plus size={18} /> 新增第一台设备
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 pb-8">
                        {filteredDevices.map(device => {
                            const busy = busyDeviceId === device.id;
                            return (
                                <article key={device.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${device.status === 'DISABLED' ? 'opacity-75' : ''}`}>
                                    <div className={`h-2 ${device.status === 'DISABLED' ? 'bg-gray-400' : 'bg-emerald-500'}`} />
                                    <div className="p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h5 className="font-black text-lg truncate">{device.deviceName}</h5>
                                                <p className="font-mono text-xs font-black text-gray-500 mt-1 tracking-wide">登入 ID：{device.deviceCode}</p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black flex items-center gap-1 ${device.status === 'DISABLED' ? 'bg-gray-200 text-gray-600' : 'bg-emerald-100 text-emerald-800'}`}>
                                                {device.status === 'DISABLED' ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                                                {device.status === 'DISABLED' ? '已停用' : '已启用'}
                                            </span>
                                        </div>

                                        <div className="mt-4 space-y-2 text-xs font-bold text-gray-600">
                                            <p className="flex items-start gap-2"><MapPin size={15} className="shrink-0 text-gray-400" /> {device.location || '未填写设备位置'}</p>
                                            <p className="flex items-start gap-2"><Clock3 size={15} className="shrink-0 text-gray-400" /> 最后登录：{formatDateTime(device.lastLoginAt)}</p>
                                            <p className="flex items-start gap-2"><MonitorSmartphone size={15} className="shrink-0 text-gray-400" /> 默认：{getScreenLabel(device.defaultScreen)}</p>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {device.allowedScreens.map(screen => {
                                                const option = SCREEN_OPTIONS.find(item => item.id === screen)!;
                                                return (
                                                    <span key={screen} className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-black flex items-center gap-1.5">
                                                        <option.Icon size={13} /> {option.label}
                                                        {device.defaultScreen === screen && <span className="text-[#8B0000]">默认</span>}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {device.notes && <p className="mt-4 rounded-xl bg-amber-50 text-amber-900 p-3 text-xs font-bold line-clamp-3">备注：{device.notes}</p>}

                                        <div className="mt-5 pt-4 border-t grid grid-cols-2 gap-2">
                                            <button disabled={busy} onClick={() => openEdit(device)} className="min-h-[42px] rounded-xl bg-gray-100 font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                <Pencil size={15} /> 编辑资料
                                            </button>
                                            <button disabled={busy} onClick={() => openPin(device)} className="min-h-[42px] rounded-xl bg-gray-100 font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                <KeyRound size={15} /> 更换 PIN
                                            </button>
                                            <button disabled={busy} onClick={() => handleRevokeSessions(device)} className="min-h-[42px] rounded-xl bg-blue-50 text-blue-800 font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50">
                                                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> 撤销登录
                                            </button>
                                            <button disabled={busy} onClick={() => handleStatusChange(device)} className={`min-h-[42px] rounded-xl font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 ${device.status === 'DISABLED' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                                                <Power size={15} /> {device.status === 'DISABLED' ? '重新启用' : '停用设备'}
                                            </button>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {device.allowedScreens.map(screen => (
                                                <button key={screen} onClick={() => openScreen(screen)} className="flex-1 min-w-[140px] min-h-[40px] rounded-xl border font-black text-[11px] flex items-center justify-center gap-1.5">
                                                    <ExternalLink size={14} /> 打开{getScreenLabel(screen)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {modalMode && (
                <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-5" onMouseDown={event => {
                    if (event.currentTarget === event.target) closeModal();
                }}>
                    <div className="bg-white w-full md:max-w-2xl max-h-[94vh] rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
                        <div className="bg-[#1A1A1A] text-white px-5 py-4 flex items-center justify-between border-b-4 border-[#FFD700] shrink-0">
                            <div>
                                <h5 className="font-black text-lg flex items-center gap-2">
                                    {modalMode === 'PIN' ? <KeyRound className="text-[#FFD700]" /> : <MonitorSmartphone className="text-[#FFD700]" />}
                                    {modalMode === 'CREATE' ? '新增设备户口' : modalMode === 'EDIT' ? '编辑设备户口' : '更换设备 PIN'}
                                </h5>
                                {editingDevice && <p className="text-xs text-gray-300 font-bold mt-1">{editingDevice.deviceName} · 登入 ID：{editingDevice.deviceCode}</p>}
                            </div>
                            <button onClick={closeModal} disabled={saving} className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-50"><X /></button>
                        </div>

                        <div className="overflow-y-auto p-5 md:p-6 space-y-5" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                            {notice && notice.type === 'error' && (
                                <div className="rounded-2xl px-4 py-3 flex items-start gap-3 font-bold text-sm shadow-sm bg-red-50 text-red-800 border border-red-200">
                                    <AlertTriangle size={20} className="shrink-0 text-red-600 mt-0.5" />
                                    <span className="flex-1 leading-relaxed">{notice.message}</span>
                                    <button onClick={() => setNotice(null)} className="p-1 hover:bg-red-100 rounded" aria-label="关闭提示"><X size={16} /></button>
                                </div>
                            )}

                            {modalMode === 'PIN' ? (
                                <>
                                    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 text-amber-900">
                                        <AlertTriangle size={20} className="shrink-0" />
                                        <p className="text-sm font-bold">更换 PIN 后，这台设备目前所有登录会立即失效，必须使用新 PIN 重新登录。</p>
                                    </div>
                                    <PinFields form={form} showPin={showPin} setShowPin={setShowPin} updateForm={updateForm} />
                                </>
                            ) : (
                                <>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <Field label="设备编号 / 登入 ID" hint="建立后不可修改（此编号为设备登录时的账号）">
                                            <input
                                                value={form.deviceCode}
                                                disabled={modalMode === 'EDIT'}
                                                onChange={event => updateForm('deviceCode', event.target.value.toUpperCase())}
                                                placeholder="请输入登入 ID，例如 KITCHEN-01"
                                                maxLength={40}
                                                className="form-input font-mono uppercase disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </Field>
                                        <Field label="设备名称">
                                            <input value={form.deviceName} onChange={event => updateForm('deviceName', event.target.value)} placeholder="例如 厨房主荧幕" maxLength={100} className="form-input" />
                                        </Field>
                                        <Field label="门店编号">
                                            <input value={form.storeId} onChange={event => updateForm('storeId', event.target.value.toUpperCase())} maxLength={80} className="form-input uppercase" />
                                        </Field>
                                        <Field label="摆放位置" hint="方便辨认是哪一台设备">
                                            <input value={form.location} onChange={event => updateForm('location', event.target.value)} placeholder="例如 热厨出菜口" maxLength={120} className="form-input" />
                                        </Field>
                                    </div>

                                    {modalMode === 'CREATE' && <PinFields form={form} showPin={showPin} setShowPin={setShowPin} updateForm={updateForm} />}

                                    <fieldset>
                                        <legend className="text-sm font-black mb-2">可使用画面 <span className="text-red-600">*</span></legend>
                                        <div className="grid md:grid-cols-2 gap-3">
                                            {SCREEN_OPTIONS.map(option => {
                                                const selected = form.allowedScreens.includes(option.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={option.id}
                                                        onClick={() => toggleScreen(option.id)}
                                                        className={`text-left rounded-2xl border-2 p-4 transition-all ${selected ? 'border-[#FFD700] bg-yellow-50' : 'border-gray-200 bg-white'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${selected ? 'bg-[#FFD700]' : 'bg-gray-100'}`}><option.Icon size={20} /></span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-black text-sm">{option.label}</p>
                                                                <p className="text-[11px] text-gray-500 font-bold mt-1 leading-relaxed">{option.description}</p>
                                                            </div>
                                                            <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${selected ? 'bg-[#8B0000] border-[#8B0000] text-white' : 'border-gray-300'}`}>{selected && <CheckCircle2 size={14} />}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </fieldset>

                                    <Field label="登录后默认画面">
                                        <select value={form.defaultScreen} onChange={event => updateForm('defaultScreen', event.target.value as DeviceScreen)} className="form-input" disabled={form.allowedScreens.length === 0}>
                                            {SCREEN_OPTIONS.filter(option => form.allowedScreens.includes(option.id)).map(option => (
                                                <option key={option.id} value={option.id}>{option.label}</option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="备注" hint="PIN 不可填写在备注里">
                                        <textarea value={form.notes} onChange={event => updateForm('notes', event.target.value)} placeholder="例如：只安装在厨房平板，不可带离门店" maxLength={300} rows={3} className="form-input resize-none" />
                                    </Field>
                                </>
                            )}
                        </div>

                        <div className="border-t bg-white p-4 md:px-6 flex gap-3 shrink-0 safe-area-bottom">
                            <button onClick={closeModal} disabled={saving} className="flex-1 min-h-[48px] rounded-xl bg-gray-100 font-black disabled:opacity-50">取消</button>
                            <button onClick={handleSave} disabled={saving} className="flex-[2] min-h-[48px] rounded-xl bg-[#FFD700] text-black font-black flex items-center justify-center gap-2 disabled:opacity-60">
                                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                                {saving ? '保存中...' : modalMode === 'PIN' ? '确认更换 PIN' : '保存设备户口'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .form-input {
                    width: 100%;
                    min-height: 46px;
                    border-radius: 0.75rem;
                    border: 1px solid #d1d5db;
                    background: white;
                    padding: 0.7rem 0.85rem;
                    font-size: 0.875rem;
                    font-weight: 700;
                    outline: none;
                }
                .form-input:focus { border-color: #e3bd00; box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.18); }
            `}</style>
        </div>
    );
};

interface FieldProps {
    label: string;
    hint?: string;
    children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, hint, children }) => (
    <label className="block">
        <span className="text-sm font-black">{label}</span>
        {hint && <span className="text-[10px] font-bold text-gray-400 ml-2">{hint}</span>}
        <span className="block mt-2">{children}</span>
    </label>
);

interface PinFieldsProps {
    form: DeviceFormState;
    showPin: boolean;
    setShowPin: React.Dispatch<React.SetStateAction<boolean>>;
    updateForm: <K extends keyof DeviceFormState>(key: K, value: DeviceFormState[K]) => void;
}

const PinFields: React.FC<PinFieldsProps> = ({ form, showPin, setShowPin, updateForm }) => (
    <div className="grid md:grid-cols-2 gap-4">
        <Field label="设备 PIN" hint="4 至 8 位数字">
            <div className="relative">
                <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={form.pin}
                    onChange={event => updateForm('pin', event.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="输入新 PIN"
                    className="form-input pr-12"
                />
                <button type="button" onClick={() => setShowPin(previous => !previous)} className="absolute right-1 top-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-gray-500" aria-label={showPin ? '隐藏 PIN' : '显示 PIN'}>
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
        </Field>
        <Field label="再次输入 PIN">
            <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="new-password"
                value={form.confirmPin}
                onChange={event => updateForm('confirmPin', event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="再次输入 PIN"
                className="form-input"
            />
        </Field>
    </div>
);