import React, { useEffect } from 'react';
import { Building2, X, Save, Star, Loader2, CreditCard, Landmark, Truck, Mail, MapPin } from 'lucide-react';
import { Supplier, SupplierBank } from '../../../types';
import { ACCOUNTING_CATEGORIES_OPTIONS, SUP_INPUT_STYLE, SUP_LABEL_STYLE } from './supplierConstants';

interface SupplierEditModalProps {
    supplierForm: Partial<Supplier>;
    suppliers: Supplier[];
    isSyncingName: boolean;
    onChange: (form: Partial<Supplier>) => void;
    onSave: () => void;
    onClose: () => void;
}

export const SupplierEditModal: React.FC<SupplierEditModalProps> = ({
    supplierForm, suppliers, isSyncingName, onChange, onSave, onClose
}) => {
    // 👑 智能向下兼容：老数据第一次进入时，自动拆分成结构化拆分银行账户格式
    useEffect(() => {
        if (!supplierForm.bankAccounts && supplierForm.bankAccount) {
            const legacyStr = supplierForm.bankAccount;
            // 尝试通过 ' | ' 拆分多个银行账户，或按 ' - ' 拆分散字段
            const accountsList: SupplierBank[] = [];
            const subAccounts = legacyStr.split(/\s*\|\s*/);
            
            subAccounts.forEach(sub => {
                const parts = sub.split(/\s*[-—]\s*/);
                let bName = '';
                let aName = '';
                let aNo = '';
                if (parts.length >= 3) {
                    bName = parts[0].trim();
                    aName = parts[1].trim();
                    aNo = parts[2].trim();
                } else if (parts.length === 2) {
                    bName = parts[0].trim();
                    aNo = parts[1].trim();
                } else {
                    bName = sub.trim();
                }
                if (bName || aName || aNo) {
                    accountsList.push({ bankName: bName, accountName: aName, accountNo: aNo });
                }
            });

            if (accountsList.length > 0) {
                onChange({
                    ...supplierForm,
                    bankAccounts: accountsList
                });
            } else {
                onChange({
                    ...supplierForm,
                    bankAccounts: [{ bankName: '', accountName: '', accountNo: '' }]
                });
            }
        } else if (!supplierForm.bankAccounts) {
            // 初始化默认一个空账户
            onChange({
                ...supplierForm,
                bankAccounts: [{ bankName: '', accountName: '', accountNo: '' }]
            });
        }
    }, [supplierForm.bankAccount, supplierForm.bankAccounts]);

    const bankAccounts = supplierForm.bankAccounts || [];

    const handleBankChange = (index: number, field: keyof SupplierBank, value: string) => {
        const updatedBanks = [...bankAccounts];
        if (!updatedBanks[index]) {
            updatedBanks[index] = { bankName: '', accountName: '', accountNo: '' };
        }
        updatedBanks[index] = { ...updatedBanks[index], [field]: value };
        
        const legacyString = updatedBanks
            .map(b => `${b.bankName || ''} - ${b.accountName || ''} - ${b.accountNo || ''}`)
            .filter(str => str !== ' -  - ')
            .join(' | ');

        onChange({
            ...supplierForm,
            bankAccounts: updatedBanks,
            bankAccount: legacyString
        });
    };

    const addBankAccount = () => {
        const updatedBanks = [...bankAccounts, { bankName: '', accountName: '', accountNo: '' }];
        onChange({
            ...supplierForm,
            bankAccounts: updatedBanks
        });
    };

    const removeBankAccount = (index: number) => {
        const updatedBanks = bankAccounts.filter((_, i) => i !== index);
        const legacyString = updatedBanks
            .map(b => `${b.bankName || ''} - ${b.accountName || ''} - ${b.accountNo || ''}`)
            .filter(str => str !== ' -  - ')
            .join(' | ');

        onChange({
            ...supplierForm,
            bankAccounts: updatedBanks,
            bankAccount: legacyString
        });
    };

    return (
        <div className="fixed inset-0 bg-[#1A1A1A]/80 z-[150] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-[2rem] p-6 md:p-8 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto border border-gray-100 scrollbar-thin">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4 sticky top-0 bg-white z-10">
                    <h3 className="font-black text-xl text-[#1A1A1A] flex items-center gap-2">
                        <div className="p-2 bg-gradient-to-br from-gray-800 to-[#1A1A1A] text-[#FFD700] rounded-xl"><Building2 size={20}/></div>
                        {supplierForm.id && suppliers.some(s => s.id === supplierForm.id) ? '编辑供应商专业档案' : '录入新供应商专业档案'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"><X size={20}/></button>
                </div>

                <div className="space-y-6">
                    {/* section 1: 基本品牌资料 */}
                    <div>
                        <div className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-md w-fit">
                            <span>01 / 基本建档资料 (Basic Info)</span>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className={SUP_LABEL_STYLE}>Company Name (企业名称) <span className="text-red-500">*</span></label>
                                <input className={SUP_INPUT_STYLE} value={supplierForm.name || ''} onChange={e => onChange({...supplierForm, name: e.target.value})} placeholder="例如: 恒胜海产贸易公司 (Heng Seng Seafood)" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>ID (唯一编码)</label>
                                    <input 
                                        className={`${SUP_INPUT_STYLE} font-mono ${suppliers.some(s => s.id === supplierForm.id) ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'text-blue-700 font-bold focus:ring-[#FFD700]'}`} 
                                        value={supplierForm.id || ''} 
                                        onChange={e => onChange({...supplierForm, id: e.target.value.trim().toUpperCase()})} 
                                        placeholder="如: S8001" 
                                        readOnly={suppliers.some(s => s.id === supplierForm.id)} 
                                        title={suppliers.some(s => s.id === supplierForm.id) ? "已有供应商主键不可修改" : "可手动输入"}
                                    />
                                </div>
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Status (合作状态)</label>
                                    <select className={SUP_INPUT_STYLE} value={supplierForm.status || 'ACTIVE'} onChange={e => onChange({...supplierForm, status: e.target.value as any})}>
                                        <option value="ACTIVE">🟢 Active 正常合作</option>
                                        <option value="INACTIVE">🔴 Inactive 暂停往来</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center justify-between bg-yellow-50/50 p-3 rounded-2xl border border-yellow-250 cursor-pointer group" onClick={() => onChange({...supplierForm, isFavorite: !supplierForm.isFavorite})}>
                                <div>
                                    <p className="text-xs font-black text-yellow-800">设为星标优选常用商户 (Primary Favorite)</p>
                                    <p className="text-[9.5px] text-yellow-600 font-bold mt-0.5">置顶显示，在应付账单模块可快捷检索和快速转账</p>
                                </div>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${supplierForm.isFavorite ? 'bg-[#FFD700] text-black shadow-md scale-105' : 'bg-white border border-yellow-200 text-gray-300 group-hover:bg-yellow-100'}`}>
                                    <Star size={18} className={supplierForm.isFavorite ? "fill-black text-black" : ""} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* section 2: 联系人与合规税务 */}
                    <div className="border-t border-gray-100 pt-5">
                        <div className="text-xs font-black text-blue-800 uppercase tracking-widest mb-3 flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                            <span>02 / 联络与工商合规 (Contact & Compliance)</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={SUP_LABEL_STYLE}>Contact Person (专职对接人)</label>
                                <input className={SUP_INPUT_STYLE} value={supplierForm.contactPerson || ''} onChange={e => onChange({...supplierForm, contactPerson: e.target.value})} placeholder="如: 阿林 Driver Line" />
                            </div>
                            <div>
                                <label className={SUP_LABEL_STYLE}>Phone (WhatsApp 联系电话)</label>
                                <input className={SUP_INPUT_STYLE} value={supplierForm.contact || ''} onChange={e => onChange({...supplierForm, contact: e.target.value})} placeholder="例如: 60123456789" />
                            </div>
                            <div>
                                <label className={SUP_LABEL_STYLE}>Email Address (财务接收账单邮箱)</label>
                                <input className={SUP_INPUT_STYLE} type="email" value={supplierForm.email || ''} onChange={e => onChange({...supplierForm, email: e.target.value})} placeholder="finance@supplier.com" />
                            </div>
                            <div>
                                <label className={SUP_LABEL_STYLE}>Company Website (企业网址/官网)</label>
                                <input className={SUP_INPUT_STYLE} value={supplierForm.website || ''} onChange={e => onChange({...supplierForm, website: e.target.value})} placeholder="https://www.supplier.com" />
                            </div>
                            <div>
                                <label className={SUP_LABEL_STYLE}>SSM Reg No. (企业注册号 / SSM 编号)</label>
                                <input className={SUP_INPUT_STYLE} value={supplierForm.ssmNumber || ''} onChange={e => onChange({...supplierForm, ssmNumber: e.target.value})} placeholder="如: 202101034567 (1432123-X)" />
                            </div>
                            <div>
                                <label className={SUP_LABEL_STYLE}>SST No. (SST 税务登记编号 / 留空免征)</label>
                                <input className={SUP_INPUT_STYLE} value={supplierForm.sstNumber || ''} onChange={e => onChange({...supplierForm, sstNumber: e.target.value})} placeholder="如: W10-1808-32000001" />
                            </div>
                        </div>
                    </div>

                    {/* section 3: 账期、收款银行与采购规格 */}
                    <div className="border-t border-gray-100 pt-5">
                        <div className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-3 flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-md w-fit">
                            <span>03 / 财务账款与配送规格 (Accounts & Delivery)</span>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Accounting Category (统驭科目)</label>
                                    <select className={SUP_INPUT_STYLE} value={supplierForm.category || 'SUPPLIER'} onChange={e => onChange({...supplierForm, category: e.target.value})}>
                                        <option value="SUPPLIER">General (一般货到付款往来)</option>
                                        {Object.entries(ACCOUNTING_CATEGORIES_OPTIONS).map(([group, options]) => (
                                            <optgroup key={group} label={group}>{options.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}</optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Payment Term (付款账期天数)</label>
                                    <select className={SUP_INPUT_STYLE} value={supplierForm.paymentTerm || 'COD'} onChange={e => onChange({...supplierForm, paymentTerm: e.target.value})}>
                                        <option value="COD">💵 COD (货到现金/即时转账 - Cash on Delivery)</option>
                                        <option value="7 Days">⏱️ 7 Days (周结 7 天)</option>
                                        <option value="15 Days">⏱️ 15 Days (半月结 15 天)</option>
                                        <option value="30 Days">📅 30 Days (月结 30 天)</option>
                                        <option value="45 Days">📅 45 Days (季中结 45 天)</option>
                                        <option value="60 Days">📅 60 Days (双月结 60 天)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Min Order Value (最低送货起免金额 RM)</label>
                                    <input 
                                        className={SUP_INPUT_STYLE} 
                                        type="number" 
                                        value={supplierForm.minOrderValue !== undefined ? supplierForm.minOrderValue : ''} 
                                        onChange={e => onChange({...supplierForm, minOrderValue: e.target.value ? Number(e.target.value) : undefined})} 
                                        placeholder="例如: 200 (免费送货门槛)" 
                                    />
                                </div>
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Rest Days & Order Cut-off (公休与截单日期)</label>
                                    <input className={SUP_INPUT_STYLE} value={supplierForm.restDayNote || ''} onChange={e => onChange({...supplierForm, restDayNote: e.target.value})} placeholder="例如: 逢周日公休，每日 22:00 截单" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className={SUP_LABEL_STYLE}>Delivery Schedule (常规备货配送排程)</label>
                                    <input className={SUP_INPUT_STYLE} value={supplierForm.deliverySchedule || ''} onChange={e => onChange({...supplierForm, deliverySchedule: e.target.value})} placeholder="例如: 每周一、三、五上午 09:00 前到店" />
                                </div>
                            </div>

                            {/* 🏦 收款银行账户拆分与多账户模块 */}
                            <div className="border border-amber-100 bg-amber-50/20 rounded-2xl p-4 md:p-5 mt-3">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-xs font-black text-amber-900 uppercase flex items-center gap-1.5">
                                        🏦 Bank Accounts (收款银行账户信息)
                                        <span className="text-[10px] text-amber-600 font-normal normal-case">(支持录入多个)</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={addBankAccount}
                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black flex items-center gap-1 active:scale-95 transition-all min-h-[32px] shadow-sm cursor-pointer"
                                    >
                                        ➕ 添加银行账户
                                    </button>
                                </div>

                                {bankAccounts.length === 0 ? (
                                    <div className="text-center py-4 bg-white/60 border border-dashed border-gray-200 rounded-xl">
                                        <p className="text-xs text-gray-400 font-bold">暂无收款银行信息，请点击右上角新增 🏦</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {bankAccounts.map((bank, idx) => (
                                            <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm relative group animate-in slide-in-from-top-2 duration-200">
                                                <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-gray-50">
                                                    <span className="text-[10px] font-mono font-black text-amber-700">账户 #{idx + 1}</span>
                                                    {bankAccounts.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeBankAccount(idx)}
                                                            className="text-red-500 hover:text-red-700 text-[10px] font-bold flex items-center gap-0.5 active:scale-95 cursor-pointer"
                                                        >
                                                            🗑️ 移除此账户
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-400 block mb-1">收款银行 (Bank Name)</label>
                                                        <input
                                                            className="w-full text-xs p-2.5 bg-gray-50 rounded-lg font-bold border border-transparent focus:border-amber-400 outline-none focus:bg-white transition-colors animate-none"
                                                            value={bank.bankName || ''}
                                                            onChange={e => handleBankChange(idx, 'bankName', e.target.value)}
                                                            placeholder="如: Public Bank / Maybank"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-400 block mb-1">收款专名/户名 (Account Name)</label>
                                                        <input
                                                            className="w-full text-xs p-2.5 bg-gray-50 rounded-lg font-bold border border-transparent focus:border-amber-400 outline-none focus:bg-white transition-colors animate-none"
                                                            value={bank.accountName || ''}
                                                            onChange={e => handleBankChange(idx, 'accountName', e.target.value)}
                                                            placeholder="如: HENG SENG SEA FOOD"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-400 block mb-1">银行帐号 (Account Number)</label>
                                                        <input
                                                            className="w-full text-xs p-2.5 bg-gray-50 rounded-lg font-mono font-bold border border-transparent focus:border-amber-400 outline-none focus:bg-white transition-colors animate-none"
                                                            value={bank.accountNo || ''}
                                                            onChange={e => handleBankChange(idx, 'accountNo', e.target.value)}
                                                            placeholder="如: 3123456789"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* section 4: 地理物理位置 & 补充备注 */}
                    <div className="border-t border-gray-100 pt-5">
                        <div className="text-xs font-black text-purple-800 uppercase tracking-widest mb-3 flex items-center gap-1.5 bg-purple-50 px-2.5 py-1 rounded-md w-fit">
                            <span>04 / 配送地址与补充备忘 (Logistics & Notes)</span>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className={SUP_LABEL_STYLE}>Physical Warehouse Address (实体提货/配送地址)</label>
                                <textarea className={`${SUP_INPUT_STYLE} h-20 resize-none`} value={supplierForm.address || ''} onChange={e => onChange({...supplierForm, address: e.target.value})} placeholder="输入完整地址，提供给送货司机，或支持店长一键导航提货..." />
                            </div>
                            <div>
                                <label className={SUP_LABEL_STYLE}>Special Terms & Remark Notes (结算流程/发票要求特别备注)</label>
                                <textarea className={`${SUP_INPUT_STYLE} h-16 resize-none`} value={supplierForm.note || ''} onChange={e => onChange({...supplierForm, note: e.target.value})} placeholder="如: 所有单据必须随货附带正本 Delivery Order，月尾需发 Email 对账单..." />
                            </div>
                        </div>
                    </div>

                    {/* Save Button */}
                    <button onClick={onSave} disabled={isSyncingName} className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-sm mt-4 flex justify-center items-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:bg-black active:scale-95 transition-all">
                        {isSyncingName ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} 保存并同步供应商档案 (Save Profile)
                    </button>
                </div>
            </div>
        </div>
    );
};
