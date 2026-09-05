"use client";

import { useState, useEffect } from "react";
import { X, Check, ChevronDown } from "lucide-react";

interface CandlePartColors {
  body: string;
  border: string;
  wick: string;
  bodyEnabled: boolean;
  borderEnabled: boolean;
  wickEnabled: boolean;
}

interface CustomCandleColors {
  preset: string;
  bull: CandlePartColors;
  bear: CandlePartColors;
}

/* Every preset here is a pair of candle colours and nothing else.

   None of them carries a colour for the order badges, and none of them should.
   The engine derives a badge from whichever body colour it is handed, shifting
   it one small step so it can never be the exact hex of the candle it lands on
   — which is what made a FALL badge vanish into a falling candle. Pick any
   palette below, or your own, and that separation comes with it. Writing a
   badge colour down beside a candle colour is what would break it again. */
const PRESETS: Record<string, { name: string; bull: CandlePartColors; bear: CandlePartColors }> = {
  default: {
    name: "Default",
    bull: { body: "#10b981", border: "#10b981", wick: "#10b981", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#f43f5e", border: "#f43f5e", wick: "#f43f5e", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  tradingview: {
    name: "TradingView",
    bull: { body: "#26a69a", border: "#26a69a", wick: "#26a69a", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#ef5350", border: "#ef5350", wick: "#ef5350", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  binance: {
    name: "Binance",
    bull: { body: "#2ebd85", border: "#2ebd85", wick: "#2ebd85", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#df294a", border: "#df294a", wick: "#df294a", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  classic: {
    name: "Classic",
    bull: { body: "#4caf50", border: "#4caf50", wick: "#4caf50", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#f44336", border: "#f44336", wick: "#f44336", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  blueorange: {
    name: "Blue & Orange",
    bull: { body: "#0094ff", border: "#0094ff", wick: "#0094ff", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#ff6a00", border: "#ff6a00", wick: "#ff6a00", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  purplegold: {
    name: "Purple & Gold",
    bull: { body: "#ab47bc", border: "#ab47bc", wick: "#ab47bc", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#fbc02d", border: "#fbc02d", wick: "#fbc02d", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  monochrome: {
    name: "Monochrome",
    bull: { body: "#b0bec5", border: "#b0bec5", wick: "#b0bec5", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#37474f", border: "#37474f", wick: "#37474f", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  neon: {
    name: "Neon",
    bull: { body: "#00e5ff", border: "#00e5ff", wick: "#00e5ff", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#ff007f", border: "#ff007f", wick: "#ff007f", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  },
  hollow: {
    name: "Hollow",
    bull: { body: "transparent", border: "#26a69a", wick: "#26a69a", bodyEnabled: false, borderEnabled: true, wickEnabled: true },
    bear: { body: "#ef5350", border: "#ef5350", wick: "#ef5350", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  }
};

interface CandleColorsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  isNavyMode?: boolean;
}

export default function CandleColorsPopup({ 
  isOpen, 
  onClose,
  isDarkMode = true,
  isNavyMode = false
}: CandleColorsPopupProps) {
  const [colors, setColors] = useState<CustomCandleColors>({
    preset: "default",
    bull: { body: "#10b981", border: "#10b981", wick: "#10b981", bodyEnabled: true, borderEnabled: true, wickEnabled: true },
    bear: { body: "#f43f5e", border: "#f43f5e", wick: "#f43f5e", bodyEnabled: true, borderEnabled: true, wickEnabled: true }
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Load initially from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("custom_candle_colors");
      if (saved) {
        setColors(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Error reading custom colors from localStorage:", e);
    }
  }, []);

  if (!isOpen) return null;

  const updateColors = (updated: Partial<CustomCandleColors>) => {
    const nextColors = { ...colors, ...updated };
    setColors(nextColors);
    
    // Sync with global window hook in chart bundle
    if (typeof window !== "undefined" && (window as any).setCustomCandleColors) {
      (window as any).setCustomCandleColors(nextColors);
    }
  };

  const handlePresetChange = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (preset) {
      updateColors({
        preset: presetKey,
        bull: { ...preset.bull },
        bear: { ...preset.bear }
      });
    }
  };

  const handlePartChange = (type: "bull" | "bear", part: keyof CandlePartColors, value: any) => {
    const updatedPart = { ...colors[type], [part]: value };
    
    // If the user customizes any setting, set preset to "custom"
    updateColors({
      preset: "custom",
      [type]: updatedPart
    });
  };

  // Theme styling resolutions
  const isLight = !isDarkMode && !isNavyMode;
  
  const panelBg = isNavyMode 
    ? "bg-[#0c1525]/95 border-[#1b2438] shadow-2xl text-zinc-100" 
    : isLight 
    ? "bg-white/95 border-zinc-200 text-zinc-800 shadow-xl" 
    : "bg-zinc-950/95 border-zinc-800/80 shadow-2xl text-zinc-100";
    
  const textClass = isLight ? "text-zinc-800" : "text-zinc-100";
  const subtextClass = isLight ? "text-zinc-500" : "text-zinc-400";
  const labelClass = isLight ? "text-zinc-400" : "text-zinc-500";
  
  const selectBg = isNavyMode 
    ? "bg-[#0d1525]/60 border-[#1b2438] text-zinc-200 hover:bg-[#0d1525] hover:text-zinc-100" 
    : isLight 
    ? "bg-zinc-100/80 border-zinc-200/80 text-zinc-700 hover:bg-zinc-150 hover:text-zinc-950" 
    : "bg-zinc-900/60 border-zinc-800 text-zinc-200 hover:bg-zinc-900 hover:text-zinc-100";
    
  const menuBg = isNavyMode 
    ? "bg-[#0b111e] border-[#1b2438]" 
    : isLight 
    ? "bg-white border-zinc-200 shadow-2xl" 
    : "bg-zinc-950 border-zinc-800";
    
  const optionClass = (isSelected: boolean) => 
    isSelected 
      ? "bg-blue-600/15 text-blue-500 font-medium" 
      : isLight 
      ? "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100" 
      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 dark:hover:bg-[#0d1525]";
      
  const sectionBg = isLight 
    ? "bg-zinc-50 border border-zinc-150/60" 
    : "bg-zinc-900/40 dark:bg-black/20 border border-zinc-900/80 dark:border-[#131a2b]";
    
  const rowText = isLight ? "text-zinc-600" : "text-zinc-400";
  
  const previewBg = isLight 
    ? "bg-zinc-50 border-zinc-200" 
    : "bg-zinc-900/60 dark:bg-black/40 border-zinc-900 dark:border-[#131a2b]";
    
  const gridLineColor = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.03)";

  // SVG live preview colors
  const bullBodyColor = colors.bull.bodyEnabled ? colors.bull.body : "transparent";
  const bullBorderColor = colors.bull.borderEnabled ? colors.bull.border : "transparent";
  const bullWickColor = colors.bull.wickEnabled ? colors.bull.wick : "transparent";

  const bearBodyColor = colors.bear.bodyEnabled ? colors.bear.body : "transparent";
  const bearBorderColor = colors.bear.borderEnabled ? colors.bear.border : "transparent";
  const bearWickColor = colors.bear.wickEnabled ? colors.bear.wick : "transparent";

  return (
    <div 
      id="candle-colors-overlay"
      className={`absolute bottom-[29px] left-[91px] z-50 w-72 p-4 rounded-2xl border backdrop-blur-md flex flex-col gap-3.5 select-none animate-in fade-in slide-in-from-left-2 duration-200 ${panelBg}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-zinc-800/20 dark:border-zinc-800/50">
        <h4 className={`text-xs font-bold uppercase tracking-wider ${subtextClass}`}>Candle Colors</h4>
        <button 
          onClick={onClose}
          className={`p-1 rounded-md transition-colors cursor-pointer ${subtextClass} hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1 relative">
        <label className={`text-[10px] font-semibold uppercase ${labelClass}`}>Preset Scheme</label>
        
        {/* Custom Dropdown Trigger */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`w-full flex items-center justify-between border rounded-xl px-3 py-2 text-xs focus:outline-none transition-all cursor-pointer shadow-sm ${selectBg}`}
        >
          <span>{colors.preset === "custom" ? "Custom Configuration" : PRESETS[colors.preset]?.name}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-250 ${isDropdownOpen ? "rotate-180 text-zinc-400 dark:text-zinc-300" : "text-zinc-500"}`} />
        </button>

        {/* Dropdown Options Menu */}
        {isDropdownOpen && (
          <>
            {/* Click-outside backdrop overlay */}
            <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsDropdownOpen(false)} />
            
            <div className={`absolute top-[calc(100%+4px)] left-0 right-0 z-50 p-1 flex flex-col gap-0.5 max-h-48 overflow-y-auto rounded-xl border shadow-2xl animate-in fade-in slide-in-from-top-1.5 duration-150 ${menuBg}`}>
              {Object.entries(PRESETS).map(([key, item]) => {
                const isSelected = colors.preset === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      handlePresetChange(key);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors cursor-pointer ${optionClass(isSelected)}`}
                  >
                    <span>{item.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-500" />}
                  </button>
                );
              })}
              {colors.preset === "custom" && (
                <button
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs rounded-lg bg-blue-600/15 text-blue-500 font-medium cursor-default"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <span>Custom Configuration</span>
                  <Check className="w-3.5 h-3.5 text-blue-500" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Settings Grid */}
      <div className="flex flex-col gap-2">
        {/* Bull Section */}
        <div className={`flex flex-col gap-1.5 p-2 rounded-xl ${sectionBg}`}>
          <div className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider">Bullish Candle</div>
          <div className="flex flex-col gap-1.5">
            {/* Body */}
            <div className="flex items-center justify-between text-xs">
              <span className={rowText}>Body Color</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch 
                  checked={colors.bull.bodyEnabled} 
                  onChange={(val) => handlePartChange("bull", "bodyEnabled", val)} 
                  isLight={isLight}
                />
                <ColorPicker 
                  value={colors.bull.body} 
                  disabled={!colors.bull.bodyEnabled}
                  onChange={(val) => handlePartChange("bull", "body", val)} 
                />
              </div>
            </div>
            {/* Border */}
            <div className="flex items-center justify-between text-xs">
              <span className={rowText}>Borders</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch 
                  checked={colors.bull.borderEnabled} 
                  onChange={(val) => handlePartChange("bull", "borderEnabled", val)} 
                  isLight={isLight}
                />
                <ColorPicker 
                  value={colors.bull.border} 
                  disabled={!colors.bull.borderEnabled}
                  onChange={(val) => handlePartChange("bull", "border", val)} 
                />
              </div>
            </div>
            {/* Wick */}
            <div className="flex items-center justify-between text-xs">
              <span className={rowText}>Wicks</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch 
                  checked={colors.bull.wickEnabled} 
                  onChange={(val) => handlePartChange("bull", "wickEnabled", val)} 
                  isLight={isLight}
                />
                <ColorPicker 
                  value={colors.bull.wick} 
                  disabled={!colors.bull.wickEnabled}
                  onChange={(val) => handlePartChange("bull", "wick", val)} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bear Section */}
        <div className={`flex flex-col gap-1.5 p-2 rounded-xl ${sectionBg}`}>
          <div className="text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider">Bearish Candle</div>
          <div className="flex flex-col gap-1.5">
            {/* Body */}
            <div className="flex items-center justify-between text-xs">
              <span className={rowText}>Body Color</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch 
                  checked={colors.bear.bodyEnabled} 
                  onChange={(val) => handlePartChange("bear", "bodyEnabled", val)} 
                  isLight={isLight}
                />
                <ColorPicker 
                  value={colors.bear.body} 
                  disabled={!colors.bear.bodyEnabled}
                  onChange={(val) => handlePartChange("bear", "body", val)} 
                />
              </div>
            </div>
            {/* Border */}
            <div className="flex items-center justify-between text-xs">
              <span className={rowText}>Borders</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch 
                  checked={colors.bear.borderEnabled} 
                  onChange={(val) => handlePartChange("bear", "borderEnabled", val)} 
                  isLight={isLight}
                />
                <ColorPicker 
                  value={colors.bear.border} 
                  disabled={!colors.bear.borderEnabled}
                  onChange={(val) => handlePartChange("bear", "border", val)} 
                />
              </div>
            </div>
            {/* Wick */}
            <div className="flex items-center justify-between text-xs">
              <span className={rowText}>Wicks</span>
              <div className="flex items-center gap-2">
                <ToggleSwitch 
                  checked={colors.bear.wickEnabled} 
                  onChange={(val) => handlePartChange("bear", "wickEnabled", val)} 
                  isLight={isLight}
                />
                <ColorPicker 
                  value={colors.bear.wick} 
                  disabled={!colors.bear.wickEnabled}
                  onChange={(val) => handlePartChange("bear", "wick", val)} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Live Preview */}
      <div className="flex flex-col gap-1">
        <label className={`text-[10px] font-semibold uppercase tracking-wider ${labelClass}`}>Live Preview</label>
        <div className={`w-full h-[68px] rounded-xl flex items-center justify-center relative overflow-hidden ${previewBg}`}>
          <svg className="w-full h-full" viewBox="0 0 200 72">
            {/* Dash grid */}
            <line x1="0" y1="18" x2="200" y2="18" stroke={gridLineColor} strokeWidth="1" strokeDasharray="2,3" />
            <line x1="0" y1="36" x2="200" y2="36" stroke={gridLineColor} strokeWidth="1" strokeDasharray="2,3" />
            <line x1="0" y1="54" x2="200" y2="54" stroke={gridLineColor} strokeWidth="1" strokeDasharray="2,3" />
            <line x1="50" y1="0" x2="50" y2="72" stroke={gridLineColor} strokeWidth="1" strokeDasharray="2,3" />
            <line x1="100" y1="0" x2="100" y2="72" stroke={gridLineColor} strokeWidth="1" strokeDasharray="2,3" />
            <line x1="150" y1="0" x2="150" y2="72" stroke={gridLineColor} strokeWidth="1" strokeDasharray="2,3" />
            
            {/* Bull candle at center X = 65 */}
            {/* Wick */}
            <line x1="65" y1="10" x2="65" y2="62" stroke={bullWickColor} strokeWidth="1.2" strokeLinecap="round" />
            {/* Body */}
            <rect x="56" y="24" width="18" height="24" rx="1" 
                  fill={bullBodyColor} 
                  stroke={bullBorderColor} 
                  strokeWidth="1.2" />
            
            {/* Bear candle at center X = 135 */}
            {/* Wick */}
            <line x1="135" y1="10" x2="135" y2="62" stroke={bearWickColor} strokeWidth="1.2" strokeLinecap="round" />
            {/* Body */}
            <rect x="126" y="20" width="18" height="32" rx="1" 
                  fill={bearBodyColor} 
                  stroke={bearBorderColor} 
                  strokeWidth="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// Subcomponents helper to keep code modular and clean

interface ColorPickerProps {
  value: string;
  disabled?: boolean;
  onChange: (val: string) => void;
}

function ColorPicker({ value, disabled, onChange }: ColorPickerProps) {
  return (
    <div className={`relative w-5 h-5 rounded-md border border-zinc-700/80 dark:border-zinc-700 shadow-inner flex items-center justify-center transition-opacity duration-150 ${disabled ? "opacity-30 pointer-events-none" : "hover:scale-105 cursor-pointer"}`} style={{ backgroundColor: disabled ? "#27272a" : value }}>
      {!disabled && (
        <input 
          type="color" 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      )}
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  isLight?: boolean;
}

function ToggleSwitch({ checked, onChange, isLight = false }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4.5 rounded-full transition-colors focus:outline-none cursor-pointer flex items-center ${
        checked ? "bg-blue-600" : isLight ? "bg-zinc-200" : "bg-zinc-800"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-3.5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
