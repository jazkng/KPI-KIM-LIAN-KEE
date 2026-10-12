import React from "react";

interface TreasuryShellProps {
  header: React.ReactNode;
  navigation?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * 资金管理 — 页面外壳
 *
 * ⚠️ 这里刻意「不」使用 -webkit-overflow-scrolling: touch。
 *    iOS 上该属性会让本容器变成独立滚动器，任何 position:fixed 的子元素
 *    都会被绑到这个滚动器上，导致弹窗自身的内部滚动失效（手机滑不动）。
 *    现代 iOS 已原生支援惯性滚动，不需要这个属性。
 *
 * ⚠️ 弹窗一律各自 createPortal 到 document.body，不要放进这个容器里。
 */
export const TreasuryShell: React.FC<TreasuryShellProps> = ({
  header,
  navigation,
  children,
  footer,
}) => {
  return (
    <div
      id="treasury-page"
      className="fixed inset-0 z-[120] flex w-full max-w-full flex-col bg-[#F6F7FB] text-[#111111]"
      style={{ height: "100dvh" }}
    >
      <div
        className="shrink-0 bg-[#111111]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {header}
        {navigation}
      </div>

      <main
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F6F7FB]"
        style={{
          overscrollBehaviorY: "contain",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        {children}
      </main>

      {footer && <div className="shrink-0">{footer}</div>}
    </div>
  );
};
