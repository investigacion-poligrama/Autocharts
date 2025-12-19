"use client";

import { RefObject, ReactNode } from "react";
import { ChartConfig } from "@/lib/chartconfig";

export type PreviewFrameProps = {
  title?: string;
  legend?: ReactNode;
  contentRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  aspectRatio?: string;
  minHeight?: number;
};

export default function PreviewFrame({
  legend,
  contentRef,
  children,
  aspectRatio = "16 / 9",
  minHeight = 680,
}: PreviewFrameProps) {
  return (
    <div
      className="relative rounded-xl shadow-sm bg-black overflow-visible"
      style={{ aspectRatio, minHeight }}
    >
      <div
        ref={contentRef as RefObject<HTMLDivElement> | undefined}
        className="absolute inset-0 p-4 sm:p-5 overflow-visible grid"
        style={{
          gridTemplateRows: legend ? "1fr auto" : "1fr",
          rowGap: legend ? 16 : 0,
        }}
      >
        <div
          className="chart-stage bg-black rounded-lg"
          style={{
            width: "100%",
            height: "100%",
            overflow: "visible",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div className="h-full w-full min-w-0 min-h-0">{children}</div>
        </div>

        {legend ? (
          <div
            className="legend-container"
            style={{ overflow: "visible", color: ChartConfig.colors.white }}
          >
            {legend}
          </div>
        ) : null}
      </div>
    </div>
  );
}
