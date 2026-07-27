import {
    Employee,
    LocalizedNotificationText,
    LogEntry,
    LogStatus,
    NotificationEventType,
    OperationalLogReply,
    SystemNotification,
} from '../types';
import { getOrgLevel } from './orgAccess';

export type LogNotificationEvent =
    | { type: 'LOGBOOK_NEW'; eventId: string }
    | { type: 'LOGBOOK_REPLY'; eventId: string; reply: OperationalLogReply }
    | { type: 'LOGBOOK_ASSIGNED'; eventId: string; assignedEmployeeId: string }
    | { type: 'LOGBOOK_STATUS'; eventId: string; status: LogStatus };

const LOGBOOK_MODULE = 'LOGBOOK';

const normalizeEmployeeId = (value?: string | null) => String(value || '').trim();

export const canViewOperationalLog = (employee: Employee): boolean => {
    const orgLevel = getOrgLevel(employee);
    if (orgLevel === 'OWNER') return true;
    return (employee.allowedModules || []).includes(LOGBOOK_MODULE);
};

export const canManageOperationalLog = (employee?: Employee | null): boolean => {
    if (!employee) return false;
    const orgLevel = getOrgLevel(employee);
    if (orgLevel === 'OWNER') return true;
    return (
        (orgLevel === 'BRANCH_MANAGER' || orgLevel === 'DEPARTMENT_HEAD') &&
        (employee.allowedModules || []).includes(LOGBOOK_MODULE)
    );
};

const resolveEmployeeIdByName = (
    name: string | undefined,
    employees: Employee[],
): string | undefined => {
    if (!name) return undefined;
    return employees.find(employee => employee.name.trim() === name.trim())?.id;
};

const getParticipantIds = (log: LogEntry, employees: Employee[]): string[] => {
    const ids = new Set<string>();
    const creatorId = normalizeEmployeeId(log.creatorId) ||
        resolveEmployeeIdByName(log.creatorName, employees);
    if (creatorId) ids.add(creatorId);
    if (log.assignedEmployeeId) ids.add(normalizeEmployeeId(log.assignedEmployeeId));
    (log.replies || []).forEach(reply => {
        if (reply.authorId && !reply.legacy) ids.add(normalizeEmployeeId(reply.authorId));
    });
    return Array.from(ids);
};

export const selectOperationalLogRecipients = (
    event: LogNotificationEvent,
    log: LogEntry,
    actor: Employee,
    employees: Employee[],
): Employee[] => {
    const recipientIds = new Set<string>();

    if (event.type === 'LOGBOOK_NEW') {
        const relatedDepartment = log.assignedDepartment || log.creatorDepartment;
        employees.forEach(employee => {
            const level = getOrgLevel(employee);
            if (
                level === 'OWNER' ||
                (
                    level === 'BRANCH_MANAGER' &&
                    canViewOperationalLog(employee)
                ) ||
                (
                    level === 'DEPARTMENT_HEAD' &&
                    canViewOperationalLog(employee) &&
                    (
                        !relatedDepartment ||
                        !employee.department ||
                        employee.department === relatedDepartment
                    )
                )
            ) {
                recipientIds.add(normalizeEmployeeId(employee.id));
            }
        });
        if (log.assignedEmployeeId) recipientIds.add(normalizeEmployeeId(log.assignedEmployeeId));
    } else if (event.type === 'LOGBOOK_ASSIGNED') {
        recipientIds.add(normalizeEmployeeId(event.assignedEmployeeId));
    } else {
        getParticipantIds(log, employees).forEach(id => recipientIds.add(id));
    }

    recipientIds.delete(normalizeEmployeeId(actor.id));

    return employees.filter(employee =>
        !employee.isArchived &&
        recipientIds.has(normalizeEmployeeId(employee.id)) &&
        canViewOperationalLog(employee)
    );
};

const clip = (value: string, max = 72): string => {
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const statusLabels: Record<LogStatus, LocalizedNotificationText> = {
    PENDING: { zh_en: '待处理', en: 'Pending', my: 'စောင့်ဆိုင်းနေသည်' },
    IN_PROGRESS: { zh_en: '处理中', en: 'In progress', my: 'ဆောင်ရွက်နေသည်' },
    RESOLVED: { zh_en: '已解决', en: 'Resolved', my: 'ဖြေရှင်းပြီး' },
};

const eventCopy = (
    event: LogNotificationEvent,
    log: LogEntry,
    actor: Employee,
): { title: LocalizedNotificationText; message: LocalizedNotificationText } => {
    const issue = clip(log.issue);

    switch (event.type) {
        case 'LOGBOOK_REPLY': {
            const reply = clip(event.reply.content);
            return {
                title: {
                    zh_en: '运营日志有新回复',
                    en: 'New operational log reply',
                    my: 'လုပ်ငန်းမှတ်တမ်းတွင် စာပြန်အသစ်',
                },
                message: {
                    zh_en: `${actor.name} 回复：${reply}`,
                    en: `${actor.name} replied: ${reply}`,
                    my: `${actor.name} က စာပြန်ထားသည်: ${reply}`,
                },
            };
        }
        case 'LOGBOOK_ASSIGNED':
            return {
                title: {
                    zh_en: '你被指派处理运营日志',
                    en: 'Operational log assigned to you',
                    my: 'လုပ်ငန်းမှတ်တမ်းတစ်ခုကို သင့်အား တာဝန်ပေးထားသည်',
                },
                message: {
                    zh_en: `${actor.name} 指派：${issue}`,
                    en: `${actor.name} assigned: ${issue}`,
                    my: `${actor.name} က တာဝန်ပေးထားသည်: ${issue}`,
                },
            };
        case 'LOGBOOK_STATUS': {
            const status = statusLabels[event.status];
            return {
                title: {
                    zh_en: '运营日志状态已更新',
                    en: 'Operational log status updated',
                    my: 'လုပ်ငန်းမှတ်တမ်း အခြေအနေ ပြောင်းလဲထားသည်',
                },
                message: {
                    zh_en: `${actor.name} 更新为「${status.zh_en}」：${issue}`,
                    en: `${actor.name} changed it to “${status.en}”: ${issue}`,
                    my: `${actor.name} က “${status.my}” သို့ ပြောင်းထားသည်: ${issue}`,
                },
            };
        }
        case 'LOGBOOK_NEW':
        default:
            return {
                title: {
                    zh_en: log.priority === 'HIGH' ? '紧急运营日志' : '新的运营日志',
                    en: log.priority === 'HIGH' ? 'Urgent operational log' : 'New operational log',
                    my: log.priority === 'HIGH'
                        ? 'အရေးပေါ် လုပ်ငန်းမှတ်တမ်း'
                        : 'လုပ်ငန်းမှတ်တမ်းအသစ်',
                },
                message: {
                    zh_en: `${actor.name} 新增：${issue}`,
                    en: `${actor.name} added: ${issue}`,
                    my: `${actor.name} က အသစ်ထည့်ထားသည်: ${issue}`,
                },
            };
    }
};

const safeIdPart = (value: string): string =>
    value.replace(/[^a-zA-Z0-9_-]/g, '_');

export const buildOperationalLogNotifications = (
    event: LogNotificationEvent,
    log: LogEntry,
    actor: Employee,
    employees: Employee[],
    createdAt = new Date().toISOString(),
): SystemNotification[] => {
    const copy = eventCopy(event, log, actor);
    return selectOperationalLogRecipients(event, log, actor, employees).map(recipient => ({
        id: `${safeIdPart(event.eventId)}__${safeIdPart(recipient.id)}`,
        recipientEmployeeId: recipient.id,
        recipientName: recipient.name,
        eventType: event.type as NotificationEventType,
        module: 'LOGBOOK',
        entityId: log.id,
        title: copy.title,
        message: copy.message,
        actorId: actor.id,
        actorName: actor.name,
        priority: log.priority,
        createdAt,
    }));
};

export const getLocalizedNotificationText = (
    text: LocalizedNotificationText,
    language?: string | null,
): string => {
    if (language === 'my') return text.my;
    if (language === 'en') return text.en;
    return text.zh_en;
};
