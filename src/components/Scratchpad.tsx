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

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newWidth = Math.round(rect.width * dpr);
      const newHeight = Math.round(rect.height * dpr);

      // Bail out if the size hasn't actually changed. Touch devices fire
      // window "resize" events while scrolling (the address bar shows/hides),
      // and reassigning canvas.width/height would wipe the drawing every time.
      if (canvas.width === newWidth && canvas.height === newHeight) {
        return;
      }

      // Preserve the existing drawing across a genuine resize.
      const snapshot = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null;

      canvas.width = newWidth;
      canvas.height = newHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = '#1e3a8a'; // Dark blue
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        contextRef.current = ctx;

        if (snapshot) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
          img.src = snapshot;
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

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

  const startDrawing = useCallback((e: React.PointerEvent) => {
    const context = contextRef.current;
    if (disabled || !context || isPalmTouch(e)) return;

    e.preventDefault();

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
  }, [disabled, getPointerPosition, shouldErase, isPalmTouch]);

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

    context.clearRect(0, 0, canvas.width, canvas.height);
    onClear?.();
  }, [onClear]);

  // Expose clear function via ref
  useImperativeHandle(ref, () => ({
    clear: handleClear,
  }), [handleClear]);

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
        <button
          onClick={handleClear}
          disabled={disabled}
          className="px-3 py-1 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm rounded-lg border border-gray-200 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-white border-2 border-gray-200 rounded-b-xl overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={stopDrawing}
          onPointerLeave={handleCanvasPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          className={`w-full h-full ${disabled ? 'cursor-not-allowed' : tool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'}`}
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
