import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, Save, ArrowLeft, Award, AlertTriangle, 
    CheckCircle2, Loader2, PenLine, Edit3, Shield, Clock,
    HelpCircle, Check, MessageSquare, Flame, BookOpen, Users,
    Zap, Sparkles, Target, Star
} from 'lucide-react';
import { Employee, QuarterKey, AssessmentRecordV2, MetricScoreV2 } from '../../types';
import { 
    JOB_METRICS, GRADE_TIERS, MetricDef, 
    MANAGEMENT_DIMENSIONS, EMPLOYEE_DIMENSIONS,
    JOB_CAPABILITY_SUBITEMS, MENTORSHIP_SUBITEMS, STRESS_SUBITEMS, TEAMWORK_SUBITEMS, PERSONAL_GROOMING_SUBITEMS,
    getQuestionsForMetric, FactQuestion, FactOption 
} from './assessmentConfig'; // 💡 引入 MetricDef 和客观事实问答函数
import { 
    getJobCategoryForEmployee, 
    formatQuarter, 
    getQuarterMonthRange,
    calculateOverallScore,
    getGradeFromScore,
    gradeToScore,
    getTierByLabel,
    calculateMultiRaterTotals,
    getFinalScoreFromRecord
} from './assessmentUtils';
import { DataManager } from '../../utils/dataManager';

interface AssessmentFormProps {
    employee: Employee;
    currentEmployee: Employee;
    quarter: QuarterKey;
    existingRecord?: AssessmentRecordV2 | null;
    onClose: () => void;
    onSaved: (record: AssessmentRecordV2) => void;
}

type FormMode = 'VIEW' | 'EDIT';
// 💡 统一档位类型
type GradeLabel = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

// ============================================================================
// 主组件
// ============================================================================

export const AssessmentForm: React.FC<AssessmentFormProps> = ({ 
    employee, currentEmployee, quarter, existingRecord, onClose, onSaved 
}) => {
    const category = getJobCategoryForEmployee(employee);
    const jobDef = JOB_METRICS[category];
    const isManagement = category === 'KITCHEN_HEAD' || category === 'FLOOR_MANAGER';
    const metrics: MetricDef[] = isManagement ? MANAGEMENT_DIMENSIONS : EMPLOYEE_DIMENSIONS;

    // ============================================================================
    // Mode: 已有记录 → 先只读, 无记录 → 直接编辑
    // ============================================================================
    const [mode, setMode] = useState<FormMode>(existingRecord ? 'VIEW' : 'EDIT');
    
    // 判断当前登录者是不是初评人本人 (本人可编辑自己的初评)
    const isInitialRater = existingRecord?.initialRating?.raterId === currentEmployee.id;
    const isOwnerRater = currentEmployee.rank === 'TOP' || currentEmployee.role.includes('Owner') || currentEmployee.role.includes('老板');
    
    // ⭐ 新增：老板是否选择跳过评分 (默认为 false, 如果之前保存过 skipped 则加载)
    const [isSkipped, setIsSkipped] = useState<boolean>(() => {
        if (isOwnerRater && existingRecord) {
            return !!existingRecord.bossRatings?.[currentEmployee.id]?.skipped;
        }
        return false;
    });

    // ⭐ 新增：老板整体备注说明
    const [bossComment, setBossComment] = useState<string>(() => {
        if (isOwnerRater && existingRecord) {
            return existingRecord.bossRatings?.[currentEmployee.id]?.comment || '';
        }
        return '';
    });

    // ============================================================================
    // State: 4 项指标的评分
    // ============================================================================
    const [scores, setScores] = useState<Record<string, MetricScoreV2>>(() => {
        const initial: Record<string, MetricScoreV2> = {};
        if (existingRecord) {
            let source = null;
            if (isOwnerRater) {
                // 如果当前老板已经打过分且未跳过，加载其个人的老板评分指标
                const myRating = existingRecord.bossRatings?.[currentEmployee.id];
                if (myRating && !myRating.skipped && myRating.metrics?.length > 0) {
                    source = myRating.metrics;
                } else if (existingRecord.initialRating?.metrics) {
                    // 如果自己还没打过分，可以拿管理层初评的指标作为辅助底稿 prefill 方便老板微调
                    source = existingRecord.initialRating.metrics;
                }
            } else if (existingRecord.initialRating?.metrics) {
                source = existingRecord.initialRating.metrics;
            }
            
            if (source) {
                source.forEach(m => { initial[m.metricKey] = { ...m }; });
            }
        }
        metrics.forEach(m => {
            if (!initial[m.key]) {
                // 💡 修复 as any，严格遵守 GradeLabel
                initial[m.key] = { metricKey: m.key, grade: 'B' as GradeLabel, score: 0, note: '' };
            }
        });
        return initial;
    });
    
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [touched, setTouched] = useState(false);

    // Global Translation States
    const [translatedBundle, setTranslatedBundle] = useState<Record<string, string> | null>(() => {
        try {
            const cached = localStorage.getItem(`translation_cache_${category}`);
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            return null;
        }
    });
    const [isTranslatingAll, setIsTranslatingAll] = useState(false);
    const [isTranslationActive, setIsTranslationActive] = useState<boolean>(() => {
        try {
            return localStorage.getItem('translation_preference_active') === 'true';
        } catch (e) {
            return false;
        }
    });

    const makeBundleToTranslate = () => {
        const bundle: Record<string, string> = {};
        
        // 1. Dimensions
        metrics.forEach(m => {
            bundle[`metric_label_${m.key}`] = m.label;
            bundle[`metric_desc_${m.key}`] = m.desc;
            
            // 2. Objective Fact Questions
            const questions = getQuestionsForMetric(m.key, m.label);
            questions.forEach(q => {
                bundle[`q_question_${m.key}_${q.id}`] = q.question;
                q.options.forEach((opt, oIdx) => {
                    bundle[`q_option_${m.key}_${q.id}_${oIdx}`] = opt.label;
                });
            });
        });
        
        // 3. Static direct rating strings
        const staticOptions = [
            '积极表率并极速无条件执行；为全店核心骨干，不打折扣地迅速落地',
            '执行力强，态度积极，无怨言，符合品牌对核心人才的高标准',
            '服从安排与调度，保质保量并按期完成岗位交办的本职工作',
            '态度中立或偏消极，执行较缓慢，偶有怨言，需要管理层反复催促',
            '服从度低，公开或消极抗拒调配、新政策，甚至出现顶撞决策行为',
            '5分 (极好)', '完美模范',
            '4分 (优秀)', '优秀突出',
            '3分 (合格)', '合格达标',
            '2分 (中等)', '待改进项',
            '1分 (较差)', '极差警告'
        ];
        staticOptions.forEach((text, idx) => {
            bundle[`static_opt_${idx}`] = text;
        });

        // 4. Subitems
        const subitemsList = [
            ...PERSONAL_GROOMING_SUBITEMS,
            ...(MENTORSHIP_SUBITEMS[category] || MENTORSHIP_SUBITEMS['FLOOR_MANAGER'] || []),
            ...(STRESS_SUBITEMS || []),
            ...(TEAMWORK_SUBITEMS[category] || TEAMWORK_SUBITEMS['UNKNOWN'] || []),
            ...(JOB_CAPABILITY_SUBITEMS[category] || [])
        ];
        subitemsList.forEach(item => {
            bundle[`subitem_label_${item.key}`] = item.label;
            bundle[`subitem_desc_${item.key}`] = item.desc;
        });

        return bundle;
    };

    // Auto-translate if preference is active but cache is missing
    useEffect(() => {
        if (isTranslationActive && !translatedBundle && !isTranslatingAll) {
            const autoTranslate = async () => {
                setIsTranslatingAll(true);
                try {
                    const bundle = makeBundleToTranslate();
                    const res = await fetch('/api/gemini/translate-card', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bundle })
                    });
                    if (!res.ok) throw new Error('Global translation failed');
                    const data = await res.json();
                    if (data && typeof data === 'object') {
                        setTranslatedBundle(data);
                        try {
                            localStorage.setItem(`translation_cache_${category}`, JSON.stringify(data));
                        } catch (e) {
                            console.error('Failed to save translation to localStorage:', e);
                        }
                    } else {
                        throw new Error('Invalid translation response');
                    }
                } catch (err) {
                    console.error('Background translation failed:', err);
                } finally {
                    setIsTranslatingAll(false);
                }
            };
            autoTranslate();
        }
    }, [isTranslationActive, category]);

    const handleToggleAllTranslation = async () => {
        if (isTranslationActive) {
            setIsTranslationActive(false);
            try {
                localStorage.setItem('translation_preference_active', 'false');
            } catch (e) {}
            return;
        }

        try {
            localStorage.setItem('translation_preference_active', 'true');
        } catch (e) {}

        if (translatedBundle) {
            setIsTranslationActive(true);
            return;
        }

        setIsTranslatingAll(true);
        try {
            const bundle = makeBundleToTranslate();
            const res = await fetch('/api/gemini/translate-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bundle })
            });
            if (!res.ok) throw new Error('Global translation failed');
            const data = await res.json();
            if (data && typeof data === 'object') {
                setTranslatedBundle(data);
                try {
                    localStorage.setItem(`translation_cache_${category}`, JSON.stringify(data));
                } catch (e) {
                    console.error('Failed to save translation to localStorage:', e);
                }
                setIsTranslationActive(true);
            } else {
                throw new Error('Invalid translation response');
            }
        } catch (err) {
            console.error(err);
            alert('全面 AI 翻译失败，请稍后重试。/ Global AI translation failed.');
        } finally {
            setIsTranslatingAll(false);
        }
    };
    
    // ⭐ 3C: 老板覆盖原因流程 (旧)
    const [showOverrideReasonModal, setShowOverrideReasonModal] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');

    // ============================================================================
    // 💡 自适应客观计算法 (Fact-Based Objective Mode) 状态与逻辑
    // ============================================================================
    const [ratingMode, setRatingMode] = useState<'FACT' | 'DIRECT'>('FACT');
    
    const [selectedAnswers, setSelectedAnswers] = useState<Record<string, Record<string, FactOption>>>(() => {
        const initial: Record<string, Record<string, FactOption>> = {};
        
        // 自动解析已有的备注文字，高还原已有的选项勾选状态
        metrics.forEach(m => {
            const currentScore = scores[m.key];
            if (currentScore && currentScore.note && currentScore.note.includes('【客观事实评估证据】')) {
                const lines = currentScore.note.split('\n');
                const metricQuestions = getQuestionsForMetric(m.key, m.label);
                const answerMap: Record<string, FactOption> = {};
                
                lines.forEach(line => {
                    metricQuestions.forEach(q => {
                        const qPart = q.question.replace(/\?|？/g, '').substring(0, 10);
                        if (line.includes(qPart)) {
                            q.options.forEach(opt => {
                                if (line.includes(`${opt.label} (`)) {
                                    answerMap[q.id] = opt;
                                }
                            });
                        }
                    });
                });
                
                if (Object.keys(answerMap).length > 0) {
                    initial[m.key] = answerMap;
                }
            }
        });
        
        return initial;
    });

    const handleSelectFactAnswer = (metricKey: string, questionId: string, option: FactOption) => {
        setTouched(true);
        setSelectedAnswers(prev => {
            const nextMetricAnswers = {
                ...(prev[metricKey] || {}),
                [questionId]: option
            };
            const next = { ...prev, [metricKey]: nextMetricAnswers };
            
            const questions = getQuestionsForMetric(metricKey, metrics.find(m => m.key === metricKey)?.label || metricKey);
            const answeredCount = Object.keys(nextMetricAnswers).length;
            
            // 计算客观事实平均分
            const totalScore = Object.values(nextMetricAnswers).reduce((sum, opt) => sum + opt.score, 0);
            const avgScore = Math.round(totalScore / answeredCount);
            const calculatedGrade = getGradeFromScore(avgScore).label as GradeLabel;
            
            // 自动生成无法推诿的客观证据摘要
            const factualSummary = `【客观事实评估证据】\n` + 
                questions.map((q, i) => {
                    const ans = nextMetricAnswers[q.id];
                    return `${i + 1}. ${q.question.replace(/\?|？/g, '')}：${ans ? `${ans.label} (${ans.grade}档, ${ans.score}分)` : '（未勾选）'}`;
                }).join('\n');

            setScores(oldScores => ({
                ...oldScores,
                [metricKey]: {
                    metricKey,
                    grade: calculatedGrade,
                    score: avgScore,
                    note: factualSummary
                }
            }));

            return next;
        });
    };

    // ============================================================================
    // iOS: 锁定 body 滚动
    // ============================================================================
    useEffect(() => {
        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        return () => {
            const savedY = document.body.style.top;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, parseInt(savedY || '0') * -1);
        };
    }, []);

    // ============================================================================
    // 实时综合分
    // ============================================================================
    const overallStats = useMemo(() => {
        const targetCount = metrics.length;

        const filled = metrics
            .map(m => scores[m.key])
            .filter(s => s && s.score > 0);

        if (filled.length === 0) return { score: 0, grade: null, allFilled: false, filledCount: 0 };
        const sum = filled.reduce((acc, s) => acc + s.score, 0);
        const avg = Math.round(sum / filled.length);
        return { 
            score: avg, 
            grade: getGradeFromScore(avg), 
            allFilled: filled.length === targetCount,
            filledCount: filled.length
        };
    }, [scores, metrics]);

    // ============================================================================
    // 校验
    // ============================================================================
    const validation = useMemo(() => {
        if (isOwnerRater && isSkipped) {
            return {
                canSubmit: true,
                missing: [],
                missingNotes: []
            };
        }
        const missing: string[] = [];
        const missingNotes: string[] = [];
        metrics.forEach(m => {
            const s = scores[m.key];
            if (!s || s.score === 0) missing.push(m.label);
            else if ((s.grade === 'C' || s.grade === 'D') && (!s.note || s.note.trim().length === 0)) missingNotes.push(m.label);
        });
        return {
            canSubmit: missing.length === 0 && missingNotes.length === 0,
            missing, missingNotes
        };
    }, [scores, metrics, isOwnerRater, isSkipped]);

    // ============================================================================
    // Handlers
    // ============================================================================
    const handleSelectGrade = (metricKey: string, grade: GradeLabel) => {
        setTouched(true);
        setScores(prev => ({
            ...prev,
            [metricKey]: {
                metricKey, grade,
                score: gradeToScore(grade),
                note: prev[metricKey]?.note || ''
            }
        }));
    };

    const handleNoteChange = (metricKey: string, note: string) => {
        setScores(prev => ({
            ...prev,
            [metricKey]: { ...prev[metricKey], note }
        }));
    };

    const handleToggleSkipMetric = (metricKey: string, skipped: boolean) => {
        setTouched(true);
        if (skipped) {
            setScores(prev => ({
                ...prev,
                [metricKey]: {
                    metricKey,
                    grade: 'B',
                    score: 0,
                    skipped: true,
                    note: '【老板选择跳过此项评分】'
                }
            }));
        } else {
            setScores(prev => {
                const copy = { ...prev };
                delete copy[metricKey];
                return copy;
            });
        }
    };

    const handleEnterEdit = () => {
        setMode('EDIT');
    };

    const handleSubmit = async () => {
        if (!validation.canSubmit) {
            if (validation.missing.length > 0) {
                setErrorMsg(`还有 ${validation.missing.length} 项未评: ${validation.missing.join('、')}`);
            } else if (validation.missingNotes.length > 0) {
                setErrorMsg(`C 档必须说明原因: ${validation.missingNotes.join('、')}`);
            }
            return;
        }
        
        setSaving(true);
        setErrorMsg('');
        
        try {
            const raterRank = currentEmployee.rank || 'CREW';
            const now = new Date().toISOString();
            
            const metricsArray: MetricScoreV2[] = metrics.map(m => {
                const s = scores[m.key];
                return {
                    metricKey: m.key,
                    grade: s.grade,
                    score: s.score,
                    note: s.note?.trim() || ""
                };
            });
            
            const overallScore = calculateOverallScore(metricsArray);
            
            let record: AssessmentRecordV2;
            
            if (isOwnerRater) {
                // ⭐ 老板（TOP）独立评分/跳过场景
                const bossRatingDetail = {
                    ownerId: currentEmployee.id,
                    ownerName: currentEmployee.name,
                    date: now,
                    metrics: isSkipped ? [] : metricsArray,
                    overallScore: isSkipped ? 0 : overallScore,
                    skipped: isSkipped,
                    comment: bossComment.trim() || ""
                };
                
                const existingBossRatings = existingRecord?.bossRatings || {};
                const updatedBossRatings = {
                    ...existingBossRatings,
                    [currentEmployee.id]: bossRatingDetail
                };
                
                if (existingRecord) {
                    record = {
                        ...existingRecord,
                        bossRatings: updatedBossRatings
                    };
                } else {
                    record = {
                        id: `${employee.id}_${quarter}`,
                        quarter,
                        employeeId: employee.id,
                        employeeName: employee.name,
                        jobCategory: category,
                        bossRatings: updatedBossRatings,
                        finalScore: 0, // 稍后通过 calculateMultiRaterTotals 重新计算
                        finalGrade: 'B', // 稍后重新计算
                        status: 'OVERRIDDEN'
                    };
                }
                
                // 重新计算最终综合成绩与等级
                const totals = calculateMultiRaterTotals(record);
                record.finalScore = totals.finalScore;
                record.finalGrade = getGradeFromScore(totals.finalScore).label as GradeLabel;
                record.status = 'OVERRIDDEN';
                
            } else {
                // ⭐ 管理层初评场景
                const initialRatingDetail = {
                    raterId: currentEmployee.id,
                    raterName: currentEmployee.name,
                    raterRank,
                    date: now,
                    metrics: metricsArray,
                    overallScore
                };
                
                if (existingRecord) {
                    record = {
                        ...existingRecord,
                        initialRating: initialRatingDetail
                    };
                } else {
                    record = {
                        id: `${employee.id}_${quarter}`,
                        quarter,
                        employeeId: employee.id,
                        employeeName: employee.name,
                        jobCategory: category,
                        initialRating: initialRatingDetail,
                        finalScore: overallScore,
                        finalGrade: getGradeFromScore(overallScore).label as GradeLabel,
                        status: 'SUBMITTED'
                    };
                }
                
                // 重新计算最终综合成绩与等级 (合并已有的老板评分)
                const totals = calculateMultiRaterTotals(record);
                record.finalScore = totals.finalScore;
                record.finalGrade = getGradeFromScore(totals.finalScore).label as GradeLabel;
                if (record.bossRatings && Object.keys(record.bossRatings).length > 0) {
                    record.status = 'OVERRIDDEN';
                } else {
                    record.status = 'SUBMITTED';
                }
            }
            
            await DataManager.saveAssessmentRecord(record);
            onSaved(record);
        } catch (e: any) {
            console.error('Save failed:', e);
            setErrorMsg(`保存失败: ${e.message || '网络错误，请重试'}`);
        } finally {
            setSaving(false);
        }
    };

    // ============================================================================
    // Render: 岗位未配置
    // ============================================================================
    if (!jobDef || !jobDef.assessable || metrics.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white w-full max-w-md rounded-[2rem] p-8 shadow-2xl text-center">
                    <AlertTriangle size={40} className="mx-auto text-orange-500 mb-4"/>
                    <h3 className="font-black text-xl text-[#1A1A1A] mb-2">无法评分</h3>
                    <p className="text-sm text-gray-500 font-bold mb-6">
                        {employee.name} 的岗位（{employee.role}）未配置评分指标，或已被豁免。
                    </p>
                    <button 
                        onClick={onClose} 
                        className="w-full py-3 bg-[#1A1A1A] text-[#FFD700] rounded-xl font-black shadow-lg active:scale-95"
                        style={{ minHeight: '48px', WebkitTapHighlightColor: 'transparent' }}
                    >
                        返回
                    </button>
                </div>
            </div>
        );
    }

    // ============================================================================
    // Render: 主界面
    // ============================================================================
    return (
        <div 
            className="fixed inset-0 bg-black/90 z-[110] flex flex-col backdrop-blur-sm animate-in fade-in duration-200"
            style={{ touchAction: 'manipulation' }}
        >
            <div className="bg-[#F5F7FA] w-full h-full md:max-w-2xl md:mx-auto md:my-4 md:rounded-[2.5rem] md:h-[calc(100vh-2rem)] flex flex-col overflow-hidden shadow-2xl relative">
                
                {/* ========== Header ========== */}
                <div 
                    className="bg-[#1A1A1A] text-white shrink-0 border-b-4 border-[#FFD700]"
                    style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
                >
                    <div className="flex items-center gap-3 px-4 pb-4 md:px-5 md:pb-5">
                        <button 
                            onClick={onClose} 
                            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors shrink-0"
                            style={{ 
                                minHeight: '44px', minWidth: '44px',
                                WebkitTapHighlightColor: 'transparent'
                            }}
                        >
                            <ArrowLeft size={22}/>
                        </button>
                        
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-11 h-11 rounded-full bg-gray-200 flex items-center justify-center font-black text-gray-400 overflow-hidden border-2 border-[#FFD700] shrink-0">
                                {employee.avatar 
                                    ? <img src={employee.avatar} className="w-full h-full object-cover"/> 
                                    : employee.name.charAt(0)
                                }
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-black text-base md:text-lg truncate">{employee.name}</h3>
                                <p className="text-[10px] md:text-xs text-[#FFD700] font-bold truncate">
                                    {jobDef.emoji} {jobDef.label}
                                </p>
                            </div>
                        </div>
                        
                        {/* Mode Badge & AI Translation */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            {mode === 'VIEW' && (
                                <div className="px-2 py-1 bg-white/10 rounded-lg text-[10px] font-black text-white/80 uppercase tracking-widest">
                                    只读
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleToggleAllTranslation}
                                disabled={isTranslatingAll}
                                className={`px-2.5 py-1.5 rounded-xl text-[10px] md:text-xs font-black transition-all flex items-center gap-1 ${
                                    isTranslationActive
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
                                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                                }`}
                                style={{ minHeight: '32px' }}
                            >
                                {isTranslatingAll ? (
                                    <>⏳ 翻译中...</>
                                ) : isTranslationActive ? (
                                    <>🇲🇲 切换中文</>
                                ) : (
                                    <>🇲🇲 缅甸文 AI 翻译</>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {/* 季度信息 */}
                    <div className="px-4 md:px-5 pb-3 flex items-center gap-2 text-[10px] md:text-xs font-bold text-white/60">
                        <Award size={12} className="text-[#FFD700]"/>
                        <span>{formatQuarter(quarter)} · 评测 {getQuarterMonthRange(quarter)} 表现</span>
                    </div>
                </div>

                {/* ========== Content ========== */}
                {mode === 'VIEW' && existingRecord ? (
                    <ViewModeContent 
                        record={existingRecord}
                        metrics={metrics}
                        isTranslationActive={isTranslationActive}
                        translatedBundle={translatedBundle}
                    />
                ) : (
                    <EditModeContent 
                        metrics={metrics}
                        scores={scores}
                        touched={touched}
                        errorMsg={errorMsg}
                        onSelectGrade={handleSelectGrade}
                        onNoteChange={handleNoteChange}
                        isOwnerRater={isOwnerRater}
                        isSkipped={isSkipped}
                        setIsSkipped={setIsSkipped}
                        bossComment={bossComment}
                        setBossComment={setBossComment}
                        ratingMode={ratingMode}
                        setRatingMode={setRatingMode}
                        selectedAnswers={selectedAnswers}
                        onSelectFactAnswer={handleSelectFactAnswer}
                        employee={employee}
                        onToggleSkipMetric={handleToggleSkipMetric}
                        isTranslationActive={isTranslationActive}
                        translatedBundle={translatedBundle}
                    />
                )}

                {/* ========== Sticky Footer ========== */}
                <div 
                    className="bg-white border-t border-gray-200 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
                    style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
                >
                    <div className="px-4 md:px-6 pt-3 pb-3">
                        
                        {/* 综合分预览 */}
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">综合分</p>
                                <div className="flex items-baseline gap-2 mt-0.5">
                                    <span className="text-3xl font-black text-[#1A1A1A] font-mono">
                                        {overallStats.score}
                                    </span>
                                    <span className="text-xs text-gray-400 font-bold">/ 120</span>
                                    {overallStats.grade && overallStats.allFilled && (
                                        <span className={`ml-2 px-2 py-0.5 rounded-lg text-xs font-black border ${overallStats.grade.color}`}>
                                            {overallStats.grade.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">进度</p>
                                <p className="text-lg font-black text-[#1A1A1A] font-mono mt-0.5">
                                    {overallStats.filledCount} / {metrics.length}
                                </p>
                            </div>
                        </div>
                        
                        {/* 底部按钮: 根据 mode 切换 */}
                        {mode === 'VIEW' ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={onClose}
                                    className="py-4 rounded-2xl font-black text-base bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-[0.98] transition-all"
                                    style={{ 
                                        minHeight: '56px',
                                        WebkitTapHighlightColor: 'transparent'
                                    }}
                                >
                                    关闭
                                </button>
                                <button 
                                    onClick={handleEnterEdit}
                                    className="py-4 rounded-2xl font-black text-base bg-[#1A1A1A] text-[#FFD700] hover:bg-black active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-2"
                                    style={{ 
                                        minHeight: '56px',
                                        WebkitTapHighlightColor: 'transparent'
                                    }}
                                >
                                    <Edit3 size={18}/>
                                    {isOwnerRater ? '进入老板评分/意见' : '修改初评'}
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={handleSubmit}
                                disabled={saving || !validation.canSubmit}
                                className={`w-full py-4 rounded-2xl font-black text-base shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                                    validation.canSubmit && !saving
                                        ? 'bg-[#1A1A1A] text-[#FFD700] hover:bg-black'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                                style={{ 
                                    minHeight: '56px',
                                    WebkitTapHighlightColor: 'transparent',
                                    touchAction: 'manipulation'
                                }}
                            >
                                {saving ? (
                                    <><Loader2 size={20} className="animate-spin"/>保存中...</>
                                ) : validation.canSubmit ? (
                                    <><Save size={20}/>{existingRecord ? '保存修改' : '提交评测'}</>
                                ) : (
                                    <>{validation.missing.length > 0 
                                        ? `还有 ${validation.missing.length} 项未评` 
                                        : `${validation.missingNotes.length} 个 C 档需填原因`}</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
                
                {/* ⭐ 3C: 覆盖原因 Modal */}
                {showOverrideReasonModal && (
                    <OverrideReasonModal
                        initialReason={overrideReason}
                        onConfirm={(reason) => {
                            setOverrideReason(reason);
                            setShowOverrideReasonModal(false);
                            setMode('EDIT');
                        }}
                        onCancel={() => {
                            setShowOverrideReasonModal(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
};

// ============================================================================
// 覆盖原因 Modal
// ============================================================================

interface OverrideReasonModalProps {
    initialReason: string;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
}

const OverrideReasonModal: React.FC<OverrideReasonModalProps> = ({ 
    initialReason, onConfirm, onCancel 
}) => {
    const [reason, setReason] = useState(initialReason);
    const canConfirm = reason.trim().length > 0;
    
    return (
        <div 
            className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in"
            onClick={onCancel}
        >
            <div 
                className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95"
                onClick={e => e.stopPropagation()}
                style={{ 
                    marginTop: 'env(safe-area-inset-top)', 
                    marginBottom: 'env(safe-area-inset-bottom)'
                }}
            >
                {/* Header */}
                <div className="bg-purple-600 text-white p-5 text-center">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Shield size={24}/>
                    </div>
                    <h3 className="font-black text-lg">覆盖他人评分</h3>
                    <p className="text-[11px] text-white/80 font-bold mt-1">
                        ⚠️ 此操作将记入系统永久轨迹
                    </p>
                </div>
                
                {/* Body */}
                <div className="p-5">
                    <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-widest mb-2">
                        覆盖原因 <span className="text-red-600">*必填</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="例如：初评偏高，实际出品不稳定。近 1 个月有 3 次客诉相关..."
                        rows={5}
                        autoFocus
                        className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold text-sm resize-none outline-none focus:border-purple-500 focus:bg-white transition-colors"
                        style={{ fontSize: '16px', minHeight: '120px' }}
                    />
                    <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-gray-400 font-bold">
                            💡 初评人和员工本人都能看到此原因
                        </p>
                        <p className={`text-[10px] font-mono font-black ${reason.trim().length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {reason.length} 字
                        </p>
                    </div>
                </div>
                
                {/* Footer */}
                <div 
                    className="grid grid-cols-2 gap-2 p-4 bg-gray-50 border-t border-gray-100"
                    style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
                >
                    <button 
                        onClick={onCancel}
                        className="py-3.5 rounded-xl font-black text-sm bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 active:scale-[0.98] transition-all"
                        style={{ minHeight: '48px', WebkitTapHighlightColor: 'transparent' }}
                    >
                        取消
                    </button>
                    <button 
                        onClick={() => canConfirm && onConfirm(reason.trim())}
                        disabled={!canConfirm}
                        className={`py-3.5 rounded-xl font-black text-sm shadow-md active:scale-[0.98] transition-all ${
                            canConfirm 
                                ? 'bg-purple-600 text-white hover:bg-purple-700' 
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                        style={{ minHeight: '48px', WebkitTapHighlightColor: 'transparent' }}
                    >
                        确认并进入编辑
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// 只读视图内容
// ============================================================================

// ============================================================================
// 📊 多维雷达图组件 (N-Dimension Radar Chart)
// ============================================================================

interface RadarChartProps {
    metrics: MetricDef[];
    record: AssessmentRecordV2;
}

const RadarChart: React.FC<RadarChartProps> = ({ metrics, record }) => {
    const N = metrics.length;
    if (N < 3) return null; // 维度太少无法绘制雷达图

    const size = 260;
    const center = size / 2;
    const r = 75; // 满分 100 的最大半径

    // 获取某个维度对应的 SVG 坐标 (顺时针，第一个顶点在正上方)
    const getCoordinates = (index: number, score: number) => {
        const angle = (2 * Math.PI / N) * index - Math.PI / 2;
        // 限制分数在 0 - 100 之间 map 到 radius 0 - r
        const radius = (Math.min(Math.max(score, 0), 100) / 100) * r;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return { x, y };
    };

    const gridLevels = [20, 40, 60, 80, 100];

    // 1. 管理层初评分路径数据
    const managementPoints = metrics.map((m, idx) => {
        const mScore = record.initialRating?.metrics.find(s => s.metricKey === m.key);
        const score = mScore ? mScore.score : 0;
        return getCoordinates(idx, score);
    });
    const managementPath = managementPoints.map(p => `${p.x},${p.y}`).join(' ');

    // 2. 老板平均评分路径数据
    const activeBosses = Object.values(record.bossRatings || {}).filter(b => !b.skipped);
    const hasBossRatings = activeBosses.length > 0;
    
    const bossPoints = metrics.map((m, idx) => {
        const scores = activeBosses
            .map(b => b.metrics.find(s => s.metricKey === m.key)?.score)
            .filter((v): v is number => v !== undefined);
        const avgScore = scores.length > 0 ? (scores.reduce((sum, s) => sum + s, 0) / scores.length) : 0;
        return getCoordinates(idx, avgScore);
    });
    const bossPath = bossPoints.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <div className="bg-white rounded-3xl border border-gray-200 p-4 shadow-sm flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    📊 {N}维能力度量图 ({N}-Dimension Radar)
                </span>
                <span className="text-[9px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100">
                    V2 评估模型
                </span>
            </div>

            {/* SVG 雷达图 */}
            <div className="relative w-full max-w-[280px] aspect-square flex items-center justify-center">
                <svg className="w-full h-full" viewBox={`0 0 ${size} ${size}`}>
                    {/* 背景多边形格网 */}
                    {gridLevels.map((level) => {
                        const levelPoints = metrics.map((_, idx) => getCoordinates(idx, level));
                        const dPath = levelPoints.map(p => `${p.x},${p.y}`).join(' ');
                        return (
                            <g key={level}>
                                <polygon
                                    points={dPath}
                                    fill="none"
                                    stroke={level === 100 ? "#D1D5DB" : "#F3F4F6"}
                                    strokeWidth={level === 100 ? "1.5" : "1"}
                                    strokeDasharray={level === 100 ? "0" : "3,3"}
                                />
                                {/* 格网分数标识 (放在正上方顶点) */}
                                {metrics.length > 0 && (
                                    <text
                                        x={center}
                                        y={center - (level / 100) * r - 2}
                                        textAnchor="middle"
                                        className="text-[7px] font-bold fill-gray-400 font-mono"
                                    >
                                        {level}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* 放射轴线 */}
                    {metrics.map((_, idx) => {
                        const outer = getCoordinates(idx, 100);
                        return (
                            <line
                                key={idx}
                                x1={center}
                                y1={center}
                                x2={outer.x}
                                y2={outer.y}
                                stroke="#E5E7EB"
                                strokeWidth="1"
                            />
                        );
                    })}

                    {/* 指标轴文字标签 */}
                    {metrics.map((m, idx) => {
                        const angle = (2 * Math.PI / N) * idx - Math.PI / 2;
                        // 把文字往外推 16 像素
                        const labelRadius = r + 16;
                        const x = center + labelRadius * Math.cos(angle);
                        const y = center + labelRadius * Math.sin(angle);

                        let textAnchor: 'start' | 'end' | 'middle' = "middle";
                        if (Math.cos(angle) > 0.1) textAnchor = "start";
                        else if (Math.cos(angle) < -0.1) textAnchor = "end";

                        // 切割过长的文字
                        const shortLabel = m.label.length > 6 ? m.label.substring(0, 6) + '..' : m.label;

                        return (
                            <text
                                key={m.key}
                                x={x}
                                y={y + 3}
                                textAnchor={textAnchor}
                                className="text-[9px] font-black fill-gray-600 tracking-tight"
                            >
                                {shortLabel}
                            </text>
                        );
                    })}

                    {/* 1. 管理层评分覆盖面 (蓝色) */}
                    {record.initialRating && (
                        <>
                            <polygon
                                points={managementPath}
                                fill="rgba(59, 130, 246, 0.12)"
                                stroke="#2563EB"
                                strokeWidth="2"
                                className="transition-all duration-300"
                            />
                            {managementPoints.map((p, idx) => (
                                <circle
                                    key={`m-dot-${idx}`}
                                    cx={p.x}
                                    cy={p.y}
                                    r="3"
                                    className="fill-white stroke-[#2563EB] stroke-[1.5]"
                                />
                            ))}
                        </>
                    )}

                    {/* 2. 老板评分覆盖面 (紫色) */}
                    {hasBossRatings && (
                        <>
                            <polygon
                                points={bossPath}
                                fill="rgba(168, 85, 247, 0.12)"
                                stroke="#7C3AED"
                                strokeWidth="2"
                                className="transition-all duration-300"
                            />
                            {bossPoints.map((p, idx) => (
                                <circle
                                    key={`b-dot-${idx}`}
                                    cx={p.x}
                                    cy={p.y}
                                    r="3"
                                    className="fill-white stroke-[#7C3AED] stroke-[1.5]"
                                />
                            ))}
                        </>
                    )}
                </svg>
            </div>

            {/* 图例 */}
            <div className="flex gap-4 mt-2 border-t border-gray-50 pt-2 w-full justify-center text-[10px] font-bold">
                {record.initialRating && (
                    <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-600 inline-block shrink-0"></span>
                        <span className="text-gray-500">管理层初评 ({record.initialRating.raterName})</span>
                    </div>
                )}
                {hasBossRatings && (
                    <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded bg-purple-50 border border-purple-600 inline-block shrink-0"></span>
                        <span className="text-gray-500">老板平均分</span>
                    </div>
                )}
            </div>
        </div>
    );
};

interface ViewModeContentProps {
    record: AssessmentRecordV2;
    metrics: MetricDef[]; // 💡 使用标准类型
    isTranslationActive: boolean;
    translatedBundle: Record<string, string> | null;
}

const ViewModeContent: React.FC<ViewModeContentProps> = ({ record, metrics, isTranslationActive, translatedBundle }) => {
    const t = (originalText: string, key: string) => {
        if (isTranslationActive && translatedBundle && translatedBundle[key]) {
            return `${originalText} | ${translatedBundle[key]}`;
        }
        return originalText;
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    };
    
    // 计算多角色评测明细
    const totals = calculateMultiRaterTotals(record);
    const bossRatingsMap = record.bossRatings || {};
    
    // 定义 4 位老板的基础信息
    const BOSSES = [
        { id: '001', name: 'BEN' },
        { id: '002', name: 'JAKE' },
        { id: '003', name: 'JEFFREY' },
        { id: '004', name: 'EVELYN' }
    ];
    
    return (
        <div 
            className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4 pb-32"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            {/* 🏆 最终综合计算信息卡 */}
            <div className="bg-gradient-to-br from-gray-900 to-slate-800 rounded-3xl p-5 text-white shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <span className="text-[10px] font-black text-[#FFD700] uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full">
                            综合评定成绩
                        </span>
                        <h3 className="text-xl font-black mt-1">最终得分与等级</h3>
                    </div>
                    <div className="bg-white/10 px-3.5 py-1.5 rounded-2xl border border-white/20 text-center">
                        <div className="text-xs font-bold text-gray-300">综合总分</div>
                        <div className="text-2xl font-black text-[#FFD700]">{record.finalScore} 分</div>
                    </div>
                </div>
                
                {/* 评分构成计算器展示 */}
                <div className="space-y-2.5 text-xs border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-300 font-bold">1. 管理层评分 (50%权重):</span>
                        <span className="font-mono font-black text-white">
                            {record.initialRating ? `${record.initialRating.overallScore} 分 (${record.initialRating.raterName})` : '⏳ 尚未评定'}
                        </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                        <span className="text-gray-300 font-bold">2. 老板评分 (50%权重):</span>
                        <span className="font-mono font-black text-[#FFD700]">
                            {totals.bossesCount > 0 ? `${totals.bossesAverage} 分` : '⏳ 尚未评分'}
                        </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-2">
                        <span className="text-gray-300 font-bold">已完成评分人数:</span>
                        <span className="font-mono font-black text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded">
                            {totals.totalRaters} 人已评
                        </span>
                    </div>
                    
                    {/* 算法公式 */}
                    <div className="bg-black/20 p-2.5 rounded-xl text-[11px] text-gray-300 leading-relaxed font-semibold border border-white/5">
                        💡 <span className="font-black text-white">计算方法：</span>
                        最终成绩 = 管理层初评分 × 50% + 老板评分平均值 × 50% （共 {totals.totalRaters} 人参与评分）。
                    </div>
                </div>
            </div>

            {/* 📊 雷达图度量 */}
            <RadarChart metrics={metrics} record={record} />

            {/* 👥 评委角色明细 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <Clock size={14} className="text-gray-400"/>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">所有评委评分状态</span>
                </div>
                
                {/* 1. 管理层初评 */}
                <div className="flex items-center justify-between bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">初评</span>
                            <span className="text-xs font-black text-[#1A1A1A]">
                                {record.initialRating ? `${record.initialRating.raterName} (${record.initialRating.raterRank})` : '（未评分）'}
                            </span>
                        </div>
                        {record.initialRating && (
                            <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                                {formatDate(record.initialRating.date)}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        {record.initialRating ? (
                            <>
                                <span className="text-sm font-black text-blue-700">{record.initialRating.overallScore} 分</span>
                                <div className="text-[9px] font-bold text-gray-400">等级: {getGradeFromScore(record.initialRating.overallScore).label}</div>
                            </>
                        ) : (
                            <span className="text-xs text-gray-400 font-bold">暂无初评</span>
                        )}
                    </div>
                </div>
                
                {/* 2. 四位老板评分状态 */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    {BOSSES.map(boss => {
                        const br = bossRatingsMap[boss.id];
                        const hasRated = !!br;
                        const isSkipped = br?.skipped;
                        
                        return (
                            <div 
                                key={boss.id} 
                                className={`rounded-xl p-2.5 border text-xs font-bold transition-all ${
                                    isSkipped 
                                        ? 'bg-gray-50 border-gray-200 text-gray-400' 
                                        : hasRated
                                            ? 'bg-purple-50/50 border-purple-200 text-purple-900'
                                            : 'bg-orange-50/30 border-orange-100 text-orange-600'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-black text-[#1A1A1A]">{boss.name}</span>
                                    {isSkipped ? (
                                        <span className="text-[8px] bg-gray-200 text-gray-500 px-1 rounded font-black">已跳过</span>
                                    ) : hasRated ? (
                                        <span className="text-[8px] bg-purple-600 text-white px-1 rounded font-black">已打分</span>
                                    ) : (
                                        <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded font-black">未完成</span>
                                    )}
                                </div>
                                
                                {isSkipped ? (
                                    <div className="text-[9px] text-gray-400 truncate italic">
                                        💬 {br.comment || '无跳过说明'}
                                    </div>
                                ) : hasRated ? (
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[10px] font-mono text-purple-600">{formatDate(br.date).substring(5,16)}</span>
                                        <span className="font-black text-purple-700">{br.overallScore} 分</span>
                                    </div>
                                ) : (
                                    <div className="text-[9px] text-gray-400">等候评分...</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 💬 决策层/老板综合评语汇总 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                    <MessageSquare size={14} className="text-purple-600"/>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">👑 决策层/老板综合评语 (Management Comments)</span>
                </div>
                
                <div className="space-y-2.5">
                    {BOSSES.map(boss => {
                        const br = bossRatingsMap[boss.id];
                        const hasRated = !!br;
                        const isSkipped = br?.skipped;
                        const comment = br?.comment?.trim();

                        return (
                            <div key={boss.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-black text-xs text-[#1A1A1A]">{boss.name}</span>
                                        {isSkipped ? (
                                            <span className="text-[9px] font-black bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">仅评语 (已跳过评分)</span>
                                        ) : hasRated ? (
                                            <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">已打分 ({br.overallScore} 分)</span>
                                        ) : (
                                            <span className="text-[9px] font-black bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">未开始评测</span>
                                        )}
                                    </div>
                                    {br?.date && (
                                        <span className="text-[9px] font-mono text-gray-400">
                                            {formatDate(br.date).substring(0, 10)}
                                        </span>
                                    )}
                                </div>
                                
                                {comment ? (
                                    <p className="text-xs text-gray-700 font-bold bg-white p-3 rounded-xl border border-gray-100 leading-relaxed whitespace-pre-line">
                                        💬 {comment}
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-400 font-bold italic bg-white p-2.5 rounded-xl border border-gray-100/50">
                                        暂无综合评语意见
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* 🎯 四大核心指标，侧并侧 (Side-by-Side) 深度展示 */}
            <div className="space-y-3.5">
                <div className="text-xs font-black text-gray-500 uppercase tracking-wider pl-1">
                    🎯 各项能力指标对比与评语
                </div>
                
                {metrics.map((metric) => {
                    const MetricIcon = metric.icon;
                    
                    // 获取该指标的所有评分输入
                    const initialMetricScore = record.initialRating?.metrics.find(s => s.metricKey === metric.key);
                    
                    return (
                        <div key={metric.key} className="bg-white rounded-3xl border border-gray-200 p-4 shadow-sm space-y-3">
                            {/* 指标名称首部 */}
                            <div className="flex items-start gap-2 border-b border-gray-100 pb-3">
                                <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-600">
                                    {MetricIcon && <MetricIcon size={16}/>}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-black text-sm text-[#1A1A1A] leading-tight">
                                        {t(metric.label, `metric_label_${metric.key}`)}
                                    </h4>
                                    <p className="text-[10px] text-gray-500 font-bold mt-0.5 leading-relaxed">
                                        {t(metric.desc, `metric_desc_${metric.key}`)}
                                    </p>
                                </div>
                            </div>
                            
                            {/* 初评与各位老板评分的对比表格 */}
                            <div className="space-y-2 text-xs">
                                {/* 管理层初评该项 */}
                                {initialMetricScore && (
                                    <div className="bg-gray-50/50 rounded-xl p-2.5 border border-gray-100">
                                        <div className="flex items-center justify-between font-bold text-[11px] mb-1">
                                            <span className="text-blue-600 font-black">管理层 ({record.initialRating?.raterName}) 评分：</span>
                                            <span className="font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-black">
                                                {initialMetricScore.grade} 档 ({initialMetricScore.score}分)
                                            </span>
                                        </div>
                                        {initialMetricScore.note && (
                                            <p className="text-xs text-gray-600 font-bold bg-white p-2 rounded border border-gray-100/80 leading-relaxed whitespace-pre-line mt-1">
                                                💬 {getCommentFromNote(initialMetricScore.note)}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* 各个老板的评分对比 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                    {BOSSES.map(boss => {
                                        const br = bossRatingsMap[boss.id];
                                        if (!br) return null;
                                        
                                        const bossMetricScore = br.metrics?.find(s => s.metricKey === metric.key);
                                        const noteText = bossMetricScore?.note ? getCommentFromNote(bossMetricScore.note) : '';
                                        
                                        const scoreText = br.skipped 
                                            ? '仅评语' 
                                            : bossMetricScore 
                                                ? `${bossMetricScore.grade} 档 (${bossMetricScore.score}分)` 
                                                : '未打分';
                                                
                                        // 如果既没有打分，也没有对该维度的具体批注，就不展示
                                        if (br.skipped && !noteText) return null;
                                        if (!bossMetricScore && !noteText) return null;

                                        return (
                                            <div key={boss.id} className="bg-purple-50/30 rounded-xl p-2.5 border border-purple-100/50">
                                                <div className="flex items-center justify-between font-bold text-[11px] mb-1">
                                                    <span className="text-purple-700 font-black">👑 {boss.name}：</span>
                                                    <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                                        br.skipped ? 'bg-gray-100 text-gray-500' : 'bg-purple-100 text-purple-700'
                                                    }`}>
                                                        {scoreText}
                                                    </span>
                                                </div>
                                                {noteText && (
                                                    <p className="text-xs text-gray-600 font-bold bg-white p-2 rounded border border-purple-100/30 leading-relaxed whitespace-pre-line mt-1">
                                                        💬 {noteText}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

interface EditModeContentProps {
    metrics: MetricDef[]; // 💡 使用 standard type
    scores: Record<string, MetricScoreV2>;
    touched: boolean;
    errorMsg: string;
    onSelectGrade: (key: string, grade: GradeLabel) => void;
    onNoteChange: (key: string, note: string) => void;
    isOwnerRater: boolean;
    isSkipped: boolean;
    setIsSkipped: (val: boolean) => void;
    bossComment: string;
    setBossComment: (val: string) => void;
    ratingMode: 'FACT' | 'DIRECT';
    setRatingMode: (mode: 'FACT' | 'DIRECT') => void;
    selectedAnswers: Record<string, Record<string, FactOption>>;
    onSelectFactAnswer: (metricKey: string, questionId: string, option: FactOption) => void;
    employee: Employee;
    onToggleSkipMetric?: (metricKey: string, skipped: boolean) => void;
    isTranslationActive: boolean;
    translatedBundle: Record<string, string> | null;
}

const parseSubItemScores = (note: string): Record<string, number> => {
    if (!note) return {};
    const match = note.match(/<!--SUB_JSON:({.*?})-->/);
    if (match) {
        try {
            return JSON.parse(match[1]);
        } catch (e) {
            console.error('Error parsing subitem json:', e);
        }
    }
    return {};
};

const serializeSubItemScores = (subScores: Record<string, number>, commentText: string): string => {
    const jsonStr = `<!--SUB_JSON:${JSON.stringify(subScores)}-->`;
    return commentText ? `${commentText.trim()}\n${jsonStr}` : jsonStr;
};

const getCommentFromNote = (note: string): string => {
    if (!note) return '';
    return note.replace(/<!--SUB_JSON:([\s\S]*?)-->/g, '').trim();
};

const getGradeDisplay = (grade: string): string => {
    if (grade === 'SSS' || grade === 'SS' || grade === 'S') return '5分';
    if (grade === 'A') return '4分';
    if (grade === 'B') return '3分';
    if (grade === 'C') return '2分';
    if (grade === 'D') return '1分';
    return grade;
};

const score1To5ToGrade = (val: number): GradeLabel => {
    if (val === 5) return 'S';
    if (val === 4) return 'A';
    if (val === 3) return 'B';
    if (val === 2) return 'C';
    return 'D';
};

const EditModeContent: React.FC<EditModeContentProps> = ({
    metrics, scores, touched, errorMsg, onSelectGrade, onNoteChange,
    isOwnerRater, isSkipped, setIsSkipped, bossComment, setBossComment,
    ratingMode, setRatingMode, selectedAnswers, onSelectFactAnswer, employee,
    onToggleSkipMetric, isTranslationActive, translatedBundle
}) => {
    const t = (originalText: string, key: string) => {
        if (isTranslationActive && translatedBundle && translatedBundle[key]) {
            return `${originalText} | ${translatedBundle[key]}`;
        }
        return originalText;
    };

    const [activeDimensionKey, setActiveDimensionKey] = useState<string | null>(null);
    const [comment, setComment] = useState<string>('');
    const [subScores, setSubScores] = useState<Record<string, number>>({});
    const [isTranslatingComment, setIsTranslatingComment] = useState(false);

    const category = getJobCategoryForEmployee(employee);
    const isManagement = category === 'KITCHEN_HEAD' || category === 'FLOOR_MANAGER';

    // Synchronize subScores and comment when active dimension changes
    useEffect(() => {
        if (activeDimensionKey) {
            const note = scores[activeDimensionKey]?.note || '';
            setSubScores(parseSubItemScores(note));
            setComment(getCommentFromNote(note));
        } else {
            setSubScores({});
            setComment('');
        }
    }, [activeDimensionKey, scores]);

    const activeMetric = metrics.find(m => m.key === activeDimensionKey);

    const handleSubScoreChange = (metricKey: string, subKey: string, val: number, subItems: any[]) => {
        const nextSubScores = { ...subScores, [subKey]: val };
        setSubScores(nextSubScores);
        
        const keys = subItems.map(item => item.key);
        const filledScores = keys.map(k => nextSubScores[k]).filter(v => v !== undefined);
        
        if (filledScores.length > 0) {
            const avg = filledScores.reduce((sum, v) => sum + v, 0) / filledScores.length;
            const roundedVal = Math.round(avg);
            const grade = score1To5ToGrade(roundedVal);
            
            // Update the main grade
            onSelectGrade(metricKey, grade);
            
            // Serialize next scores with current comment text
            const serializedNote = serializeSubItemScores(nextSubScores, comment);
            onNoteChange(metricKey, serializedNote);
        }
    };

    const handleCommentChange = (metricKey: string, text: string) => {
        setComment(text);
        const hasSubItems = metricKey === 'job_capability' || 
                            metricKey === 'teamwork' ||
                            metricKey === 'personal_grooming' ||
                            (metricKey === 'mentorship' && isManagement) ||
                            (metricKey === 'stress_handling' && !isManagement);
        if (hasSubItems) {
            const serializedNote = serializeSubItemScores(subScores, text);
            onNoteChange(metricKey, serializedNote);
        } else {
            onNoteChange(metricKey, text);
        }
    };

    const handleTranslateCommentLocal = async (target: 'my' | 'zh', metricKey: string, currentNote: string) => {
        const commentToTranslate = getCommentFromNote(currentNote);
        if (!commentToTranslate.trim()) return;
        setIsTranslatingComment(true);
        try {
            const res = await fetch('/api/gemini/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: commentToTranslate,
                    targetLang: target
                })
            });
            if (!res.ok) throw new Error('Translation failed');
            const data = await res.json();
            if (data.text) {
                const delimiter = `\n\n--- 🇲🇲 [Myanmar / 缅甸语] ---`;
                const cnDelimiter = `\n\n--- 🇨🇳 [Chinese / 中文] ---`;
                
                let newCleanComment = '';
                if (target === 'my') {
                    const baseText = commentToTranslate.split(delimiter)[0];
                    newCleanComment = `${baseText}${delimiter}\n${data.text}`;
                } else {
                    const baseText = commentToTranslate.split(cnDelimiter)[0];
                    newCleanComment = `${baseText}${cnDelimiter}\n${data.text}`;
                }
                
                handleCommentChange(metricKey, newCleanComment);
            }
        } catch (err) {
            console.error(err);
            alert('翻译失败，请稍后重试。/ Translation failed.');
        } finally {
            setIsTranslatingComment(false);
        }
    };

    const renderCommentTranslationActions = (metricKey: string, currentNote: string) => {
        const commentText = getCommentFromNote(currentNote);
        if (!commentText.trim()) return null;
        return (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 animate-in fade-in">
                <button
                    type="button"
                    onClick={() => handleTranslateCommentLocal('my', metricKey, currentNote)}
                    disabled={isTranslatingComment}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors flex items-center gap-1 shrink-0"
                    style={{ minHeight: '32px' }}
                >
                    {isTranslatingComment ? '⏳ 正在翻译...' : '🇲🇲 翻译成缅甸语 (Bilingual MM)'}
                </button>
                <button
                    type="button"
                    onClick={() => handleTranslateCommentLocal('zh', metricKey, currentNote)}
                    disabled={isTranslatingComment}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-blue-100 hover:bg-blue-200 text-blue-800 transition-colors flex items-center gap-1 shrink-0"
                    style={{ minHeight: '32px' }}
                >
                    {isTranslatingComment ? '⏳ 正在翻译...' : '🇨🇳 翻译成中文 (Bilingual ZH)'}
                </button>
            </div>
        );
    };

    return (
        <div 
            className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4 pb-32"
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
            {/* ⭐ 老板角色专属：独立评分与跳过切换器 */}
            {isOwnerRater && activeDimensionKey === null && (
                <div className="bg-purple-950 text-white rounded-3xl p-4 shadow-md space-y-3">
                    <div className="flex items-center gap-2">
                        <Shield size={16} className="text-[#FFD700]"/>
                        <span className="text-[10px] font-black uppercase text-[#FFD700] tracking-widest">
                            老板评分设置 (BEN / JAKE / JEFFREY / EVELYN)
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 bg-black/30 p-1.5 rounded-2xl border border-white/5">
                        <button
                            type="button"
                            onClick={() => setIsSkipped(false)}
                            className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                !isSkipped 
                                    ? 'bg-purple-600 text-white shadow-md' 
                                    : 'text-gray-300 hover:text-white'
                            }`}
                        >
                            <span>🟢 进行独立评分</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsSkipped(true)}
                            className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                                isSkipped 
                                    ? 'bg-gray-600 text-white shadow-md' 
                                    : 'text-gray-300 hover:text-white'
                            }`}
                        >
                            <span>⚪ 跳过本轮评分</span>
                        </button>
                    </div>
                    
                    <p className="text-[10px] text-purple-200 leading-relaxed font-bold">
                        {isSkipped 
                            ? '💡 您选择跳过评分。跳过评分后，您的考核分数不会计入该员工的总平均分中，但您仍可在下方填写您的评语意见，系统会予以合并展现。' 
                            : '💡 您将对该员工进行具体的指标打分与备注，您的打分将被独立存储，并与其他评委的分数按均值进行最终汇总。'}
                    </p>
                </div>
            )}

            {/* ⭐ 老板整体备注/跳过评语说明框 */}
            {isOwnerRater && activeDimensionKey === null && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-2">
                    <label className="block text-xs font-black text-[#1A1A1A] uppercase tracking-widest">
                        {isSkipped ? '✍️ 老板跳过评语 / 意见备注' : '✍️ 老板综合总评 / 评语 (选填)'}
                    </label>
                    <textarea
                        value={bossComment}
                        onChange={e => setBossComment(e.target.value)}
                        placeholder={isSkipped ? "请填写跳过理由或综合备注意见，如：本季度此员工主要归Jaz管理，我不作具体分值考量..." : "请填写对该员工本季度的综合表现评价、肯定或改进建议..."}
                        rows={3}
                        className="w-full p-3 bg-gray-50 border-2 border-gray-200 rounded-xl font-bold text-xs resize-none outline-none focus:border-purple-600 focus:bg-white transition-colors"
                        style={{ fontSize: '13px', minHeight: '80px' }}
                    />
                </div>
            )}

            {/* 1. 维度选择导航面板 */}
            {activeDimensionKey === null ? (
                (!isOwnerRater || !isSkipped) && (
                    <div className="space-y-3.5">
                        <div className="flex items-center justify-between pl-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                📱 6维通用评估指标列表 (Click to assess)
                            </span>
                            <span className="text-[10px] font-black bg-[#1A1A1A] text-[#FFD700] px-2 py-0.5 rounded-full">
                                移动版极简操作
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {metrics.map((metric, idx) => {
                                const currentScore = scores[metric.key];
                                const isLocked = false;
                                const MetricIcon = metric.icon;

                                const hasRated = currentScore && currentScore.score > 0;
                                const isCD = hasRated && (currentScore.grade === 'C' || currentScore.grade === 'D');
                                const hasNote = currentScore?.note && getCommentFromNote(currentScore.note).trim().length > 0;
                                const noteWarning = isCD && !hasNote && touched;

                                return (
                                    <button
                                        key={metric.key}
                                        type="button"
                                        onClick={() => {
                                            if (!isLocked) {
                                                setActiveDimensionKey(metric.key);
                                            }
                                        }}
                                        className={`w-full text-left bg-white border rounded-[2rem] p-4 flex items-center justify-between gap-4 transition-all hover:border-gray-300 active:scale-[0.98] cursor-pointer ${
                                            noteWarning 
                                                ? 'border-red-300 ring-2 ring-red-100 bg-red-50/20' 
                                                : isLocked 
                                                    ? 'border-gray-100 opacity-60 bg-gray-50/50' 
                                                    : 'border-gray-200 shadow-sm'
                                        }`}
                                        style={{ minHeight: '84px', WebkitTapHighlightColor: 'transparent' }}
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                                                isLocked 
                                                    ? 'bg-gray-100 text-gray-400' 
                                                    : hasRated 
                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                                        : 'bg-gray-50 text-gray-600 border border-gray-100'
                                            }`}>
                                                {MetricIcon ? <MetricIcon size={20} /> : <span className="font-black text-sm">{idx + 1}</span>}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-black text-[13px] text-[#1A1A1A] leading-tight">
                                                        {idx + 1}. {t(metric.label, `metric_label_${metric.key}`)}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 font-bold mt-1 line-clamp-1">
                                                    {t(metric.desc, `metric_desc_${metric.key}`)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="shrink-0 flex items-center ml-2">
                                            {isLocked ? (
                                                <span className="text-[9px] font-black bg-gray-100 text-gray-400 px-2 py-1 rounded-lg flex items-center gap-1">
                                                    🔒 老板专属
                                                </span>
                                            ) : hasRated ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full font-mono ${
                                                        isCD ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {currentScore.grade} 档 ({currentScore.score}分)
                                                    </span>
                                                    {noteWarning && (
                                                        <span className="text-[8px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded-md animate-pulse">
                                                            ⚠️ 漏填佐证
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[9px] font-black bg-orange-50 border border-orange-200 text-orange-600 px-2 py-1 rounded-xl">
                                                    ⚠️ 待评测
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {errorMsg && (
                            <div className="bg-red-50 border border-red-200 p-3.5 rounded-2xl flex items-start gap-2 animate-in fade-in">
                                <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5"/>
                                <p className="text-xs font-bold text-red-700 leading-normal">{errorMsg}</p>
                            </div>
                        )}

                        <div className="bg-gray-100/50 rounded-2xl p-3.5 text-center text-[10px] font-bold text-gray-400 leading-relaxed">
                            💡 请依次点击上方 6 个维度模块，进入触屏卡片进行评星、打分及填写佐证，最后点击屏幕最下方的 【保存并提交考核】 即可.
                        </div>
                    </div>
                )
            ) : (
                // 2. 指标详细评测详情面板
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                    {/* Back Navigator */}
                    <button
                        type="button"
                        onClick={() => setActiveDimensionKey(null)}
                        className="flex items-center gap-1.5 px-3 py-2 -ml-2 rounded-xl text-xs font-black text-gray-600 hover:text-[#1A1A1A] hover:bg-gray-100 transition-colors w-fit"
                        style={{ minHeight: '44px' }}
                    >
                        <ArrowLeft size={16}/>
                        <span>← 返回指标列表</span>
                    </button>

                    {/* Prominent Header Card */}
                    <div className="bg-[#1A1A1A] text-white rounded-[2rem] p-5 shadow-md border-b-4 border-[#FFD700] space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🎯</span>
                            <span className="text-[10px] font-black uppercase text-[#FFD700] tracking-widest">
                                详细评估板块 (Dimension Details)
                            </span>
                        </div>
                        <h3 className="font-black text-base md:text-lg leading-tight text-white">
                            {activeMetric ? t(activeMetric.label, `metric_label_${activeMetric.key}`) : ''}
                        </h3>
                        <p className="text-xs font-medium text-gray-300 leading-relaxed">
                            {activeMetric ? t(activeMetric.desc, `metric_desc_${activeMetric.key}`) : ''}
                        </p>
                    </div>

                    {/* Locked View */}
                    {activeDimensionKey && (activeDimensionKey === 'loyalty' || activeDimensionKey === 'adaptability' || activeDimensionKey === 'teamwork') && false ? (
                        null
                    ) : (
                        <div className="space-y-4">
                            {/* Skip Toggle for Owner (Boss) */}
                            {isOwnerRater && activeDimensionKey && (
                                <div className="bg-purple-950 text-white rounded-[2rem] p-4 border border-purple-800 flex items-center justify-between gap-4 shadow-sm animate-in fade-in">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xl shrink-0">🤫</span>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase text-purple-300 tracking-wider">
                                                老板专属权限 (Owner Skip Option)
                                            </p>
                                            <p className="text-xs font-black text-white">
                                                跳过此维度的打分？
                                            </p>
                                            <p className="text-[10px] text-purple-200/85 font-medium mt-0.5">
                                                不影响权重，支持直接留言备注
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (onToggleSkipMetric) {
                                                const isCurrentlySkipped = !!scores[activeDimensionKey]?.skipped;
                                                onToggleSkipMetric(activeDimensionKey, !isCurrentlySkipped);
                                                setSubScores({});
                                            }
                                        }}
                                        className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shrink-0 border ${
                                            scores[activeDimensionKey]?.skipped
                                                ? 'bg-purple-600 border-purple-500 text-white shadow-inner animate-pulse'
                                                : 'bg-purple-900/40 border-purple-800 text-purple-200 hover:text-white'
                                        }`}
                                        style={{ minHeight: '44px' }}
                                    >
                                        {scores[activeDimensionKey]?.skipped ? '🟢 已跳过评分' : '⚪ 跳过打分'}
                                    </button>
                                </div>
                            )}

                            {scores[activeDimensionKey]?.skipped ? (
                                <div className="bg-purple-50/50 border border-purple-100 rounded-[2rem] p-6 text-center space-y-2 animate-in fade-in">
                                    <span className="text-2xl">🤐</span>
                                    <h4 className="font-black text-purple-950 text-sm">已跳过此项评分 (Metrics Skipped)</h4>
                                    <p className="text-xs text-purple-700/80 leading-relaxed font-bold max-w-sm mx-auto">
                                        您已选择跳过此维度的指标打分，在下方仍可以留下评语或修改评分依据。
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Option list */}
                                    {/* case 1: Dimensions 1, 2 (Direct rating with custom descriptions) */}
                                    {activeDimensionKey && (activeDimensionKey === 'loyalty' || activeDimensionKey === 'adaptability') && (
                                        <div className="space-y-2.5">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">
                                                💡 请轻触选择契合的实际等级 (Tap to select)
                                            </div>
                                            {[
                                                { val: 5, label: '5分 (极好)', desc: '完美模范', text: '积极表率并极速无条件执行；为全店核心骨干，不打折扣地迅速落地', labelKey: 'static_opt_5', descKey: 'static_opt_6', textKey: 'static_opt_0' },
                                                { val: 4, label: '4分 (优秀)',  desc: '优秀突出', text: '执行力强，态度积极，无怨言，符合品牌对核心人才的高标准', labelKey: 'static_opt_7', descKey: 'static_opt_8', textKey: 'static_opt_1' },
                                                { val: 3, label: '3分 (合格)',  desc: '合格达标', text: '服从安排与调度，保质保量并按期完成岗位交办的本职工作', labelKey: 'static_opt_9', descKey: 'static_opt_10', textKey: 'static_opt_2' },
                                                { val: 2, label: '2分 (中等)',  desc: '待改进项', text: '态度中立或偏消极，执行较缓慢，偶有怨言，需要管理层反复催促', labelKey: 'static_opt_11', descKey: 'static_opt_12', textKey: 'static_opt_3' },
                                                { val: 1, label: '1分 (较差)',  desc: '极差警告', text: '服从度低，公开或消极抗拒调配、新政策，甚至出现顶撞决策行为', labelKey: 'static_opt_13', descKey: 'static_opt_14', textKey: 'static_opt_4' }
                                            ].map(item => {
                                                const grade = score1To5ToGrade(item.val);
                                                const isSelected = scores[activeDimensionKey]?.grade === grade;
                                                return (
                                                    <button
                                                        key={item.val}
                                                        type="button"
                                                        onClick={() => onSelectGrade(activeDimensionKey, grade)}
                                                        className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all active:scale-[0.99] flex items-start justify-between gap-3 ${
                                                            isSelected
                                                                ? 'bg-purple-950 border-purple-500 text-[#FFD700] shadow-sm'
                                                                : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                        style={{ minHeight: '68px', WebkitTapHighlightColor: 'transparent' }}
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                                                    isSelected ? 'bg-[#FFD700] text-black' : 'bg-gray-100 text-gray-500'
                                                                }`}>
                                                                    {t(item.label, item.labelKey)}
                                                                </span>
                                                                <span className="text-xs font-black leading-tight text-gray-800">
                                                                    {t(item.desc, item.descKey)}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 font-bold mt-1 leading-normal">
                                                                {t(item.text, item.textKey)}
                                                            </p>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 mt-0.5 transition-all ${
                                                            isSelected ? 'bg-purple-600 border-purple-700 text-white scale-115' : 'border-gray-300'
                                                        }`}>
                                                            {isSelected && <Check size={11} strokeWidth={4}/>}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* case 2: Dimension 4 (Personal cultivation with Subitems) */}
                                    {activeDimensionKey === 'personal_grooming' && (
                                        <div className="space-y-4 animate-in fade-in">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">
                                                🧼 个人修养评估（1-5分）：请分别选择各子项表现：
                                            </div>
                                            {PERSONAL_GROOMING_SUBITEMS.map((item, idx) => {
                                                const currentSubVal = subScores[item.key];
                                                return (
                                                    <div key={item.key} className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm space-y-3 animate-in fade-in">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-[11px] font-bold bg-blue-100 text-blue-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                                                                {idx + 1}
                                                            </span>
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="text-xs font-black text-[#1A1A1A] leading-tight">
                                                                    {t(item.label, `subitem_label_${item.key}`)}
                                                                </h4>
                                                                <div className="text-[10px] text-gray-500 font-bold mt-1 leading-normal whitespace-pre-wrap">
                                                                    {t(item.desc, `subitem_desc_${item.key}`)}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-5 gap-1.5">
                                                            {[
                                                                { score: 1, label: '1分', bg: 'bg-red-50 border-red-200 text-red-700', activeBg: 'bg-red-500 border-red-600 text-white', text: '极差' },
                                                                { score: 2, label: '2分', bg: 'bg-orange-50 border-orange-200 text-orange-700', activeBg: 'bg-orange-500 border-orange-600 text-white', text: '较差' },
                                                                { score: 3, label: '3分', bg: 'bg-blue-50 border-blue-200 text-blue-700', activeBg: 'bg-blue-500 border-blue-600 text-white', text: '达标' },
                                                                { score: 4, label: '4分', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', activeBg: 'bg-indigo-500 border-indigo-600 text-white', text: '优秀' },
                                                                { score: 5, label: '5分', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-500 border-emerald-600 text-white', text: '卓越' }
                                                            ].map(btn => {
                                                                const isBtnSelected = currentSubVal === btn.score;
                                                                return (
                                                                    <button
                                                                        key={btn.score}
                                                                        type="button"
                                                                        onClick={() => handleSubScoreChange('personal_grooming', item.key, btn.score, PERSONAL_GROOMING_SUBITEMS)}
                                                                        className={`py-1.5 rounded-xl border font-black transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                                                                            isBtnSelected 
                                                                                ? `${btn.activeBg} shadow-sm scale-102` 
                                                                                : `${btn.bg} border-opacity-50 opacity-60`
                                                                        }`}
                                                                        style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                                                    >
                                                                        <span className="text-xs font-black">{btn.label}</span>
                                                                        <span className="text-[8px] font-bold opacity-80 leading-none">{btn.text}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Average calculator banner */}
                                            {(() => {
                                                const filled = PERSONAL_GROOMING_SUBITEMS.filter(item => subScores[item.key] !== undefined);
                                                const allFilled = filled.length === PERSONAL_GROOMING_SUBITEMS.length;
                                                if (filled.length === 0) return null;
                                                const sum = filled.reduce((acc, item) => acc + (subScores[item.key] || 0), 0);
                                                const avg = (sum / filled.length).toFixed(1);
                                                const parentScore = scores[activeDimensionKey];

                                                return (
                                                    <div className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 ${
                                                        allFilled ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950 animate-pulse'
                                                    }`}>
                                                        <span className="text-xs font-bold">
                                                            {allFilled ? '✅ 全部子指标已录齐' : '⚠️ 子指标待完成评选'} · 平均得分: <strong className="font-mono">{avg}</strong> 分 (满分 5)
                                                        </span>
                                                        {allFilled && parentScore && (
                                                            <span className="text-[10px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg">
                                                                折合 {parentScore.grade} 档 ({parentScore.score}分)
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                            {/* case 3.5: Dimension 3 (Teamwork with Subitems) */}
                            {activeDimensionKey === 'teamwork' && (
                                <div className="space-y-4 animate-in fade-in">
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">
                                        🤝 团队合作能力指标（1-5分）：请分别选择各子项表现：
                                    </div>
                                    {(TEAMWORK_SUBITEMS[category] || TEAMWORK_SUBITEMS['UNKNOWN'] || []).map((item, idx) => {
                                        const currentSubVal = subScores[item.key];
                                        const teamworkList = TEAMWORK_SUBITEMS[category] || TEAMWORK_SUBITEMS['UNKNOWN'] || [];
                                        return (
                                            <div key={item.key} className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm space-y-3 animate-in fade-in">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-bold bg-purple-100 text-purple-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-[#1A1A1A] leading-tight">
                                                            {t(item.label, `subitem_label_${item.key}`)}
                                                        </h4>
                                                        <div className="text-[10px] text-gray-500 font-bold mt-1 leading-normal whitespace-pre-wrap">
                                                            {t(item.desc, `subitem_desc_${item.key}`)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {[
                                                        { score: 1, label: '1分', bg: 'bg-red-50 border-red-200 text-red-700', activeBg: 'bg-red-500 border-red-600 text-white', text: '极差' },
                                                        { score: 2, label: '2分', bg: 'bg-orange-50 border-orange-200 text-orange-700', activeBg: 'bg-orange-500 border-orange-600 text-white', text: '较差' },
                                                        { score: 3, label: '3分', bg: 'bg-blue-50 border-blue-200 text-blue-700', activeBg: 'bg-blue-500 border-blue-600 text-white', text: '达标' },
                                                        { score: 4, label: '4分', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', activeBg: 'bg-indigo-500 border-indigo-600 text-white', text: '优秀' },
                                                        { score: 5, label: '5分', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-500 border-emerald-600 text-white', text: '卓越' }
                                                    ].map(btn => {
                                                        const isBtnSelected = currentSubVal === btn.score;
                                                        return (
                                                            <button
                                                                key={btn.score}
                                                                type="button"
                                                                onClick={() => handleSubScoreChange('teamwork', item.key, btn.score, teamworkList)}
                                                                className={`py-1.5 rounded-xl border font-black transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                                                                    isBtnSelected 
                                                                        ? `${btn.activeBg} shadow-sm scale-102` 
                                                                        : `${btn.bg} border-opacity-50 opacity-60`
                                                                }`}
                                                                style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                                            >
                                                                <span className="text-xs font-black">{btn.label}</span>
                                                                <span className="text-[8px] font-bold opacity-80 leading-none">{btn.text}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Average calculator banner */}
                                    {activeDimensionKey === 'teamwork' && (() => {
                                        const subItems = TEAMWORK_SUBITEMS[category] || TEAMWORK_SUBITEMS['UNKNOWN'] || [];
                                        const filled = subItems.filter(item => subScores[item.key] !== undefined);
                                        const allFilled = filled.length === subItems.length;
                                        if (filled.length === 0) return null;
                                        const sum = filled.reduce((acc, item) => acc + (subScores[item.key] || 0), 0);
                                        const avg = (sum / filled.length).toFixed(1);
                                        const parentScore = scores[activeDimensionKey];

                                        return (
                                            <div className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 ${
                                                allFilled ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950 animate-pulse'
                                            }`}>
                                                <span className="text-xs font-bold">
                                                    {allFilled ? '✅ 全部子指标已录齐' : '⚠️ 子指标待完成评选'} · 平均得分: <strong className="font-mono">{avg}</strong> 分 (满分 5)
                                                </span>
                                                {allFilled && parentScore && (
                                                    <span className="text-[10px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg">
                                                        折合 {parentScore.grade} 档 ({parentScore.score}分)
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* case 3: Dimension 5 (Job Capability with Subitems) */}
                            {activeDimensionKey === 'job_capability' && (
                                <div className="space-y-4">
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">
                                        🛠️ 该职位专属核心硬实力指标：请分别选择各子项表现：
                                    </div>
                                    {(JOB_CAPABILITY_SUBITEMS[category] || []).map((item, idx) => {
                                        const currentSubVal = subScores[item.key];
                                        return (
                                            <div key={item.key} className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm space-y-3 animate-in fade-in">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-bold bg-gray-100 text-gray-500 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-[#1A1A1A] leading-tight">
                                                            {t(item.label, `subitem_label_${item.key}`)}
                                                        </h4>
                                                        <p className="text-[10px] text-gray-400 font-bold mt-0.5 leading-normal">
                                                            {t(item.desc, `subitem_desc_${item.key}`)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {[
                                                        { score: 1, label: '1分', bg: 'bg-red-50 border-red-200 text-red-700', activeBg: 'bg-red-500 border-red-600 text-white', text: '极差' },
                                                        { score: 2, label: '2分', bg: 'bg-orange-50 border-orange-200 text-orange-700', activeBg: 'bg-orange-500 border-orange-600 text-white', text: '较差' },
                                                        { score: 3, label: '3分', bg: 'bg-blue-50 border-blue-200 text-blue-700', activeBg: 'bg-blue-500 border-blue-600 text-white', text: '达标' },
                                                        { score: 4, label: '4分', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', activeBg: 'bg-indigo-500 border-indigo-600 text-white', text: '优秀' },
                                                        { score: 5, label: '5分', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-500 border-emerald-600 text-white', text: '卓越' }
                                                    ].map(btn => {
                                                        const isBtnSelected = currentSubVal === btn.score;
                                                        return (
                                                            <button
                                                                key={btn.score}
                                                                type="button"
                                                                onClick={() => handleSubScoreChange('job_capability', item.key, btn.score, JOB_CAPABILITY_SUBITEMS[category] || [])}
                                                                className={`py-1.5 rounded-xl border font-black transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                                                                    isBtnSelected 
                                                                        ? `${btn.activeBg} shadow-sm scale-102` 
                                                                        : `${btn.bg} border-opacity-50 opacity-60`
                                                                }`}
                                                                style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                                            >
                                                                <span className="text-xs font-black">{btn.label}</span>
                                                                <span className="text-[8px] font-bold opacity-80 leading-none">{btn.text}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Average calculator banner */}
                                    {activeDimensionKey && (() => {
                                        const subItems = JOB_CAPABILITY_SUBITEMS[category] || [];
                                        const filled = subItems.filter(item => subScores[item.key] !== undefined);
                                        const allFilled = filled.length === subItems.length;
                                        if (filled.length === 0) return null;
                                        const sum = filled.reduce((acc, item) => acc + (subScores[item.key] || 0), 0);
                                        const avg = (sum / filled.length).toFixed(1);
                                        const parentScore = scores[activeDimensionKey];

                                        return (
                                            <div className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 ${
                                                allFilled ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950 animate-pulse'
                                            }`}>
                                                <span className="text-xs font-bold">
                                                    {allFilled ? '✅ 全部子指标已录齐' : '⚠️ 子指标待完成评选'} · 平均得分: <strong className="font-mono">{avg}</strong> 分 (满分 5)
                                                </span>
                                                {allFilled && parentScore && (
                                                    <span className="text-[10px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg">
                                                        折合 {parentScore.grade} 档 ({parentScore.score}分)
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* case 4: Dimension 6 (Mentorship for Management, or Stress Handling for Employee) */}
                            {activeDimensionKey === 'mentorship' && isManagement && (
                                <div className="space-y-4">
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">
                                        🎓 传帮带与人才培养能力 (Mentorship & Coaching) 子项打分:
                                    </div>
                                    {((MENTORSHIP_SUBITEMS[category] || MENTORSHIP_SUBITEMS['FLOOR_MANAGER'] || [])).map((item, idx) => {
                                        const currentSubVal = subScores[item.key];
                                        const mentorshipList = MENTORSHIP_SUBITEMS[category] || MENTORSHIP_SUBITEMS['FLOOR_MANAGER'] || [];
                                        return (
                                            <div key={item.key} className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm space-y-3 animate-in fade-in">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-bold bg-gray-100 text-gray-500 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-[#1A1A1A] leading-tight">
                                                            {t(item.label, `subitem_label_${item.key}`)}
                                                        </h4>
                                                        <p className="text-[10px] text-gray-400 font-bold mt-0.5 leading-normal">
                                                            {t(item.desc, `subitem_desc_${item.key}`)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {[
                                                        { score: 1, label: '1分', bg: 'bg-red-50 border-red-200 text-red-700', activeBg: 'bg-red-500 border-red-600 text-white', text: '极差' },
                                                        { score: 2, label: '2分', bg: 'bg-orange-50 border-orange-200 text-orange-700', activeBg: 'bg-orange-500 border-orange-600 text-white', text: '较差' },
                                                        { score: 3, label: '3分', bg: 'bg-blue-50 border-blue-200 text-blue-700', activeBg: 'bg-blue-500 border-blue-600 text-white', text: '达标' },
                                                        { score: 4, label: '4分', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', activeBg: 'bg-indigo-500 border-indigo-600 text-white', text: '优秀' },
                                                        { score: 5, label: '5分', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-500 border-emerald-600 text-white', text: '卓越' }
                                                    ].map(btn => {
                                                        const isBtnSelected = currentSubVal === btn.score;
                                                        return (
                                                            <button
                                                                key={btn.score}
                                                                type="button"
                                                                onClick={() => handleSubScoreChange('mentorship', item.key, btn.score, mentorshipList)}
                                                                className={`py-1.5 rounded-xl border font-black transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                                                                    isBtnSelected 
                                                                        ? `${btn.activeBg} shadow-sm scale-102` 
                                                                        : `${btn.bg} border-opacity-50 opacity-60`
                                                                }`}
                                                                style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                                            >
                                                                <span className="text-xs font-black">{btn.label}</span>
                                                                <span className="text-[8px] font-bold opacity-80 leading-none">{btn.text}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Average calculator banner */}
                                    {activeDimensionKey && (() => {
                                        const mentorshipList = MENTORSHIP_SUBITEMS[category] || MENTORSHIP_SUBITEMS['FLOOR_MANAGER'] || [];
                                        const filled = mentorshipList.filter(item => subScores[item.key] !== undefined);
                                        const allFilled = filled.length === mentorshipList.length;
                                        if (filled.length === 0) return null;
                                        const sum = filled.reduce((acc, item) => acc + (subScores[item.key] || 0), 0);
                                        const avg = (sum / filled.length).toFixed(1);
                                        const parentScore = scores[activeDimensionKey];

                                        return (
                                            <div className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 ${
                                                allFilled ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950 animate-pulse'
                                            }`}>
                                                <span className="text-xs font-bold">
                                                    {allFilled ? '✅ 全部培养子项已填齐' : '⚠️ 培养子项待完成评选'} · 平均得分: <strong className="font-mono">{avg}</strong> 分 (满分 5)
                                                </span>
                                                {allFilled && parentScore && (
                                                    <span className="text-[10px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg">
                                                        折合 {parentScore.grade} 档 ({parentScore.score}分)
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                             {activeDimensionKey === 'stress_handling' && !isManagement && (
                                <div className="space-y-4">
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider pl-1">
                                        ⚡ 抗压与危机处理能力子项打分:
                                    </div>
                                    {STRESS_SUBITEMS.map((item, idx) => {
                                        const currentSubVal = subScores[item.key];
                                        return (
                                            <div key={item.key} className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm space-y-3 animate-in fade-in">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-[11px] font-bold bg-gray-100 text-gray-500 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-[#1A1A1A] leading-tight">
                                                            {t(item.label, `subitem_label_${item.key}`)}
                                                        </h4>
                                                        <p className="text-[10px] text-gray-400 font-bold mt-0.5 leading-normal">
                                                            {t(item.desc, `subitem_desc_${item.key}`)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-5 gap-1.5">
                                                    {[
                                                        { score: 1, label: '1分', bg: 'bg-red-50 border-red-200 text-red-700', activeBg: 'bg-red-500 border-red-600 text-white', text: '极差' },
                                                        { score: 2, label: '2分', bg: 'bg-orange-50 border-orange-200 text-orange-700', activeBg: 'bg-orange-500 border-orange-600 text-white', text: '较差' },
                                                        { score: 3, label: '3分', bg: 'bg-blue-50 border-blue-200 text-blue-700', activeBg: 'bg-blue-500 border-blue-600 text-white', text: '达标' },
                                                        { score: 4, label: '4分', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', activeBg: 'bg-indigo-500 border-indigo-600 text-white', text: '优秀' },
                                                        { score: 5, label: '5分', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', activeBg: 'bg-emerald-500 border-emerald-600 text-white', text: '卓越' }
                                                    ].map(btn => {
                                                        const isBtnSelected = currentSubVal === btn.score;
                                                        return (
                                                            <button
                                                                key={btn.score}
                                                                type="button"
                                                                onClick={() => handleSubScoreChange('stress_handling', item.key, btn.score, STRESS_SUBITEMS)}
                                                                className={`py-1.5 rounded-xl border font-black transition-all flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                                                                    isBtnSelected 
                                                                        ? `${btn.activeBg} shadow-sm scale-102` 
                                                                        : `${btn.bg} border-opacity-50 opacity-60`
                                                                }`}
                                                                style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                                                            >
                                                                <span className="text-xs font-black">{btn.label}</span>
                                                                <span className="text-[8px] font-bold opacity-80 leading-none">{btn.text}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Average calculator banner */}
                                    {activeDimensionKey && (() => {
                                        const filled = STRESS_SUBITEMS.filter(item => subScores[item.key] !== undefined);
                                        const allFilled = filled.length === STRESS_SUBITEMS.length;
                                        if (filled.length === 0) return null;
                                        const sum = filled.reduce((acc, item) => acc + (subScores[item.key] || 0), 0);
                                        const avg = (sum / filled.length).toFixed(1);
                                        const parentScore = scores[activeDimensionKey];

                                        return (
                                            <div className={`p-3.5 border rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top-1 ${
                                                allFilled ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950 animate-pulse'
                                            }`}>
                                                <span className="text-xs font-bold">
                                                    {allFilled ? '✅ 全部抗压子项已填齐' : '⚠️ 抗压子项待完成评选'} · 平均得分: <strong className="font-mono">{avg}</strong> 分 (满分 5)
                                                </span>
                                                {allFilled && parentScore && (
                                                    <span className="text-[10px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded-lg">
                                                        折合 {getGradeDisplay(parentScore.grade)} ({parentScore.score}分)
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                        </>
                    )}

                            {/* Comments area */}
                            {scores[activeDimensionKey] && (
                                <div className="mt-5 border-t border-dashed border-gray-100 pt-3.5 space-y-2">
                                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest">
                                        ✍️ 该维度备注佐证说明与具体事实记录 (Note)
                                    </label>
                                    
                                    {(scores[activeDimensionKey].grade === 'C' || scores[activeDimensionKey].grade === 'D') && (
                                        <div className="p-2 bg-red-50 border border-red-200 text-red-700 font-bold text-[10px] rounded-xl flex items-center gap-1.5 animate-pulse">
                                            <AlertTriangle size={12}/>
                                            <span>依据分店绩效规定：评为 C 或 D 档必须输入具体的真实佐证说明！</span>
                                        </div>
                                    )}

                                    <textarea
                                        value={comment}
                                        onChange={e => handleCommentChange(activeDimensionKey, e.target.value)}
                                        placeholder="请输入具体的实际事例说明（选填，C/D 档必填），如：本季度切配时漏写生产标签导致报废浪费..."
                                        rows={3}
                                        className="w-full p-3 bg-white border-2 border-gray-200 focus:border-[#1A1A1A] rounded-2xl font-bold text-sm resize-none outline-none transition-colors"
                                        style={{ fontSize: '15px', minHeight: '84px' }}
                                    />

                                    {renderCommentTranslationActions(activeDimensionKey, scores[activeDimensionKey].note || '')}
                                </div>
                            )}

                            {/* Back navigator confirm button */}
                            <button
                                type="button"
                                onClick={() => setActiveDimensionKey(null)}
                                className="w-full py-4 mt-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-2xl font-black text-base shadow-lg transition-all flex items-center justify-center gap-1.5"
                                style={{ minHeight: '52px', WebkitTapHighlightColor: 'transparent' }}
                            >
                                <CheckCircle2 size={18}/>
                                确定并返回列表
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};