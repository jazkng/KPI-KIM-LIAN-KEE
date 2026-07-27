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
    <div
      id="treasury-page"
      className="
        fixed
        inset-0
        z-[120]
        w-full
        max-w-full
        overflow-y-auto
        overflow-x-hidden
        bg-[#F4F5F8]
        text-[#111111]
        touch-pan-y
      "
      style={{
        height: "100dvh",
        minHeight: "-webkit-fill-available",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehaviorY: "contain",
      }}
    >
      <div className="sticky top-0 z-50 bg-[#111111] shadow-md">
        <div
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          {header}
        </div>

        {navigation && (
          <div className="bg-[#111111]">
            {navigation}
          </div>
        )}
      </div>

      <main
        className="bg-[#F4F5F8] touch-pan-y"
        style={{
          paddingBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 28px)",
        }}
      >
        {children}
      </main>

      {footer && <div>{footer}</div>}
    </div>
  );
};
