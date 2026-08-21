import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface ScratchpadHandle {
  clear: () => void;
}

interface ScratchpadProps {
  onClear?: () => void;
  disabled?: boolean;
}

type Tool = 'pen' | 'eraser';

// Brush sizes in CSS pixels.
const PEN_WIDTH = 3;
const ERASER_WIDTH = 44;

export const Scratchpad = forwardRef<ScratchpadHandle, ScratchpadProps>(function Scratchpad({ onClear, disabled }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  // The 2D context is held in a ref: it's a mutable drawing handle, not render state.
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Once a stylus is detected we reject touch input (palm rejection).
  const hasSeenPenRef = useRef(false);
  // Manual override: when on, touch is always ignored regardless of detection.
  const [stylusOnly, setStylusOnly] = useState(false);
  // Where the eraser ring preview is drawn (null = hidden).
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  // Undo history: canvas snapshots captured before each stroke (newest last).
  const undoStackRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // Current logical height of the (growable) workspace, in CSS pixels.
  const workspaceHeightRef = useRef(0);

  // Size the canvas to the container width and the growable workspace height at
  // device-pixel resolution, optionally preserving the existing drawing.
  const applyCanvasSize = useCallback((preserve: boolean) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const visible = container.clientHeight;
    if (width === 0 || visible === 0) return;

    // Start with at least two screens of height so there's room to scroll into.
    const height = Math.max(visible * 2, workspaceHeightRef.current);
    workspaceHeightRef.current = height;

    const newWidth = Math.round(width * dpr);
    const newHeight = Math.round(height * dpr);

    // No-op if nothing changed (touch scrolling fires spurious resize events,
    // and reassigning canvas.width/height would wipe the drawing every time).
    if (canvas.width === newWidth && canvas.height === newHeight && contextRef.current) return;

    // Preserve the existing drawing across a genuine resize / grow.
    const snapshot = preserve && canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null;

    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#1e3a8a'; // Dark blue
      ctx.lineWidth = PEN_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      contextRef.current = ctx;

      if (snapshot) {
        const img = new Image();
        // Redraw at the snapshot's natural (unscaled) size so growth adds blank
        // space below without stretching the existing work.
        img.onload = () => ctx.drawImage(img, 0, 0, img.width / dpr, img.height / dpr);
        img.src = snapshot;
      }
    }
  }, []);

  // Grow the workspace by one screen when the user scrolls near the bottom, so
  // it behaves like infinite paper. Existing work is preserved.
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollTop + container.clientHeight >= container.scrollHeight - container.clientHeight * 0.75;
    if (nearBottom) {
      workspaceHeightRef.current =
        Math.max(workspaceHeightRef.current, container.clientHeight * 2) + container.clientHeight;
      applyCanvasSize(true);
    }
  }, [applyCanvasSize]);

  // Initialize and keep the canvas sized to the container.
  useEffect(() => {
    applyCanvasSize(false);
    const onResize = () => applyCanvasSize(true);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [applyCanvasSize]);

  const getPointerPosition = useCallback((e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Remember when a stylus is in use, and reject palm/finger touches.
  // Pen events (including hover) flip the auto-detect flag, so the palm is
  // ignored even if it lands on the screen before the pen tip does. The manual
  // "stylus only" toggle forces rejection regardless of detection.
  const isPalmTouch = useCallback((e: React.PointerEvent | PointerEvent): boolean => {
    if (e.pointerType === 'pen') {
      hasSeenPenRef.current = true;
    }
    if (e.pointerType !== 'touch') return false;
    return stylusOnly || hasSeenPenRef.current;
  }, [stylusOnly]);

  // Check if stylus eraser button is pressed (barrel button)
  const isEraserButton = useCallback((e: React.PointerEvent | PointerEvent): boolean => {
    // Android S Pen and most tablet styluses:
    // - Barrel button press: button === 2 (on pointerdown) or buttons & 2 (during move)
    // - Some devices use button === 5 or buttons & 32
    // - Eraser end of stylus: pointerType === 'eraser' (rare)
    const isBarrelButton = e.button === 2 || (e.buttons & 2) !== 0;
    const isEraserType = e.pointerType === 'eraser';
    const isButton5 = e.button === 5 || (e.buttons & 32) !== 0;

    return isBarrelButton || isEraserType || isButton5;
  }, []);

  // Determine if we should erase based on tool selection OR stylus button
  const shouldErase = useCallback((e: React.PointerEvent | PointerEvent): boolean => {
    return tool === 'eraser' || isEraserButton(e);
  }, [tool, isEraserButton]);

  // Snapshot the canvas so the action that follows can be undone. Called before
  // each stroke (and before Clear); keeps a bounded history of PNG snapshots.
  const UNDO_LIMIT = 30;
  const pushUndoSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stack = undoStackRef.current;
    stack.push(canvas.toDataURL());
    if (stack.length > UNDO_LIMIT) stack.shift();
    setCanUndo(true);
  }, []);

  const startDrawing = useCallback((e: React.PointerEvent) => {
    const context = contextRef.current;
    if (disabled || !context || isPalmTouch(e)) return;

    e.preventDefault();

    // Remember the state before this stroke so it can be undone.
    pushUndoSnapshot();

    const erasing = shouldErase(e);
    setIsDrawing(true);

    const point = getPointerPosition(e);
    lastPointRef.current = point;

    // Set drawing mode based on eraser state
    if (erasing) {
      context.globalCompositeOperation = 'destination-out';
      context.lineWidth = ERASER_WIDTH; // Wider for erasing
    } else {
      context.globalCompositeOperation = 'source-over';
      context.lineWidth = PEN_WIDTH;
    }

    // Draw a dot for single clicks
    context.beginPath();
    context.arc(point.x, point.y, erasing ? ERASER_WIDTH / 2 : 1.5, 0, Math.PI * 2);
    context.fill();
  }, [disabled, getPointerPosition, shouldErase, isPalmTouch, pushUndoSnapshot]);

  const draw = useCallback((e: React.PointerEvent) => {
    const context = contextRef.current;
    if (!isDrawing || disabled || !context || !lastPointRef.current || isPalmTouch(e)) return;

    e.preventDefault();

    const erasing = shouldErase(e);
    if (erasing) {
      context.globalCompositeOperation = 'destination-out';
      context.lineWidth = ERASER_WIDTH;
    } else {
      context.globalCompositeOperation = 'source-over';
      context.lineWidth = PEN_WIDTH;
    }

    const point = getPointerPosition(e);

    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();

    lastPointRef.current = point;
  }, [isDrawing, disabled, getPointerPosition, shouldErase, isPalmTouch]);

  // Canvas pointer move: update the eraser preview ring (even while hovering)
  // and forward to the drawing handler.
  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPalmTouch(e)) return;

    if (tool === 'eraser') {
      setEraserCursor(getPointerPosition(e));
    }

    draw(e);
  }, [tool, getPointerPosition, draw, isPalmTouch]);

  const handleCanvasPointerLeave = useCallback(() => {
    setEraserCursor(null);
    setIsDrawing(false);
    lastPointRef.current = null;
  }, []);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPointRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    // Keep the pre-clear state so Clear can be undone too.
    if (canvas.width > 0 && canvas.height > 0) {
      pushUndoSnapshot();
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    onClear?.();
  }, [onClear, pushUndoSnapshot]);

  // Undo the most recent stroke (or clear) by restoring the last snapshot.
  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    const stack = undoStackRef.current;
    if (!canvas || !context || stack.length === 0) return;

    const snapshot = stack.pop()!;
    setCanUndo(stack.length > 0);

    const dpr = window.devicePixelRatio || 1;
    const img = new Image();
    img.onload = () => {
      context.globalCompositeOperation = 'source-over';
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, img.width / dpr, img.height / dpr);
    };
    img.src = snapshot;
  }, []);

  // Expose clear function via ref
  // Imperative clear (used between questions) wipes the canvas AND the undo
  // history, so a new question never lets you undo back into the previous one.
  useImperativeHandle(ref, () => ({
    clear: () => {
      // Reset the workspace back to its starting height and scroll position.
      workspaceHeightRef.current = 0;
      applyCanvasSize(false);
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (canvas && context) {
        context.globalCompositeOperation = 'source-over';
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (containerRef.current) containerRef.current.scrollTop = 0;
      undoStackRef.current = [];
      setCanUndo(false);
      onClear?.();
    },
  }), [onClear, applyCanvasSize]);

  // Handle pointer events at the document level for smooth drawing
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const context = contextRef.current;
      if (!isDrawing || disabled || !context || !lastPointRef.current) return;

      // Ignore palm/finger touches when a stylus is in use (or forced).
      if (e.pointerType === 'touch' && (stylusOnly || hasSeenPenRef.current)) return;

      // Check for eraser mode (tool selection OR stylus button)
      const isBarrelButton = e.button === 2 || (e.buttons & 2) !== 0;
      const isEraserType = e.pointerType === 'eraser';
      const isButton5 = e.button === 5 || (e.buttons & 32) !== 0;
      const erasing = tool === 'eraser' || isBarrelButton || isEraserType || isButton5;

      if (erasing) {
        context.globalCompositeOperation = 'destination-out';
        context.lineWidth = ERASER_WIDTH;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.lineWidth = PEN_WIDTH;
      }

      const point = getPointerPosition(e);
      context.beginPath();
      context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      lastPointRef.current = point;
    };

    const handlePointerUp = () => {
      setIsDrawing(false);
      lastPointRef.current = null;
    };

    if (isDrawing) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);
    }

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDrawing, disabled, getPointerPosition, tool, stylusOnly]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex justify-between items-center p-2 bg-gray-100 rounded-t-xl">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-gray-600 mr-2">Scratch Paper</span>
          {/* Pen tool */}
          <button
            onClick={() => setTool('pen')}
            disabled={disabled}
            className={`p-2 rounded-lg transition-all ${
              tool === 'pen'
                ? 'bg-blue-500 text-white'
                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
            } disabled:opacity-50`}
            title="Pen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {/* Eraser tool */}
          <button
            onClick={() => setTool('eraser')}
            disabled={disabled}
            className={`p-2 rounded-lg transition-all ${
              tool === 'eraser'
                ? 'bg-pink-500 text-white'
                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
            } disabled:opacity-50`}
            title="Eraser"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zm-1.41 1.42L6.93 12.87l4.24 4.24 7.87-7.87-4.21-4.26z" />
            </svg>
          </button>
          {/* Divider */}
          <div className="w-px h-6 bg-gray-300 mx-1" />
          {/* Stylus-only (palm rejection) toggle */}
          <button
            onClick={() => setStylusOnly((v) => !v)}
            disabled={disabled}
            className={`p-2 rounded-lg transition-all ${
              stylusOnly
                ? 'bg-indigo-500 text-white'
                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
            } disabled:opacity-50`}
            title={stylusOnly ? 'Stylus only: ON — touch/palm ignored' : 'Stylus only: OFF — tap to ignore touch/palm'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0 1 16.35 15m.002 0h-.002" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={disabled || !canUndo}
            className="flex items-center gap-1 px-3 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm rounded-lg border border-gray-200 transition-colors"
            title="Undo last stroke"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            Undo
          </button>
          <button
            onClick={handleClear}
            disabled={disabled}
            className="px-3 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm rounded-lg border border-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Scrollable, growable canvas workspace */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="scratch-scroll relative flex-1 bg-white border-2 border-gray-200 rounded-b-xl overflow-y-auto overflow-x-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={stopDrawing}
          onPointerLeave={handleCanvasPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          className={`block ${disabled ? 'cursor-not-allowed' : tool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'}`}
          style={{
            touchAction: 'none',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 19px, #e5e7eb 19px, #e5e7eb 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, #e5e7eb 19px, #e5e7eb 20px)',
          }}
        />

        {/* Eraser preview ring - shows where the eraser will act, even on hover */}
        {tool === 'eraser' && eraserCursor && !disabled && (
          <div
            className="pointer-events-none absolute rounded-full border-2 border-pink-400 bg-pink-300/20"
            style={{
              width: ERASER_WIDTH,
              height: ERASER_WIDTH,
              left: eraserCursor.x - ERASER_WIDTH / 2,
              top: eraserCursor.y - ERASER_WIDTH / 2,
            }}
          />
        )}
      </div>
    </div>
  );
});
