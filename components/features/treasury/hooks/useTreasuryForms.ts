import { html2canvas, loadJsPDF } from '../../../../utils/lazyLibs';
import { useState, useRef } from "react";
import { DataManager } from "../../../../utils/dataManager";
import {
  applyResolvedStylesForPdf,
  waitForPdfFonts,
} from "../../../../utils/pdfStyleResolver";
import {
  TreasuryConfig,
  FundTransfer,
  ExpenseItem,
  Shareholder,
} from "../treasuryTypes";
import { SETTINGS_PASSWORD } from "../treasuryConstants";
import { guardWrite } from "../../../../utils/readOnlyMode";

interface UseTreasuryFormsArgs {
  config: TreasuryConfig;
  setConfig: React.Dispatch<React.SetStateAction<TreasuryConfig>>;
  transfers: FundTransfer[];
  setTransfers: React.Dispatch<React.SetStateAction<FundTransfer[]>>;
  expenses: ExpenseItem[];
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  loadData: () => void;
  loadExpenses: () => void;
}

const todayStr = () => new Date().toISOString().split("T")[0];

/**
 * 资金管理 — 表单状态与写入操作 (转账 / 注资 / 分红 / 还款 / 代收收入 / 补录支出 / 股东 / 设置)
 *
 * ⚠️ 所有保存逻辑、记录格式 (note 前缀、id 前缀) 与原实作完全一致，只是搬迁位置。
 */
export const useTreasuryForms = ({
  config,
  setConfig,
  transfers,
  setTransfers,
  expenses,
  setExpenses,
  loadData,
  loadExpenses,
}: UseTreasuryFormsArgs) => {
  // 🔐 设置密码锁
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState(false);
  const [settingsPasswordInput, setSettingsPasswordInput] = useState("");
  const [settingsPasswordError, setSettingsPasswordError] = useState(false);

  const handleSettingsUnlock = () => {
    if (settingsPasswordInput === SETTINGS_PASSWORD) {
      setIsSettingsUnlocked(true);
      setSettingsPasswordError(false);
    } else {
      setSettingsPasswordError(true);
    }
  };

  // --- 收据 PDF ---
  const printRef = useRef<HTMLDivElement>(null);
  const [printingRecord, setPrintingRecord] = useState<FundTransfer | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // --- 表单 State ---
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<Partial<FundTransfer>>({
    amount: 0,
    fromAccount: "CASH",
    toAccount: "BANK",
    type: "DEPOSIT",
    date: todayStr(),
  });

  const [isShareholderFormOpen, setIsShareholderFormOpen] = useState(false);
  const [shareholderForm, setShareholderForm] = useState<Partial<Shareholder>>({
    name: "",
    investmentAmount: 0,
    equityPercentage: 0,
  });

  const [isInjectionModalOpen, setIsInjectionModalOpen] = useState(false);
  const [injectionForm, setInjectionForm] = useState({
    shareholderName: "",
    amount: "",
    toAccount: "BANK",
    date: todayStr(),
    note: "",
  });

  const [isDividendModalOpen, setIsDividendModalOpen] = useState(false);
  const [dividendForm, setDividendForm] = useState({
    dividendMonth: new Date().toISOString().slice(0, 7),
    shareholderId: "",
    amount: "",
    paymentMethod: "BANK_TRANSFER",
    date: todayStr(),
    note: "",
  });

  const [isRepaymentModalOpen, setIsRepaymentModalOpen] = useState(false);
  const [repaymentForm, setRepaymentForm] = useState({
    shareholderId: "",
    amount: "",
    fromAccount: "BANK",
    date: todayStr(),
    note: "",
  });

  const [expandedInjections, setExpandedInjections] = useState<
    Record<string, boolean>
  >({});

  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [editingIncomeRecord, setEditingIncomeRecord] =
    useState<FundTransfer | null>(null);
  const [incomeForm, setIncomeForm] = useState({
    source: "",
    category: "ELECTRICITY",
    amount: "",
    toAccount: "CASH",
    date: todayStr(),
    note: "",
  });

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<Partial<ExpenseItem>>({
    category: "RENOVATION",
    amount: 0,
    company: "",
    note: "",
    paymentStatus: "PAID",
    paymentMethod: "BANK_TRANSFER",
    time: todayStr(),
  });

  const resetIncomeForm = () =>
    setIncomeForm({
      source: "",
      category: "ELECTRICITY",
      amount: "",
      toAccount: "CASH",
      date: todayStr(),
      note: "",
    });

  // --- HANDLERS ---
  const handleSaveConfig = async () => {
    if (!guardWrite('保存设置')) return;
    await DataManager.saveTreasuryConfig(config);
    alert("✅ 设置已保存 (Settings Saved)");
    loadData();
  };

  const handleSaveShareholder = async () => {
    if (!guardWrite('保存股东资料')) return;
    if (!shareholderForm.name || !shareholderForm.investmentAmount)
      return alert("Name & Investment Required");
    const newShareholder: Shareholder = {
      id: shareholderForm.id || `sh_${Date.now()}`,
      name: shareholderForm.name,
      investmentAmount: Number(shareholderForm.investmentAmount),
      equityPercentage: Number(shareholderForm.equityPercentage),
      role: shareholderForm.role,
    };
    const currentList = config.shareholders || [];
    const updatedList = shareholderForm.id
      ? currentList.map((s) => (s.id === newShareholder.id ? newShareholder : s))
      : [...currentList, newShareholder];
    const newConfig = { ...config, shareholders: updatedList };
    setConfig(newConfig);
    await DataManager.saveTreasuryConfig(newConfig);
    setIsShareholderFormOpen(false);
    setShareholderForm({ name: "", investmentAmount: 0, equityPercentage: 0 });
  };

  const handleDeleteShareholder = async (id: string) => {
    if (!guardWrite('删除股东')) return;
    if (
      !confirm(
        "⚠️ 确定要删除该股东吗？\n\n删除后该股东信息将无法在前端参与日后的股份分红、注资核算操作。此操作不可逆，请确认！",
      )
    )
      return;
    const newConfig = {
      ...config,
      shareholders: config.shareholders?.filter((s) => s.id !== id),
    };
    setConfig(newConfig);
    await DataManager.saveTreasuryConfig(newConfig);
  };

  const handleSaveExpense = async () => {
    if (!guardWrite('记录支出')) return;
    if (!expenseForm.amount || !expenseForm.company)
      return alert("Please fill amount and details");
    const newExpense: ExpenseItem = {
      id: `exp_${Date.now()}`,
      category: expenseForm.category || "OTHER",
      expenseType: "GENERAL",
      company: expenseForm.company,
      amount: Number(expenseForm.amount),
      note: expenseForm.note || "Manual Entry",
      time: expenseForm.time
        ? `${expenseForm.time}T12:00:00`
        : new Date().toISOString(),
      paymentMethod: expenseForm.paymentMethod || "BANK_TRANSFER",
      paymentStatus: "PAID",
      totalBillAmount: Number(expenseForm.amount),
      outstandingAmount: 0,
    };
    await DataManager.saveStandaloneExpense(newExpense);
    setIsExpenseModalOpen(false);
    setExpenseForm({
      category: "RENOVATION",
      amount: 0,
      company: "",
      note: "",
      paymentMethod: "BANK_TRANSFER",
      time: todayStr(),
    });
    alert("✅ 支出已补录 (Expense Recorded)");
    loadExpenses();
  };

  const handleSaveTransfer = async () => {
    if (!guardWrite('记录转账')) return;
    if (!transferForm.amount || transferForm.amount <= 0)
      return alert("Enter valid amount");
    const newTransfer: FundTransfer = {
      id: `trf_${Date.now()}`,
      date: transferForm.date || new Date().toISOString(),
      amount: Number(transferForm.amount),
      fromAccount: transferForm.fromAccount as any,
      toAccount: transferForm.toAccount as any,
      type: transferForm.type as any,
      note: transferForm.note,
    };
    await DataManager.saveFundTransfer(newTransfer);
    setTransfers([newTransfer, ...transfers]);
    setIsTransferModalOpen(false);
    alert("✅ 转账记录已保存");
    loadData();
  };

  const handleSaveInjection = async () => {
    if (!guardWrite('记录注资')) return;
    if (!injectionForm.shareholderName || !injectionForm.amount)
      return alert("请填写完整信息");
    const newTransfer: FundTransfer = {
      id: `inj_${Date.now()}`,
      date: injectionForm.date,
      amount: parseFloat(injectionForm.amount),
      fromAccount: "SHAREHOLDER" as any,
      toAccount: injectionForm.toAccount as any,
      type: "DEPOSIT",
      note: `[股东注资] ${injectionForm.shareholderName}: ${injectionForm.note || "额外资金"}`,
    };
    await DataManager.saveFundTransfer(newTransfer);
    setTransfers([newTransfer, ...transfers]);
    setIsInjectionModalOpen(false);
    setInjectionForm({
      shareholderName: "",
      amount: "",
      toAccount: "BANK",
      date: todayStr(),
      note: "",
    });
    alert("✅ 资金注入已记录 (Injection Recorded)");
    loadData();
  };

  // 👑 handleSaveIncome 支持新增 + 编辑模式
  const handleSaveIncome = async () => {
    if (!guardWrite('记录额外收入')) return;
    if (!incomeForm.amount) return alert("请输入金额");

    if (editingIncomeRecord) {
      // 编辑模式：先删除旧记录，再创建新记录
      await DataManager.deleteFundTransfer(editingIncomeRecord.id);
      const updatedTransfer: FundTransfer = {
        id: editingIncomeRecord.id,
        date: incomeForm.date,
        amount: parseFloat(incomeForm.amount),
        fromAccount: "OTHER" as any,
        toAccount: incomeForm.toAccount as any,
        type: "DEPOSIT",
        note: `[代收] ${incomeForm.source} - ${incomeForm.category}${incomeForm.note ? ` (${incomeForm.note})` : ""}`,
      };
      await DataManager.saveFundTransfer(updatedTransfer);
      setEditingIncomeRecord(null);
      setIsIncomeModalOpen(false);
      resetIncomeForm();
      alert("✅ 收入记录已更新 (Income Updated)");
      loadData();
    } else {
      // 新增模式
      const newTransfer: FundTransfer = {
        id: `inc_${Date.now()}`,
        date: incomeForm.date,
        amount: parseFloat(incomeForm.amount),
        fromAccount: "OTHER" as any,
        toAccount: incomeForm.toAccount as any,
        type: "DEPOSIT",
        note: `[代收] ${incomeForm.source} - ${incomeForm.category}${incomeForm.note ? ` (${incomeForm.note})` : ""}`,
      };
      await DataManager.saveFundTransfer(newTransfer);
      setTransfers([newTransfer, ...transfers]);
      setIsIncomeModalOpen(false);
      resetIncomeForm();
      alert("✅ 代收收入已记录 (Income Recorded)");
      loadData();
    }
  };

  // 👑 编辑收入记录：解析 note 回填表单
  const handleEditIncome = (record: FundTransfer) => {
    const cleanNote = record.note?.replace("[代收] ", "") || "";
    const dashIndex = cleanNote.indexOf(" - ");
    const source = dashIndex > -1 ? cleanNote.substring(0, dashIndex) : cleanNote;
    let category = "OTHER";
    let noteText = "";
    if (dashIndex > -1) {
      const afterDash = cleanNote.substring(dashIndex + 3);
      // 尝试提取 category 和 note
      const parenMatch = afterDash.match(/^(.+?)\s*\((.+)\)$/);
      if (parenMatch) {
        category = parenMatch[1].trim();
        noteText = parenMatch[2].trim();
      } else {
        category = afterDash.trim();
      }
    }

    setEditingIncomeRecord(record);
    setIncomeForm({
      source: source,
      category: category,
      amount: String(record.amount),
      toAccount: record.toAccount as string,
      date: record.date.split("T")[0],
      note: noteText,
    });
    setIsIncomeModalOpen(true);
  };

  const handleDeleteTransfer = async (id: string) => {
    if (!guardWrite('删除记录')) return;
    if (
      !confirm(
        "⚠️ 确定要彻底删除此笔资金记录/转账日志吗？\n\n删除后系统该笔账目将被永久移除并自动重新校准总资产流，此操作不可撤消，请确认！",
      )
    )
      return;
    await DataManager.deleteFundTransfer(id);
    setTransfers(transfers.filter((t) => t.id !== id));
    loadData();
  };

  const handleGenerateReceipt = async (record: FundTransfer) => {
    if (isGeneratingPdf) return;
    setPrintingRecord(record);
    setIsGeneratingPdf(true);
    setTimeout(async () => {
      if (!printRef.current) return;
      try {
        await waitForPdfFonts();
        const canvas = await html2canvas(printRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.getElementById(
              "treasury-receipt-export-root",
            );
            if (printRef.current && clonedEl) {
              applyResolvedStylesForPdf(
                printRef.current as HTMLElement,
                clonedEl as HTMLElement,
              );
            }
          },
        });
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const pdf = new (await loadJsPDF())("p", "mm", "a5");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Receipt_${record.date}_${record.id.slice(-4)}.pdf`);
      } catch (err) {
        console.error("PDF Gen Error:", err);
        alert("生成收据失败 (Failed to generate PDF)");
      } finally {
        setIsGeneratingPdf(false);
        setPrintingRecord(null);
      }
    }, 800);
  };

  const handleSaveDividend = async () => {
    if (!guardWrite('记录分红')) return;
    if (!dividendForm.shareholderId || !dividendForm.amount)
      return alert("Please fill all fields");
    const sh = config.shareholders?.find(
      (s) => s.id === dividendForm.shareholderId,
    );
    const companyName = sh ? sh.name : "Unknown";

    const monthStr = dividendForm.dividendMonth
      ? `[${dividendForm.dividendMonth}分红]`
      : "[股东分红]";

    const newExpense: ExpenseItem = {
      id: `div_${Date.now()}`,
      category: "DIVIDEND",
      expenseType: "GENERAL",
      company: companyName,
      amount: parseFloat(dividendForm.amount),
      paymentStatus: "PAID",
      paymentMethod: dividendForm.paymentMethod as any,
      time: `${dividendForm.date}T12:00:00`,
      note: `${monthStr} ${dividendForm.note || "Dividend Payout"}`,
      paidBy: "COMPANY",
    };

    await DataManager.saveStandaloneExpense(newExpense);
    setExpenses([newExpense, ...expenses]);
    setIsDividendModalOpen(false);
    setDividendForm({
      dividendMonth: new Date().toISOString().slice(0, 7),
      shareholderId: "",
      amount: "",
      paymentMethod: "BANK_TRANSFER",
      date: todayStr(),
      note: "",
    });
    alert("✅ 分红已记录并扣除 (Dividend Recorded)");
    loadData();
  };

  const handleSaveRepayment = async () => {
    if (!guardWrite('记录还款')) return;
    if (!repaymentForm.shareholderId || !repaymentForm.amount)
      return alert("Please fill all fields");
    const sh = config.shareholders?.find(
      (s) => s.id === repaymentForm.shareholderId,
    );
    const name = sh ? sh.name : "Unknown";

    const newTransfer: FundTransfer = {
      id: `trf_${Date.now()}`,
      date: repaymentForm.date,
      amount: parseFloat(repaymentForm.amount),
      fromAccount: repaymentForm.fromAccount as any,
      toAccount: "SHAREHOLDER" as any,
      type: "WITHDRAWAL",
      note: `[还钱给股东] ${name}: ${repaymentForm.note || "Repayment"}`,
    };

    await DataManager.saveFundTransfer(newTransfer);
    setTransfers([newTransfer, ...transfers]);
    setIsRepaymentModalOpen(false);
    setRepaymentForm({
      shareholderId: "",
      amount: "",
      fromAccount: "BANK",
      date: todayStr(),
      note: "",
    });
    alert("✅ 还钱记录已保存 (Repayment Saved)");
    loadData();
  };

  /** 打开转账弹窗：存入 (现金 → 银行) */
  const openDepositModal = () => {
    setTransferForm({
      type: "DEPOSIT",
      fromAccount: "CASH",
      toAccount: "BANK",
      date: todayStr(),
    });
    setIsTransferModalOpen(true);
  };

  /** 打开转账弹窗：提款 (银行 → 现金) */
  const openWithdrawModal = () => {
    setTransferForm({
      type: "WITHDRAWAL",
      fromAccount: "BANK",
      toAccount: "CASH",
      date: todayStr(),
    });
    setIsTransferModalOpen(true);
  };

  /** 打开新增代收收入弹窗 */
  const openAddIncomeModal = () => {
    setEditingIncomeRecord(null);
    resetIncomeForm();
    setIsIncomeModalOpen(true);
  };

  return {
    // 设置密码锁
    isSettingsUnlocked,
    setIsSettingsUnlocked,
    settingsPasswordInput,
    setSettingsPasswordInput,
    settingsPasswordError,
    setSettingsPasswordError,
    handleSettingsUnlock,
    handleSaveConfig,
    // 收据
    printRef,
    printingRecord,
    isGeneratingPdf,
    handleGenerateReceipt,
    // 转账
    isTransferModalOpen,
    setIsTransferModalOpen,
    transferForm,
    setTransferForm,
    handleSaveTransfer,
    openDepositModal,
    openWithdrawModal,
    // 股东
    isShareholderFormOpen,
    setIsShareholderFormOpen,
    shareholderForm,
    setShareholderForm,
    handleSaveShareholder,
    handleDeleteShareholder,
    // 注资
    isInjectionModalOpen,
    setIsInjectionModalOpen,
    injectionForm,
    setInjectionForm,
    handleSaveInjection,
    // 分红
    isDividendModalOpen,
    setIsDividendModalOpen,
    dividendForm,
    setDividendForm,
    handleSaveDividend,
    // 还款
    isRepaymentModalOpen,
    setIsRepaymentModalOpen,
    repaymentForm,
    setRepaymentForm,
    handleSaveRepayment,
    // 代收收入
    isIncomeModalOpen,
    setIsIncomeModalOpen,
    incomeForm,
    setIncomeForm,
    editingIncomeRecord,
    setEditingIncomeRecord,
    handleSaveIncome,
    handleEditIncome,
    openAddIncomeModal,
    // 补录支出
    isExpenseModalOpen,
    setIsExpenseModalOpen,
    expenseForm,
    setExpenseForm,
    handleSaveExpense,
    // 其他
    expandedInjections,
    setExpandedInjections,
    handleDeleteTransfer,
  };
};
