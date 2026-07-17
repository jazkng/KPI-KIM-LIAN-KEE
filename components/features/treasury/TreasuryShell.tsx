import React from "react";

interface TreasuryShellProps {
  header: React.ReactNode;
  navigation?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const TreasuryShell: React.FC<TreasuryShellProps> = ({
  header,
  navigation,
  children,
  footer,
}) => {
  return (
    <div className="fixed inset-0 z-[120] h-[100dvh] overflow-hidden bg-[#F6F7FB] text-[#111111]">
      <div className="flex h-full min-h-0 flex-col">
        {/* Fixed Header */}
        <div
          className="shrink-0 bg-white"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          {header}
        </div>

        {/* Optional Fixed Navigation */}
        {navigation ? <div className="shrink-0">{navigation}</div> : null}

        {/* Independent Scroll Content with Hardware Touch Acceleration */}
        <main
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F6F7FB]"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
          }}
        >
          {children}
        </main>

        {/* Fixed Footer */}
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
};
