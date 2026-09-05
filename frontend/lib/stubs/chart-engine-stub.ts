"use client";

/**
 * Chart Engine Stub
 *
 * This stub is used when the chart-engine addon is not installed.
 * It exports a null component and empty exports to prevent import errors.
 *
 * The actual chart-engine code is NOT included in this stub.
 * When the addon is installed, webpack/turbopack will use the real module instead.
 */

import type { FC } from "react";

// Stub component that returns null - proper React FC type
/* Renders nothing, and says nothing over the network.

   This used to fire a fetch to /api/exchange/chart on every render, with a
   second one at module load. Diagnostics that cost a network request per render
   are a trap: a component that renders often turns into a traffic generator
   against a real endpoint, and this one points at the most expensive route in
   the app. Left as plain comments so the stub cannot become a load source. */
const ChartEngineStub: FC<any> & { __isStub?: boolean } = () => null;

// Mark as stub for detection
ChartEngineStub.__isStub = true;

// Default export
export default ChartEngineStub;

// Named exports that might be imported
export const TradingChart = ChartEngineStub;
export const BinaryChart = ChartEngineStub;

// Stub store hook
export const useChartStore: any = Object.assign(
  (selector?: any) => {
    const dummyState = {
      activeDrawingTool: "cursor",
      setActiveDrawingTool: () => {},
      isDrawingSnapEnabled: false,
      setDrawingSnapEnabled: () => {},
      canUndoDrawing: false,
      canRedoDrawing: false,
      undoDrawing: () => {},
      redoDrawing: () => {},
      clearAllDrawings: () => {},
      openIndicatorsPanel: () => {},
      selectedDrawingId: null,
      drawings: [],
      updateDrawing: () => {},
      removeDrawing: () => {},
      addDrawing: () => "",
      selectDrawing: () => {},
      state: {
        viewport: { startTime: 0, endTime: 0, minPrice: 0, maxPrice: 0 },
        dimensions: {
          width: 0,
          height: 0,
          chartAreaWidth: 0,
          chartAreaHeight: 0,
          priceAxisWidth: 0,
          timeAxisHeight: 0,
          toolbarHeight: 0,
        },
      },
    };
    return selector ? selector(dummyState) : dummyState;
  },
  {
    getState: () => ({
      activeDrawingTool: "cursor",
      setActiveDrawingTool: () => {},
      isDrawingSnapEnabled: false,
      setDrawingSnapEnabled: () => {},
      canUndoDrawing: false,
      canRedoDrawing: false,
      undoDrawing: () => {},
      redoDrawing: () => {},
      clearAllDrawings: () => {},
      openIndicatorsPanel: () => {},
      selectedDrawingId: null,
      drawings: [],
      updateDrawing: () => {},
      removeDrawing: () => {},
      addDrawing: () => "",
      selectDrawing: () => {},
      state: {
        viewport: { startTime: 0, endTime: 0, minPrice: 0, maxPrice: 0 },
        dimensions: {
          width: 0,
          height: 0,
          chartAreaWidth: 0,
          chartAreaHeight: 0,
          priceAxisWidth: 0,
          timeAxisHeight: 0,
          toolbarHeight: 0,
        },
      },
    })
  }
);

// Re-export empty types
export type TradingChartProps = Record<string, any>;
export type BinaryChartProps = Record<string, any>;
export type TimeFrame = string;
export type ChartType = string;
