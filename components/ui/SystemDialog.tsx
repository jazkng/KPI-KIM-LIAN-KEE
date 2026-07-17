import React, { createContext, useContext, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info, 
  HelpCircle, 
  X, 
  RefreshCw, 
  FileText, 
  HelpCircle as QuestionIcon,
  CheckCircle2 as SuccessIcon,
  CornerDownRight
} from 'lucide-react';

export type DialogStatus = 'success' | 'error' | 'warning' | 'info' | 'neutral';

export interface DialogCard {
  id?: string;
  status: DialogStatus;
  title: string;
  description: string | React.ReactNode;
  icon?: React.ReactNode;
}

export interface SystemDialogOptions {
  module?: string;
  title?: string;
  status?: DialogStatus;
  cards: DialogCard[];
  primaryButtonText?: string;
  secondaryButtonText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  showCloseButton?: boolean;
}

interface SystemDialogContextProps {
  show: (options: SystemDialogOptions) => Promise<boolean>;
  alert: (message: string, module?: string) => Promise<void>;
  confirm: (message: string, module?: string) => Promise<boolean>;
}

const SystemDialogContext = createContext<SystemDialogContextProps | null>(null);

export function useSystemDialog() {
  const context = useContext(SystemDialogContext);
  if (!context) {
    throw new Error('useSystemDialog must be used within a SystemDialogProvider');
  }
  return context;
}

// Custom CSS styled components
export const StatusCard: React.FC<DialogCard> = ({ status, title, description, icon }) => {
  const themeClasses = {
    success: {
      bg: 'bg-[#ECFDF5]',
      border: 'border-[#6EE7B7]',
      text: 'text-[#047857]',
      iconColor: 'text-[#047857]'
    },
    error: {
      bg: 'bg-[#FFF1F2]',
      border: 'border-[#FDA4AF]',
      text: 'text-[#BE123C]',
      iconColor: 'text-[#BE123C]'
    },
    warning: {
      bg: 'bg-[#FFFBEB]',
      border: 'border-[#FCD34D]',
      text: 'text-[#92400E]',
      iconColor: 'text-[#92400E]'
    },
    info: {
      bg: 'bg-[#EFF6FF]',
      border: 'border-[#93C5FD]',
      text: 'text-[#1D4ED8]',
      iconColor: 'text-[#1D4ED8]'
    },
    neutral: {
      bg: 'bg-[#F8FAFC]',
      border: 'border-[#CBD5E1]',
      text: 'text-[#334155]',
      iconColor: 'text-[#334155]'
    }
  };

  const currentTheme = themeClasses[status];

  const getDefaultIcon = () => {
    switch (status) {
      case 'success': return <CheckCircle2 size={20} className={currentTheme.iconColor} />;
      case 'error': return <XCircle size={20} className={currentTheme.iconColor} />;
      case 'warning': return <AlertTriangle size={20} className={currentTheme.iconColor} />;
      case 'info': return <Info size={20} className={currentTheme.iconColor} />;
      default: return <HelpCircle size={20} className={currentTheme.iconColor} />;
    }
  };

  return (
    <div className={`flex gap-3 p-4 rounded-xl border ${currentTheme.bg} ${currentTheme.border} transition-all duration-200`}>
      <div className="flex-shrink-0 mt-0.5">
        {icon || getDefaultIcon()}
      </div>
      <div className="flex-grow">
        <h4 className={`text-sm font-bold mb-1 leading-snug ${currentTheme.text}`}>
          {title}
        </h4>
        <div className={`text-xs font-medium leading-relaxed opacity-90 ${currentTheme.text}`}>
          {typeof description === 'string' ? (
            <p className="whitespace-pre-wrap">{description}</p>
          ) : (
            description
          )}
        </div>
      </div>
    </div>
  );
};

// Internal utility to strip URLs, run.app mentions, HTTP codes, AXIOS errors, fetch details
export const cleanTextForDisplay = (text: string): string => {
  if (!text) return '';
  let cleaned = text;
  
  // Remove run.app subdomain mentions and typical run.app URLs
  cleaned = cleaned.replace(/https?:\/\/[a-zA-Z0-9-]+\.run\.app[^\s]*/gi, '');
  cleaned = cleaned.replace(/[a-zA-Z0-9-]+\.run\.app/gi, '金莲记 ERP 云端');
  
  // Remove HTTP Status codes like HTTP 500, HTTP 503, etc.
  cleaned = cleaned.replace(/HTTP \d+/gi, '');
  cleaned = cleaned.replace(/HTTP status:\s*\d+/gi, '');
  
  // Remove stack traces, code lines, specific file paths
  cleaned = cleaned.replace(/at\s+.*:\d+:\d+/g, '');
  cleaned = cleaned.replace(/AxiosError.*/gi, '网络请求异常');
  cleaned = cleaned.replace(/FetchError.*/gi, '通信请求异常');
  
  // Strip out technical error details if it contains JSON or standard error strings
  if (cleaned.includes('Firebase') || cleaned.includes('Firestore') || cleaned.includes('setDoc') || cleaned.includes('unsupported field value')) {
    cleaned = '系统检测到单据数据格式存在不兼容项，部分关键字段可能为空或未正确填写。';
  }

  // Strip generic error wrappers
  cleaned = cleaned.replace(/^Error:\s*/i, '');
  cleaned = cleaned.replace(/^Receive Error:\s*/i, '');

  return cleaned.trim() || '操作未成功，请检查网络后重试。';
};

export const SystemDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<SystemDialogOptions | null>(null);
  const [resolver, setResolver] = useState<((val: boolean) => void) | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Close the dialog and resolve
  const handleClose = (result: boolean) => {
    if (isOpen) {
      setIsOpen(false);
      setIsActionLoading(false);
      if (resolver) resolver(result);
    }
  };

  const handleConfirm = async () => {
    if (options?.onConfirm) {
      try {
        setIsActionLoading(true);
        await options.onConfirm();
        handleClose(true);
      } catch (err) {
        console.error('[SystemDialog] onConfirm Error:', err);
      } finally {
        setIsActionLoading(false);
      }
    } else {
      handleClose(true);
    }
  };

  const handleCancel = () => {
    if (options?.onCancel) {
      options.onCancel();
    }
    handleClose(false);
  };

  // Main custom show method
  const showDialog = (opts: SystemDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      // Filter out technical info from descriptions
      const cleanedCards = opts.cards.map(card => ({
        ...card,
        description: typeof card.description === 'string' ? cleanTextForDisplay(card.description) : card.description
      }));

      setOptions({
        ...opts,
        cards: cleanedCards
      });
      setResolver(() => resolve);
      setIsOpen(true);
    });
  };

  // Helper: auto-generate structured layout for success messages
  const showStructuredSuccess = async (message: string, moduleName: string): Promise<void> => {
    const cleanedMsg = cleanTextForDisplay(message);
    const hasInventoryMention = message.includes('库存') || message.includes('库');
    const hasApMention = message.includes('成本') || message.includes('应付') || message.includes('账');
    
    const cards: DialogCard[] = [
      {
        status: 'success',
        title: '操作成功',
        description: cleanedMsg || '本次入库数据已妥善提交并完成核算。'
      }
    ];

    if (hasInventoryMention) {
      cards.push({
        status: 'info',
        title: '库存更新结果',
        description: '系统已完成批次及货品实时账面库存增加，数据已同步全店进销存报表。'
      });
    }

    if (hasApMention || message.includes('成功')) {
      cards.push({
        status: 'neutral',
        title: '应付账款生成结果',
        description: '对应供应商的应付款项 (A/P) 已自动录入系统并进入审核账期队列。'
      });
    }

    cards.push({
      status: 'neutral',
      title: '单据摘要',
      description: `业务模块: ${moduleName} • 时间: ${new Date().toLocaleTimeString()} • 状态: 正常入账`
    });

    await showDialog({
      module: moduleName,
      title: '操作成功',
      status: 'success',
      cards,
      primaryButtonText: '完成',
      showCloseButton: true
    });
  };

  // Helper: auto-generate structured layout for error messages
  const showStructuredError = async (message: string, moduleName: string): Promise<void> => {
    const cleanedMsg = cleanTextForDisplay(message);
    
    // Determine possible reasons based on content
    let possibleReason = '可能是由于当前网络连接波动，或是服务器接口处于维护状态导致数据上传超时。';
    if (message.includes('unsupported field value') || message.includes('undefined') || message.includes('setDoc')) {
      possibleReason = '单据结构校验失败，可能由于部分必须录入的明细（如单价、实收数量或商品ID）出现未填项或无效字符。';
    } else if (message.includes('high demand') || message.includes('503')) {
      possibleReason = '云端 AI 识别模型当前处于超负荷访问高峰（High Demand），导致请求被限流。';
    }

    // Determine suggestion
    let suggestion = '1. 请检查您的网络连通状态并稍后再试。\n2. 检查当前填写的表格项是否完整（特别是价格、数量和必填文本框）。\n3. 如问题持续，请点击下方“重新尝试”或联系店长报修。';
    if (message.includes('high demand') || message.includes('503')) {
      suggestion = '1. 建议稍等 10-30 秒再试，让云端服务器排队释放。\n2. 如果紧急，您可以暂时通过手动录入单据数量来避开 AI 识别，快速完成核对。';
    }

    const cards: DialogCard[] = [
      {
        status: 'error',
        title: '入库失败',
        description: cleanedMsg || '单据在保存入库时发生异常。'
      },
      {
        status: 'warning',
        title: '可能原因',
        description: possibleReason
      },
      {
        status: 'neutral',
        title: '单据资料',
        description: `模块定位: ${moduleName} • 操作行为: 入库点算确认`
      },
      {
        status: 'info',
        title: '下一步建议',
        description: suggestion
      }
    ];

    await showDialog({
      module: moduleName,
      title: '系统提示',
      status: 'error',
      cards,
      primaryButtonText: '重新尝试',
      secondaryButtonText: '返回修改',
      showCloseButton: true
    });
  };

  // Intercepting standard alert
  const alertCustom = async (message: string, moduleName: string = '系统提示'): Promise<void> => {
    console.log('[SystemDialog Alert Intercepted]:', message);
    
    // Check if success
    const isSuccess = message.includes('✅') || message.includes('成功');
    const isError = message.includes('失败') || message.includes('Error') || message.includes('错误') || message.includes('invalid') || message.includes('unsupported');

    if (isSuccess) {
      await showStructuredSuccess(message, moduleName);
      return;
    }

    if (isError) {
      await showStructuredError(message, moduleName);
      return;
    }

    // Default neutral alert
    const cleaned = cleanTextForDisplay(message);
    await showDialog({
      module: moduleName,
      title: '系统通知',
      status: 'neutral',
      cards: [
        {
          status: 'neutral',
          title: '通知详情',
          description: cleaned
        }
      ],
      primaryButtonText: '确定',
      showCloseButton: true
    });
  };

  // Intercepting standard confirm
  const confirmCustom = async (message: string, moduleName: string = '安全确认'): Promise<boolean> => {
    console.log('[SystemDialog Confirm Intercepted]:', message);
    const cleaned = cleanTextForDisplay(message);
    
    return await showDialog({
      module: moduleName,
      title: '安全确认',
      status: 'warning',
      cards: [
        {
          status: 'warning',
          title: '请确认您的操作',
          description: cleaned
        }
      ],
      primaryButtonText: '确定执行',
      secondaryButtonText: '取消',
      showCloseButton: false
    });
  };

  // Register on window and keep it updated
  useEffect(() => {
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;

    // Custom window object declaration
    const systemDialogApi = {
      show: showDialog,
      alert: alertCustom,
      confirm: confirmCustom
    };

    (window as any).systemDialog = systemDialogApi;

    // Graceful native override: redirect to custom system dialog
    window.alert = (msg) => {
      // We don't block thread, we async call our dialog
      alertCustom(msg || '');
    };

    window.confirm = (msg) => {
      // Note: native confirm is synchronous, but because code is compiled
      // with standard async where possible, we print a warning and show a fallback warning.
      // For synchronous safety we log it, and if they use standard window.confirm, they should migrate to await window.systemDialog.confirm
      console.warn('[SystemDialog] Synchronous window.confirm is deprecated. Please use await window.systemDialog.confirm() instead.');
      return originalConfirm(msg);
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
    };
  }, []);

  return (
    <SystemDialogContext.Provider value={{ show: showDialog, alert: alertCustom, confirm: confirmCustom }}>
      {children}
      <AnimatePresence>
        {isOpen && options && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-[520px] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col my-8"
              style={{ width: 'calc(100% - 32px)' }}
            >
              {/* Header */}
              <div className="bg-[#1A1A1A] p-4 text-white relative">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black tracking-wider text-white">
                      金莲记 ERP
                    </h3>
                    {options.module && (
                      <p className="text-xs text-gray-300 font-medium mt-0.5 tracking-wide">
                        {options.module}
                      </p>
                    )}
                  </div>
                  {options.showCloseButton !== false && (
                    <button
                      onClick={handleCancel}
                      className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
                      aria-label="关闭"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                {/* Gold Fine Line bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#D4AF37] via-[#FFD700] to-[#D4AF37]" />
              </div>

              {/* Body */}
              <div className="p-4 md:p-5 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
                {options.cards.map((card, idx) => (
                  <StatusCard
                    key={card.id || `card-${idx}`}
                    status={card.status}
                    title={card.title}
                    description={card.description}
                    icon={card.icon}
                  />
                ))}
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row-reverse gap-2 safe-area-bottom">
                <button
                  onClick={handleConfirm}
                  disabled={isActionLoading}
                  className="w-full sm:w-auto px-6 py-3 bg-[#EAA308] hover:bg-[#D49206] active:bg-[#B37B04] text-white font-bold text-sm rounded-xl shadow-sm hover:shadow transition-all duration-150 flex items-center justify-center gap-2 select-none min-h-[48px]"
                >
                  {isActionLoading && <RefreshCw size={16} className="animate-spin" />}
                  {options.primaryButtonText || '确定'}
                </button>
                {options.secondaryButtonText && (
                  <button
                    onClick={handleCancel}
                    disabled={isActionLoading}
                    className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 border border-gray-300 font-bold text-sm rounded-xl shadow-sm transition-all duration-150 flex items-center justify-center select-none min-h-[48px]"
                  >
                    {options.secondaryButtonText}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </SystemDialogContext.Provider>
  );
};
