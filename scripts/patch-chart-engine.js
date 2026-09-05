const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../frontend/components/(ext)/chart-engine/dist/index.js');
const backupPath = path.resolve(__dirname, '../frontend/components/(ext)/chart-engine/dist/index.js.original_bak');

// ── Do not touch a committed, customized engine ──────────────────────────────
//
// This script rebuilds index.js from index.js.original_bak and re-applies only
// the patch list below. The engine is dist-only, so it is also edited BY HAND and
// those hand-edits are committed — they exist nowhere but in git. Rebuilding from
// the backup discards every one of them.
//
// That is what used to happen on each of the four entry points that run this
// script (postinstall, dev, dev:frontend, build:frontend). A `pnpm dev` left
// index.js 9,406 bytes smaller than HEAD and stripped of its BIDEX_CHART_PATCHED
// sentinel. It looked harmless only because next.config.js notices the missing
// sentinel at frontend boot and runs `git checkout HEAD --` to put the committed
// engine back — so the output of this script was overwritten every single time
// and never actually reached the browser.
//
// Pure churn, then, except for the window it opened: a de-patched engine sitting
// in the working tree where any `git add` could commit it and erase the hand-edits
// from history for good. The pre-commit hook exists because that has happened.
//
// So: the sentinel means "this file is the customized engine, it is committed, and
// it is authoritative". If it is present, leave the file completely alone. Skipping
// is behaviour-preserving — the committed engine is what ran before this guard and
// what runs after it.
//
// A pristine bundle (no sentinel — a fresh `pnpm build:chart-engine`, say) has no
// hand-edits to lose and is patched exactly as before.
//
// To deliberately re-derive the engine from the pristine backup, discarding the
// hand-edits:  BIDEX_FORCE_CHART_PATCH=1 node scripts/patch-chart-engine.js
const SENTINEL = 'BIDEX_CHART_PATCHED';
if (process.env.BIDEX_FORCE_CHART_PATCH !== '1' && fs.existsSync(targetPath)) {
  if (fs.readFileSync(targetPath, 'utf8').includes(SENTINEL)) {
    console.log(
      `[chart-engine] index.js carries the ${SENTINEL} sentinel — already the ` +
        `customized build. Leaving it untouched.`
    );
    console.log(
      '[chart-engine] To re-derive it from the pristine backup and DISCARD the ' +
        'hand-edits: BIDEX_FORCE_CHART_PATCH=1'
    );
    process.exit(0);
  }
}

if (!fs.existsSync(backupPath)) {
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, backupPath);
    console.log('Created chart engine backup from index.js');
  } else {
    console.error(`Error: Chart engine backup bundle not found at ${backupPath}`);
    process.exit(1);
  }
}

// Always restore from original backup before patching to ensure clean slate
fs.copyFileSync(backupPath, targetPath);
console.log('Restored target bundle from original backup.');

let rawContent = fs.readFileSync(targetPath, 'utf8');
const isCrlf = rawContent.includes('\r\n');

// Normalize line endings to LF for uniform patching
let content = rawContent.replace(/\r\n/g, '\n');
let modified = false;

const patches = [
  {
    name: 'Dynamic Navy/Dark theme backgrounds in Re.DARK configuration',
    find: 'var Re={DARK:{BACKGROUND:"#09090b",BACKGROUND_SECONDARY:"#0f0f12",BACKGROUND_TERTIARY:"#141418",GRID:"rgba(255, 255, 255, 0.03)",GRID_MAJOR:"rgba(255, 255, 255, 0.06)",GRID_ACCENT:"rgba(255, 255, 255, 0.08)",TEXT:"#e4e4e7",TEXT_SECONDARY:"#a1a1aa",TEXT_MUTED:"#71717a",TEXT_SUBTLE:"#52525b",BULL:"#10b981",BULL_LIGHT:"#34d399",BULL_DARK:"#059669",BULL_GLOW:"rgba(16, 185, 129, 0.2)",BEAR:"#f43f5e",BEAR_LIGHT:"#fb7185",BEAR_DARK:"#e11d48",BEAR_GLOW:"rgba(244, 63, 94, 0.2)",VOLUME:"#6366f1",VOLUME_UP:"rgba(16, 185, 129, 0.4)",VOLUME_DOWN:"rgba(244, 63, 94, 0.4)",CROSSHAIR:"#52525b",CROSSHAIR_LABEL_BG:"#27272a",ORDER_RISE:"#10b981",ORDER_FALL:"#f43f5e",ORDER_WIN:"#10b981",ORDER_LOSS:"#f43f5e",ORDER_PENDING:"#f59e0b",ORDER_PENDING_GLOW:"rgba(245, 158, 11, 0.3)",EXPIRY_LINE:"#eab308",EXPIRY_LINE_GLOW:"rgba(234, 179, 8, 0.25)",AXIS_BORDER:"rgba(255, 255, 255, 0.08)",AXIS_BG:"#0c0c0e",ACCENT:"#8b5cf6",ACCENT_LIGHT:"#a78bfa",INFO:"#3b82f6"},',
    replace: 'var Re={DARK:{get BACKGROUND(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"#0b111e":"#09090b"},get BACKGROUND_SECONDARY(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"#0e1525":"#0f0f12"},get BACKGROUND_TERTIARY(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"#131a2b":"#141418"},get GRID(){let o=typeof chartGridOpacity!=="undefined"?chartGridOpacity:5;let s=Math.min(1,0.025*o);return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"rgba(255,255,255,"+s+")":"rgba(255,255,255,"+Math.min(1,s*1.4)+")"},get GRID_MAJOR(){let o=typeof chartGridOpacity!=="undefined"?chartGridOpacity:5;let s=Math.min(1,0.040*o);return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"rgba(255,255,255,"+s+")":"rgba(255,255,255,"+Math.min(1,s*1.4)+")"},get GRID_ACCENT(){let o=typeof chartGridOpacity!=="undefined"?chartGridOpacity:5;let s=Math.min(1,0.055*o);return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"rgba(255,255,255,"+s+")":"rgba(255,255,255,"+Math.min(1,s*1.4)+")"},TEXT:"#e4e4e7",TEXT_SECONDARY:"#a1a1aa",TEXT_MUTED:"#71717a",TEXT_SUBTLE:"#52525b",get BULL(){return (typeof customCandleColors!=="undefined"&&customCandleColors.bull.bodyEnabled)?customCandleColors.bull.body:(typeof customCandleColors!=="undefined"?customCandleColors.bull.border:"#10b981")},get BULL_LIGHT(){return typeof customCandleColors!=="undefined"?customCandleColors.bull.body:"#34d399"},get BULL_DARK(){return typeof customCandleColors!=="undefined"?customCandleColors.bull.border:"#059669"},get BULL_GLOW(){return typeof customCandleColors!=="undefined"?"rgba("+hexToRgb(this.BULL)+",0.2)":"rgba(16,185,129,0.2)"},get BEAR(){return (typeof customCandleColors!=="undefined"&&customCandleColors.bear.bodyEnabled)?customCandleColors.bear.body:(typeof customCandleColors!=="undefined"?customCandleColors.bear.border:"#f43f5e")},get BEAR_LIGHT(){return typeof customCandleColors!=="undefined"?customCandleColors.bear.body:"#fb7185"},get BEAR_DARK(){return typeof customCandleColors!=="undefined"?customCandleColors.bear.border:"#e11d48"},get BEAR_GLOW(){return typeof customCandleColors!=="undefined"?"rgba("+hexToRgb(this.BEAR)+",0.2)":"rgba(244,63,94,0.2)"},VOLUME:"#6366f1",get VOLUME_UP(){return "rgba("+hexToRgb(this.BULL)+",0.4)"},get VOLUME_DOWN(){return "rgba("+hexToRgb(this.BEAR)+",0.4)"},CROSSHAIR:"#52525b",get CROSSHAIR_LABEL_BG(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"#1b2438":"#27272a"},get ORDER_RISE(){return this.BULL},get ORDER_FALL(){return this.BEAR},get ORDER_WIN(){return this.BULL},get ORDER_LOSS(){return this.BEAR},ORDER_PENDING:"#f59e0b",ORDER_PENDING_GLOW:"rgba(245, 158, 11, 0.3)",EXPIRY_LINE:"#eab308",EXPIRY_LINE_GLOW:"rgba(234, 179, 8, 0.25)",get AXIS_BORDER(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"rgba(255, 255, 255, 0.05)":"rgba(255, 255, 255, 0.08)"},get AXIS_BG(){return this.BACKGROUND},get ACCENT(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"#3b82f6":"#8b5cf6"},get ACCENT_LIGHT(){return (typeof document!=="undefined"&&(document.documentElement.classList.contains("navy")||document.documentElement.classList.contains("theme-navy")))?"#60a5fa":"#a78bfa"},INFO:"#3b82f6"},',
  },
  {
    name: 'Make LIGHT theme price/time axis background match chart background',
    find: 'LIGHT:{BACKGROUND:"#fafafa",BACKGROUND_SECONDARY:"#f4f4f5",BACKGROUND_TERTIARY:"#e4e4e7",GRID:"rgba(0, 0, 0, 0.04)",GRID_MAJOR:"rgba(0, 0, 0, 0.07)",GRID_ACCENT:"rgba(0, 0, 0, 0.1)",TEXT:"#18181b",TEXT_SECONDARY:"#3f3f46",TEXT_MUTED:"#71717a",TEXT_SUBTLE:"#a1a1aa",BULL:"#059669",BULL_LIGHT:"#10b981",BULL_DARK:"#047857",BULL_GLOW:"rgba(5, 150, 105, 0.15)",BEAR:"#e11d48",BEAR_LIGHT:"#f43f5e",BEAR_DARK:"#be123c",BEAR_GLOW:"rgba(225, 29, 72, 0.15)",VOLUME:"#6366f1",VOLUME_UP:"rgba(5, 150, 105, 0.3)",VOLUME_DOWN:"rgba(225, 29, 72, 0.3)",CROSSHAIR:"#a1a1aa",CROSSHAIR_LABEL_BG:"#ffffff",ORDER_RISE:"#059669",ORDER_FALL:"#e11d48",ORDER_WIN:"#059669",ORDER_LOSS:"#e11d48",ORDER_PENDING:"#d97706",ORDER_PENDING_GLOW:"rgba(217, 119, 6, 0.25)",EXPIRY_LINE:"#ca8a04",EXPIRY_LINE_GLOW:"rgba(202, 138, 4, 0.2)",AXIS_BORDER:"rgba(0, 0, 0, 0.08)",AXIS_BG:"#ffffff",ACCENT:"#7c3aed",ACCENT_LIGHT:"#8b5cf6",INFO:"#2563eb"}',
    replace: 'LIGHT:{BACKGROUND:"#fafafa",BACKGROUND_SECONDARY:"#f4f4f5",BACKGROUND_TERTIARY:"#e4e4e7",GRID:"rgba(0, 0, 0, 0.04)",GRID_MAJOR:"rgba(0, 0, 0, 0.07)",GRID_ACCENT:"rgba(0, 0, 0, 0.1)",TEXT:"#18181b",TEXT_SECONDARY:"#3f3f46",TEXT_MUTED:"#71717a",TEXT_SUBTLE:"#a1a1aa",BULL:"#059669",BULL_LIGHT:"#10b981",BULL_DARK:"#047857",BULL_GLOW:"rgba(5, 150, 105, 0.15)",BEAR:"#e11d48",BEAR_LIGHT:"#f43f5e",BEAR_DARK:"#be123c",BEAR_GLOW:"rgba(225, 29, 72, 0.15)",VOLUME:"#6366f1",VOLUME_UP:"rgba(5, 150, 105, 0.3)",VOLUME_DOWN:"rgba(225, 29, 72, 0.3)",CROSSHAIR:"#a1a1aa",CROSSHAIR_LABEL_BG:"#ffffff",ORDER_RISE:"#059669",ORDER_FALL:"#e11d48",ORDER_WIN:"#059669",ORDER_LOSS:"#e11d48",ORDER_PENDING:"#d97706",ORDER_PENDING_GLOW:"rgba(217, 119, 6, 0.25)",EXPIRY_LINE:"#ca8a04",EXPIRY_LINE_GLOW:"rgba(202, 138, 4, 0.2)",AXIS_BORDER:"rgba(0, 0, 0, 0.08)",get AXIS_BG(){return this.BACKGROUND},ACCENT:"#7c3aed",ACCENT_LIGHT:"#8b5cf6",INFO:"#2563eb"}'
  },
  {
    name: 'Inject getSyncTime helper and isomorphic layout effect',
    find: "import W3,{memo,useState,useRef,useCallback,useEffect,useMemo}from'react';",
    replace: "import W3,{memo,useState,useRef,useCallback,useEffect,useMemo}from'react';"
  },
  {
    name: 'Use isomorphic layout effect for z.current to prevent rendering race condition',
    find: 'useEffect(()=>{z.current=ug;},[ug])',
    replace: 'useIsomorphicLayoutEffect(()=>{z.current=ug;},[ug])'
  },
  {
    name: 'Order amount decimals removal',
    find: 'var amtStr = sym.length <= 2 ? (sym + n.amount.toFixed(2)) : (n.amount.toFixed(2) + " " + sym);',
    replace: 'var amtStr = sym.length <= 2 ? (sym + n.amount.toFixed(0)) : (n.amount.toFixed(0) + " " + sym);'
  },
  {
    name: 'Bolder order label font stack',
    find: 'var label=amtStr+"  "+timeStr;\n    i.font="bold 11px Inter, system-ui, sans-serif";',
    replace: 'var label=amtStr+"  "+timeStr;\n    i.font="bold 12px Inter, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif";'
  },
  {
    name: 'Custom vector directional arrows & clean fonts in active order badge',
    find: '      // Icon circle\n      i.fillStyle="rgba(255,255,255,0.25)";\n      i.beginPath();\n      i.arc(pillX+pillPadX+7, entryY, 7, 0, Math.PI*2);\n      i.fill();\n      i.fillStyle="#ffffff";\n      i.font="bold 9px Inter, system-ui, sans-serif";\n      i.textAlign="center";\n      i.textBaseline="middle";\n      i.fillText("\\u25CF", pillX+pillPadX+7, entryY);\n\n      // Label\n      i.fillStyle="#ffffff";\n      i.font="bold 11px Inter, system-ui, sans-serif";\n      i.textAlign="left";\n      i.textBaseline="middle";\n      i.fillText(label, pillX+pillPadX+iconW+2, entryY);',
    replace: '      // Icon circle\n      i.fillStyle="rgba(255,255,255,0.25)";\n      i.beginPath();\n      i.arc(pillX+pillPadX+7, entryY, 7, 0, Math.PI*2);\n      i.fill();\n      var isUp = (typeof Ri === "function" ? Ri(n.side) : false) || n.side === "RISE" || n.side === "HIGHER" || n.side === "TOUCH" || n.side === "CALL" || n.side === "UP" || n.side === "BUY";\n      \n      // Draw modern vector arrow\n      i.save();\n      i.strokeStyle="#ffffff";\n      i.lineWidth=1.8;\n      i.lineCap="round";\n      i.lineJoin="round";\n      i.beginPath();\n      var cx=pillX+pillPadX+7;\n      var cy=entryY;\n      if(isUp){\n        // UP arrow\n        i.moveTo(cx,cy+3);\n        i.lineTo(cx,cy-3);\n        i.moveTo(cx-2,cy-1);\n        i.lineTo(cx,cy-3);\n        i.lineTo(cx+2,cy-1);\n      }else{\n        // DOWN arrow\n        i.moveTo(cx,cy-3);\n        i.lineTo(cx,cy+3);\n        i.moveTo(cx-2,cy+1);\n        i.lineTo(cx,cy+3);\n        i.lineTo(cx+2,cy+1);\n      }\n      i.stroke();\n      i.restore();\n\n      // Label\n      i.fillStyle="#ffffff";\n      i.font="bold 12px Inter, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif";\n      i.textAlign="left";\n      i.textBaseline="middle";\n      i.fillText(label, pillX+pillPadX+iconW+2, entryY);'
  },
  {
    name: 'Countdown timer next to price line (opacity 0.6 & 12px font)',
    find: ',b>0&&n.restore(),d)return;let y=ct(e,c),x=18,',
    replace: ',b>0&&n.restore(),d){try{let state=F.getState(),candles=state.candles,timeFrame=state.state.timeFrame;if(candles&&candles.length>0&&timeFrame){let Le=candles[candles.length-1],tfMs=Fv(timeFrame),remain=Math.max(0,tfMs-(getSyncTime()%tfMs)),totSecs=Math.ceil(remain/1e3),mins=Math.floor(totSecs/60),secs=totSecs%60,text=mins.toString().padStart(2,"0")+":"+secs.toString().padStart(2,"0"),lastCandleX=lt(Le.time,t.startTime,t.endTime,r);if(lastCandleX>=0&&lastCandleX<=r){n.save(),n.globalAlpha=0.6,n.font="bold 12px Inter, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif";let numCandles=(t.endTime-t.startTime)/tfMs,candleWidth=numCandles<=0?8:Math.max(3,Math.min(50,r/numCandles*0.8));let textWidth=n.measureText(text).width||30,boxW=textWidth+12,boxH=18,boxX=lastCandleX+candleWidth/2+65,boxY=h-boxH/2;n.fillStyle=(s==="dark"||s==="navy")?"rgba(24,24,27,0.9)":"rgba(255,255,255,0.9)",n.strokeStyle=(s==="dark"||s==="navy")?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.15)",n.lineWidth=1,n.roundRect?(n.beginPath(),n.roundRect(boxX,boxY,boxW,boxH,4),n.fill(),n.stroke()):(n.fillRect(boxX,boxY,boxW,boxH),n.strokeRect(boxX,boxY,boxW,boxH)),n.fillStyle=(s==="dark"||s==="navy")?"#ffffff":"#000000",n.textAlign="center",n.textBaseline="middle",n.fillText(text,boxX+boxW/2,h),n.restore();}}}catch(err){console.error("Countdown draw error:",err)}return}let y=ct(e,c),x=18,'
  },
  {
    name: 'Layout thrashing reflow removal in pointer movements (kv callback)',
    find: 'kv=useCallback(H=>{let J=H.currentTarget.getBoundingClientRect(),ne=H.clientX-J.left,ee=H.clientY-J.top,We=ci(ne,ee),Oe=qt&&qt!=="cursor"&&qt!=="crosshair";',
    replace: 'kv=useCallback(H=>{let ne=H.nativeEvent?.offsetX,ee=H.nativeEvent?.offsetY;if(ne===void 0||ee===void 0){let J=H.currentTarget.getBoundingClientRect();ne=H.clientX-J.left;ee=H.clientY-J.top;}let We=ci(ne,ee),Oe=qt&&qt!=="cursor"&&qt!=="crosshair";'
  },
  {
    name: 'Layout thrashing reflow removal in price axis onMouseMove',
    find: 'onMouseMove:H=>{let J=H.currentTarget.getBoundingClientRect(),ne=H.clientY-J.top;Pr(ne);},onMouseLeave:()=>Pr(null)',
    replace: 'onMouseMove:H=>{let ne=H.nativeEvent?.offsetY;if(ne===void 0){let J=H.currentTarget.getBoundingClientRect();ne=H.clientY-J.top;}Pr(ne);},onMouseLeave:()=>Pr(null)'
  },
  {
    name: 'Memoize drawing manager Hook reference (ty useMemo)',
    find: 'return {engine:s,activeTool:l,setActiveTool:S,cancelDrawing:M,completeDrawing:R,isMultiPointDrawing:k,selectedId:u,hoveredId:m,select:W,addPoint:E,updateActivePoint:O,removeDrawing:I,clearAll:$,hitTest:D,setHovered:z,getDrawing:B,startDrag:U,updateDrag:te,endDrag:G,render:Q,undo:Z,redo:q,canUndo:f,canRedo:y,exportDrawings:se,importDrawings:fe,drawingCount:h,isDrawing:he,isPlacingDrawing:v,isSnapEnabled:C,setSnapEnabled:ie,setSnapContext:pe,setSnapOptions:le}}var fp=i=>i,',
    replace: 'return useMemo(()=>({engine:s,activeTool:l,setActiveTool:S,cancelDrawing:M,completeDrawing:R,isMultiPointDrawing:k,selectedId:u,hoveredId:m,select:W,addPoint:E,updateActivePoint:O,removeDrawing:I,clearAll:$,hitTest:D,setHovered:z,getDrawing:B,startDrag:U,updateDrag:te,endDrag:G,render:Q,undo:Z,redo:q,canUndo:f,canRedo:y,exportDrawings:se,importDrawings:fe,drawingCount:h,isDrawing:he,isPlacingDrawing:v,isSnapEnabled:C,setSnapEnabled:ie,setSnapContext:pe,setSnapOptions:le}),[s,l,S,M,R,k,u,m,W,E,O,I,$,D,z,B,U,te,G,Q,Z,q,f,y,se,fe,h,he,v,C,ie,pe,le])}var fp=i=>i,'
  },
  {
    name: '60 FPS static canvas layer dirty marking during drawing/dragging',
    find: 'if(Pn.current){let ge={time:We.time-Pn.current.lastPoint.time,price:We.price-Pn.current.lastPoint.price};xe.updateDrag(Pn.current.drawingId,ge),Pn.current.lastPoint=We;return}if(qi.current){xe.addPoint(We),H.currentTarget.style.cursor="crosshair";return}if(xe.isPlacingDrawing){xe.updateActivePoint(We),H.currentTarget.style.cursor="crosshair";return}',
    replace: 'if(Pn.current){let ge={time:We.time-Pn.current.lastPoint.time,price:We.price-Pn.current.lastPoint.price};xe.updateDrag(Pn.current.drawingId,ge),Pn.current.lastPoint=We,dt.markStaticDirty();return}if(qi.current){xe.addPoint(We),H.currentTarget.style.cursor="crosshair",dt.markStaticDirty();return}if(xe.isPlacingDrawing){xe.updateActivePoint(We),H.currentTarget.style.cursor="crosshair",dt.markStaticDirty();return}'
  },
  {
    name: 'Remove crosshairPosition from React store selector to fix mousemove lag',
    find: '{indicators:Gn,drawings:Eh,activeDrawingTool:qt,crosshairPosition:tc,hoveredDrawingId:Dt,selectedDrawingId:qn}=F(useShallow(H=>({indicators:H.indicators,drawings:H.drawings,activeDrawingTool:H.activeDrawingTool,crosshairPosition:H.crosshairPosition,hoveredDrawingId:H.hoveredDrawingId,selectedDrawingId:H.selectedDrawingId})))',
    replace: '{indicators:Gn,drawings:Eh,activeDrawingTool:qt,hoveredDrawingId:Dt,selectedDrawingId:qn}=F(useShallow(H=>({indicators:H.indicators,drawings:H.drawings,activeDrawingTool:H.activeDrawingTool,hoveredDrawingId:H.hoveredDrawingId,selectedDrawingId:H.selectedDrawingId})))'
  },
  {
    name: 'Drawings list, selection, and hover state interaction redraw hook (useEffect)',
    find: 'useEffect(()=>{dt.markStaticDirty();},[Ui,Nt])',
    replace: 'useEffect(()=>{dt.markStaticDirty();},[Ui,Nt]),useEffect(()=>{dt.markStaticDirty();},[Eh,qn,Dt])'
  },
  {
    name: 'Candle expiry live countdown ticker hook (useEffect setInterval)',
    find: 'useEffect(()=>{dt.markStaticDirty();},[Eh,qn,Dt])',
    replace: 'useEffect(()=>{dt.markStaticDirty();},[Eh,qn,Dt]),useEffect(()=>{const interval=setInterval(()=>{dt.markStaticDirty();},1000);return()=>clearInterval(interval);},[])'
  },
  {
    name: 'Vv function time synchronization',
    find: 'function Vv(i){let n=Date.now(),e=i*60*1e3;return Math.ceil(n/e)*e}',
    replace: 'function Vv(i){let n=getSyncTime(),e=i*60*1e3;return Math.ceil(n/e)*e}'
  },
  {
    name: 'rv function time synchronization',
    find: 'function rv(i){let n=Date.now(),e=0;switch(i){case "1m":',
    replace: 'function rv(i){let n=getSyncTime(),e=0;switch(i){case "1m":'
  },
  {
    name: 'Stopwatch class tick time synchronization',
    find: 'A(this,"tick",()=>{if(!this.isRunning)return;let n=Date.now(),e=Math.max(0,this.expiryTime-n)/1e3,',
    replace: 'A(this,"tick",()=>{if(!this.isRunning)return;let n=getSyncTime(),e=Math.max(0,this.expiryTime-n)/1e3,'
  },
  {
    name: 'Stopwatch class start time synchronization',
    find: 'this.expiryTime=n,this.startTime=Date.now(),this.totalDuration=Math.max(0,n-this.startTime)/1e3,',
    replace: 'this.expiryTime=n,this.startTime=getSyncTime(),this.totalDuration=Math.max(0,n-this.startTime)/1e3,'
  },
  {
    name: 'Stopwatch class startWithDuration time synchronization',
    find: 'startWithDuration(n){this.start(Date.now()+n*1e3);}',
    replace: 'startWithDuration(n){this.start(getSyncTime()+n*1e3);}'
  },
  {
    name: 'Order remainingMs time synchronization',
    find: 'remainingMs:Math.max(0,n.expiryTime-Date.now())',
    replace: 'remainingMs:Math.max(0,n.expiryTime-getSyncTime())'
  },
  {
    name: 'Order updateState time synchronization',
    find: 'updateState(){if(!this.order||!this.state)return;let n=Date.now(),e=Math.max(0,this.order.expiryTime-n),',
    replace: 'updateState(){if(!this.order||!this.state)return;let n=getSyncTime(),e=Math.max(0,this.order.expiryTime-n),'
  },
  {
    name: 'setCandles zoom default time synchronization',
    find: 'let u=t.zoomAnchorTime,d=e[e.length-1].time,m=e[0].time,p=Date.now(),h,g,f,b,',
    replace: 'let u=t.zoomAnchorTime,d=e[e.length-1].time,m=e[0].time,p=getSyncTime(),h,g,f,b,'
  },
  {
    name: 'appendCandle startTime limit check and autoscroll/shift',
    find: 'let r=[...t.candles,e],{viewport:o,timeFrame:a}=t.state,s=Ye[a]?.milliseconds||6e4,l=Date.now();if(o.startTime<l-s*10)return {candles:r,currentPrice:e.close,newestLoadedTime:e.time,state:{...t.state,lastUpdateTime:Date.now()}};let u=o.endTime,d=u>l+s*2,m=o;if(!d){m={...o,endTime:Math.max(u,e.time+s)};let h=(o.maxPrice-o.minPrice)*.1,g=e.high>o.maxPrice,f=e.low<o.minPrice;if(g||f){let b=o.minPrice,y=o.maxPrice;f&&(b=e.low-h*.5),g&&(y=e.high+h*.5),m={...m,minPrice:b,maxPrice:y};}}return {candles:r,currentPrice:e.close,newestLoadedTime:e.time,state:{...t.state,viewport:m,lastUpdateTime:Date.now()}}',
    replace: 'let r=[...t.candles,e],{viewport:o,timeFrame:a}=t.state,s=Ye[a]?.milliseconds||6e4,l=getSyncTime();if(o.endTime>0&&o.endTime<l-s*5)return {candles:r,currentPrice:e.close,newestLoadedTime:e.time,state:{...t.state,lastUpdateTime:Date.now()}};let u=o.endTime,d=u>l+s*2,m=o;if(!d){let shift=e.time-(t.candles.length>0?t.candles[t.candles.length-1].time:e.time);if(shift>0&&shift<=s*3){m={...o,startTime:o.startTime+shift,endTime:o.endTime+shift};}else{m={...o,endTime:Math.max(u,e.time+s)};}let h=(m.maxPrice-m.minPrice)*.1||m.maxPrice*.001||0.001;let g=e.high>m.maxPrice,f=e.low<m.minPrice;if(g||f){let b=m.minPrice,y=m.maxPrice;f&&(b=e.low-h*.5);g&&(y=e.high+h*.5);m={...m,minPrice:b,maxPrice:y};}}return {candles:r,currentPrice:e.close,newestLoadedTime:e.time,state:{...t.state,viewport:m,lastUpdateTime:Date.now()}}'
  },
  {
    name: 'appendCandles gap check synchronization',
    find: 'u=s[s.length-1].time,m=Date.now()-u>c*2;return',
    replace: 'u=s[s.length-1].time,m=getSyncTime()-u>c*2;return'
  },
  {
    name: 'updateLastCandle limit check synchronization',
    find: 'let a=r[o],{viewport:s,timeFrame:l}=t.state,c=Ye[l]?.milliseconds||6e4;dt.markAnimatedDirty();let u=Date.now();if(s.startTime<u-c*10)return',
    replace: 'let a=r[o],{viewport:s,timeFrame:l}=t.state,c=Ye[l]?.milliseconds||6e4;dt.markAnimatedDirty();let u=getSyncTime();if(s.endTime<u-c*5)return'
  },
  {
    name: 'goToCurrentTime reset time synchronization',
    find: 'goToCurrentTime:()=>i(e=>{dt.markAllDirty();let{candles:t,currentPrice:r}=e,o=Ye[e.state.timeFrame]?.milliseconds||6e4,a=Date.now(),s=e.state.viewport.endTime-e.state.viewport.startTime,',
    replace: 'goToCurrentTime:()=>i(e=>{dt.markAllDirty();let{candles:t,currentPrice:r}=e,o=Ye[e.state.timeFrame]?.milliseconds||6e4,a=getSyncTime(),s=e.state.viewport.endTime-e.state.viewport.startTime,'
  },
  {
    name: 'zoom default anchor time synchronization',
    find: 'let J=100,ne=Yi??Date.now(),ee=J*H/2;',
    replace: 'let J=100,ne=Yi??getSyncTime(),ee=J*H/2;'
  },
  {
    name: 'Scroll drag boundaries limitation check time synchronization',
    find: 'St=-it*ot,Qt=ve.startTime+St,Yt=ve.endTime+St,Le=Date.now(),tt=Math.max(Xt*.5,Mn*60*1e3),Mt=Le+tt,',
    replace: 'St=-it*ot,Qt=ve.startTime+St,Yt=ve.endTime+St,Le=getSyncTime(),tt=Math.max(Xt*.5,Mn*60*1e3),Mt=Le+tt,'
  },
  {
    name: 'Historical fetch boundary range check time synchronization',
    find: 'let D=F.getState();u.current=D.zoomAnchorTime,d.current=D.zoomAnchorVersion;let N=Date.now(),z=Ye[n]?.milliseconds||6e4,B=pg(),U,te,G=E??N;if(E!==null){let Z=z*B/2;U=E-Z,te=E+Z,te>N+z*10&&(te=N+z*10,',
    replace: 'let D=F.getState();u.current=D.zoomAnchorTime,d.current=D.zoomAnchorVersion;let N=getSyncTime(),z=Ye[n]?.milliseconds||6e4,B=pg(),U,te,G=E??N;if(E!==null){let Z=z*B/2;U=E-Z,te=E+Z,te>N+z*10&&(te=N+z*10,'
  },
  {
    name: 'Expiry lines call currentTime synchronization',
    find: 'currentTime:Date.now(),fullVerticalHeight:Le});}if(ot.forEach(Le=>{let tt=ji.get(Le.id),Mt=ot.findIndex',
    replace: 'currentTime:getSyncTime(),fullVerticalHeight:Le});}if(ot.forEach(Le=>{let tt=ji.get(Le.id),Mt=ot.findIndex'
  },
  {
    name: 'Order markers call currentTime synchronization',
    find: 'currentTime:Date.now(),hoveredOrderId:Dt,selectedOrderId:qn,timeframeDuration:tt,currency:Xi,decimals:_t',
    replace: 'currentTime:getSyncTime(),hoveredOrderId:Dt,selectedOrderId:qn,timeframeDuration:tt,currency:Xi,decimals:_t'
  },
  {
    name: 'Order tooltips call currentTime synchronization',
    find: 'currentTime:Date.now(),hoveredOrderId:Dt,selectedOrderId:qn,currency:Xi,decimals:_t,currentPrice:pt',
    replace: 'currentTime:getSyncTime(),hoveredOrderId:Dt,selectedOrderId:qn,currency:Xi,decimals:_t,currentPrice:pt'
  },
  {
    name: 'WebSocket candle append condition change to pe >= ie',
    find: 'pe<ie?F.getState().updateLastCandle({open:te,high:G,low:Q,close:Z,volume:q}):pe<=ie*2&&F.getState().appendCandle(se);',
    replace: 'pe<ie?F.getState().updateLastCandle({open:te,high:G,low:Q,close:Z,volume:q}):pe>=ie&&F.getState().appendCandle(se);'
  },
  {
    name: 'Simulated trade generator entryTime synchronization',
    find: 'id:q,symbol:"",direction:"rise",entryPrice:0,entryTime:Date.now(),expiryTime:se,amount:0,payout:0,status:"active"',
    replace: 'id:q,symbol:"",direction:"rise",entryPrice:0,entryTime:getSyncTime(),expiryTime:se,amount:0,payout:0,status:"active"'
  },
  {
    name: 'Simulated trade timestamp synchronization',
    find: 'id:`trade-${pe}`,orderId:`order-${pe}`,timestamp:Date.now()-pe*6e4,symbol:"",direction:ie.direction,entryPrice:ie.entryPrice',
    replace: 'id:`trade-${pe}`,orderId:`order-${pe}`,timestamp:getSyncTime()-pe*6e4,symbol:"",direction:ie.direction,entryPrice:ie.entryPrice'
  },
  {
    name: 'Discard stale fetch response on historical fetch if global store active symbol/timeframe changed',
    find: 'if($.signal.aborted){Pt("API RESPONSE - ABORTED, discarding");return}if(l.current!==n||c.current!==i){Pt("API RESPONSE - STALE (symbol/timeframe changed)",{requestSymbol:i,currentSymbol:c.current,requestTimeFrame:n,currentTimeFrame:l.current});return}',
    replace: 'if($.signal.aborted){Pt("API RESPONSE - ABORTED, discarding");return}let _gs=F.getState();if(l.current!==n||c.current!==i||_gs.state.symbol!==i||_gs.state.timeFrame!==n){Pt("API RESPONSE - STALE (symbol/timeframe changed)",{requestSymbol:i,currentSymbol:c.current,globalSymbol:_gs.state.symbol,requestTimeFrame:n,currentTimeFrame:l.current,globalTimeFrame:_gs.state.timeFrame});return}'
  },
  {
    name: 'Discard stale fetch response on fetch-more-history if global store active symbol/timeframe changed',
    find: 'if(D.signal.aborted||l.current!==N||c.current!==z)return;',
    replace: 'let _gs=F.getState();if(D.signal.aborted||l.current!==N||c.current!==z||_gs.state.symbol!==z||_gs.state.timeFrame!==N)return;'
  },
  {
    name: 'Discard stale WebSocket updates if global store active symbol/timeframe changed',
    find: 'z=>{if(g.current!==E||c.current!==$||l.current!==D||!z||!z.data||!Array.isArray(z.data)||z.data.length===0)return;',
    replace: 'z=>{let _gs=F.getState();if(g.current!==E||c.current!==$||l.current!==D||_gs.state.symbol!==$||_gs.state.timeFrame!==D||_gs.state.isLoading||!z||!z.data||!Array.isArray(z.data)||z.data.length===0)return;'
  },
  {
    name: 'Abort pending fetch requests on unmount',
    find: 'v.current(),w.current(),()=>{r.current&&(r.current(),r.current=null);}},[t,i,n]);let C=useRef(0);',
    replace: 'v.current(),w.current(),()=>{r.current&&(r.current(),r.current=null);m.current&&m.current.abort();p.current&&p.current.abort();vn=null;o.current=false;h.current=null;}},[t,i,n]);let C=useRef(0);'
  },
  {
    name: 'Persistent console logger inside Pt helper',
    find: 'function Pt(i,n){console.log("[ChartEngine Pt]",i,n);}',
    replace: 'function Pt(i,n){console.log("[ChartEngine Pt]",i,n);if(typeof window!=="undefined"){try{let logs=JSON.parse(localStorage.getItem("chart_engine_logs")||"[]");logs.push({time:Date.now(),msg:i,data:n});if(logs.length>100)logs.shift();localStorage.setItem("chart_engine_logs",JSON.stringify(logs));}catch(e){}}}'
  },
  {
    name: 'Reset zoomAnchorTime and anchorConsumedByViewport in setSymbol',
    find: 'setSymbol:e=>i(t=>{if(t.state.symbol===e)return t;dt.markAllDirty();let r=Hv(e);return {state:{...t.state,symbol:e,...r?.timeFrame&&{timeFrame:r.timeFrame},viewport:{...t.state.viewport,startTime:0,endTime:0,minPrice:0,maxPrice:0,zoomLevel:r?.zoomLevel||t.state.viewport.zoomLevel||1},isLoading:true},candles:[],currentPrice:0,oldestLoadedTime:0,newestLoadedTime:0,...r?.expiryMinutes&&{expiryMinutes:r.expiryMinutes}}})',
    replace: 'setSymbol:e=>i(t=>{if(t.state.symbol===e)return t;dt.markAllDirty();let r=Hv(e);return {state:{...t.state,symbol:e,...r?.timeFrame&&{timeFrame:r.timeFrame},viewport:{...t.state.viewport,startTime:0,endTime:0,minPrice:0,maxPrice:0,zoomLevel:r?.zoomLevel||t.state.viewport.zoomLevel||1},isLoading:true},candles:[],currentPrice:0,oldestLoadedTime:0,newestLoadedTime:0,...r?.expiryMinutes&&{expiryMinutes:r.expiryMinutes},zoomAnchorTime:null,anchorConsumedByViewport:false}})'
  },
  {
    name: 'Reset vn state on historical fetch AbortError',
    find: 'catch(Z){if(Z instanceof Error&&Z.name==="AbortError")return;',
    replace: 'catch(Z){if(Z instanceof Error&&Z.name==="AbortError"){vn=null;return;}'
  },
  {
    name: 'Reset vn state on fetch-more-history AbortError',
    find: 'catch(B){if(B instanceof Error&&B.name==="AbortError")return;',
    replace: 'catch(B){if(B instanceof Error&&B.name==="AbortError"){vn=null;return;}'
  },
  {
    name: 'Prevent "No chart data available" flashing on chart switch/refresh',
    find: '!Sr&&W.width>0&&_i===0&&jsx("div",{className:"absolute inset-0 flex items-center justify-center z-30"',
    replace: '!Sr&&W.width>0&&_i===0&&storeState.symbol===i&&storeState.timeFrame===n&&jsx("div",{className:"absolute inset-0 flex items-center justify-center z-30"'
  },
  {
    name: 'Set loading to false on cache hit in historical fetch',
    find: 'let Q=XH(i,n,G,U,te);if(Q&&Q.length>0){F.getState().setCandles(Q),Q.length>0&&F.getState().setCurrentPrice(Q[Q.length-1].close),h.current=null,F.getState().clearTransition();let Z=Q[Q.length-1].time,se=N-Z>z*5;F.getState().setHasGapToFill(se),av(i,n),lv();return}',
    replace: 'let Q=XH(i,n,G,U,te);if(Q&&Q.length>0){F.getState().setCandles(Q),Q.length>0&&F.getState().setCurrentPrice(Q[Q.length-1].close),h.current=null,F.getState().clearTransition();let Z=Q[Q.length-1].time,se=N-Z>z*5;F.getState().setHasGapToFill(se),av(i,n),lv(),F.getState().setLoading(false);return}'
  },
  {
    name: 'Fix finally block: call setLoading(false) when fetch completes (not aborted)',
    find: 'finally{o.current=false,h.current=null,F.getState().setLoading(false),lv(),m.current===$&&(m.current=null);}',
    replace: 'finally{o.current=false,h.current=null;let _gs=F.getState();if(!$.signal.aborted){F.getState().setLoading(false);}lv();m.current===$&&(m.current=null);}'
  },
  {
    name: 'Set loading to false in API success path before setCandles',
    find: 'Pt("SETTING CANDLES IN STORE",{count:pe.length}),F.getState().setCandles(pe),pe.length>0&&F.getState().setCurrentPrice(pe[pe.length-1].close)',
    replace: 'Pt("SETTING CANDLES IN STORE",{count:pe.length}),F.getState().setLoading(false),F.getState().setCandles(pe),pe.length>0&&F.getState().setCurrentPrice(pe[pe.length-1].close)'
  },
  {
    name: 'Unlock canvas rendering frame rates for high-refresh-rate screens',
    find: 'useEffect(()=>{let H=true,J=null,ne=0,ee=0,We=16,Oe=16,Ze=50,Qe=100,et=0,ge=0,ve=De=>{',
    replace: 'useEffect(()=>{let H=true,J=null,ne=0,ee=0,We=0,Oe=0,Ze=0,Qe=16,et=0,ge=0,ve=De=>{'
  },
  {
    // Injects visual price smoothing state and helper function from scratch (ensures valid wicks)
    name: 'Inject price smoothing state and helper function',
    find: 'const useIsomorphicLayoutEffect=typeof window!=="undefined"?W3.useLayoutEffect:W3.useEffect;',
    replace: 'const useIsomorphicLayoutEffect=typeof window!=="undefined"?W3.useLayoutEffect:W3.useEffect;let smoothPriceState={visualPrice:null,lastSymbol:null,lastCandleTime:null,lastUpdateTime:null};function updateSmoothPrice(target,realHigh,realLow,open,symbol,candleTime){const now=performance.now();if(smoothPriceState.lastSymbol!==symbol||smoothPriceState.visualPrice===null){smoothPriceState.visualPrice=target;smoothPriceState.lastSymbol=symbol;smoothPriceState.lastCandleTime=candleTime;smoothPriceState.lastUpdateTime=now;return{close:target,high:Math.max(realHigh,target),low:Math.min(realLow,target)}}if(smoothPriceState.lastCandleTime!==candleTime){smoothPriceState.lastCandleTime=candleTime;smoothPriceState.visualPrice=open;}const priceDiff=smoothPriceState.visualPrice>0?Math.abs(target-smoothPriceState.visualPrice)/smoothPriceState.visualPrice:0;const isOutOfRange=realLow>0&&(smoothPriceState.visualPrice<realLow*0.98||smoothPriceState.visualPrice>realHigh*1.02);if(priceDiff>0.02||isOutOfRange){smoothPriceState.visualPrice=target;smoothPriceState.lastUpdateTime=now;return{close:target,high:Math.max(realHigh,target),low:Math.min(realLow,target)}}const elapsed=now-smoothPriceState.lastUpdateTime;smoothPriceState.lastUpdateTime=now;const elapsedSec=Math.min(elapsed/1000,0.1);const easeRate=12;const factor=1-Math.exp(-easeRate*elapsedSec);const wobbleAmp=target*0.00001;const wobble=Math.sin(now*0.005)*0.5+Math.cos(now*0.011)*0.3+Math.sin(now*0.018)*0.2;const targetWithWobble=target+wobble*wobbleAmp;smoothPriceState.visualPrice+=(targetWithWobble-smoothPriceState.visualPrice)*factor;const visualClose=smoothPriceState.visualPrice;const visualHigh=Math.max(realHigh,visualClose,open);const visualLow=Math.min(realLow,visualClose,open);if(typeof requestAnimationFrame!=="undefined"){requestAnimationFrame(()=>{if(typeof dt!=="undefined")dt.markAnimatedDirty()});}return{close:visualClose,high:visualHigh,low:visualLow}}let customCandleColors={preset:"default",bull:{body:"#10b981",border:"#10b981",wick:"#10b981",bodyEnabled:true,borderEnabled:true,wickEnabled:true},bear:{body:"#f43f5e",border:"#f43f5e",wick:"#f43f5e",bodyEnabled:true,borderEnabled:true,wickEnabled:true}};if(typeof window!=="undefined"){try{const saved=localStorage.getItem("custom_candle_colors");if(saved)customCandleColors=JSON.parse(saved);}catch(e){}window.customCandleColors=customCandleColors;window.setCustomCandleColors=function(newColors){customCandleColors={...customCandleColors,...newColors};window.customCandleColors=customCandleColors;try{localStorage.setItem("custom_candle_colors",JSON.stringify(customCandleColors));}catch(e){}if(typeof dt!=="undefined")dt.markAllDirty();};}function resolveCandleColor(type,part,defaultColor){const settings=customCandleColors[type];if(!settings)return defaultColor;if(part==="body")return settings.bodyEnabled?settings.body:"transparent";if(part==="border")return settings.borderEnabled?settings.border:"transparent";if(part==="wick")return settings.wickEnabled?settings.wick:"transparent";return defaultColor;}function hexToRgb(hex){if(!hex||hex==="transparent")return"16, 185, 129";const shorthandRegex=/^#?([a-f\\d])([a-f\\d])([a-f\\d])$/i;const fullHex=hex.replace(shorthandRegex,(m,r,g,b)=>r+r+g+g+b+b);const result=/^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(fullHex);return result?parseInt(result[1],16)+", "+parseInt(result[2],16)+", "+parseInt(result[3],16):"16, 185, 129";}',
  },
  {
    // Apply visual price smoothing to smoothPt and active forming candle only
    name: 'Shadow bn and calculate smoothPt at start of drawing loop ug',
    find: 'let ug=useCallback(()=>{let H=O.current,J=I.current;$.current;D.current;if(!H||!J)return;let We=dt.isDirty("static"),Oe=dt.isDirty("animated"),Ze=dt.isDirty("overlay");',
    replace: 'let ug=useCallback(()=>{let H=O.current,J=I.current;$.current;D.current;if(!H||!J)return;let smoothPt=pt;if(re.length>0){let lastCandle=re[re.length-1];let currentVal=lastCandle.close;if(currentVal>0){let smoothed=updateSmoothPrice(currentVal,lastCandle.high,lastCandle.low,lastCandle.open,yt,lastCandle.time);smoothPt=smoothed.close;bn=bn.map(c=>{if(c.time===lastCandle.time){return {...c,close:smoothed.close,high:smoothed.high,low:smoothed.low}}return c});}}let badgeEl=document.getElementById("live-price-badge");let badgeBgEl=document.getElementById("live-price-badge-bg");let badgeTextEl=document.getElementById("live-price-badge-text");if(badgeEl&&smoothPt>0){let badgeY=Se(smoothPt,Ee.minPrice,Ee.maxPrice,j.chartAreaHeight);badgeEl.style.top=(badgeY-11)+"px";if(badgeBgEl&&re.length>0){let lastCandle=re[re.length-1];let isUp=smoothPt>=lastCandle.open;badgeBgEl.style.backgroundColor=isUp?"#10b981":"#ef4444"}if(badgeTextEl){badgeTextEl.textContent=smoothPt.toFixed(_t);}}let We=dt.isDirty("static"),Oe=dt.isDirty("animated"),Ze=dt.isDirty("overlay");'
  },
  {
    // Use smoothPt in the canvas price line draw call so striker line follows candle smoothly
    name: 'Use smoothPt in canvas Cs price line draw call',
    find: 'Cs({ctx:H,price:pt,viewport:Tt,chartWidth:j.chartAreaWidth,chartHeight:j.chartAreaHeight,priceAxisWidth:j.priceAxisWidth,theme:xt,candleOpen:Le?.open,decimals:_t,animationState:yn,skipLabel:true})',
    replace: 'Cs({ctx:H,price:smoothPt,viewport:Tt,chartWidth:j.chartAreaWidth,chartHeight:j.chartAreaHeight,priceAxisWidth:j.priceAxisWidth,theme:xt,candleOpen:Le?.open,decimals:_t,animationState:yn,skipLabel:true})'
  },
  {
    name: 'Premium Category Measurement Icon (C0 re-styled)',
    find: 'C0=ce(jsxs(Fragment,{children:[jsx("line",{x1:"4",y1:"18",x2:"20",y2:"6"}),jsx("line",{x1:"6",y1:"16",x2:"8",y2:"14",strokeOpacity:"0.5"}),jsx("line",{x1:"10",y1:"12",x2:"12",y2:"10",strokeOpacity:"0.5"}),jsx("line",{x1:"14",y1:"10",x2:"16",y2:"8",strokeOpacity:"0.5"}),jsx("circle",{cx:"4",cy:"18",r:"1.5",fill:"currentColor"}),jsx("circle",{cx:"20",cy:"6",r:"1.5",fill:"currentColor"})]}))',
    replace: 'C0=ce(jsxs(Fragment,{children:[jsx("path",{d:"M5 19L19 5"}),jsx("line",{x1:"9",y1:"12",x2:"11",y2:"14"}),jsx("line",{x1:"12",y1:"9",x2:"14",y2:"11"}),jsx("line",{x1:"15",y1:"6",x2:"17",y2:"8"})]}))'
  },
  {
    name: 'Define Crosshair SVG icon (TradingView style)',
    find: 'h0=ce(',
    replace: 'Crosshair=ce(jsxs(Fragment,{children:[jsx("circle",{cx:"12",cy:"12",r:"3"}),jsx("line",{x1:"12",y1:"2",x2:"12",y2:"8"}),jsx("line",{x1:"12",y1:"16",x2:"12",y2:"22"}),jsx("line",{x1:"2",y1:"12",x2:"8",y2:"12"}),jsx("line",{x1:"16",y1:"12",x2:"22",y2:"12"})]})) ,h0=ce('
  },
  {
    name: 'Use Crosshair icon for cursor Deselect Tool',
    find: 'icon:MousePointer2,label:"Deselect Tool"',
    replace: 'icon:MousePointer2,label:"Deselect Tool"'
  },
  {
    name: 'Inject debug logging to Th hook entry',
    find: 'function Th({symbol:i,timeFrame:n,marketType:e="spot",enabled:t=true}){',
    replace: 'function Th({symbol:i,timeFrame:n,marketType:e="spot",enabled:t=true}){sendDebugLog("Th hook called for " + i + " tf=" + n + " enabled=" + t);'
  },
  {
    name: 'Inject debug logging to b callback',
    find: 'b=useCallback(async()=>{if(!i||!t){return}if(VH(i,n)){return}let E=F.getState().zoomAnchorTime,',
    replace: 'b=useCallback(async()=>{sendDebugLog("b callback trigger inside Th hook for " + i + " tf=" + n);if(!i||!t){sendDebugLog("b callback aborted early: empty symbol or disabled. symbol=" + i + " enabled=" + t);return}if(VH(i,n)){sendDebugLog("b callback aborted early: VH check returned true (already in-flight or throttled). symbol=" + i + " tf=" + n);return}let timeframeChanged=l.current!==n||c.current!==i;if(timeframeChanged){F.getState().setCandles([]);}let E=timeframeChanged?null:F.getState().zoomAnchorTime,'
  },
  {
    name: 'Map navy theme to dark for canvas rendering routines',
    find: ',xt=x??as,',
    replace: ',xt=(x??as)==="navy"?"dark":(x??as),',
  },
  {
    name: 'Shift chart legend down to y:48 to prevent overlap with timezone clock overlays',
    find: 'theme:xt,x:10,y:10,',
    replace: 'theme:xt,x:10,y:48,',
  },
  {
    // Hide the OHLC legend bar (symbol + timeframe + O H L C % row) drawn on canvas
    name: 'Hide canvas chart legend (OHLC header bar)',
    find: 'if(qe.showLegend){let ot;if(re.length>1){let St=re[0];ot=(re[re.length-1].close-St.open)/St.open*100;}ks({ctx:J,candle:De,theme:xt,x:10,y:48,symbol:yt,decimals:_t,currentPrice:pt,priceChange:ot,alwaysShowSymbol:true,timeframe:Nt,isMobile:g,canvasWidth:j.chartAreaWidth});}',
    replace: '/* legend hidden */'
  },
  {
    // Bake in vivid grid opacity directly into DARK theme Re.DARK getters
    // NOTE: This patch is intentionally skipped (find string won't match after patch #1 already sets correct values)
    name: 'Increase DARK grid opacity to visible levels (DISABLED - handled by patch #1)',
    find: '__GRID_OPACITY_PLACEHOLDER_NEVER_MATCHES__',
    replace: '__GRID_OPACITY_PLACEHOLDER_NEVER_MATCHES__'
  },
  {
    name: 'Make all grid lines solid and equal (remove dotted minor/major distinction)',
    find: 'n.forEach((l,c)=>{let u=Math.round(Se(l,t.minPrice,t.maxPrice,o))+.5;if(u>=0&&u<=o){i.beginPath();let d=c%5===0;i.strokeStyle=d?a.GRID_MAJOR:a.GRID,i.lineWidth=1,i.setLineDash(d?[]:[2,4]),i.moveTo(0,u),i.lineTo(r,u),i.stroke();}}),i.setLineDash([]),e.forEach(l=>{let c=Math.round(lt(l.time,t.startTime,t.endTime,r))+.5;c>=0&&c<=r&&(i.beginPath(),i.strokeStyle=l.isMajor?a.GRID_MAJOR:a.GRID,i.lineWidth=1,i.setLineDash(l.isMajor?[]:[2,4]),i.moveTo(c,0),i.lineTo(c,s',
    replace: 'n.forEach((l,c)=>{let u=Math.round(Se(l,t.minPrice,t.maxPrice,o))+.5;if(u>=0&&u<=o){i.beginPath();i.strokeStyle=a.GRID,i.lineWidth=1,i.setLineDash([]),i.moveTo(0,u),i.lineTo(r,u),i.stroke();}}),i.setLineDash([]),e.forEach(l=>{let c=Math.round(lt(l.time,t.startTime,t.endTime,r))+.5;c>=0&&c<=r&&(i.beginPath(),i.strokeStyle=a.GRID,i.lineWidth=1,i.setLineDash([]),i.moveTo(c,0),i.lineTo(c,s'
  },
  {
    name: 'Make price striker line more visible (thicker, better dash, higher opacity)',
    find: 'n.beginPath(),n.strokeStyle=f,n.lineWidth=b>0?1:.5,n.setLineDash([4,6]),n.moveTo(0,h),n.lineTo(r,h),n.stroke(),n.setLineDash([])',
    replace: 'n.beginPath(),n.strokeStyle=f,n.lineWidth=b>0?1.5:1,n.globalAlpha=0.9,n.setLineDash([8,4]),n.moveTo(0,h),n.lineTo(r,h),n.stroke(),n.setLineDash([]),n.globalAlpha=1,(typeof document!=="undefined"&&(function(){const _el=document.getElementById("live-price-badge");_el&&(_el.style.top=(h-12)+"px")})())'
  },
  {
    name: 'Remove vertical separator line between chart canvas and price axis',
    find: 'i.fillRect(t,0,o,u),i.beginPath(),i.strokeStyle=a.AXIS_BORDER||a.GRID,i.lineWidth=1,i.moveTo(t+.5,0),i.lineTo(t+.5,u),i.stroke(),i.textAlign="left"',
    replace: 'i.fillRect(t,0,o,u),i.textAlign="left"'
  },
  {
    name: 'Add unique IDs to live price axis HTML badge components for smooth direct DOM styling updates',
    find: 'return jsx("div",{className:"absolute left-0 right-0",style:{top:H-11},children:jsx("div",{className:"w-full h-[22px] text-chart-xs font-semibold text-white flex items-center justify-center",style:{backgroundColor:ee},children:jsx("span",{className:"font-mono",children:pt.toFixed(_t)})})})',
    replace: 'return jsx("div",{id:"live-price-badge",className:"absolute left-0 right-0",style:{top:H-12},children:jsx("div",{id:"live-price-badge-bg",className:"w-full h-[24px] flex items-center justify-center",style:{backgroundColor:ee,clipPath:"polygon(12px 0%,96% 0%,100% 20%,100% 80%,96% 100%,12px 100%,0% 50%)",filter:"drop-shadow(0 0 5px "+ee+"99)"},children:jsx("span",{id:"live-price-badge-text",style:{paddingLeft:"6px",fontFamily:"Inter,monospace",fontSize:"11px",fontWeight:"700",color:"#ffffff",letterSpacing:"0.4px"},children:pt.toFixed(_t)})})})'
  },
  {
    name: 'Ye support for 15s, 30s, 2m and 10m',
    find: 'Ye={"1m":{label:"1 Minute",shortLabel:"1m",milliseconds:6e4,apiInterval:"1m"},"3m":{label:"3 Minutes",shortLabel:"3m",milliseconds:18e4,apiInterval:"3m"},"5m":{label:"5 Minutes",shortLabel:"5m",milliseconds:3e5,apiInterval:"5m"},',
    replace: 'Ye={"15s":{label:"15 Seconds",shortLabel:"15s",milliseconds:15e3,apiInterval:"15s"},"30s":{label:"30 Seconds",shortLabel:"30s",milliseconds:3e4,apiInterval:"30s"},"1m":{label:"1 Minute",shortLabel:"1m",milliseconds:6e4,apiInterval:"1m"},"2m":{label:"2 Minutes",shortLabel:"2m",milliseconds:12e4,apiInterval:"2m"},"3m":{label:"3 Minutes",shortLabel:"3m",milliseconds:18e4,apiInterval:"3m"},"5m":{label:"5 Minutes",shortLabel:"5m",milliseconds:3e5,apiInterval:"5m"},"10m":{label:"10 Minutes",shortLabel:"10m",milliseconds:6e5,apiInterval:"10m"},'
  },
  {
    name: 'gs support for 15s, 30s, 2m and 10m',
    find: 'gs=[{value:"1m",label:"1 Minute",shortLabel:"1m"},{value:"3m",label:"3 Minutes",shortLabel:"3m"},{value:"5m",label:"5 Minutes",shortLabel:"5m"},',
    replace: 'gs=[{value:"15s",label:"15 Seconds",shortLabel:"15s"},{value:"30s",label:"30 Seconds",shortLabel:"30s"},{value:"1m",label:"1 Minute",shortLabel:"1m"},{value:"2m",label:"2 Minutes",shortLabel:"2m"},{value:"3m",label:"3 Minutes",shortLabel:"3m"},{value:"5m",label:"5 Minutes",shortLabel:"5m"},{value:"10m",label:"10 Minutes",shortLabel:"10m"},'
  },
  {
    name: 'Zi support for 15s, 30s, 2m and 10m',
    find: 'Zi=["1m","3m","5m",',
    replace: 'Zi=["15s","30s","1m","2m","3m","5m","10m",'
  },
  {
    name: 'ns support for 15s, 30s, 2m and 10m',
    find: 'ns={"1m":{short:"1m",full:"1 Minute"},"3m":{short:"3m",full:"3 Minutes"},"5m":{short:"5m",full:"5 Minutes"},',
    replace: 'ns={"15s":{short:"15s",full:"15 Seconds"},"30s":{short:"30s",full:"30 Seconds"},"1m":{short:"1m",full:"1 Minute"},"2m":{short:"2m",full:"2 Minutes"},"3m":{short:"3m",full:"3 Minutes"},"5m":{short:"5m",full:"5 Minutes"},"10m":{short:"10m",full:"10 Minutes"},'
  },
  {
    name: 'rv function support for 15s, 30s, 2m, 3m, 10m',
    find: 'function rv(i){let n=getSyncTime(),e=0;switch(i){case "1m":e=60*1e3;break;case "5m":e=300*1e3;break;',
    replace: 'function rv(i){let n=getSyncTime(),e=0;switch(i){case "15s":e=15*1e3;break;case "30s":e=30*1e3;break;case "1m":e=60*1e3;break;case "2m":e=120*1e3;break;case "3m":e=180*1e3;break;case "5m":e=300*1e3;break;case "10m":e=600*1e3;break;'
  },
  {
    name: 'Preserve OTC symbol underscores in Di helper function',
    find: 'function Di(i){if(!i)return "BTC/USDT";if(i.includes("/"))return i;if(i.includes("-"))return i.replace("-","/");if(i.includes("_"))return i.replace("_","/");',
    replace: 'function Di(i){if(!i)return "BTC/USDT";if(i.includes("/"))return i;if(i.includes("-"))return i.replace("-","/");'
  },
  {
    name: 'Debounce Ar localStorage writes to prevent main-thread blocking during zoom',
    find: 'function Ar(i,n){if(!(typeof window>"u"))try{let e=localStorage.getItem(fs),t=e?JSON.parse(e):{};t[i]={...t[i],...n,savedAt:Date.now()},localStorage.setItem(fs,JSON.stringify(t));}catch{}}',
    replace: 'let _arTimer=null;function Ar(i,n){if(typeof window==="undefined")return;if(_arTimer)clearTimeout(_arTimer);_arTimer=setTimeout(()=>{try{let e=localStorage.getItem(fs),t=e?JSON.parse(e):{};t[i]={...t[i],...n,savedAt:Date.now()};localStorage.setItem(fs,JSON.stringify(t));}catch{}},500);}'
  },
  {
    name: 'Smooth zoomIn Y-axis price bounds with lerp to prevent jitter',
    find: 'if(v.length>0){w=Math.min(...v.map(R=>R.low)),C=Math.max(...v.map(R=>R.high));let M=(C-w)*.1;w-=M,C+=M;}Ar(a,{timeFrame:g,zoomLevel:x,chartType:t.state.chartType})',
    replace: 'if(v.length>0){let _tMin=Math.min(...v.map(R=>R.low)),_tMax=Math.max(...v.map(R=>R.high)),_pad=(_tMax-_tMin)*.1;_tMin-=_pad;_tMax+=_pad;w=isFinite(r.minPrice)&&r.minPrice>0?r.minPrice+(_tMin-r.minPrice)*.5:_tMin;C=isFinite(r.maxPrice)&&r.maxPrice>0?r.maxPrice+(_tMax-r.maxPrice)*.5:_tMax;}Ar(a,{timeFrame:g,zoomLevel:x,chartType:t.state.chartType})'
  },
  {
    name: 'Smooth zoomOut Y-axis price bounds with lerp to prevent jitter',
    find: 'if(w.length>0){C=Math.min(...w.map(k=>k.low)),P=Math.max(...w.map(k=>k.high));let R=(P-C)*.1;C-=R,P+=R;}Ar(a,{timeFrame:f,zoomLevel:v,chartType:t.state.chartType})',
    replace: 'if(w.length>0){let _tMin=Math.min(...w.map(k=>k.low)),_tMax=Math.max(...w.map(k=>k.high)),_pad=(_tMax-_tMin)*.1;_tMin-=_pad;_tMax+=_pad;C=isFinite(r.minPrice)&&r.minPrice>0?r.minPrice+(_tMin-r.minPrice)*.5:_tMin;P=isFinite(r.maxPrice)&&r.maxPrice>0?r.maxPrice+(_tMax-r.maxPrice)*.5:_tMax;}Ar(a,{timeFrame:f,zoomLevel:v,chartType:t.state.chartType})'
  },
  {
    name: 'Expose window.__chartStore and window.__useChartStore to window object',
    find: 'zoomLevel:1}}}))})));function Bv',
    replace: 'zoomLevel:1}}}))})));if(typeof window!=="undefined"){window.__chartStore=F;window.__useChartStore=F;}function Bv'
  },
  {
    name: 'Ultra-fluid 60fps proportional wheel and trackpad pinch zoom handler',
    find: 'let J=ne=>{ne.preventDefault(),ne.stopPropagation();let ee=F.getState();if(ee.state.isLoading||ee.isLoadingMore||ee.isTransitioning)return;let We=H.getBoundingClientRect(),Oe=ne.clientX-We.left,Ze=Math.max(0,Math.min(1,Oe/j.chartAreaWidth));q.current={direction:ne.deltaY<0?"in":"out",ratio:Ze},Z.current===null&&(Z.current=requestAnimationFrame(()=>{let Qe=q.current;if(Qe){let{zoomIn:et,zoomOut:ge}=F.getState();Qe.direction==="in"?et(Qe.ratio):ge(Qe.ratio);}Z.current=null,q.current=null;}));};',
    replace: 'let J=ne=>{ne.preventDefault(),ne.stopPropagation();let We=H.getBoundingClientRect(),Oe=ne.clientX-We.left,Ze=Math.max(0,Math.min(1,Oe/(j.chartAreaWidth||1)));let delta=ne.deltaY;if(ne.deltaMode===1)delta*=16;if(ne.deltaMode===2)delta*=100;let steps=Math.max(-8,Math.min(8,Math.round(delta/40)));if(steps===0)steps=ne.deltaY<0?-1:1;let ee=F.getState();if(steps<0){for(let k=0;k<Math.abs(steps);k++)ee.zoomIn(Ze);}else{for(let k=0;k<Math.abs(steps);k++)ee.zoomOut(Ze);}};'
  },
  {
    name: 'Clamp zoomOut viewport startTime and enforce strict dynamic candle count limits',
    find: 'zoomOut:e=>i(t=>{let{viewport:r,timeFrame:o,symbol:a}=t.state,{candles:s}=t,l=r.endTime-r.startTime,c=e??.5,u=r.startTime+l*c,d=Hn(),m=Ye[o]?.milliseconds||6e4;if(Math.floor(l/m)>=d.maxCandles)return t;let h=l*1.15,g=Math.floor(h/m),f=o,b=h;if(g>d.maxCandles){b=d.maxCandles*m;}let y=u-b*c,x=u+b*(1-c),v=Math.max(.2,r.zoomLevel/1.2),w=s.filter(M=>M.time>=y&&M.time<=x),C=r.minPrice,P=r.maxPrice;',
    replace: 'zoomOut:e=>i(t=>{let{viewport:r,timeFrame:o,symbol:a}=t.state,{candles:s}=t,l=r.endTime-r.startTime,c=e??.5,u=r.startTime+l*c,d=Hn(),m=Ye[o]?.milliseconds||6e4;let _maxC=Math.min(65,Math.max(30,s.length+5));if(Math.floor(l/m)>=_maxC)return t;let h=l*1.15,g=Math.floor(h/m),f=o,b=h;if(g>_maxC){b=_maxC*m;}let y=u-b*c,x=u+b*(1-c);if(s.length>0){let _minT=s[0].time;if(y<_minT-b*.05){let _diff=(_minT-b*.05)-y;y+=_diff;x+=_diff;}}let v=Math.max(.2,r.zoomLevel/1.2),w=s.filter(M=>M.time>=y&&M.time<=x),C=r.minPrice,P=r.maxPrice;let _tb=w.length>0?w:s.slice(-30);if(_tb.length>0){let _tMin=Math.min(..._tb.map(k=>k.low)),_tMax=Math.max(..._tb.map(k=>k.high)),_pad=(_tMax-_tMin>0?_tMax-_tMin:_tMax*.001||.001)*.12;C=_tMin-_pad;P=_tMax+_pad;}'
  },
  {
    name: 'Responsive TradingView style candle bounds and min/max candles limit in Hn helper',
    find: 'function Hn(i){let n=(typeof window<"u"?window.innerWidth:1920),t=n<640?120:70,r=Math.max(200,n-t),o=8,a=12,s=25,l=Math.floor(r/o),c=Math.floor(r/a),u=Math.max(8,Math.floor(r/s));return {minCandles:Math.max(8,Math.min(u,25)),maxCandles:Math.max(l,u+15),defaultCandles:60}}',
    replace: 'function Hn(i){return {minCandles:18,maxCandles:65,defaultCandles:45}}'
  },
  {
    name: 'Responsive 15 percent vertical candle height padding in setCandles price bounds',
    find: 'let R=(b-f||1)*.1;f-=R,b+=R;}let x=y',
    replace: 'let R=(b>f?(b-f)*.15:(b>0?b*.002:.002));f-=R;b+=R;}let x=y'
  },
  {
    name: 'Fix setCandles future space from 24 candles down to 3 candles and calculate tight price bounds over visible candles',
    find: 'g=Math.max(p,d)+o*24,h=g-P*o;let T=e.filter(k=>k.time>=h&&k.time<=g),S=T.length>0?T:e.slice(-a.defaultCandles);if(f=Math.min(...S.map(k=>k.low)),b=Math.max(...S.map(k=>k.high)),!isFinite(f)||!isFinite(b)){let k=e[e.length-1];f=k.low,b=k.high;}',
    replace: 'g=Math.max(p,d)+o*3,h=g-P*o;if(e.length>0&&h<e[0].time){h=e[0].time;}let T=e.filter(k=>k.time>=h&&k.time<=g),S=T.length>0?T:e.slice(-a.defaultCandles);if(f=Math.min(...S.map(k=>k.low)),b=Math.max(...S.map(k=>k.high)),!isFinite(f)||!isFinite(b)){let k=e[e.length-1];f=k.low,b=k.high;}'
  },
  {
    name: 'Complete chart resetZoom helper to restore 45 bold candles viewport, price bounds, and clear localStorage state',
    find: 'resetZoom:()=>i(e=>({state:{...e.state,viewport:{...e.state.viewport,zoomLevel:1}}}))',
    replace: 'resetZoom:()=>i(e=>{dt.markAllDirty();try{localStorage.removeItem("binary-chart-state");}catch(_e){}let{candles:t}=e,o=Ye[e.state.timeFrame]?.milliseconds||6e4,a=getSyncTime(),P=45,g=a+o*3,h=g-P*o,p=t.filter(b=>b.time>=h&&b.time<=g),S=p.length>0?p:t.slice(-P),mn=S.length>0?Math.min(...S.map(x=>x.low)):0,mx=S.length>0?Math.max(...S.map(x=>x.high)):1,pad=(mx-mn>0?mx-mn:mx*.001||.001)*.12;return {state:{...e.state,viewport:{...e.state.viewport,startTime:h,endTime:g,minPrice:mn-pad,maxPrice:mx+pad,zoomLevel:1}},zoomAnchorTime:null,zoomAnchorVersion:e.zoomAnchorVersion+1,hasGapToFill:false};})'
  },
  {
    name: 'Always default setSymbol to clean zoomLevel 1',
    find: 'zoomLevel:r?.zoomLevel||t.state.viewport.zoomLevel||1',
    replace: 'zoomLevel:1'
  },
  {
    name: 'Unconditional clamp of setCandles startTime to earliest loaded candle to eliminate empty space on left',
    find: 'y=u!==null&&!t.anchorConsumedByViewport;if(c&&!y)h=t.state.viewport.startTime,g=t.state.viewport.endTime,f=t.state.viewport.minPrice,b=t.state.viewport.maxPrice;',
    replace: 'y=u!==null&&!t.anchorConsumedByViewport;if(c&&!y)h=t.state.viewport.startTime,g=t.state.viewport.endTime,f=t.state.viewport.minPrice,b=t.state.viewport.maxPrice;if(e.length>0&&h<e[0].time){h=e[0].time;}'
  },
  {
    name: 'Disable horizontal panning on mouse/touch drag',
    find: 'scrollBy:e=>i(t=>{let{viewport:r}=t.state,{candles:o}=t,a=r.startTime+e,s=r.endTime+e,l=s-a;if(o.length>0){let c=o[0].time,u=o[o.length-1].time,d=l*.9,m=c-d,p=u+d;if(a<m){let h=m-a;a=m,s+=h;}if(s>p){let h=s-p;s=p,a-=h,a<m&&(a=m);}}return {state:{...t.state,viewport:{...r,startTime:a,endTime:s}}}})',
    replace: 'scrollBy:e=>i(t=>t)'
  },
  {
    name: 'Fix shorthand and longhand border conflicts in LR drawing tool drawer button',
    find: 'R?"bg-blue-500/10 text-blue-400 border-l-[3px] border-blue-400/80":a?"hover:bg-white/5 text-zinc-300":"hover:bg-black/5 text-gray-700"',
    replace: 'R?"bg-blue-500/10 text-blue-400 border-l-[3px] border-l-blue-400/80 border-y border-r border-transparent":a?"border-l-[3px] border-l-transparent border-y border-r border-transparent hover:bg-white/5 text-zinc-300":"border-l-[3px] border-l-transparent border-y border-r border-transparent hover:bg-black/5 text-gray-700"'
  },
  {
    name: 'Fix border-l-2 shorthand conflict in strategy builder condition group lh',
    find: 'r>0?`border-l-2 ${l} pl-3 ml-2`:""',
    replace: 'r>0?`border-l-2 border-l-zinc-700/50 pl-3 ml-2`:""'
  }
];

for (const patch of patches) {
  const find = patch.find.replace(/\r?\n/g, '\n');
  const replace = patch.replace.replace(/\r?\n/g, '\n');

  if (content.includes(replace)) {
    console.log(`[Already Patched] ${patch.name}`);
  } else if (content.includes(find)) {
    content = content.replace(find, () => replace);
    console.log(`[Patch Applied] ${patch.name}`);
    modified = true;
  } else {
    // Fallback search patterns
    if (patch.name === '60 FPS static canvas layer dirty marking during drawing/dragging') {
      const intermediateFind = 'if(Pn.current){let ge={time:We.time-Pn.current.lastPoint.time,price:We.price-Pn.current.lastPoint.price};xe.updateDrag(Pn.current.drawingId,ge),Pn.current.lastPoint=We,dt.markOverlayDirty();return}if(qi.current){xe.addPoint(We),H.currentTarget.style.cursor="crosshair",dt.markOverlayDirty();return}if(xe.isPlacingDrawing){xe.updateActivePoint(We),H.currentTarget.style.cursor="crosshair",dt.markOverlayDirty();return}';
      const normalizedIntermediate = intermediateFind.replace(/\r?\n/g, '\n');
      if (content.includes(normalizedIntermediate)) {
        content = content.replace(normalizedIntermediate, () => replace);
        console.log(`[Patch Applied (via intermediate search)] ${patch.name}`);
        modified = true;
        continue;
      }
    }
    console.warn(`[Warning] Match target not found for patch: ${patch.name}`);
  }
}

// Deduplicate function getSyncTime if injected multiple times
content = content.replace(/(function getSyncTime\(\)\{return Date\.now\(\)\+\(typeof window!=="undefined"\?\(window\.__binary_time_offset\|\|0\):0\)\})+\s*/g, 'function getSyncTime(){return Date.now()+(typeof window!=="undefined"?(window.__binary_time_offset||0):0)}');

if (modified) {
  // Restore CRLF if it was originally CRLF
  if (isCrlf) {
    content = content.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(targetPath, content, 'utf8');
  console.log('Chart engine bundle index.js has been successfully updated with all patches!');
} else {
  console.log('No modifications needed. All patches are already applied.');
}

// ─── Run the drawer revamp script on top of the patched bundle ────────────────
const revampPath = path.resolve(__dirname, 'revamp-drawer.js');
if (fs.existsSync(revampPath)) {
  try {
    require(revampPath);
  } catch (e) {
    console.warn('[Warning] revamp-drawer.js failed:', e.message);
  }
}
