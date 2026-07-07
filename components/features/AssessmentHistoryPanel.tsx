import React, { useState, useEffect, useMemo } from 'react';
import { 
    TrendingUp, TrendingDown, Minus, Shield, 
    Clock, AlertTriangle, Trophy, Loader2, ChevronRight, BarChart3
} from 'lucide-react';
import { Employee, AssessmentRecordV2, QuarterKey } from '../../types';
import { DataManager } from '../../utils/dataManager';
import { JOB_METRICS, JobCategory } from './assessmentConfig'; // 💡 引入自动推导的 JobCategory
import { 
    getJobCategoryForEmployee, 
    formatQuarter,
    getTierByLabel,
    getQuarterFromDate,
    getEmployeeLevel
} from './assessmentUtils';
import { AssessmentForm } from './AssessmentForm';

interface AssessmentHistoryPanelProps {
    employee: Employee;
    currentEmployee?: Employee | null;  // 当前登录用户 (决定能否覆盖)
}

export const AssessmentHistoryPanel: React.FC<AssessmentHistoryPanelProps> = ({ 
    employee, currentEmployee 
}) => {
    const [records, setRecords] = useState<AssessmentRecordV2[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewingRecord, setViewingRecord] = useState<AssessmentRecordV2 | null>(null);

    // 💡 严格约束：确保寻址的 Key 绝对是 JobCategory 类型
    const category = getJobCategoryForEmployee(employee) as JobCategory;
    const jobDef = JOB_METRICS[category];

    const isRaterManagement = currentEmployee ? getEmployeeLevel(currentEmployee) === 2 : false;
    const isTargetLevel3 = getEmployeeLevel(employee) === 3;
    const isAccessRestricted = isRaterManagement && !isTargetLevel3;

    // ========================================================================
    // 加载此员工的所有评分历史
    // ========================================================================
    useEffect(() => {
        if (isAccessRestricted) {
            setLoading(false);
            return;
        }
        const load = async () => {
            setLoading(true);
            try {
                const data = await DataManager.getAssessmentRecordsByEmployee(employee.id);
                // 排序: 最新季度在前
                const sorted = (data as AssessmentRecordV2[]).sort(
                    (a, b) => (b.quarter || '').localeCompare(a.quarter || '')
                );
                setRecords(sorted);
            } catch (e) {
                console.error('Load assessment records failed:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [employee.id, isAccessRestricted]);

    // ========================================================================
    // 计算统计信息
    // ========================================================================
    const stats = useMemo(() => {
        if (isAccessRestricted || records.length === 0) return null;
        
        const latest = records[0];
        const previous = records.length > 1 ? records[1] : null;
        
        const avgScore = Math.round(
            records.reduce((sum, r) => sum + (r.finalScore || 0), 0) / records.length
        );
        
        // 走势: 最新 vs 上一次
        let trend: 'UP' | 'DOWN' | 'FLAT' | null = null;
        if (previous) {
            const diff = latest.finalScore - previous.finalScore;
            if (diff > 5) trend = 'UP';
            else if (diff < -5) trend = 'DOWN';
            else trend = 'FLAT';
        }
        
        // 连续 S 级 / 连续 C 级
        let consecutiveS = 0;
        let consecutiveC = 0;
        for (const r of records) {
            if (r.finalGrade === 'S') consecutiveS++;
            else break;
        }
        for (const r of records) {
            if (r.finalGrade === 'C') consecutiveC++;
            else break;
        }
        
        return { latest, previous, avgScore, trend, consecutiveS, consecutiveC };
    }, [records, isAccessRestricted]);

    // ========================================================================
    // 条形图数据 (近 6 季)
    // ========================================================================
    const chartData = useMemo(() => {
        if (isAccessRestricted) return [];
        const lastSix = records.slice(0, 6).reverse(); // 倒过来, 左边最早, 右边最新
        return lastSix.map(r => ({
            quarter: r.quarter,
            score: r.finalScore,
            grade: r.finalGrade,
            color: getTierByLabel(r.finalGrade).color,
            isOverridden: !!r.ownerOverride
        }));
    }, [records, isAccessRestricted]);

    const currentQuarter = getQuarterFromDate(new Date());

    // ========================================================================
    // Render: 权限限制
    // ========================================================================
    if (isAccessRestricted) {
        return null;
    }

    // ========================================================================
    // Render: 加载中
    // ========================================================================
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 size={24} className="animate-spin mr-2"/>
                <span className="text-xs font-bold">加载评分记录...</span>
            </div>
        );
    }

    // ========================================================================
    // Render: 无记录 / 状态保护 (过滤掉 stats 为 null 的情况)
    // ========================================================================
    if (records.length === 0 || !stats) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 min-h-[180px]">
                <div className="bg-white p-4 rounded-full shadow-sm mb-3 border border-gray-100">
                    <Trophy size={28} className="text-gray-300"/>
                </div>
                <span className="text-sm font-black text-gray-500">暂无评分记录</span>
                <span className="text-[10px] text-gray-400 mt-1 font-bold bg-white px-2 py-0.5 rounded border border-gray-100">
                    请到「季度评测」模块评分
                </span>
                {jobDef && (
                    <span className="text-[10px] text-gray-400 mt-2 font-bold">
                        岗位: {jobDef.emoji} {jobDef.label}
                    </span>
                )}
            </div>
        );
    }

    // ========================================================================
    // 💡 彻底消灭 `stats!.` ，采用优雅的安全解构
    // 因为上面的 if (!stats) 已经拦截了 null，TypeScript 确信这里 stats 绝对有值
    // ========================================================================
    const { latest, avgScore, trend, consecutiveS, consecutiveC } = stats;
    const latestTier = getTierByLabel(latest.finalGrade);

    return (
        <div className="space-y-4">
            
            {/* 最新季度结果卡 */}
            <div 
                className={`p-4 rounded-2xl border-2 cursor-pointer active:scale-[0.99] transition-all ${latestTier.color}`}
                onClick={() => setViewingRecord(latest)}
            >
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                            {formatQuarter(latest.quarter)}
                        </span>
                        {latest.quarter === currentQuarter && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/50 uppercase">
                                本季
                            </span>
                        )}
                        {latest.ownerOverride && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase flex items-center gap-0.5">
                                <Shield size={9}/> 老板覆盖
                            </span>
                        )}
                    </div>
                    <ChevronRight size={16} className="opacity-50"/>
                </div>
                
                <div className="flex items-end justify-between">
                    <div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black leading-none">{latest.finalGrade}</span>
                            <span className="text-sm font-mono font-black opacity-70">{latest.finalScore}/100</span>
                        </div>
                        <p className="text-[11px] font-bold mt-1 opacity-80 leading-tight">
                            {latestTier.desc} · {latestTier.decision}
                        </p>
                    </div>
                    {trend && (
                        <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${
                            trend === 'UP' ? 'bg-green-100 text-green-700' :
                            trend === 'DOWN' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                            {trend === 'UP' && <><TrendingUp size={11}/> 上升</>}
                            {trend === 'DOWN' && <><TrendingDown size={11}/> 下降</>}
                            {trend === 'FLAT' && <><Minus size={11}/> 持平</>}
                        </div>
                    )}
                </div>
            </div>

            {/* 连续性徽章 */}
            {(consecutiveS >= 2 || consecutiveC >= 2) && (
                <div className="grid grid-cols-1 gap-2">
                    {consecutiveS >= 2 && (
                        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-yellow-400 text-white flex items-center justify-center shrink-0 shadow-md">
                                <Trophy size={16}/>
                            </div>
                            <div>
                                <p className="text-xs font-black text-amber-900">🌟 连续 {consecutiveS} 季 S 级</p>
                                <p className="text-[10px] font-bold text-amber-700">建议: 加薪候选 · 考虑升职</p>
                            </div>
                        </div>
                    )}
                    {consecutiveC >= 2 && (
                        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                <AlertTriangle size={16}/>
                            </div>
                            <div>
                                <p className="text-xs font-black text-red-900">⚠️ 连续 {consecutiveC} 季 C 级</p>
                                <p className="text-[10px] font-bold text-red-700">建议: 关注名单 · 考虑辅导或调岗</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 条形图走势 */}
            {chartData.length >= 2 && (
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 size={14} className="text-gray-400"/>
                        <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            近 {chartData.length} 季度走势
                        </h5>
                        <span className="ml-auto text-[10px] font-bold text-gray-400">
                            平均 <span className="text-[#1A1A1A] font-black">{avgScore}</span>
                        </span>
                    </div>
                    
                    <div className="flex items-end gap-1.5 h-28 px-1">
                        {chartData.map((d, idx) => {
                            const heightPct = (d.score / 100) * 100;
                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1 group cursor-pointer" onClick={() => {
                                    const rec = records.find(r => r.quarter === d.quarter);
                                    if (rec) setViewingRecord(rec);
                                }}>
                                    {/* Grade 字母 */}
                                    <div className="text-[10px] font-black text-gray-600">{d.grade}</div>
                                    {/* Bar */}
                                    <div 
                                        className={`w-full rounded-t-md border-2 ${d.color} transition-all group-hover:opacity-80 relative`}
                                        style={{ height: `${Math.max(heightPct, 8)}%` }}
                                    >
                                        {d.isOverridden && (
                                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center shadow">
                                                <Shield size={6} className="text-white"/>
                                            </div>
                                        )}
                                    </div>
                                    {/* 分数 */}
                                    <div className="text-[9px] font-mono font-bold text-gray-500">{d.score}</div>
                                    {/* 季度 */}
                                    <div className="text-[8px] font-black text-gray-400 uppercase">
                                        {d.quarter.split('-')[1]}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[9px] text-gray-400 font-bold text-center mt-2">
                        点击柱子查看详情
                    </p>
                </div>
            )}

            {/* 历史列表 */}
            {records.length > 1 && (
                <details className="group">
                    <summary className="text-[10px] font-bold text-gray-400 cursor-pointer flex items-center gap-1 hover:text-gray-600 uppercase tracking-widest">
                        <Clock size={11}/>
                        <span>历史记录 ({records.length} 次)</span>
                    </summary>
                    <div className="mt-2 space-y-1.5">
                        {records.map(r => {
                            const tier = getTierByLabel(r.finalGrade);
                            return (
                                <button 
                                    key={r.id}
                                    onClick={() => setViewingRecord(r)}
                                    className="w-full flex items-center justify-between p-2.5 bg-white hover:bg-gray-50 rounded-lg border border-gray-100 text-left transition-colors active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border ${tier.color} shrink-0`}>
                                            {r.finalGrade}
                                        </div>
                                        <div>
                                            <div className="text-xs font-black text-[#1A1A1A]">{formatQuarter(r.quarter)}</div>
                                            <div className="text-[9px] text-gray-400 font-bold">
                                                {r.initialRating?.raterName || '无初评分'}
                                                {r.ownerOverride && ` → 老板覆盖`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-mono font-black text-[#1A1A1A]">{r.finalScore}</span>
                                        <ChevronRight size={14} className="text-gray-300"/>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </details>
            )}

            {/* 评分只读详情 (复用 AssessmentForm VIEW 模式) */}
            {viewingRecord && currentEmployee && (
                <AssessmentForm
                    employee={employee}
                    currentEmployee={currentEmployee}
                    quarter={viewingRecord.quarter as QuarterKey}
                    existingRecord={viewingRecord}
                    onClose={() => setViewingRecord(null)}
                    onSaved={(updated) => {
                        setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
                        setViewingRecord(null);
                    }}
                />
            )}
        </div>
    );
};