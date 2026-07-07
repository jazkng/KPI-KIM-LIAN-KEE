// ============================================================================
// 👑 一次性迁移工具组件
// 路径建议：components/admin/PriceHistoryMigrationTool.tsx
// 
// 用法：临时挂在你的 OwnerMenu 或 SettingsModule 里，
//      跑完一次后可以直接删掉。
// ============================================================================

import React, { useState } from 'react';
import { Database, CheckCircle2, AlertTriangle, RefreshCw, X, Zap } from 'lucide-react';
import { DataManager } from '../../utils/dataManager';

interface Props {
    onClose: () => void;
}

export const PriceHistoryMigrationTool: React.FC<Props> = ({ onClose }) => {
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('准备就绪');
    const [result, setResult] = useState<{
        stockItems: number;
        totalEntries: number;
        logsScanned: number;
        errors: string[];
    } | null>(null);

    const handleRun = async () => {
        const confirmed = window.confirm(
            '⚠️ 即将执行价格历史回填\n\n' +
            '此操作会读取全部 inventory_logs 并写入 stock_price_history。\n' +
            '建议在低流量时段运行（例如打烊后）。\n\n' +
            '继续？'
        );
        if (!confirmed) return;

        setRunning(true);
        setDone(false);
        setResult(null);
        
        try {
            const res = await DataManager.migratePriceHistoryFromLogs(
                (current, total, label) => {
                    setProgress(current);
                    setStatusText(label);
                }
            );
            setResult(res);
            setDone(true);
        } catch (e) {
            alert('迁移失败: ' + (e as Error).message);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center md:p-4 backdrop-blur-sm">
            <div className="bg-white w-full h-full md:max-w-lg md:h-auto md:max-h-[90vh] md:rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                
                <div className="bg-[#1A1A1A] px-5 py-4 pt-[max(env(safe-area-inset-top,20px),1rem)] flex items-center justify-between text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#FFD700] text-black p-2.5 rounded-xl">
                            <Database size={20}/>
                        </div>
                        <div>
                            <h3 className="font-black text-lg">价格历史迁移</h3>
                            <p className="text-[9px] text-gray-400 font-mono uppercase mt-0.5 tracking-[0.2em]">
                                Price History Backfill
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center">
                        <X size={20}/>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    
                    {/* 说明卡片 */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-start gap-2 mb-2">
                            <Zap size={16} className="text-blue-600 mt-0.5 shrink-0"/>
                            <h4 className="font-black text-blue-900 text-sm">这个工具做什么？</h4>
                        </div>
                        <ul className="text-[11px] text-blue-800 font-bold space-y-1 ml-6 list-disc">
                            <li>读取全部 inventory_logs（你现有的进货记录）</li>
                            <li>按商品 ID 分组所有价格条目</li>
                            <li>批量写入 stock_price_history 子集合</li>
                            <li>一次跑完即可，之后新的进货会自动同步</li>
                        </ul>
                    </div>

                    {/* 成本预估 */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">
                            📊 Firestore 成本估算 Cost Estimate
                        </p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <p className="text-gray-500 font-bold">读取 Reads</p>
                                <p className="text-[#1A1A1A] font-black font-mono">~5000 次</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">≈ $0.003 USD</p>
                            </div>
                            <div>
                                <p className="text-gray-500 font-bold">写入 Writes</p>
                                <p className="text-[#1A1A1A] font-black font-mono">~150 次</p>
                                <p className="text-[9px] text-gray-400 mt-0.5">≈ $0.0003 USD</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-3 italic">
                            实际数字以你的数据库规模为准。整体成本 &lt; 0.01 USD。
                        </p>
                    </div>

                    {/* 进度条 */}
                    {(running || done) && (
                        <div className="bg-white border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-black text-gray-600">{statusText}</span>
                                <span className="text-xs font-black font-mono text-[#1A1A1A]">{progress}%</span>
                            </div>
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-[#FFD700] to-yellow-500 transition-all duration-300 rounded-full"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* 结果展示 */}
                    {done && result && (
                        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 animate-in slide-in-from-bottom-2">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 size={18} className="text-green-600"/>
                                <h4 className="font-black text-green-900 text-sm">迁移成功！</h4>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                <div className="bg-white p-2 rounded-lg text-center">
                                    <p className="text-[9px] font-bold text-gray-500 uppercase">扫描记录</p>
                                    <p className="text-base font-black font-mono text-green-700">{result.logsScanned}</p>
                                </div>
                                <div className="bg-white p-2 rounded-lg text-center">
                                    <p className="text-[9px] font-bold text-gray-500 uppercase">处理商品</p>
                                    <p className="text-base font-black font-mono text-green-700">{result.stockItems}</p>
                                </div>
                                <div className="bg-white p-2 rounded-lg text-center">
                                    <p className="text-[9px] font-bold text-gray-500 uppercase">写入条目</p>
                                    <p className="text-base font-black font-mono text-green-700">{result.totalEntries}</p>
                                </div>
                            </div>
                            {result.errors.length > 0 && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mt-2">
                                    <p className="text-[10px] font-black text-orange-700 mb-1">⚠️ 部分失败：</p>
                                    {result.errors.map((err, i) => (
                                        <p key={i} className="text-[10px] text-orange-600 font-mono">{err}</p>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-green-700 mt-3 italic">
                                ✅ 现在可以重新打开 Price Monitor 查看效果。
                            </p>
                        </div>
                    )}

                    {/* 操作按钮 */}
                    {!done && (
                        <button 
                            onClick={handleRun}
                            disabled={running}
                            className="w-full py-4 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform">
                            {running ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin"/>
                                    迁移中... ({progress}%)
                                </>
                            ) : (
                                <>
                                    <Database size={16}/>
                                    开始迁移 START MIGRATION
                                </>
                            )}
                        </button>
                    )}

                    {done && (
                        <button 
                            onClick={onClose}
                            className="w-full py-3 bg-green-500 text-white rounded-xl font-black text-sm">
                            完成 (Done)
                        </button>
                    )}

                    {/* 警告 */}
                    {!done && (
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex gap-2">
                            <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5"/>
                            <p className="text-[11px] text-orange-700 font-bold leading-relaxed">
                                此操作幂等可重跑。如已运行过，再跑会用新数据覆盖（不会重复条目）。<br/>
                                <span className="text-[10px] opacity-75">Idempotent. Safe to re-run.</span>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};