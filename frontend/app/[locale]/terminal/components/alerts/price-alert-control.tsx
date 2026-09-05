"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Bell, X } from "lucide-react";
import { AXIS_CHIP, AXIS_CHIP_INTERACTIVE } from "../chart/axis-chip";
import { cn } from "@/lib/utils";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { usePriceAlertStore } from "@/store/trade/use-price-alert-store";

// Classical Error Boundary to catch client compile/runtime/store-access crashes
class AlertErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("[PriceAlertControl] Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute top-[95px] left-[48px] bg-red-600 text-white text-[11px] p-4 rounded-lg z-[99999] pointer-events-auto border-2 border-white shadow-2xl font-mono">
          <div className="font-bold text-sm mb-1">⚠️ PriceAlertControl Crashed</div>
          <div>{this.state.error?.message || String(this.state.error)}</div>
          <pre className="mt-2 text-[10px] opacity-80 max-w-lg max-h-[190px] overflow-auto">
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LayoutGeometry {
  toolbarH: number;
  chartH: number;
  priceAxisW: number;
  width: number;
  height: number;
}

function PriceAlertControlInner() {
  const rootRef = useRef<HTMLDivElement>(null);

  // gutterY is in overlay-relative coordinates (px from overlay top) when cursor is in right price axis gutter
  const [gutterY, setGutterY] = useState<number | null>(null);
  /* The row is pinned to the pointer, so moving toward the bell moves the bell.
     Crossing onto it also takes the pointer off the plot, which drops the
     engine's crosshair and used to take the whole row with it — the control was
     unclickable by construction. Entering the bell freezes the row where it is
     until the pointer leaves again. */
  const [heldY, setHeldY] = useState<number | null>(null);

  // Geometry measured dynamically from DOM
  const [geometry, setGeometry] = useState<LayoutGeometry | null>(null);

  // Chart store reads
  const crosshair = useChartStore((s: any) => s.crosshairPosition) as { x: number; y: number } | null;
  const viewport = useChartStore((s: any) => s.state?.viewport) as { minPrice: number; maxPrice: number } | undefined;
  const dims = useChartStore((s: any) => s.state?.dimensions) as {
    priceAxisWidth: number;
  } | undefined;
  const chartPrice = useChartStore((s: any) => s.currentPrice) as number;
  const activeTool = useChartStore((s: any) => s.activeDrawingTool) as string;
  const decimals = useChartStore((s: any) => s.decimals) as number;

  // Price stores
  const currentSymbol = useBinaryStore((s) => s.currentSymbol);
  const alerts = usePriceAlertStore((s) => s.alerts);
  const addAlert = usePriceAlertStore((s) => s.addAlert);
  const removeAlert = usePriceAlertStore((s) => s.removeAlert);

  // Calculate the total rendering height of all active bottom indicator panels dynamically in responsive viewport space
  const indicatorPanelHeight = useChartStore((s: any) => {
    const list = (s.indicators || []) as any[];
    const panels = list.filter((ind) => ind.placement === "panel" && ind.isVisible !== false).slice(0, 3);
    if (panels.length === 0) return 0;

    let total = 24; // Is index base padding
    panels.forEach((o, index) => {
      if (index > 0) total += 24;
      const defaultH = 100;
      const height = o.panelHeight || defaultH;
      total += Math.round(height * 1.0); // desktop uses 1.0 multiplier
    });
    return total;
  });

  const fmt = (n: number) =>
    n.toFixed(
      Number.isFinite(decimals) && decimals >= 0 && decimals <= 8
        ? decimals
        : Math.abs(n) >= 1000
        ? 2
        : Math.abs(n) >= 100
        ? 3
        : Math.abs(n) >= 1
        ? 5
        : 6
    );

  // Measure canvas and layout geometry in real time
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const measure = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const rect = el.getBoundingClientRect();
      const canvas = parent.querySelector("canvas");

      const priceAxisW = (dims?.priceAxisWidth && dims.priceAxisWidth > 0) ? dims.priceAxisWidth : 80;

      /* No zoom divisor. Every measurement here was divided by a hardcoded 0.95
         to undo the page zoom that used to be applied; with the zoom gone the
         division inflates each one by 5.26% instead of cancelling anything.
         getBoundingClientRect reports the geometry that is actually on screen. */
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const toolbarH = Math.max(0, canvasRect.top - rect.top);
        // Canvas height includes time axis (20px) at the bottom, subtract indicator vertical area
        const chartH = Math.max(0, canvasRect.height - 20) - indicatorPanelHeight;

        setGeometry({
          toolbarH,
          chartH,
          priceAxisW,
          width: rect.width,
          height: rect.height,
        });
      } else {
        setGeometry({
          toolbarH: 0,
          chartH: Math.max(0, rect.height - 20) - indicatorPanelHeight,
          priceAxisW,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // Poll to capture canvas mount/changes
    const t = setInterval(measure, 100);

    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, [dims?.priceAxisWidth, indicatorPanelHeight]);

  // Window mousemove gutter detection
  useEffect(() => {
    if (!geometry) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!rootRef.current || !geometry) return;
      const rect = rootRef.current.getBoundingClientRect();

      /* The cursor's position, undivided.

         These were divided by a hardcoded 0.95 as well, which is what made the
         bell impossible to click: the icon was placed 5% further down the axis
         than the pointer that summoned it, so moving toward it moved it again.
         It looked like the bell was sliding away, and it was. */
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Price axis is rightmost `priceAxisW` pixels of the container
      const inGutter =
        x >= geometry.width - geometry.priceAxisW &&
        x <= geometry.width &&
        y >= geometry.toolbarH &&
        y <= geometry.toolbarH + geometry.chartH + 20;

      if (inGutter) {
        setGutterY(y);
      } else {
        setGutterY(null);
      }
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [geometry]);

  // Derive active Y coordinate for the alert tag & guide lines
  const chipY = gutterY !== null ? gutterY : (crosshair !== null ? crosshair.y : null);

  // Derived calculations
  const min = viewport?.minPrice ?? 0;
  const max = viewport?.maxPrice ?? 0;
  const range = max - min;

  const ready = range > 0 && geometry !== null && geometry.chartH > 0;

  // Convert overlay Y → price
  const yToPrice = useCallback(
    (overlayY: number) => {
      if (!geometry) return 0;
      const canvasY = overlayY - geometry.toolbarH;
      return max - (canvasY / geometry.chartH) * range;
    },
    [max, range, geometry]
  );

  // Convert price → overlay Y
  const priceToY = useCallback(
    (p: number) => {
      if (!geometry) return 0;
      return geometry.toolbarH + ((max - p) / range) * geometry.chartH;
    },
    [max, range, geometry]
  );

  // Symbol-filtered alerts
  const symbolAlerts = alerts.filter((a) => a.symbol === currentSymbol);

  // Chip visibility: chipY must be within the canvas boundaries (with 4px padding)
  const chipInBounds =
    geometry !== null &&
    chipY !== null &&
    chipY >= geometry.toolbarH + 4 &&
    chipY <= geometry.toolbarH + geometry.chartH - 4;

  const renderY = heldY ?? chipY;
  const showChip = ready && (heldY !== null || chipInBounds);
  const chipPrice = showChip && renderY !== null ? yToPrice(renderY) : NaN;

  // Hide chip if it would overlap an existing alert tag (within 10px)
  const nearExistingTag =
    ready &&
    renderY !== null &&
    symbolAlerts.some((a) => {
      const y = priceToY(a.targetPrice);
      return Math.abs(y - renderY) < 10;
    });

  /* Whatever hides the row releases the latch, not just the pointer leaving.
     The latch exists so the row survives the pointer arriving on it; a row that
     is no longer rendered has nothing to survive, and holding it there freezes
     the readout at a price the pointer left long ago. */
  useEffect(() => {
    if (heldY !== null && (nearExistingTag || !ready)) setHeldY(null);
  }, [heldY, nearExistingTag, ready]);

  // Guide line target position mapping
  const priceAxisW = geometry?.priceAxisW ?? 80;
  const toolbarH = geometry?.toolbarH ?? 0;
  const chartH = geometry?.chartH ?? 0;

  // Place a new alert
  const addAt = useCallback(
    (overlayY: number) => {
      if (!currentSymbol || !ready) return;
      const price = yToPrice(overlayY);
      if (!Number.isFinite(price) || price <= 0) return;
      const condition = price >= (chartPrice || 0) ? "above" : "below";
      addAlert(currentSymbol, Number(price.toFixed(6)), condition);
    },
    [currentSymbol, ready, yToPrice, chartPrice, addAlert]
  );

  return (
    // pointer-events-none on root ensures we never block chart clicks/drag/wheel events
    <div ref={rootRef} className="absolute inset-0 z-30 pointer-events-none overflow-hidden">


      {/* Active alert level lines/tags */}
      {ready &&
        symbolAlerts.map((a) => {
          const y = priceToY(a.targetPrice);
          if (!(y >= toolbarH && y <= toolbarH + chartH)) return null;
          const tagFits = y >= toolbarH + 8 && y <= toolbarH + chartH - 8;
          return (
            <div
              key={a.id}
              className={`absolute left-0 right-0 ${a.triggered ? "opacity-50" : ""}`}
              style={{ top: y }}
            >
              {/* Same row as the hover readout above: the rule grows into what
                  the tag does not use, so it stops at the bell rather than
                  leaving the width of the price axis between them. A placed
                  alert was also a white chip on every theme, two pixels shorter
                  than the one that placed it. */}
              <div
                className="pointer-events-none absolute top-0 -translate-y-1/2 flex items-center gap-[2px]"
                style={{ left: 0, right: 4 }}
              >
                <div className="min-w-0 flex-1 border-t border-dashed border-zinc-400/45" />
                {tagFits && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAlert(a.id);
                      }}
                      className={cn(
                        "group pointer-events-auto flex items-center justify-center w-[19px] shrink-0 transition-all",
                        AXIS_CHIP,
                        AXIS_CHIP_INTERACTIVE
                      )}
                      aria-label="Remove alert"
                      title="Remove alert"
                    >
                      <Bell
                        size={9}
                        strokeWidth={2.2}
                        className={cn(
                          "group-hover:hidden",
                          a.triggered ? "text-muted-foreground" : "text-foreground"
                        )}
                      />
                      <X size={9} strokeWidth={2.6} className="hidden group-hover:block text-rose-500" />
                    </button>
                    <span
                      className={cn(
                        "flex items-center px-1.5",
                        AXIS_CHIP,
                        a.triggered && "text-muted-foreground"
                      )}
                    >
                      {fmt(a.targetPrice)}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}

      {/* The line and the readout are one row.
      
          They were two absolutely-positioned elements: a dashed rule ending at
          the price axis, and a chip group 4px from the right edge — which left a
          gap the width of the axis between the line and the bell it was pointing
          at, and no way to keep them in step as the price string changed width.
          As one flex row the rule simply grows into whatever the readout does not
          use, so it always ends exactly where the bell begins, and never runs
          behind the card. */}
      {showChip && !nearExistingTag && renderY !== null && Number.isFinite(chipPrice) && (
        <div
          className="pointer-events-none absolute -translate-y-1/2 flex items-center gap-[2px]"
          style={{ top: renderY, left: 0, right: 4 }}
        >
          <div className="min-w-0 flex-1 border-t border-dashed border-zinc-400/45" />

          {/* The bell is the button. The readout beside it used to be one too,
              so the price you were reading was also a control, and brushing it
              set an alert you never asked for. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              addAt(renderY);
              /* Released here as well as on mouseleave. Placing the alert makes
                 `nearExistingTag` true at this exact y, which unmounts this
                 button while the pointer is still on it — and a button that
                 unmounts under the pointer never gets its mouseleave. The latch
                 would have stayed closed on the price you just alerted, so the
                 bell and its readout never came back anywhere on the chart. */
              setHeldY(null);
            }}
            onMouseEnter={() => setHeldY(renderY)}
            onMouseLeave={() => setHeldY(null)}
            title="Click to set a price alert"
            aria-label="Set a price alert"
            className={cn(
              "pointer-events-auto flex items-center justify-center w-[19px] shrink-0 transition-all animate-in fade-in zoom-in-95 duration-100",
              AXIS_CHIP,
              AXIS_CHIP_INTERACTIVE
            )}
          >
            <Bell size={10} strokeWidth={2.2} className="text-muted-foreground" />
          </button>

          <div
            className={cn(
              "flex items-center px-1.5 animate-in fade-in zoom-in-95 duration-100",
              AXIS_CHIP
            )}
          >
            {fmt(chipPrice)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PriceAlertControl() {
  return (
    <AlertErrorBoundary>
      <PriceAlertControlInner />
    </AlertErrorBoundary>
  );
}
