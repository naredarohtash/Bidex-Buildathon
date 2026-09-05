"use client";

/**
 * The chart's tool rail, for a phone.
 *
 * On desktop these four controls — drawing tools, timeframe, chart type and
 * indicators — sit permanently in the chart toolbar. There is no
 * room for a permanent toolbar over a 390px chart, so they collapse into one
 * button in the chart's bottom-left corner and unfold upwards as a rail when
 * it is tapped, with the chosen control's options opening beside it.
 *
 * Nothing here is new behaviour. Every control calls the same chart-engine
 * store action the desktop toolbar calls (`setChartType`, `setTimeFrame`,
 * `openIndicatorsPanel`), so the two toolbars cannot disagree about what the
 * chart is doing. The one exception is the drawing rail, which is driven by a
 * prop rather than the store: `initialSettings` re-applies `showDrawingTools`
 * on every engine render, so a value written straight to the store would be
 * overwritten on the next one — see ChartSwitcher.
 */

import { useState, useEffect } from "react";
import { SlidersHorizontal, X, Pencil } from "lucide-react";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { useBinaryStore, type TimeFrame } from "@/store/trade/use-binary-store";
import {
  CandlestickIcon,
  LineChartIcon,
  AreaChartIcon,
  BarChartIcon,
} from "../layout/terminal-icons";

/** Same list, same order, same labels as the desktop toolbar's picker. */
const CHART_TYPES = [
  { value: "candlestick", label: "Candles", icon: <CandlestickIcon /> },
  { value: "line", label: "Line", icon: <LineChartIcon /> },
  { value: "area", label: "Area", icon: <AreaChartIcon /> },
  { value: "bar", label: "Bar", icon: <BarChartIcon /> },
  { value: "heikin-ashi", label: "Heikin Ashi", icon: <CandlestickIcon /> },
];

type Pane = "draw" | "timeframe" | "type" | null;

interface MobileChartToolsProps {
  timeFrame: TimeFrame;
  timeframeDurations?: Array<{ value: TimeFrame; label: string }>;
  onTimeFrameChange: (timeFrame: TimeFrame) => void;
  /** The engine's left drawing rail — owned by the layout, see the note above. */
  drawingToolsOpen: boolean;
  onDrawingToolsChange: (open: boolean) => void;
  /** So the layout can stand its other floating controls down while the rail is out. */
  onOpenChange?: (open: boolean) => void;
  isDark: boolean;
}

export default function MobileChartTools({
  timeFrame,
  timeframeDurations,
  onTimeFrameChange,
  drawingToolsOpen,
  onDrawingToolsChange,
  onOpenChange,
  isDark,
}: MobileChartToolsProps) {
  const [open, setOpenState] = useState(false);
  /* Timeframe, not nothing. Opening the rail to four unlabelled icons asks
     the trader to guess which one they wanted before they can see anything;
     the timeframe is what they open this for nearly every time, so it is
     already showing when the rail unfolds. The other panes are one tap from
     here exactly as before. */
  const [pane, setPane] = useState<Pane>("timeframe");

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) setPane("timeframe");
    onOpenChange?.(next);
  };

  const chartType = useChartStore(
    (s: any) => s.state?.chartType ?? s.settings?.chartType ?? "candlestick"
  );
  const showIndicatorsPanel = useChartStore((s: any) => s.showIndicatorsPanel ?? false);

  /* Opening the drawing rail while the tool rail is over it puts two vertical
     bars in the same corner. The tool rail folds away and leaves the chart to
     the tools. */
  useEffect(() => {
    if (drawingToolsOpen) {
      setOpen(false);
      setPane(null);
    }
  }, [drawingToolsOpen]);

  const setChartType = (value: string) => {
    const store: any = useChartStore.getState();
    store.setChartType?.(value);
    setPane(null);
  };

  const setTimeFrame = (tf: TimeFrame) => {
    useBinaryStore.getState().setTimeFrame(tf);
    const store: any = useChartStore.getState();
    store.setTimeFrame?.(tf);
    onTimeFrameChange(tf);
    setPane(null);
  };

  const toggleIndicators = () => {
    const store: any = useChartStore.getState();
    if (showIndicatorsPanel) store.closeIndicatorsPanel?.();
    else store.openIndicatorsPanel?.();
    setOpen(false);
    setPane(null);
  };

  const timeframes =
    timeframeDurations && timeframeDurations.length > 0
      ? timeframeDurations
      : ([
          { value: "1m", label: "1m" },
          { value: "5m", label: "5m" },
          { value: "15m", label: "15m" },
          { value: "1h", label: "1h" },
        ] as Array<{ value: TimeFrame; label: string }>);

  const currentTimeframeLabel =
    timeframes.find((t) => t.value === timeFrame)?.label ?? String(timeFrame);

  const currentTypeIcon =
    CHART_TYPES.find((c) => c.value === chartType)?.icon ?? <CandlestickIcon />;

  // Panels are always dark — they sit over the chart, in either theme.
  const panelBg = "bg-[#2f3542]";

  return (
    /* Right edge, not left. The engine's own drawing rail comes out of the
       left border, so the tool rail sat on top of the tools it opens; and
       the chart's price axis — the thing a trader is reading while they
       reach for a timeframe — is on the right, which is where the thumb
       already is. Options open leftward, into the chart, rather than off
       the screen. */
    <div
      className={`absolute bottom-[46px] right-3 z-30 flex items-end flex-row-reverse ${
        /* Open, the rail and its options are one object — a single dark
           panel with the rail down one side — rather than a column of
           loose pills with a second box floating beside it. Closed, it is
           just the one button and carries no container at all. */
        open ? `${panelBg} gap-1.5 p-1.5 rounded-2xl shadow-xl` : "gap-2"
      }`}
    >
      {/* ── the rail, bottom-up: ⋯ last so it stays under the thumb ──── */}
      <div className="flex flex-col-reverse gap-1.5">
        <button
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (!next) setPane(null);
          }}
          aria-label="Chart tools"
          aria-expanded={open}
          className={`relative w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors ${
            open
              ? "bg-[#2f80ed] text-white"
              : isDark
                ? "bg-[#1b1f26]/90 text-zinc-300 active:bg-[#232833]"
                : "bg-[#f2f4f7]/95 text-zinc-600 active:bg-[#e6e9ee]"
          }`}
        >
          <SlidersHorizontal size={19} strokeWidth={2.2} />
          {open && (
            <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-[#2f3542] text-white flex items-center justify-center z-10">
              <X size={11} strokeWidth={3} />
            </span>
          )}
        </button>

        {open && (
          <>
            <RailButton
              label="Drawing tools"
              active={drawingToolsOpen}
              onClick={() => onDrawingToolsChange(!drawingToolsOpen)}
            >
              <Pencil size={18} strokeWidth={2} />
            </RailButton>

            <RailButton
              label="Timeframe"
              active={pane === "timeframe"}
              onClick={() => setPane(pane === "timeframe" ? null : "timeframe")}
            >
              <span className="text-[13px] font-bold">{currentTimeframeLabel}</span>
            </RailButton>

            <RailButton
              label="Chart type"
              active={pane === "type"}
              onClick={() => setPane(pane === "type" ? null : "type")}
            >
              {currentTypeIcon}
            </RailButton>

            <RailButton
              label="Indicators"
              active={showIndicatorsPanel}
              onClick={toggleIndicators}
            >
              <IndicatorsGlyph />
            </RailButton>

          </>
        )}
      </div>

      {/* ── the options ──────────────────────────────────────────────── */}
      {open && pane === "timeframe" && (
        <div className="bg-white/[0.06] rounded-xl p-2 max-h-[70%] overflow-y-auto">
          <div className="grid grid-cols-3 gap-1">
            {timeframes.map((tf) => {
              const isActive = tf.value === timeFrame;
              return (
                <button
                  key={tf.value}
                  onClick={() => setTimeFrame(tf.value)}
                  className={`h-11 min-w-[62px] px-2 rounded-lg text-[15px] font-medium tabular-nums transition-colors ${
                    isActive
                      ? "bg-white/10 text-zinc-400"
                      : "text-white active:bg-white/10"
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open && pane === "type" && (
        <div className="bg-white/[0.06] rounded-xl p-2 max-h-[70%] overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            {CHART_TYPES.map((ct) => {
              const isActive = ct.value === chartType;
              return (
                <button
                  key={ct.value}
                  onClick={() => setChartType(ct.value)}
                  className={`h-10 px-3 rounded-lg flex items-center gap-2.5 text-[14px] font-medium transition-colors ${
                    isActive ? "bg-white/10 text-zinc-400" : "text-white active:bg-white/10"
                  }`}
                >
                  {ct.icon}
                  <span className="whitespace-nowrap">{ct.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RailButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      /* These only ever render inside the open panel, so they are chips on
         that panel rather than free-floating controls over the chart —
         theme-independent for the same reason the panel is. */
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
        active ? "bg-white text-zinc-900" : "bg-white/[0.08] text-zinc-300 active:bg-white/[0.16]"
      }`}
    >
      {children}
    </button>
  );
}

/** Three bars over a baseline — the desktop toolbar's indicators glyph. */
function IndicatorsGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 20V10M9 20V4M14 20V13M19 20V7" />
    </svg>
  );
}
