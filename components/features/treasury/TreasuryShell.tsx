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
        bg-[#F6F7FB]
        text-[#111111]
      "
      style={{
        height: "100dvh",
        minHeight: "-webkit-fill-available",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehaviorY: "contain",
      }}
    >
      <div className="sticky top-0 z-50 bg-white shadow-sm">
        <div
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          {header}
        </div>

        {navigation && (
          <div className="bg-white">
            {navigation}
          </div>
        )}
      </div>

      <main
        className="bg-[#F6F7FB]"
        style={{
          paddingBottom:
            "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        {children}
      </main>

      {footer && <div>{footer}</div>}
    </div>
  );
};
