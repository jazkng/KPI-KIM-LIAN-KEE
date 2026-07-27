import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    BookOpen, AlertCircle, CheckCircle2, Clock, Trash2, Shield, AlertTriangle,
    FileText, Camera, X, Loader2, ChevronDown, Zap, PenTool, Maximize2,
    Gavel, Coins, Check, Calendar, Languages, MessageCircle, UserCheck, Send, ArrowLeft,
} from 'lucide-react';
import {
    LogEntry,
    LogCategory,
    LogPriority,
    Employee,
    MisconductRecord,
    AppLanguage,
    normalizeLanguage,
    LogStatus,
    OperationalLogReply,
    OperationalLogReadReceipt,
} from '../../types';
import { uploadToCloudinary } from '../utils';
import { DataManager } from '../../utils/dataManager';
import { ModuleGuideButton } from '../ui/ModuleGuide';
import { getOrgLevel } from '../../utils/orgAccess';
import { canManageOperationalLog } from '../../utils/notificationUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface LogbookModuleProps {
    viewOnly?: boolean;
    currentEmployee?: Employee;
    lang?: AppLanguage | string;
}

type MisconductType = 'SMALL' | 'MEDIUM' | 'BIG';
type QuickDateType  = 'TODAY' | 'YESTERDAY' | '7DAYS' | 'THIS_MONTH' | 'LAST_MONTH';
type TranslationTarget = 'zh' | 'en' | 'my';

const LOG_PAGE_SIZE = 30;

const TRANSLATION_UI: Record<TranslationTarget, {
    button: string;
    loading: string;
    title: string;
    failed: string;
    context: string;
    flag: string;
}> = {
    zh: {
        button: '翻译成中文',
        loading: '正在翻译成中文…',
        title: '中文翻译',
        failed: '翻译失败',
        context: '餐饮工作日志。请把任何语言翻译成自然、简洁、便于管理层和员工理解的简体中文工作用语。',
        flag: '🇨🇳'
    },
    en: {
        button: 'Translate to English',
        loading: 'Translating to English…',
        title: 'English Translation',
        failed: 'Translation failed',
        context: 'Restaurant operations log. Translate any input language into natural, concise workplace English for restaurant managers and staff.',
        flag: '🇬🇧'
    },
    my: {
        button: 'မြန်မာဘာသာသို့ ဘာသာပြန်ရန်',
        loading: 'မြန်မာဘာသာသို့ ဘာသာပြန်နေသည်…',
        title: 'မြန်မာဘာသာပြန်',
        failed: 'ဘာသာပြန်မအောင်မြင်ပါ',
        context: 'စားသောက်ဆိုင်လုပ်ငန်းမှတ်တမ်း။ မည်သည့်ဘာသာစကားကိုမဆို မြန်မာဝန်ထမ်းများ နားလည်လွယ်သော သဘာဝကျပြီး တိုတောင်းသည့် မြန်မာဘာသာသို့ ပြန်ဆိုပါ။',
        flag: '🇲🇲'
    }
};

const LOGBOOK_I18N: Record<'zh_en' | 'en' | 'my', {
    addLogTitle: string;
    categoryGeneral: string;
    categoryComplaint: string;
    categoryRepair: string;
    categoryVip: string;
    catLabelGeneral: string;
    catLabelComplaint: string;
    catLabelRepair: string;
    catLabelVip: string;
    priorityNormal: string;
    priorityHigh: string;
    assigneeLabel: string;
    unassigned: string;
    issueLabel: string;
    issuePlaceholder: string;
    actionLabel: string;
    actionPlaceholder: string;
    disciplineToggle: string;
    staffLabel: string;
    selectStaff: string;
    severityLabel: string;
    smallError: string;
    mediumError: string;
    bigError: string;
    smallWarningHint: string;
    mediumWarningHint: string;
    bigWarningHint: string;
    fineLabel: string;
    submitLog: string;
    today: string;
    yesterday: string;
    sevenDays: string;
    thisMonth: string;
    lastMonth: string;
    customDate: string;
    to: string;
    itemsCountSuffix: string;
    filterAll: string;
    filterHigh: string;
    filterComplaint: string;
    loadingLogs: string;
    noLogsFound: string;
    recentLogsHint: string;
    loadMore: string;
    loadingMore: string;
    statusResolved: string;
    statusInProgress: string;
    statusPending: string;
    urgentBadge: string;
    unassignedStaff: string;
    addReply: string;
    violationRecord: string;
    fine: string;
    loggedBy: string;
    seenBy: string;
    peopleSuffix: string;
    markRead: string;
    viewPhotoTitle: string;
    back: string;
    exitPhotoHint: string;
    addReplyTitle: string;
    addReplySub: string;
    replyPlaceholder: string;
    cancel: string;
    postReply: string;
    confirmDeleteTitle: string;
    confirmDeleteSub: string;
    confirmDeleteBtn: string;
    logSubmitted: string;
    submitFailed: string;
    deleteFailed: string;
    markReadFailed: string;
    saveFailed: string;
    statusUpdateFailed: string;
    assigneeUpdateFailed: string;
}> = {
    zh_en: {
        addLogTitle: '新增日志 (New Log)',
        categoryGeneral: '📝 日常记录 (General)',
        categoryComplaint: '😡 客诉处理 (Complaint)',
        categoryRepair: '🔧 设备维修 (Repair)',
        categoryVip: '👑 VIP 接待 (VIP)',
        catLabelGeneral: '日常记录',
        catLabelComplaint: '客诉处理',
        catLabelRepair: '设备维修',
        catLabelVip: 'VIP 接待',
        priorityNormal: '🟢 普通 (Normal)',
        priorityHigh: '🔴 紧急/重要 (High)',
        assigneeLabel: '负责人 (Optional Assignee)',
        unassigned: '暂不指派',
        issueLabel: '发生了什么? (Issue)',
        issuePlaceholder: '例如：2号桌客人投诉福建面太咸...',
        actionLabel: '采取了什么行动? (Action Taken)',
        actionPlaceholder: '例如：立即重做一份，并赠送凉茶致歉...',
        disciplineToggle: '记录违规与处罚 (Discipline)',
        staffLabel: 'Staff (责任人)',
        selectStaff: 'Select Staff...',
        severityLabel: 'Severity (错误等级)',
        smallError: '小错 (5x)',
        mediumError: '中错 (3x)',
        bigError: '大错 (1x)',
        smallWarningHint: '累计 5 次触发黄色警告 (Yellow Warning)',
        mediumWarningHint: '累计 3 次触发黄色警告 (Yellow Warning)',
        bigWarningHint: '直接触发黄色警告 (Direct Warning)',
        fineLabel: 'Fine (罚款 - Optional)',
        submitLog: '提交记录 (Submit)',
        today: '今日',
        yesterday: '昨日',
        sevenDays: '近7天',
        thisMonth: '本月',
        lastMonth: '上月',
        customDate: '自选日期',
        to: '至',
        itemsCountSuffix: '笔',
        filterAll: '全部日志 (All)',
        filterHigh: '紧急 (High)',
        filterComplaint: '客诉 (Complaint)',
        loadingLogs: '加载日志中...',
        noLogsFound: '该分类下暂无日志',
        recentLogsHint: '默认仅读取最新 30 条，减少流量；需要旧记录时可选择日期或加载更多。',
        loadMore: '加载更早 30 条',
        loadingMore: '正在加载...',
        statusResolved: '已解决',
        statusInProgress: '处理中',
        statusPending: '待处理',
        urgentBadge: '紧急',
        unassignedStaff: '未指派负责人',
        addReply: '添加回复',
        violationRecord: '违规记录',
        fine: '罚款',
        loggedBy: '记录人:',
        seenBy: '已阅',
        peopleSuffix: '人',
        markRead: '标记我已阅',
        viewPhotoTitle: '查看图片照片',
        back: '返回 (Back)',
        exitPhotoHint: '点击屏幕任意位置或左上角/右上角按钮即可返回 (Tap anywhere to exit)',
        addReplyTitle: '添加回复',
        addReplySub: '回复会保留姓名和时间，不会覆盖其他人的内容',
        replyPlaceholder: '输入处理进展、安排或最终结果…',
        cancel: '取消',
        postReply: '发布回复',
        confirmDeleteTitle: '确认删除?',
        confirmDeleteSub: '此操作无法撤销',
        confirmDeleteBtn: '确认删除',
        logSubmitted: '✅ 日志已提交 (已自动处理违规记录)',
        submitFailed: '提交失败',
        deleteFailed: '删除失败，请重试',
        markReadFailed: '标记已阅失败，请重试',
        saveFailed: '保存失败，请重试',
        statusUpdateFailed: '状态更新失败，请重试',
        assigneeUpdateFailed: '负责人更新失败，请重试',
    },
    en: {
        addLogTitle: 'Add New Log',
        categoryGeneral: '📝 General Log',
        categoryComplaint: '😡 Customer Complaint',
        categoryRepair: '🔧 Equipment Repair',
        categoryVip: '👑 VIP Reception',
        catLabelGeneral: 'General Log',
        catLabelComplaint: 'Customer Complaint',
        catLabelRepair: 'Equipment Repair',
        catLabelVip: 'VIP Reception',
        priorityNormal: '🟢 Normal',
        priorityHigh: '🔴 High / Urgent',
        assigneeLabel: 'Assignee (Optional)',
        unassigned: 'Unassigned',
        issueLabel: 'What happened? (Issue)',
        issuePlaceholder: 'e.g. Table 2 customer complained Hokkien Mee was too salty...',
        actionLabel: 'What action was taken? (Action Taken)',
        actionPlaceholder: 'e.g. Remade immediately and offered free herbal tea...',
        disciplineToggle: 'Record Violation & Discipline',
        staffLabel: 'Staff Member',
        selectStaff: 'Select Staff...',
        severityLabel: 'Severity Level',
        smallError: 'Minor (5x)',
        mediumError: 'Moderate (3x)',
        bigError: 'Major (1x)',
        smallWarningHint: '5 occurrences trigger yellow warning',
        mediumWarningHint: '3 occurrences trigger yellow warning',
        bigWarningHint: 'Directly triggers yellow warning',
        fineLabel: 'Fine Amount (Optional)',
        submitLog: 'Submit Log',
        today: 'Today',
        yesterday: 'Yesterday',
        sevenDays: '7 Days',
        thisMonth: 'This Month',
        lastMonth: 'Last Month',
        customDate: 'Custom Date',
        to: 'to',
        itemsCountSuffix: 'logs',
        filterAll: 'All Logs',
        filterHigh: 'High Priority',
        filterComplaint: 'Complaints',
        loadingLogs: 'Loading logs...',
        noLogsFound: 'No logs found under this filter',
        recentLogsHint: 'Only the latest 30 logs are loaded by default to reduce data usage. Choose a date or load more for older records.',
        loadMore: 'Load 30 Earlier Logs',
        loadingMore: 'Loading...',
        statusResolved: 'Resolved',
        statusInProgress: 'In Progress',
        statusPending: 'Pending',
        urgentBadge: 'URGENT',
        unassignedStaff: 'Unassigned',
        addReply: 'Add Reply',
        violationRecord: 'Violation Record',
        fine: 'Fine',
        loggedBy: 'Logged by:',
        seenBy: 'Seen by',
        peopleSuffix: '',
        markRead: 'Mark as Read',
        viewPhotoTitle: 'View Photo',
        back: 'Back',
        exitPhotoHint: 'Tap anywhere or top buttons to exit',
        addReplyTitle: 'Add Reply',
        addReplySub: 'Replies record your name & time without overwriting existing replies',
        replyPlaceholder: 'Enter progress update, action items, or final resolution...',
        cancel: 'Cancel',
        postReply: 'Post Reply',
        confirmDeleteTitle: 'Confirm Delete?',
        confirmDeleteSub: 'This action cannot be undone.',
        confirmDeleteBtn: 'Delete',
        logSubmitted: '✅ Log submitted successfully',
        submitFailed: 'Submission failed',
        deleteFailed: 'Delete failed, please try again',
        markReadFailed: 'Failed to mark as read, please try again',
        saveFailed: 'Save failed, please try again',
        statusUpdateFailed: 'Status update failed, please try again',
        assigneeUpdateFailed: 'Assignee update failed, please try again',
    },
    my: {
        addLogTitle: 'မှတ်တမ်းအသစ်ထည့်ရန် (Add Log)',
        categoryGeneral: '📝 နေ့စဉ်မှတ်တမ်း (General)',
        categoryComplaint: '😡 ဧည့်သည်တိုင်ကြားချက် (Complaint)',
        categoryRepair: '🔧 စက်ပစ္စည်းပြင်ဆင်ရေး (Repair)',
        categoryVip: '👑 VIP ဧည့်ခံပွဲ (VIP)',
        catLabelGeneral: 'နေ့စဉ်မှတ်တမ်း',
        catLabelComplaint: 'တိုင်ကြားချက်',
        catLabelRepair: 'ပြင်ဆင်ရေး',
        catLabelVip: 'VIP',
        priorityNormal: '🟢 ပုံမှန် (Normal)',
        priorityHigh: '🔴 အရေးကြီး/အရေးပေါ် (High)',
        assigneeLabel: 'တာဝန်ရှိသူ (Assignee)',
        unassigned: 'တာဝန်မပေးသေးပါ',
        issueLabel: 'ဘာဖြစ်ခဲ့သလဲ? (Issue)',
        issuePlaceholder: 'ဥပမာ - စားပွဲ ၂ မှ ဧည့်သည် တိုင်ကြားသည်...',
        actionLabel: 'မည်သို့အရေးယူဆောင်ရွက်ခဲ့သလဲ? (Action Taken)',
        actionPlaceholder: 'ဥပမာ - ချက်ချင်းပြန်လုပ်ပေးပြီး ဧည့်သည်အား တောင်းပန်ခဲ့သည်...',
        disciplineToggle: 'စည်းကမ်းဖောက်ဖျက်မှု မှတ်တမ်း',
        staffLabel: 'ဝန်ထမ်း (Staff)',
        selectStaff: 'ဝန်ထမ်းရွေးပါ...',
        severityLabel: 'အမှားအဆင့် (Severity)',
        smallError: 'အသေးအဖွဲ (5x)',
        mediumError: 'အလယ်အလတ် (3x)',
        bigError: 'အကြီးအကျယ် (1x)',
        smallWarningHint: '၅ ကြိမ်ပြည့်ပါက သတိပေးချက်ထုတ်မည်',
        mediumWarningHint: '၃ ကြိမ်ပြည့်ပါက သတိပေးချက်ထုတ်မည်',
        bigWarningHint: 'တိုက်ရိုက် သတိပေးချက်ထုတ်မည်',
        fineLabel: 'ဒဏ်ငွေ (Optional)',
        submitLog: 'မှတ်တမ်းတင်ရန် (Submit)',
        today: 'ယနေ့',
        yesterday: 'မနေ့က',
        sevenDays: '၇ ရက်',
        thisMonth: 'ဒီလ',
        lastMonth: 'ပြီးခဲ့သောလ',
        customDate: 'ရက်စွဲရွေးရန်',
        to: 'မှ',
        itemsCountSuffix: 'ခု',
        filterAll: 'မှတ်တမ်းအားလုံး (All)',
        filterHigh: 'အရေးကြီး (High)',
        filterComplaint: 'တိုင်ကြားချက် (Complaint)',
        loadingLogs: 'မှတ်တမ်းများ ရယူနေသည်...',
        noLogsFound: 'ဤကဏ္ဍတွင် မှတ်တမ်းမရှိပါ',
        recentLogsHint: 'ဒေတာအသုံးပြုမှု လျှော့ချရန် နောက်ဆုံးမှတ်တမ်း ၃၀ ခုကိုသာ ပုံမှန်ရယူပါသည်။ မှတ်တမ်းအဟောင်းအတွက် ရက်စွဲရွေးပါ သို့မဟုတ် ထပ်မံရယူပါ။',
        loadMore: 'အစောပိုင်းမှတ်တမ်း ၃၀ ခု ထပ်မံရယူရန်',
        loadingMore: 'ရယူနေသည်...',
        statusResolved: 'ဖြေရှင်းပြီး',
        statusInProgress: 'ဆောင်ရွက်ဆဲ',
        statusPending: 'စောင့်ဆိုင်းဆဲ',
        urgentBadge: 'အရေးကြီး',
        unassignedStaff: 'တာဝန်မပေးသေးပါ',
        addReply: 'ပြန်လည်ဖြေကြားရန်',
        violationRecord: 'စည်းကမ်းဖောက်ဖျက်မှု',
        fine: 'ဒဏ်ငွေ',
        loggedBy: 'မှတ်တမ်းတင်သူ:',
        seenBy: 'ကြည့်ရှုပြီး',
        peopleSuffix: 'ဦး',
        markRead: 'ဖတ်ပြီးပြီဟု မှတ်သားရန်',
        viewPhotoTitle: 'ဓာတ်ပုံကြည့်ရန်',
        back: 'နောက်သို့ (Back)',
        exitPhotoHint: 'ပိတ်ရန် မည်သည့်နေရာမဆို နှိပ်ပါ',
        addReplyTitle: 'ပြန်လည်ဖြေကြားရန်',
        addReplySub: 'အမည်နှင့် အချိန်ကို မှတ်တမ်းတင်မည်',
        replyPlaceholder: 'တိုးတက်မှု သို့မဟုတ် ရလဒ် ရေးသားပါ…',
        cancel: 'မလုပ်တော့ပါ',
        postReply: 'ပြန်လည်ဖြေကြားမည်',
        confirmDeleteTitle: 'ဖျက်ရန် သေချာပါသလား?',
        confirmDeleteSub: 'ဤလုပ်ဆောင်ချက်ကို ပြန်ပြင်၍မရပါ',
        confirmDeleteBtn: 'ဖျက်မည်',
        logSubmitted: '✅ မှတ်တမ်း တင်ပြီးပါပြီ',
        submitFailed: 'တင်ပြမှု မအောင်မြင်ပါ',
        deleteFailed: 'ဖျက်ဆီးမှု မအောင်မြင်ပါ',
        markReadFailed: 'ဖတ်ပြီးကြောင်း မှတ်သားမှု မအောင်မြင်ပါ',
        saveFailed: 'သိမ်းဆည်းမှု မအောင်မြင်ပါ',
        statusUpdateFailed: 'အခြေအနေ ပြောင်းလဲမှု မအောင်မြင်ပါ',
        assigneeUpdateFailed: 'တာဝန်ရှိသူ ပြောင်းလဲမှု မအောင်မြင်ပါ',
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const getCategoryLabel = (cat: LogCategory, langNorm: 'zh_en' | 'en' | 'my' = 'zh_en') => {
    const texts = LOGBOOK_I18N[langNorm] || LOGBOOK_I18N.zh_en;
    switch (cat) {
        case 'VIP':       return { label: texts.catLabelVip, color: 'bg-yellow-100 text-yellow-800 border-yellow-200', Icon: Zap };
        case 'COMPLAINT': return { label: texts.catLabelComplaint, color: 'bg-red-100 text-red-800 border-red-200',          Icon: AlertCircle };
        case 'REPAIR':    return { label: texts.catLabelRepair, color: 'bg-orange-100 text-orange-800 border-orange-200', Icon: PenTool };
        default:          return { label: texts.catLabelGeneral, color: 'bg-gray-100 text-gray-800 border-gray-200',       Icon: FileText };
    }
};

const toDateStr = (d: Date) => d.toISOString().split('T')[0];

const CategoryIcon = ({ cat, lang }: { cat: LogCategory; lang?: 'zh_en' | 'en' | 'my' }) => {
    const { Icon } = getCategoryLabel(cat, lang);
    return <Icon size={10} />;
};

// iOS: WebkitTapHighlightColor 内联样式常量，统一管理
const noTapHighlight: React.CSSProperties = { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' };

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export const LogbookModule: React.FC<LogbookModuleProps> = ({ viewOnly = false, currentEmployee, lang }) => {

    const activeLanguage = normalizeLanguage(lang || currentEmployee?.preferredLanguage);
    const t = LOGBOOK_I18N[activeLanguage] || LOGBOOK_I18N.zh_en;
    const translationTarget: TranslationTarget = activeLanguage === 'zh_en' ? 'zh' : activeLanguage;
    const translationUi = TRANSLATION_UI[translationTarget];

    const [logs,          setLogs]          = useState<LogEntry[]>([]);
    const [isLoading,     setIsLoading]     = useState(true);   // Fix #7: 加载状态
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMoreLogs,   setHasMoreLogs]   = useState(false);
    const [pagingBeforeId, setPagingBeforeId] = useState<string | null>(null);
    const [activeFilter,  setActiveFilter]  = useState<'ALL' | 'HIGH_PRIORITY' | 'COMPLAINT'>('ALL');
    const [employees,     setEmployees]     = useState<Employee[]>([]);
    const [translations,  setTranslations]  = useState<Record<string, {
        issue: string;
        replies: Record<string, string>;
        loading?: boolean;
        error?: string;
        lang?: TranslationTarget;
    }>>({});

    // A translation belongs to the page language in use. Clear visible results
    // after a language switch so an old Chinese/Burmese result is never shown
    // inside the English interface (and vice versa).
    useEffect(() => {
        setTranslations({});
    }, [translationTarget]);

    // 查看模式默认直接读取最新 30 条；只有员工主动筛选日期时才查询历史记录。
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [showDatePicker, setShowDatePicker] = useState(false);

    const loadDateRangeLogs = useCallback(async (start: string, end: string) => {
        if (!viewOnly || !start || !end) return;
        setIsLoading(true);
        try {
            const rangedLogs = await DataManager.getLogsByDateRange(start, end, 100);
            setLogs(rangedLogs);
            setHasMoreLogs(false);
            setPagingBeforeId(null);
        } catch (err) {
            console.error('Logbook date range load error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [viewOnly]);

    const resetToRecentLogs = useCallback(async () => {
        setDateRange({ start: '', end: '' });
        setShowDatePicker(false);
        if (!viewOnly) return;
        setIsLoading(true);
        try {
            const recentLogs = await DataManager.getRecentLogs(LOG_PAGE_SIZE);
            setLogs(recentLogs);
            setHasMoreLogs(recentLogs.length === LOG_PAGE_SIZE);
            setPagingBeforeId(recentLogs.length > 0 ? recentLogs[recentLogs.length - 1].id : null);
        } catch (err) {
            console.error('Logbook recent load error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [viewOnly]);

    const applyQuickDate = useCallback((type: QuickDateType) => {
        const now = new Date();
        const s   = new Date(now);
        const e   = new Date(now);
        if      (type === 'YESTERDAY')   { s.setDate(now.getDate() - 1); e.setDate(now.getDate() - 1); }
        else if (type === '7DAYS')       { s.setDate(now.getDate() - 7); }
        else if (type === 'THIS_MONTH')  { s.setDate(1); e.setMonth(e.getMonth() + 1); e.setDate(0); }
        else if (type === 'LAST_MONTH')  { s.setDate(1); s.setMonth(s.getMonth() - 1); e.setDate(0); }
        // TODAY: s = e = today，已是初始值，无需额外处理
        const nextRange = { start: toDateStr(s), end: toDateStr(e) };
        setDateRange(nextRange);
        setShowDatePicker(false);
        void loadDateRangeLogs(nextRange.start, nextRange.end);
    }, [loadDateRangeLogs]);

    // 表单状态
    const [form, setForm] = useState<{
        issue: string;
        action: string;
        category: LogCategory;
        priority: LogPriority;
        image: string;
        assignedEmployeeId: string;
    }>({
        issue: '',
        action: '',
        category: 'OTHER',
        priority: 'NORMAL',
        image: '',
        assignedEmployeeId: '',
    });

    // 违规表单（老板专用）
    const [showMisconduct, setShowMisconduct] = useState(false);
    const [misconductForm, setMisconductForm] = useState<{
        empId: string; type: MisconductType; fine: string;  // Fix #misc: 移除 as any
    }>({ empId: '', type: 'SMALL', fine: '' });

    const [isUploading,  setIsUploading]  = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 弹窗状态
    const [deleteCandidateId,       setDeleteCandidateId]       = useState<string | null>(null);
    const [viewImage,               setViewImage]               = useState<string | null>(null);
    const [solutionModalOpen,       setSolutionModalOpen]       = useState(false);
    const [selectedLogForSolution,  setSelectedLogForSolution]  = useState<LogEntry | null>(null);
    const [solutionText,            setSolutionText]            = useState('');
    const [isSavingReply,           setIsSavingReply]           = useState(false);
    const [updatingLogId,           setUpdatingLogId]           = useState<string | null>(null);
    const [focusedLogId,            setFocusedLogId]            = useState<string | null>(null);

    // 权限判断
    const isOwner = !!currentEmployee && getOrgLevel(currentEmployee) === 'OWNER';
    const canManageLog = useMemo(
        () => canManageOperationalLog(currentEmployee),
        [currentEmployee],
    );

    const handleTranslate = async (log: LogEntry) => {
        if (translations[log.id]?.loading) return;

        const targetLang = translationTarget;

        setTranslations(prev => ({
            ...prev,
            [log.id]: { issue: '', replies: {}, loading: true, lang: targetLang }
        }));

        try {
            const textsToTranslate = [log.issue];
            const replies = log.replies || [];
            replies.forEach(reply => textsToTranslate.push(reply.content));

            const res = await fetch('/api/gemini/translate-my', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: textsToTranslate,
                    targetLang,
                    context: translationUi.context
                })
            });

            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }

            const data = await res.json();
            if (data.error) {
                throw new Error(data.error);
            }

            const translatedTexts = data.translations || [];
            const translatedReplies = replies.reduce<Record<string, string>>((result, reply, index) => {
                result[reply.id] = translatedTexts[index + 1] || '';
                return result;
            }, {});
            setTranslations(prev => ({
                ...prev,
                [log.id]: {
                    issue: translatedTexts[0] || '',
                    replies: translatedReplies,
                    loading: false,
                    lang: targetLang
                }
            }));
        } catch (err: any) {
            console.error('Translation failed:', err);
            setTranslations(prev => ({
                ...prev,
                [log.id]: {
                    issue: '',
                    replies: {},
                    loading: false,
                    lang: targetLang,
                    error: err.message || translationUi.failed
                }
            }));
        }
    };

    // ── Fix #3: isMounted 守卫，防止卸载后 setState ───────────────────────────
    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            setIsLoading(true);
            try {
                const [l, e] = await Promise.all([
                    viewOnly
                        ? DataManager.getRecentLogs(LOG_PAGE_SIZE)
                        : DataManager.getLogs(),
                    DataManager.getEmployees(),
                ]);
                if (!isMounted) return;
                setLogs(l || []);
                setHasMoreLogs(viewOnly && (l || []).length === LOG_PAGE_SIZE);
                setPagingBeforeId(
                    viewOnly && (l || []).length > 0
                        ? l[l.length - 1].id
                        : null,
                );
                setEmployees((e || []).filter(emp => !emp.isArchived));
            } catch (err) {
                console.error('LogbookModule load error:', err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, [viewOnly]);

    // 通知中心点击后，仅补读目标日志，不为寻找旧记录而下载整批历史。
    useEffect(() => {
        if (isLoading) return;
        let cancelled = false;

        const focusNotificationLog = async () => {
            let targetLogId = '';
            try {
                targetLogId = localStorage.getItem('klk_notification_log_target') || '';
            } catch {}
            if (!targetLogId) return;

            let targetLog = logs.find(log => log.id === targetLogId) || null;
            if (!targetLog) {
                try {
                    targetLog = await DataManager.getLogById(targetLogId);
                } catch (err) {
                    console.error('Notification log load error:', err);
                }
            }
            if (cancelled || !targetLog) return;

            setLogs(prev => prev.some(log => log.id === targetLogId)
                ? prev
                : [...prev, targetLog as LogEntry]);
            setDateRange({ start: '', end: '' });
            setActiveFilter('ALL');
            setFocusedLogId(targetLogId);
            try {
                localStorage.removeItem('klk_notification_log_target');
            } catch {}

            window.setTimeout(() => {
                document.getElementById(`operational-log-${targetLogId}`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }, 120);
            window.setTimeout(() => setFocusedLogId(null), 3500);
        };

        void focusNotificationLog();
        return () => { cancelled = true; };
    }, [isLoading, logs]);

    const loadMoreLogs = useCallback(async () => {
        if (!viewOnly || !hasMoreLogs || !pagingBeforeId || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const olderLogs = await DataManager.getRecentLogs(LOG_PAGE_SIZE, pagingBeforeId);
            setLogs(prev => {
                const existingIds = new Set(prev.map(log => log.id));
                return [...prev, ...olderLogs.filter(log => !existingIds.has(log.id))];
            });
            setHasMoreLogs(olderLogs.length === LOG_PAGE_SIZE);
            setPagingBeforeId(
                olderLogs.length > 0 ? olderLogs[olderLogs.length - 1].id : null,
            );
        } catch (err) {
            console.error('Load earlier logs error:', err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [hasMoreLogs, isLoadingMore, pagingBeforeId, viewOnly]);

    // ── 图片上传 ──────────────────────────────────────────────────────────────
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            setForm(prev => ({ ...prev, image: url }));
        } catch {
            alert('Upload Failed');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Fix #4: 提交改用乐观更新，取消提交后多余的 getLogs() ─────────────────
    const handleAddLog = async () => {
        if (!form.issue.trim()) return alert('请填写发生事项 (Issue)');
        setIsSubmitting(true);
        try {
            let misconductData: MisconductRecord | undefined;
            if (showMisconduct && misconductForm.empId) {
                const emp = employees.find(e => e.id === misconductForm.empId);
                if (emp) {
                    misconductData = {
                        employeeId:   emp.id,
                        employeeName: emp.name,
                        type:         misconductForm.type,
                        fineAmount:   misconductForm.fine ? parseFloat(misconductForm.fine) : 0,
                    };
                }
            }

            const createdAt = new Date().toISOString();
            const logId = Date.now().toString();
            const assignee = employees.find(employee => employee.id === form.assignedEmployeeId);
            const initialReplies: OperationalLogReply[] = form.action.trim() && currentEmployee ? [{
                id: `initial-${logId}`,
                authorId: currentEmployee.id,
                authorName: currentEmployee.name,
                authorOrgLevel: getOrgLevel(currentEmployee),
                authorDepartment: currentEmployee.department,
                content: form.action.trim(),
                createdAt,
            }] : [];

            const newEntry: LogEntry = {
                id:          logId,
                date:        toDateStr(new Date()),
                time:        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                issue:       form.issue.trim(),
                action:      form.action,
                category:    form.category,
                priority:    form.priority,
                status:      'PENDING',
                creatorId:   currentEmployee?.id,
                creatorName: currentEmployee?.name || 'Staff',
                creatorDepartment: currentEmployee?.department,
                image:       form.image || '',
                replies:     initialReplies,
                readReceipts: [],
                assignedEmployeeId: assignee?.id,
                assignedEmployeeName: assignee?.name,
                assignedDepartment: assignee?.department,
                updatedAt: createdAt,
                misconduct:  misconductData,
            };

            const safeEntry: LogEntry = JSON.parse(JSON.stringify(newEntry));
            const savedEntry = await DataManager.addLog(
                safeEntry,
                currentEmployee ? { actor: currentEmployee, employees } : undefined,
            );

            // 乐观更新：新日志插到最前面，省去第二次 getLogs 读取
            setLogs(prev => [savedEntry, ...prev]);

            setForm({
                issue: '',
                action: '',
                category: 'OTHER',
                priority: 'NORMAL',
                image: '',
                assignedEmployeeId: '',
            });
            setMisconductForm({ empId: '', type: 'SMALL', fine: '' });
            setShowMisconduct(false);
            alert(t.logSubmitted);
        } catch (error: any) {
            console.error('Submit Log Error:', error);
            alert(`${t.submitFailed}: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Fix #5: confirmDelete 加 try-catch，失败时恢复列表 ───────────────────
    const confirmDelete = async () => {
        if (!deleteCandidateId) return;
        const backup = [...logs];
        setLogs(prev => prev.filter(l => l.id !== deleteCandidateId));
        setDeleteCandidateId(null);
        try {
            await DataManager.deleteLog(deleteCandidateId);
        } catch (err) {
            console.error('Delete failed:', err);
            setLogs(backup);                // 回滚
            alert(t.deleteFailed);
        }
    };

    // 每位管理者拥有独立的已阅记录，不再覆盖其他人的状态。
    const handleAcknowledge = async (id: string) => {
        if (!currentEmployee || !canManageLog) return;
        const now = new Date().toISOString();
        const receipt: OperationalLogReadReceipt = {
            employeeId: currentEmployee.id,
            employeeName: currentEmployee.name,
            readAt: now,
        };
        const backup     = [...logs];
        setLogs(prev => prev.map(log =>
            log.id === id
                ? {
                    ...log,
                    readReceipts: [
                        ...(log.readReceipts || []).filter(item => item.employeeId !== currentEmployee.id),
                        receipt,
                    ],
                }
                : log
        ));
        try {
            const updated = await DataManager.markLogRead(id, currentEmployee);
            setLogs(prev => prev.map(log => log.id === id ? updated : log));
        } catch (err) {
            console.error('Acknowledge failed:', err);
            setLogs(backup);               // 回滚
            alert(t.markReadFailed);
        }
    };

    const openSolutionModal = (log: LogEntry) => {
        setSelectedLogForSolution(log);
        setSolutionText('');
        setSolutionModalOpen(true);
    };

    // 追加独立回复；不会覆盖原来的解决方案或其他人的回复。
    const handleSaveSolution = async () => {
        if (!selectedLogForSolution || !currentEmployee || !canManageLog) return;
        const content = solutionText.trim();
        if (!content) return;
        const reply: OperationalLogReply = {
            id: `${Date.now()}-${currentEmployee.id}`,
            authorId: currentEmployee.id,
            authorName: currentEmployee.name,
            authorOrgLevel: getOrgLevel(currentEmployee),
            authorDepartment: currentEmployee.department,
            content,
            createdAt: new Date().toISOString(),
        };
        const backup = [...logs];
        setIsSavingReply(true);
        try {
            const updated = await DataManager.appendLogReply(
                selectedLogForSolution.id,
                reply,
                currentEmployee,
                employees,
            );
            setLogs(prev => prev.map(log => log.id === updated.id ? updated : log));
            setSolutionModalOpen(false);
            setSelectedLogForSolution(null);
            setSolutionText('');
        } catch (err) {
            console.error('Save solution failed:', err);
            setLogs(backup);
            alert(t.saveFailed);
        } finally {
            setIsSavingReply(false);
        }
    };

    const handleStatusChange = async (log: LogEntry, status: LogStatus) => {
        if (!currentEmployee || !canManageLog || log.status === status) return;
        const backup = [...logs];
        setUpdatingLogId(log.id);
        setLogs(prev => prev.map(item => item.id === log.id ? { ...item, status } : item));
        try {
            const updated = await DataManager.updateLogStatus(
                log.id,
                status,
                currentEmployee,
                employees,
            );
            setLogs(prev => prev.map(item => item.id === log.id ? updated : item));
        } catch (error) {
            console.error('Status update failed:', error);
            setLogs(backup);
            alert(t.statusUpdateFailed);
        } finally {
            setUpdatingLogId(null);
        }
    };

    const handleAssigneeChange = async (log: LogEntry, employeeId: string) => {
        if (!currentEmployee || !canManageLog) return;
        const assignee = employees.find(employee => employee.id === employeeId) || null;
        const backup = [...logs];
        setUpdatingLogId(log.id);
        setLogs(prev => prev.map(item => item.id === log.id ? {
            ...item,
            assignedEmployeeId: assignee?.id,
            assignedEmployeeName: assignee?.name,
            assignedDepartment: assignee?.department,
        } : item));
        try {
            const updated = await DataManager.assignLog(
                log.id,
                assignee,
                currentEmployee,
                employees,
            );
            setLogs(prev => prev.map(item => item.id === log.id ? updated : item));
        } catch (error) {
            console.error('Assignee update failed:', error);
            setLogs(backup);
            alert(t.assigneeUpdateFailed);
        } finally {
            setUpdatingLogId(null);
        }
    };

    // ── Fix #6: 排序 — 最新日志显示在最前 ───────────────────────────────────
    const filteredLogs = useMemo(() => {
        let list = [...logs];
        if (dateRange.start) list = list.filter(l => l.date >= dateRange.start);
        if (dateRange.end)   list = list.filter(l => l.date <= dateRange.end);
        if (activeFilter === 'HIGH_PRIORITY') list = list.filter(l => l.priority === 'HIGH');
        if (activeFilter === 'COMPLAINT')     list = list.filter(l => l.category === 'COMPLAINT');
        // 按日期+时间降序，最新优先
        list.sort((a, b) => {
            const da = `${a.date} ${a.time || ''}`;
            const db = `${b.date} ${b.time || ''}`;
            return db.localeCompare(da);
        });
        return list;
    }, [logs, dateRange, activeFilter]);

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        /*
         * iOS 适配：
         *  - pb-safe 兼容 Home Indicator
         *  - overflow-x-hidden 防弹性滚动溢出
         */
        <div
            className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-x-hidden"
            style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
        >

            {/* ── ADD LOG FORM ──────────────────────────────────────────────── */}
            {!viewOnly && (
                <div className="bg-white p-5 rounded-2xl shadow-lg border border-[#FFD700]/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FFD700] to-[#1A1A1A]" />
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-black text-[#1A1A1A] flex items-center gap-2">
                            <BookOpen size={20} className="text-[#FFD700] fill-current" />
                            {t.addLogTitle}
                        </h3>
                        <ModuleGuideButton module="LOGBOOK" dark />
                    </div>

                    <div className="space-y-4">
                        {/* 分类 & 优先级 */}
                        <div className="grid grid-cols-2 gap-3">
                            {/* iOS: select 最小高度 44px */}
                            <select
                                value={form.category}
                                onChange={e => setForm({ ...form, category: e.target.value as LogCategory })}
                                style={noTapHighlight}
                                className="w-full p-3 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD700]"
                            >
                                <option value="OTHER">{t.categoryGeneral}</option>
                                <option value="COMPLAINT">{t.categoryComplaint}</option>
                                <option value="REPAIR">{t.categoryRepair}</option>
                                <option value="VIP">{t.categoryVip}</option>
                            </select>
                            <select
                                value={form.priority}
                                onChange={e => setForm({ ...form, priority: e.target.value as LogPriority })}
                                style={noTapHighlight}
                                className={`w-full p-3 min-h-[44px] border rounded-xl text-xs font-bold outline-none focus:border-[#FFD700] ${form.priority === 'HIGH' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 border-gray-200'}`}
                            >
                                <option value="NORMAL">{t.priorityNormal}</option>
                                <option value="HIGH">{t.priorityHigh}</option>
                            </select>
                        </div>

                        {canManageLog && (
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block pl-1">
                                    {t.assigneeLabel}
                                </label>
                                <select
                                    value={form.assignedEmployeeId}
                                    onChange={event => setForm({
                                        ...form,
                                        assignedEmployeeId: event.target.value,
                                    })}
                                    style={noTapHighlight}
                                    className="w-full p-3 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-[#FFD200]"
                                >
                                    <option value="">{t.unassigned}</option>
                                    {employees
                                        .filter(employee => (employee.allowedModules || []).includes('LOGBOOK'))
                                        .map(employee => (
                                            <option key={employee.id} value={employee.id}>
                                                {employee.name} · {employee.role}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block pl-1">{t.issueLabel}</label>
                            <textarea
                                value={form.issue}
                                onChange={e => setForm({ ...form, issue: e.target.value })}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:border-[#FFD700] transition-colors resize-none h-20 placeholder:font-normal"
                                placeholder={t.issuePlaceholder}
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block pl-1">{t.actionLabel}</label>
                            <textarea
                                value={form.action}
                                onChange={e => setForm({ ...form, action: e.target.value })}
                                className="w-full p-3 bg-green-50/50 border border-green-100 rounded-xl text-sm font-bold outline-none focus:border-green-400 transition-colors resize-none h-16 placeholder:font-normal text-green-800"
                                placeholder={t.actionPlaceholder}
                            />
                        </div>

                        {/* 违规处罚（老板专用） */}
                        {isOwner && (
                            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                <label className="flex items-center gap-2 text-xs font-black text-red-700 cursor-pointer select-none min-h-[44px]" style={noTapHighlight}>
                                    <input
                                        type="checkbox"
                                        checked={showMisconduct}
                                        onChange={e => setShowMisconduct(e.target.checked)}
                                        className="accent-red-600 w-4 h-4"
                                    />
                                    <Gavel size={14} /> {t.disciplineToggle}
                                </label>

                                {showMisconduct && (
                                    <div className="space-y-3 mt-3 animate-in fade-in slide-in-from-top-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">{t.staffLabel}</label>
                                            <select
                                                value={misconductForm.empId}
                                                onChange={e => setMisconductForm({ ...misconductForm, empId: e.target.value })}
                                                style={noTapHighlight}
                                                className="w-full p-2.5 min-h-[44px] bg-white border border-red-200 rounded-lg text-xs font-bold outline-none"
                                            >
                                                <option value="">{t.selectStaff}</option>
                                                {/* Fix #4: (e.role || '') 防止 split 崩溃 */}
                                                {employees.filter(e => getOrgLevel(e) !== 'OWNER').map(e => (
                                                    <option key={e.id} value={e.id}>
                                                        {e.name} ({(e.role || '').split('(')[0].trim()})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold text-red-400 uppercase mb-1 block">{t.severityLabel}</label>
                                            <div className="flex gap-2">
                                                {([
                                                    { id: 'SMALL'  as MisconductType, l: t.smallError, c: 'bg-blue-100 text-blue-700 border-blue-200' },
                                                    { id: 'MEDIUM' as MisconductType, l: t.mediumError, c: 'bg-orange-100 text-orange-700 border-orange-200' },
                                                    { id: 'BIG'    as MisconductType, l: t.bigError, c: 'bg-red-600 text-white border-red-600' },
                                                ] as const).map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        style={noTapHighlight}
                                                        onClick={() => setMisconductForm({ ...misconductForm, type: opt.id })}
                                                        className={`flex-1 py-3 min-h-[44px] rounded-lg text-[10px] font-bold border transition-all select-none active:scale-95 ${misconductForm.type === opt.id ? opt.c : 'bg-white text-gray-500 border-gray-200'}`}
                                                    >
                                                        {opt.l}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="mt-1 text-[9px] text-red-500 italic">
                                                {misconductForm.type === 'SMALL'  && t.smallWarningHint}
                                                {misconductForm.type === 'MEDIUM' && t.mediumWarningHint}
                                                {misconductForm.type === 'BIG'    && t.bigWarningHint}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[10px] font-bold text-red-400 uppercase mb-1 flex items-center gap-1">
                                                <Coins size={10} /> {t.fineLabel}
                                            </label>
                                            <input
                                                type="number"
                                                value={misconductForm.fine}
                                                onChange={e => setMisconductForm({ ...misconductForm, fine: e.target.value })}
                                                className="w-full p-2.5 min-h-[44px] bg-white border border-red-200 rounded-lg text-xs font-bold outline-none"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 图片 + 提交 */}
                        <div className="flex items-center gap-3">
                            <div className="relative shrink-0">
                                {form.image ? (
                                    <div className="w-14 h-14 rounded-lg border border-gray-200 overflow-hidden relative group cursor-pointer">
                                        <img
                                            src={form.image}
                                            className="w-full h-full object-cover"
                                            // Fix #8: 加空值检查
                                            onClick={() => form.image && setViewImage(form.image)}
                                            alt="preview"
                                        />
                                        <button
                                            onClick={() => setForm(prev => ({ ...prev, image: '' }))}
                                            style={noTapHighlight}
                                            className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity select-none"
                                        >
                                            <X size={16} className="text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        style={noTapHighlight}
                                        className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center border border-dashed border-gray-300 hover:bg-gray-200 active:bg-gray-300 transition-colors select-none"
                                    >
                                        {isUploading
                                            ? <Loader2 size={18} className="animate-spin text-gray-400" />
                                            : <Camera size={20} className="text-gray-400" />}
                                    </button>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </div>
                            <button
                                onClick={handleAddLog}
                                disabled={isUploading || isSubmitting}
                                style={noTapHighlight}
                                className="flex-grow bg-[#1A1A1A] text-[#FFD700] h-14 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2 hover:bg-black disabled:opacity-50 disabled:scale-100 select-none"
                            >
                                {isSubmitting
                                    ? <Loader2 size={20} className="animate-spin" />
                                    : t.submitLog}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LOG LIST ──────────────────────────────────────────────────── */}
            <div className="space-y-4">

                {/* 日期筛选栏 */}
                <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 space-y-2">
                    {viewOnly && !dateRange.start && !dateRange.end && (
                        <div className="rounded-xl border border-[#FFD200]/35 bg-[#FFD200]/10 px-3 py-2 text-[10px] font-bold leading-relaxed text-stone-600">
                            {t.recentLogsHint}
                        </div>
                    )}
                    {/* iOS: overflow-x-auto + -webkit-overflow-scrolling */}
                    <div
                        className="flex items-center gap-1.5 overflow-x-auto"
                        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                    >
                        {([
                            { label: t.today,     value: 'TODAY'      },
                            { label: t.yesterday, value: 'YESTERDAY'  },
                            { label: t.sevenDays, value: '7DAYS'      },
                            { label: t.thisMonth, value: 'THIS_MONTH' },
                            { label: t.lastMonth, value: 'LAST_MONTH' },
                        ] as { label: string; value: QuickDateType }[]).map(item => (
                            <button
                                key={item.value}
                                onClick={() => applyQuickDate(item.value)}
                                style={noTapHighlight}
                                className="px-3 py-2 min-h-[44px] bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 rounded-lg text-[10px] font-bold whitespace-nowrap text-gray-500 transition-all shrink-0 select-none"
                            >
                                {item.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowDatePicker(p => !p)}
                            style={noTapHighlight}
                            className={`px-3 py-2 min-h-[44px] rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 flex items-center gap-1 transition-all select-none ${dateRange.start ? 'bg-blue-600 text-white border border-blue-600' : 'bg-white border border-gray-200 text-gray-500 hover:bg-blue-50'}`}
                        >
                            <Calendar size={10} />
                            {dateRange.start && dateRange.end
                                ? `${dateRange.start.slice(5)} ~ ${dateRange.end.slice(5)}`
                                : t.customDate}
                        </button>
                        {(dateRange.start || dateRange.end) && (
                            <button
                                onClick={() => { void resetToRecentLogs(); }}
                                style={noTapHighlight}
                                className="p-2 min-w-[44px] min-h-[44px] hover:bg-gray-100 active:bg-gray-200 rounded-full text-gray-400 shrink-0 flex items-center justify-center select-none"
                            >
                                <X size={12} />
                            </button>
                        )}
                        <span className="text-[10px] text-gray-400 font-bold ml-auto shrink-0">{filteredLogs.length} {t.itemsCountSuffix}</span>
                    </div>

                    {showDatePicker && (
                        <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-1">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="flex-1 bg-white text-xs font-bold p-2 min-h-[44px] outline-none rounded-lg border border-blue-200 text-center"
                            />
                            <span className="text-gray-400 text-xs font-bold shrink-0">{t.to}</span>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="flex-1 bg-white text-xs font-bold p-2 min-h-[44px] outline-none rounded-lg border border-blue-200 text-center"
                            />
                            <button
                                onClick={() => {
                                    setShowDatePicker(false);
                                    void loadDateRangeLogs(dateRange.start, dateRange.end);
                                }}
                                disabled={!dateRange.start || !dateRange.end}
                                style={noTapHighlight}
                                className="p-2.5 min-w-[44px] min-h-[44px] bg-blue-600 active:bg-blue-700 text-white rounded-lg shrink-0 flex items-center justify-center select-none disabled:opacity-40"
                            >
                                <CheckCircle2 size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* 分类 tab */}
                <div className="flex bg-gray-200/60 p-1 rounded-xl w-fit shadow-inner border border-gray-200">
                    {([
                        { key: 'ALL'           as const, label: t.filterAll,       extra: '' },
                        { key: 'HIGH_PRIORITY' as const, label: t.filterHigh,      extra: 'text-red-600' },
                        { key: 'COMPLAINT'     as const, label: t.filterComplaint, extra: 'text-orange-600' },
                    ]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            style={noTapHighlight}
                            className={`px-3 md:px-4 py-2 min-h-[44px] rounded-lg text-xs font-bold transition-all select-none active:scale-95 ${activeFilter === tab.key ? `bg-white shadow-sm ${tab.extra || 'text-[#1A1A1A]'}` : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Fix #7: Loading 状态 */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 size={28} className="animate-spin text-gray-300" />
                        <p className="text-xs text-gray-400 font-bold">{t.loadingLogs}</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 font-bold text-sm bg-white rounded-2xl border-2 border-dashed border-gray-200">
                        {t.noLogsFound}
                    </div>
                ) : (
                    filteredLogs.map(log => {
                        const catInfo = getCategoryLabel(log.category, activeLanguage);
                        const currentEmployeeHasRead = !!currentEmployee && (log.readReceipts || []).some(
                            receipt => receipt.employeeId === currentEmployee.id,
                        );
                        const statusStyle = log.status === 'RESOLVED'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : log.status === 'IN_PROGRESS'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200';
                        const statusLabel = log.status === 'RESOLVED'
                            ? t.statusResolved
                            : log.status === 'IN_PROGRESS'
                                ? t.statusInProgress
                                : t.statusPending;

                        return (
                            <div
                                key={log.id}
                                id={`operational-log-${log.id}`}
                                className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all border-l-4 ${
                                    log.priority === 'HIGH' ? 'border-l-red-500' : 'border-l-gray-300'
                                } ${
                                    focusedLogId === log.id
                                        ? 'ring-4 ring-[#FFD200]/45 border-[#FFD200] shadow-[0_12px_34px_rgba(255,210,0,0.2)]'
                                        : 'border-y-gray-100 border-r-gray-100'
                                }`}
                            >
                                <div className="p-4">
                                    {/* 头部：分类 badge + 时间 + 删除 */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0 mr-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border ${catInfo.color}`}>
                                                <CategoryIcon cat={log.category} /> {catInfo.label}
                                            </span>
                                            {log.priority === 'HIGH' && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white animate-pulse">{t.urgentBadge}</span>
                                            )}
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${statusStyle}`}>
                                                {statusLabel}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                <Clock size={10} /> {log.date} {log.time}
                                            </span>
                                        </div>
                                        {/* iOS: 删除按钮扩大热区 */}
                                        {canManageLog && (
                                            <button
                                                onClick={() => setDeleteCandidateId(log.id)}
                                                style={noTapHighlight}
                                                className="w-11 h-11 flex items-center justify-center text-gray-300 hover:text-red-500 active:text-red-600 rounded-full hover:bg-red-50 active:bg-red-100 transition-colors select-none shrink-0"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex gap-3">
                                        <div className="flex-grow space-y-2 min-w-0">
                                            <h5 className="font-bold text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap break-words">
                                                {log.issue}
                                            </h5>

                                            {/* 负责人和处理状态 */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                <div className="min-h-[42px] bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 flex items-center gap-2">
                                                    <UserCheck size={13} className="text-amber-600 shrink-0" />
                                                    {canManageLog ? (
                                                        <select
                                                            value={log.assignedEmployeeId || ''}
                                                            onChange={event => handleAssigneeChange(log, event.target.value)}
                                                            disabled={updatingLogId === log.id}
                                                            className="w-full bg-transparent outline-none text-[10px] font-black text-stone-700 disabled:opacity-50"
                                                        >
                                                            <option value="">{t.unassignedStaff}</option>
                                                            {employees
                                                                .filter(employee => (employee.allowedModules || []).includes('LOGBOOK'))
                                                                .map(employee => (
                                                                    <option key={employee.id} value={employee.id}>
                                                                        {employee.name} · {employee.role}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    ) : (
                                                        <span className="text-[10px] font-black text-stone-600">
                                                            {log.assignedEmployeeName || t.unassignedStaff}
                                                        </span>
                                                    )}
                                                </div>

                                                {canManageLog && (
                                                    <div className="min-h-[42px] bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 flex items-center gap-2">
                                                        {updatingLogId === log.id
                                                            ? <Loader2 size={13} className="animate-spin text-blue-500" />
                                                            : <CheckCircle2 size={13} className="text-blue-600" />}
                                                        <select
                                                            value={log.status}
                                                            onChange={event => handleStatusChange(log, event.target.value as LogStatus)}
                                                            disabled={updatingLogId === log.id}
                                                            className="w-full bg-transparent outline-none text-[10px] font-black text-stone-700 disabled:opacity-50"
                                                        >
                                                            <option value="PENDING">{t.statusPending}</option>
                                                            <option value="IN_PROGRESS">{t.statusInProgress}</option>
                                                            <option value="RESOLVED">{t.statusResolved}</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 多人回复时间线 */}
                                            {(log.replies || []).length > 0 && (
                                                <div className="mt-3 border-l-2 border-[#FFD200]/60 pl-3 space-y-2.5">
                                                    {(log.replies || []).map(reply => (
                                                        <div key={reply.id} className="bg-[#F6F7FB] border border-gray-100 rounded-xl p-3">
                                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <span className="w-6 h-6 rounded-full bg-[#111111] text-[#FFD200] flex items-center justify-center text-[9px] font-black shrink-0">
                                                                        {reply.legacy ? '旧' : reply.authorName.charAt(0)}
                                                                    </span>
                                                                    <span className="text-[10px] font-black text-stone-800 truncate">
                                                                        {reply.authorName}
                                                                    </span>
                                                                    {reply.authorOrgLevel && (
                                                                        <span className="text-[8px] font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                                                            {reply.authorOrgLevel === 'OWNER'
                                                                                ? 'L1'
                                                                                : reply.authorOrgLevel === 'BRANCH_MANAGER'
                                                                                    ? 'L2'
                                                                                    : reply.authorOrgLevel === 'DEPARTMENT_HEAD'
                                                                                        ? 'L3'
                                                                                        : reply.authorOrgLevel === 'TEAM_LEAD'
                                                                                            ? 'L4'
                                                                                            : 'L5'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <time className="text-[9px] font-bold text-stone-400 shrink-0">
                                                                    {reply.createdAt.includes('T')
                                                                        ? new Date(reply.createdAt).toLocaleString([], {
                                                                            month: 'short',
                                                                            day: 'numeric',
                                                                            hour: '2-digit',
                                                                            minute: '2-digit',
                                                                        })
                                                                        : reply.createdAt}
                                                                </time>
                                                            </div>
                                                            <p className="text-xs text-stone-700 font-medium leading-relaxed whitespace-pre-wrap break-words">
                                                                {reply.content}
                                                            </p>
                                                            {translations[log.id]?.replies?.[reply.id] && (
                                                                <p className="mt-2 pt-2 border-t border-stone-200 text-xs text-amber-800 font-medium leading-relaxed whitespace-pre-wrap">
                                                                    {translations[log.id].replies[reply.id]}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {canManageLog && (
                                                <button
                                                    onClick={() => openSolutionModal(log)}
                                                    style={noTapHighlight}
                                                    className="w-full mt-2 py-3 min-h-[44px] bg-[#FFD200]/15 border border-[#FFD200]/60 rounded-xl text-stone-800 text-xs font-black flex items-center justify-center gap-2 hover:bg-[#FFD200]/25 active:scale-[0.99] transition-all select-none"
                                                >
                                                    <MessageCircle size={14} />
                                                    {t.addReply}
                                                </button>
                                            )}

                                            {/* 违规记录 */}
                                            {log.misconduct && (
                                                <div className="bg-red-50 p-2 rounded-lg border border-red-100 mt-2">
                                                    <div className="flex justify-between items-center text-[10px] font-black text-red-700 uppercase mb-1">
                                                        <span className="flex items-center gap-1"><Gavel size={10} /> {t.violationRecord}</span>
                                                        <span>{log.misconduct.type}</span>
                                                    </div>
                                                    <p className="text-xs text-red-800 font-bold">{log.misconduct.employeeName}</p>
                                                    {!!log.misconduct.fineAmount && (
                                                        <p className="text-[10px] text-red-600 mt-0.5">{t.fine}: RM {log.misconduct.fineAmount}</p>
                                                    )}
                                                    {log.misconduct.actionResult && (
                                                        <p className="text-[10px] text-red-500 mt-1 italic">{log.misconduct.actionResult}</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* 翻译展示 (Bidirectional Translation Display) */}
                                            {translations[log.id] && (
                                                <div className="mt-2 animate-in fade-in slide-in-from-top-1">
                                                    {translations[log.id].loading ? (
                                                        <div className={`flex items-center gap-1.5 text-xs font-bold p-2.5 rounded-lg border ${
                                                            translations[log.id].lang === 'zh'
                                                                ? 'text-blue-700 bg-blue-50/50 border-blue-200/30'
                                                                : 'text-amber-700 bg-amber-50/50 border-amber-200/30'
                                                        }`}>
                                                            <Loader2 size={12} className={`animate-spin ${translations[log.id].lang === 'zh' ? 'text-blue-500' : 'text-amber-500'}`} />
                                                            <span>{TRANSLATION_UI[translations[log.id].lang || translationTarget].loading}</span>
                                                        </div>
                                                    ) : translations[log.id].error ? (
                                                        <div className="text-[10px] text-red-500 font-bold bg-red-50 p-2 rounded-lg border border-red-100 flex items-center justify-between">
                                                            <span>⚠️ {TRANSLATION_UI[translations[log.id].lang || translationTarget].failed}: {translations[log.id].error}</span>
                                                            <button
                                                                onClick={() => setTranslations(prev => {
                                                                    const copy = { ...prev };
                                                                    delete copy[log.id];
                                                                    return copy;
                                                                })}
                                                                className="text-stone-400 hover:text-stone-600 active:scale-90 transition-all outline-none p-1"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className={`border p-3 rounded-xl space-y-2 relative ${
                                                            translations[log.id].lang === 'zh'
                                                                ? 'bg-blue-50/40 border-blue-200/30'
                                                                : 'bg-amber-50/40 border-amber-200/30'
                                                        }`}>
                                                            <div className="flex items-center justify-between gap-1.5 text-[10px] font-black tracking-wider uppercase">
                                                                <span className={translations[log.id].lang === 'zh' ? 'text-blue-800' : 'text-amber-800'}>
                                                                    {TRANSLATION_UI[translations[log.id].lang || translationTarget].flag}{' '}
                                                                    {TRANSLATION_UI[translations[log.id].lang || translationTarget].title}
                                                                </span>
                                                                <button
                                                                    onClick={() => setTranslations(prev => {
                                                                        const copy = { ...prev };
                                                                        delete copy[log.id];
                                                                        return copy;
                                                                    })}
                                                                    className="text-stone-400 hover:text-stone-600 active:scale-90 transition-all p-1 -mr-1 -mt-1 outline-none"
                                                                    title="清除翻译 (Clear)"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                            <p className="text-xs text-stone-800 font-semibold leading-relaxed break-words whitespace-pre-wrap">
                                                                {translations[log.id].issue}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* 底部：记录人 + 已阅 */}
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-gray-100">
                                                    <Shield size={10} /> {t.loggedBy} {log.creatorName}
                                                </span>

                                                {/* One translation action which follows the current page language. */}
                                                {!translations[log.id]?.issue && !translations[log.id]?.loading && (
                                                    <button
                                                        onClick={() => handleTranslate(log)}
                                                        style={noTapHighlight}
                                                        className="text-[10px] text-stone-800 font-bold bg-[#FFD200]/20 border border-[#FFD200]/50 px-2.5 py-1.5 min-h-[36px] rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 hover:bg-[#FFD200]/30 transition-all select-none cursor-pointer"
                                                    >
                                                        <Languages size={12} />
                                                        <span>{translationUi.flag}</span>
                                                        {translationUi.button}
                                                    </button>
                                                )}

                                                {(log.readReceipts || []).length > 0 && (
                                                    <span
                                                        className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-1.5 rounded-lg flex items-center gap-1 border border-blue-100"
                                                        title={(log.readReceipts || []).map(receipt =>
                                                            `${receipt.employeeName} · ${receipt.readAt}`
                                                        ).join('\n')}
                                                    >
                                                        <CheckCircle2 size={10} />
                                                        {t.seenBy} {(log.readReceipts || []).length} {t.peopleSuffix}
                                                        <span className="text-blue-400">
                                                            · {(log.readReceipts || [])
                                                                .slice(-3)
                                                                .map(receipt => receipt.employeeName)
                                                                .join('、')}
                                                        </span>
                                                    </span>
                                                )}

                                                {canManageLog && !currentEmployeeHasRead && (
                                                    <button
                                                        onClick={() => handleAcknowledge(log.id)}
                                                        style={noTapHighlight}
                                                        className="text-[10px] text-white font-bold bg-blue-500 px-2.5 py-1.5 min-h-[32px] rounded-lg flex items-center gap-1 shadow-sm active:scale-95 hover:bg-blue-600 transition-all select-none"
                                                    >
                                                        <Check size={10} /> {t.markRead}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* 附图 — iOS: cursor-zoom-in 在移动端显示为放大镜 */}
                                        {log.image && (
                                            <div
                                                className="w-20 h-20 rounded-lg bg-gray-100 border border-gray-200 shrink-0 overflow-hidden cursor-zoom-in relative group"
                                                onClick={() => setViewImage(log.image || null)}
                                                style={noTapHighlight}
                                            >
                                                <img
                                                    src={log.image}
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                                    alt="log"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                    <Maximize2 size={16} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}

                {!isLoading && viewOnly && hasMoreLogs && !dateRange.start && !dateRange.end && (
                    <button
                        type="button"
                        onClick={() => { void loadMoreLogs(); }}
                        disabled={isLoadingMore}
                        style={noTapHighlight}
                        className="w-full min-h-[48px] rounded-xl border border-[#FFD200]/45 bg-white text-xs font-black text-[#111111] shadow-sm transition-all hover:bg-[#FFD200]/10 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoadingMore
                            ? <Loader2 size={15} className="animate-spin" />
                            : <ChevronDown size={15} />}
                        {isLoadingMore ? t.loadingMore : t.loadMore}
                    </button>
                )}
            </div>

            {/* ── MODALS ────────────────────────────────────────────────────── */}

            {/* 图片放大 (Photo Fullscreen Viewer) */}
            {viewImage && (
                <div
                    className="fixed inset-0 bg-black/95 z-[250] flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200 select-none cursor-pointer"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 16px), 16px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
                    }}
                    onClick={() => setViewImage(null)}
                >
                    {/* 顶部操作栏 (Top Action Bar with Back & Close) */}
                    <div className="w-full max-w-4xl flex items-center justify-between z-10 shrink-0 py-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setViewImage(null);
                            }}
                            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2.5 rounded-full backdrop-blur-md border border-white/20 transition-all shadow-xl active:scale-95 text-sm font-bold cursor-pointer"
                            id="logbook-photo-back-btn"
                            style={{ minWidth: '44px', minHeight: '44px' }}
                        >
                            <ArrowLeft size={20} className="stroke-[2.5]" />
                            <span>{t.back}</span>
                        </button>

                        <span className="text-white/80 font-bold text-xs sm:text-sm tracking-wide bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10">
                            {t.viewPhotoTitle}
                        </span>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setViewImage(null);
                            }}
                            className="bg-white/20 hover:bg-white/30 text-white p-2.5 rounded-full backdrop-blur-md border border-white/20 transition-all shadow-xl active:scale-95 flex items-center justify-center cursor-pointer"
                            id="logbook-photo-close-btn"
                            style={{ minWidth: '44px', minHeight: '44px' }}
                            aria-label="Close"
                        >
                            <X size={22} className="stroke-[2.5]" />
                        </button>
                    </div>

                    {/* 中央主图 (Center Image) */}
                    <div className="flex-1 w-full max-w-4xl flex items-center justify-center my-2 overflow-hidden">
                        <img
                            src={viewImage}
                            className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                            onClick={() => setViewImage(null)}
                            alt="Logbook full photo"
                        />
                    </div>

                    {/* 底部提示语 (Bottom Hint) */}
                    <div className="shrink-0 text-center z-10">
                        <p className="text-xs text-gray-400 font-semibold tracking-wide">
                            {t.exitPhotoHint}
                        </p>
                    </div>
                </div>
            )}

            {/* 多人回复 */}
            {solutionModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
                    <div
                        className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl"
                        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-9 h-9 rounded-xl bg-[#FFD200] text-[#111111] flex items-center justify-center">
                                <MessageCircle size={17} />
                            </div>
                            <div>
                                <h4 className="font-black text-[#1A1A1A]">{t.addReplyTitle}</h4>
                                <p className="text-[10px] font-bold text-stone-400">
                                    {t.addReplySub}
                                </p>
                            </div>
                        </div>
                        {selectedLogForSolution && (
                            <p className="mb-3 p-3 bg-stone-50 rounded-xl text-xs font-bold text-stone-600 line-clamp-2 border border-stone-100">
                                {selectedLogForSolution.issue}
                            </p>
                        )}
                        <textarea
                            value={solutionText}
                            onChange={e => setSolutionText(e.target.value)}
                            className="w-full p-3 border-2 border-gray-200 rounded-xl text-sm font-bold outline-none h-32 resize-none mb-4 focus:border-green-400"
                            placeholder={t.replyPlaceholder}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setSolutionModalOpen(false); setSelectedLogForSolution(null); setSolutionText(''); }}
                                style={noTapHighlight}
                                className="flex-1 py-3 min-h-[48px] bg-gray-100 font-bold rounded-xl text-sm active:bg-gray-200 select-none"
                            >
                                {t.cancel}
                            </button>
                            <button
                                onClick={handleSaveSolution}
                                disabled={!solutionText.trim() || isSavingReply}
                                style={noTapHighlight}
                                className="flex-[2] py-3 min-h-[48px] bg-[#111111] text-[#FFD200] font-bold rounded-xl text-sm active:scale-[0.99] select-none disabled:opacity-45 flex items-center justify-center gap-2"
                            >
                                {isSavingReply
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : <Send size={16} />}
                                {t.postReply}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 删除确认 */}
            {deleteCandidateId && (
                <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4">
                    <div
                        className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-2xl"
                        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
                    >
                        <h4 className="text-xl font-black mb-1">{t.confirmDeleteTitle}</h4>
                        <p className="text-xs text-gray-400 mb-4">{t.confirmDeleteSub}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setDeleteCandidateId(null)}
                                style={noTapHighlight}
                                className="py-3 min-h-[48px] bg-gray-100 font-bold rounded-xl text-sm active:bg-gray-200 select-none"
                            >
                                {t.cancel}
                            </button>
                            <button
                                onClick={confirmDelete}
                                style={noTapHighlight}
                                className="py-3 min-h-[48px] bg-red-600 text-white font-bold rounded-xl text-sm active:bg-red-700 select-none"
                            >
                                {t.confirmDeleteBtn}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
