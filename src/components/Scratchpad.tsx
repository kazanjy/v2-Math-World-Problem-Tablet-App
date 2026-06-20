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
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Once a stylus is detected we reject touch input (palm rejection).
  const hasSeenPenRef = useRef(false);
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
        setContext(ctx);

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

  // Remember when a stylus is in use, and reject palm/finger touches once it is.
  // Pen events (including hover) flip the flag, so the palm is ignored even if
  // it lands on the screen before the pen tip does.
  const isPalmTouch = useCallback((e: React.PointerEvent | PointerEvent): boolean => {
    if (e.pointerType === 'pen') {
      hasSeenPenRef.current = true;
    }
    return e.pointerType === 'touch' && hasSeenPenRef.current;
  }, []);

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
  }, [disabled, context, getPointerPosition, shouldErase, isPalmTouch]);

  const draw = useCallback((e: React.PointerEvent) => {
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
  }, [isDrawing, disabled, context, getPointerPosition, shouldErase, isPalmTouch]);

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
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    onClear?.();
  }, [context, onClear]);

  // Expose clear function via ref
  useImperativeHandle(ref, () => ({
    clear: handleClear,
  }), [handleClear]);

  // Handle pointer events at the document level for smooth drawing
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawing || disabled || !context || !lastPointRef.current) return;

      // Ignore palm/finger touches once a stylus is in use.
      if (e.pointerType === 'touch' && hasSeenPenRef.current) return;

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
  }, [isDrawing, disabled, context, getPointerPosition, tool]);

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
