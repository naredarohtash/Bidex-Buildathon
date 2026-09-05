"use client";

import React, { useState, useEffect, useRef } from "react";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import {
  GripVertical,
  Pencil,
  Copy,
  Lock,
  Unlock,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp
} from "lucide-react";

const colors = [
  "#22c55e", // Green
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#6366f1", // Indigo
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f43f5e", // Rose
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#6b7280"  // Gray
];

// Persist the user's custom dragged position across component mount/unmount lifecycles
let globalToolbarPosition: { left: number; top: number; isCustom: boolean } | null = null;

if (typeof window !== "undefined") {
  try {
    const savedPlaced = window.localStorage.getItem("bidex_drawing_toolbar_user_placed");
    if (savedPlaced === "true") {
      const savedPos = window.localStorage.getItem("bidex_drawing_toolbar_position");
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (parsed && typeof parsed.left === "number" && typeof parsed.top === "number") {
          globalToolbarPosition = { ...parsed, isCustom: true };
        }
      }
    }
  } catch (e) {
    console.error("Failed to read toolbar position from localStorage", e);
  }
}

export function DrawingPropertiesToolbar() {
  // Initialize state to null to allow measuring on client-side mount
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthDropdown, setShowWidthDropdown] = useState(false);
  const [, setUpdateTrigger] = useState(0);

  const elementRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  // Set whenever the engine (re)selects a drawing — lets the outside-click check
  // tell "clicked on a drawing" apart from "clicked on empty chart space"
  const reselectedRef = useRef(false);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Subscribe to Zustand store properties
  const selectedDrawingId = useChartStore((s) => s.selectedDrawingId);
  const selectDrawing = useChartStore((s) => s.selectDrawing);

  // Access the global drawing manager instance and its engine
  const manager = typeof window !== "undefined" ? (window as any).__chart_drawing_manager : null;
  const selectedDrawing = manager && manager.engine ? manager.engine.getDrawing(selectedDrawingId) : null;

  // React to drawing manager engine events (moving, updating, resizing)
  useEffect(() => {
    if (!manager || !manager.engine || !selectedDrawingId) return;

    const handleDrawingEvent = (event: any) => {
      // Any selection (same drawing or another one) means the pointer landed on a
      // drawing, so an in-flight outside-click check must not deselect
      if (event.type === "selected") {
        reselectedRef.current = true;
      }

      if (event.drawingId && event.drawingId !== selectedDrawingId) {
        return;
      }

      // If the toolbar is stationary (position is set), we don't care about moved or resized events!
      if (globalToolbarPosition && (event.type === "moved" || event.type === "resized")) {
        return;
      }

      if (
        event.type === "updated" ||
        event.type === "moved" ||
        event.type === "resized" ||
        event.type === "selected" ||
        event.type === "deselected"
      ) {
        setUpdateTrigger((prev) => prev + 1);
      }
    };

    manager.engine.addEventListener(handleDrawingEvent);
    return () => {
      manager.engine.removeEventListener(handleDrawingEvent);
    };
  }, [manager, selectedDrawingId]);

  // Reset pickers when selection changes, but keep the custom position
  useEffect(() => {
    setShowColorPicker(false);
    setShowWidthDropdown(false);
  }, [selectedDrawingId]);

  // Dismiss on any click on the chart surface that isn't on a drawing.
  // The chart canvas normally deselects itself on mousedown, but several of its
  // early-return paths skip that, which would leave this toolbar stuck open.
  useEffect(() => {
    if (!selectedDrawingId) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left click / touch only — keep right-click menu working

      const target = e.target as HTMLElement | null;
      const root = elementRef.current;
      if (!target || !root) return;

      if (root.contains(target)) return; // clicks on the toolbar itself

      const container = root.parentElement;
      if (!container || !container.contains(target)) return; // clicks outside the chart

      // Only the chart drawing surface counts — not panels, menus or overlays
      if (target.tagName !== "CANVAS" && target !== container) return;

      reselectedRef.current = false;

      // The chart handles this same event on the bubble phase; check afterwards
      // whether it (re)selected a drawing. If it didn't, this was empty space.
      window.setTimeout(() => {
        if (reselectedRef.current) return;

        const engine = (window as any).__chart_drawing_manager?.engine;
        if (engine && engine.getSelectedId() !== null) {
          engine.select(null);
        }
        if (selectDrawing) {
          selectDrawing(null);
        }
      }, 0);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [selectedDrawingId, selectDrawing]);

  // Escape key listener to deselect drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedDrawingId) {
          if (manager && manager.engine) {
            manager.engine.select(null);
          }
          if (selectDrawing) {
            selectDrawing(null);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedDrawingId, manager, selectDrawing]);

  const toolbarWidth = 270; // Compact width
  const toolbarHeight = 44;  // Compact height (h-11)

  const constrainPosition = (
    left: number,
    top: number,
    parentWidth: number,
    parentHeight: number
  ) => {
    const maxX = Math.max(8, parentWidth - toolbarWidth);
    const maxY = Math.max(8, parentHeight - toolbarHeight);

    const constrainedLeft = Math.max(4, Math.min(left, maxX - 4));
    const constrainedTop = Math.max(4, Math.min(top, maxY - 4));
    return { left: constrainedLeft, top: constrainedTop };
  };

  // Mount/Initial Calculation Effect
  useEffect(() => {
    const parent = elementRef.current?.parentElement;
    if (!parent) return;

    const parentWidth = parent.clientWidth;
    const parentHeight = parent.clientHeight;

    let restored: { left: number; top: number } | null = null;
    let isCustom = false;

    if (globalToolbarPosition?.isCustom) {
      restored = { left: globalToolbarPosition.left, top: globalToolbarPosition.top };
      isCustom = true;
    } else {
      const savedPlaced = localStorage.getItem("bidex_drawing_toolbar_user_placed");
      if (savedPlaced === "true") {
        const saved = localStorage.getItem("bidex_drawing_toolbar_position");
        if (saved) {
          try {
            restored = JSON.parse(saved);
            isCustom = true;
          } catch (e) {
            // ignore
          }
        }
      }
    }

    if (restored) {
      const constrained = constrainPosition(restored.left, restored.top, parentWidth, parentHeight);
      setPosition(constrained);
      globalToolbarPosition = { ...constrained, isCustom: true };
    } else {
      const defaultLeft = parentWidth * 0.6 - toolbarWidth / 2;
      const defaultTop = parentHeight * 0.25;
      const constrained = constrainPosition(defaultLeft, defaultTop, parentWidth, parentHeight);
      setPosition(constrained);
      globalToolbarPosition = { ...constrained, isCustom: false };
    }
  }, [selectedDrawingId]);

  // Window Resize Event Effect
  useEffect(() => {
    const handleResize = () => {
      const currentPos = positionRef.current;
      if (!currentPos) return;

      const parent = elementRef.current?.parentElement;
      if (!parent) return;

      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      const isCustom = globalToolbarPosition?.isCustom || false;
      const constrained = constrainPosition(currentPos.left, currentPos.top, parentWidth, parentHeight);

      if (constrained.left !== currentPos.left || constrained.top !== currentPos.top) {
        setPosition(constrained);
        globalToolbarPosition = { ...constrained, isCustom };
        if (isCustom) {
          localStorage.setItem("bidex_drawing_toolbar_position", JSON.stringify(constrained));
        }
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!selectedDrawing || !manager || !manager.engine) return null;

  const isReady = position !== null;
  const renderLeft = position ? position.left : 0;
  const renderTop = position ? position.top : 0;

  // Style properties
  const drawingStyle = selectedDrawing.config?.style || {};
  const activeColor = drawingStyle.lineColor || drawingStyle.textColor || "#3b82f6";
  const activeWidth = drawingStyle.lineWidth || drawingStyle.borderWidth || 1;
  const activeStyle = drawingStyle.lineStyle || "solid";
  const isLocked = selectedDrawing.config?.locked || false;

  // Action: Change Color
  const handleColorSelect = (color: string) => {
    const newStyle = { ...drawingStyle };
    newStyle.lineColor = color;
    newStyle.textColor = color;
    newStyle.fillColor = color;

    selectedDrawing.config.style = newStyle;
    selectedDrawing.config.updatedAt = Date.now();

    manager.engine.emitEvent({
      type: "updated",
      drawingId: selectedDrawingId,
      drawing: selectedDrawing.config
    });

    setShowColorPicker(false);
  };

  // Action: Change Style
  const handleStyleSelect = (style: string) => {
    const newStyle = { ...drawingStyle };
    newStyle.lineStyle = style;

    selectedDrawing.config.style = newStyle;
    selectedDrawing.config.updatedAt = Date.now();

    manager.engine.emitEvent({
      type: "updated",
      drawingId: selectedDrawingId,
      drawing: selectedDrawing.config
    });
  };

  // Action: Select Thickness Directly
  const handleWidthSelect = (width: number) => {
    const newStyle = { ...drawingStyle };
    newStyle.lineWidth = width;
    newStyle.borderWidth = width;

    selectedDrawing.config.style = newStyle;
    selectedDrawing.config.updatedAt = Date.now();

    manager.engine.emitEvent({
      type: "updated",
      drawingId: selectedDrawingId,
      drawing: selectedDrawing.config
    });
  };

  // Action: Increment/Decrement Thickness
  const handleThicknessChange = (delta: number) => {
    const currentW = Number(drawingStyle.lineWidth || drawingStyle.borderWidth || 1);
    if (isNaN(currentW)) return;
    const nextWidth = Math.max(1, Math.min(12, currentW + delta));

    const newStyle = { ...drawingStyle };
    newStyle.lineWidth = nextWidth;
    newStyle.borderWidth = nextWidth;

    selectedDrawing.config.style = newStyle;
    selectedDrawing.config.updatedAt = Date.now();

    manager.engine.emitEvent({
      type: "updated",
      drawingId: selectedDrawingId,
      drawing: selectedDrawing.config
    });
  };

  // Action: Toggle Lock
  const handleToggleLock = () => {
    selectedDrawing.config.locked = !isLocked;
    selectedDrawing.config.updatedAt = Date.now();

    manager.engine.emitEvent({
      type: "updated",
      drawingId: selectedDrawingId,
      drawing: selectedDrawing.config
    });
  };

  // Action: Duplicate Drawing
  const handleDuplicate = () => {
    const duplicated: any = {
      id: "drawing-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
      type: selectedDrawing.config.type,
      style: JSON.parse(JSON.stringify(selectedDrawing.config.style)),
      points: selectedDrawing.config.points.map((p: any) => ({
        time: p.time,
        price: p.price
      })),
      visible: true,
      locked: selectedDrawing.config.locked === true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Calculate slight shifts based on viewport size
    const currentViewport = useChartStore.getState().state?.viewport;
    if (currentViewport) {
      const timeShift = (currentViewport.endTime - currentViewport.startTime) * 0.02;
      const priceShift = (currentViewport.maxPrice - currentViewport.minPrice) * 0.02;

      duplicated.points = duplicated.points.map((p: any) => ({
        time: p.time + timeShift,
        price: p.price - priceShift
      }));
    }

    manager.engine.addDrawing(duplicated);
    manager.engine.select(duplicated.id);
  };

  // Action: Delete Drawing
  const handleDelete = () => {
    manager.engine.removeDrawing(selectedDrawingId);
    manager.engine.emitEvent({
      type: "deleted",
      drawingId: selectedDrawingId
    });
    if (selectDrawing) {
      selectDrawing(null);
    }
  };

  // Drag handler using standard mouse/touch events
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    // Stop propagation so the chart canvas underneath doesn't receive the event
    e.stopPropagation();

    // Check if the click target is inside a button, input, select or active picker popup
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("select") ||
      target.closest(".z-50")
    ) {
      return;
    }

    let startX = 0;
    let startY = 0;

    if ("touches" in e) {
      if (e.touches.length === 0) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      if (e.button !== 0) return; // Only drag on left click
      startX = e.clientX;
      startY = e.clientY;
    }

    setIsDragging(true);

    const initialLeft = position ? position.left : 0;
    const initialTop = position ? position.top : 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const parent = elementRef.current?.parentElement;
      if (!parent) return;

      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const constrained = constrainPosition(initialLeft + dx, initialTop + dy, parentWidth, parentHeight);
      setPosition(constrained);
      globalToolbarPosition = { ...constrained, isCustom: true };
      localStorage.setItem("bidex_drawing_toolbar_position", JSON.stringify(constrained));
      localStorage.setItem("bidex_drawing_toolbar_user_placed", "true");
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return;
      // Prevent page scroll/bounce when dragging the toolbar on touch screen
      moveEvent.preventDefault();

      const parent = elementRef.current?.parentElement;
      if (!parent) return;

      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;

      const dx = moveEvent.touches[0].clientX - startX;
      const dy = moveEvent.touches[0].clientY - startY;
      const constrained = constrainPosition(initialLeft + dx, initialTop + dy, parentWidth, parentHeight);
      setPosition(constrained);
      globalToolbarPosition = { ...constrained, isCustom: true };
      localStorage.setItem("bidex_drawing_toolbar_position", JSON.stringify(constrained));
      localStorage.setItem("bidex_drawing_toolbar_user_placed", "true");
    };

    const handleDragEnd = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleDragEnd, true);
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", handleDragEnd, true);
    };

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleDragEnd, true);
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", handleDragEnd, true);
  };

  return (
    <div
      ref={elementRef}
      style={{
        position: "absolute",
        left: `${renderLeft}px`,
        top: `${renderTop}px`,
        zIndex: 42,
        ...(!isReady ? { opacity: 0, pointerEvents: "none" } : {})
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className={`
        bg-popover/90 border border-zinc-200 dark:border-zinc-700/80
        backdrop-blur-md shadow-xl dark:shadow-[0_4px_20px_rgba(0,0,0,0.6)] rounded-md flex items-center select-none h-11 cursor-grab active:cursor-grabbing
        transition-all duration-150
        ${isDragging ? "ring-2 ring-blue-500/20 border-blue-500/50" : ""}
      `}
    >
      {/* DRAG HANDLE */}
      <div
        className="
          w-9 h-full flex items-center justify-center text-muted-foreground
          cursor-grab active:cursor-grabbing hover:bg-muted/30
          transition-colors select-none rounded-l-md touch-none
        "
      >
        <GripVertical className="w-[17px] h-[17px]" />
      </div>

      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700/60" />

      {/* COLOR PICKER TRIGGER */}
      <div className="relative h-full">
        <button
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowWidthDropdown(false);
          }}
          className={`
            w-11 h-full flex flex-col items-center justify-center relative
            text-foreground/80 hover:bg-muted/30 transition-colors
            ${showColorPicker ? "bg-muted/50" : ""}
          `}
        >
          <Pencil className="w-[17px] h-[17px] hover:scale-105 active:scale-95 transition-transform" />
          <span
            className="absolute bottom-2 w-6 h-[4px] rounded-sm transition-colors"
            style={{ backgroundColor: activeColor }}
          />
        </button>

        {/* COLOR PICKER POPUP */}
        {showColorPicker && (
          <div
            className="
              absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-2.5
              bg-popover/95 border border-zinc-200 dark:border-zinc-700/80
              shadow-2xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.7)] rounded-lg w-[152px] backdrop-blur-md flex flex-col gap-1.5
              animate-in fade-in zoom-in-95 duration-100
            "
          >
            <div className="grid grid-cols-6 gap-1.5 justify-items-center">
              {colors.map((c) => {
                const isActive = activeColor.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    onClick={() => handleColorSelect(c)}
                    style={{ backgroundColor: c }}
                    className={`
                      relative w-[17px] h-[17px] rounded-full hover:scale-115 active:scale-90
                      transition-all border border-black/5 dark:border-white/5
                      flex items-center justify-center cursor-pointer
                      ${isActive ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background shadow-sm" : ""}
                    `}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700/60" />

      {/* LINE STYLE & WIDTH TRIGGER */}
      <div className="relative h-full">
        <button
          onClick={() => {
            setShowWidthDropdown(!showWidthDropdown);
            setShowColorPicker(false);
          }}
          className={`
            w-14 h-full flex items-center justify-center gap-1 transition-colors
            text-foreground/80 hover:bg-muted/30
            ${showWidthDropdown ? "bg-muted/50" : ""}
          `}
        >
          <div className="flex items-center justify-center w-8">
            <svg viewBox="0 0 24 24" width="20" height="20" style={{ color: activeColor }} className="hover:scale-105 active:scale-95 transition-transform">
              <line
                x1="2"
                y1="12"
                x2="22"
                y2="12"
                stroke="currentColor"
                strokeWidth={Math.max(1.5, Math.min(4, activeWidth))}
                strokeDasharray={
                  activeStyle === "dashed"
                    ? "4,3"
                    : activeStyle === "dotted"
                    ? "1.5,2.5"
                    : undefined
                }
                strokeLinecap="round"
              />
            </svg>
          </div>
          {showWidthDropdown ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>

        {/* LINE STYLE & THICKNESS DROPDOWN */}
        {showWidthDropdown && (
          <div
            className="
              absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-2.5
              bg-popover/95 border border-zinc-200 dark:border-zinc-700/80
              shadow-2xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.7)] rounded-lg w-[162px] backdrop-blur-md flex flex-col gap-3
              animate-in fade-in zoom-in-95 duration-100
            "
          >
            {/* LINE STYLE ROW */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">
                Style
              </span>
              <div className="flex bg-muted p-0.5 rounded-lg gap-0.5">
                {[
                  { id: "solid", preview: (
                    <line x1="2" y1="10" x2="26" y2="10" strokeWidth="2.5" strokeLinecap="round" />
                  )},
                  { id: "dashed", preview: (
                    <line x1="2" y1="10" x2="26" y2="10" strokeWidth="2.5" strokeDasharray="5,3" strokeLinecap="round" />
                  )},
                  { id: "dotted", preview: (
                    <line x1="2" y1="10" x2="26" y2="10" strokeWidth="2.5" strokeDasharray="1.5,3" strokeLinecap="round" />
                  )}
                ].map((style) => {
                  const isSelected = activeStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      onClick={() => handleStyleSelect(style.id)}
                      className={`
                        flex-1 h-6 rounded-md flex items-center justify-center transition-all hover:scale-105 active:scale-95
                        ${
                          isSelected
                            ? "bg-background text-primary shadow-sm border border-zinc-200 dark:border-zinc-700/50"
                            : "text-muted-foreground hover:text-foreground"
                        }
                      `}
                    >
                      <svg viewBox="0 0 28 20" width="20" height="14" className="stroke-current">
                        {style.preview}
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* THICKNESS SECTION */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">
                Thickness
              </span>

              {/* Presets Grid */}
              <div className="grid grid-cols-5 gap-1 bg-muted p-0.5 rounded-lg">
                {[1, 2, 3, 5, 8].map((w) => {
                  const isSelected = activeWidth === w;
                  return (
                    <button
                      key={w}
                      onClick={() => handleWidthSelect(w)}
                      className={`
                        h-6 rounded-md flex items-center justify-center text-[10px] font-bold transition-all hover:scale-110 active:scale-95
                        ${
                          isSelected
                            ? "bg-background text-primary shadow-sm border border-zinc-200 dark:border-zinc-700/50"
                            : "text-muted-foreground hover:text-foreground"
                        }
                      `}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>

              {/* Stepper Adjustment */}
              <div className="flex items-center justify-between bg-muted p-1 rounded-lg">
                <button
                  onClick={() => handleThicknessChange(-1)}
                  disabled={activeWidth <= 1}
                  className="
                    w-6 h-6 rounded-md bg-background flex items-center justify-center
                    hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all font-bold text-xs
                    text-foreground/80 disabled:opacity-30 disabled:cursor-not-allowed select-none
                    border border-zinc-200 dark:border-zinc-700/50 shadow-sm
                  "
                >
                  -
                </button>

                <span className="text-foreground font-bold text-[11px] w-8 text-center select-none">
                  {activeWidth}px
                </span>

                <button
                  onClick={() => handleThicknessChange(1)}
                  disabled={activeWidth >= 12}
                  className="
                    w-6 h-6 rounded-md bg-background flex items-center justify-center
                    hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all font-bold text-xs
                    text-foreground/80 disabled:opacity-30 disabled:cursor-not-allowed select-none
                    border border-zinc-200 dark:border-zinc-700/50 shadow-sm
                  "
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700/60" />

      {/* DUPLICATE BUTTON */}
      <button
        onClick={handleDuplicate}
        title="Duplicate Element"
        className="
          w-11 h-full flex items-center justify-center text-foreground/80
          hover:bg-muted/30 transition-colors
        "
      >
        <Copy className="w-[17px] h-[17px] hover:scale-110 active:scale-95 transition-transform" />
      </button>

      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700/60" />

      {/* LOCK BUTTON */}
      <button
        onClick={handleToggleLock}
        title={isLocked ? "Unlock Element" : "Lock Element"}
        className={`
          w-11 h-full flex items-center justify-center transition-colors
          ${
            isLocked
              ? "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-450"
              : "text-foreground/80 hover:bg-muted/30"
          }
        `}
      >
        {isLocked ? (
          <Lock className="w-[17px] h-[17px] hover:scale-110 active:scale-95 transition-transform" />
        ) : (
          <Unlock className="w-[17px] h-[17px] hover:scale-110 active:scale-95 transition-transform" />
        )}
      </button>

      <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700/60" />

      {/* DELETE BUTTON */}
      <button
        onClick={handleDelete}
        title="Delete Element"
        className="
          w-11 h-full flex items-center justify-center text-red-500
          hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors rounded-r-md
        "
      >
        <Trash2 className="w-[17px] h-[17px] hover:scale-110 active:scale-95 transition-transform" />
      </button>
    </div>
  );
}
