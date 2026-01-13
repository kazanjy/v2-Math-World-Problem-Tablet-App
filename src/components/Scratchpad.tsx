import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface ScratchpadHandle {
  clear: () => void;
}

interface ScratchpadProps {
  onClear?: () => void;
  disabled?: boolean;
}

export const Scratchpad = forwardRef<ScratchpadHandle, ScratchpadProps>(function Scratchpad({ onClear, disabled }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
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

  // Check if stylus eraser button is pressed (barrel button)
  const isEraserButton = useCallback((e: React.PointerEvent | PointerEvent): boolean => {
    // Button 5 is the eraser button on many styluses
    // Also check buttons bitmask - bit 5 (value 32) indicates eraser
    // Some devices report eraser as a separate pointerType
    return e.button === 5 || (e.buttons & 32) !== 0 || e.pointerType === 'eraser';
  }, []);

  const startDrawing = useCallback((e: React.PointerEvent) => {
    if (disabled || !context) return;

    e.preventDefault();

    // Check if eraser button is pressed
    const erasing = isEraserButton(e);
    setIsErasing(erasing);
    setIsDrawing(true);

    const point = getPointerPosition(e);
    lastPointRef.current = point;

    // Set drawing mode based on eraser state
    if (erasing) {
      context.globalCompositeOperation = 'destination-out';
      context.lineWidth = 20; // Wider for erasing
    } else {
      context.globalCompositeOperation = 'source-over';
      context.lineWidth = 3;
    }

    // Draw a dot for single clicks
    context.beginPath();
    context.arc(point.x, point.y, erasing ? 10 : 1.5, 0, Math.PI * 2);
    context.fill();
  }, [disabled, context, getPointerPosition, isEraserButton]);

  const draw = useCallback((e: React.PointerEvent) => {
    if (!isDrawing || disabled || !context || !lastPointRef.current) return;

    e.preventDefault();

    // Check if eraser button state changed mid-stroke
    const erasing = isEraserButton(e);
    if (erasing !== isErasing) {
      setIsErasing(erasing);
      if (erasing) {
        context.globalCompositeOperation = 'destination-out';
        context.lineWidth = 20;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.lineWidth = 3;
      }
    }

    const point = getPointerPosition(e);

    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(point.x, point.y);
    context.stroke();

    lastPointRef.current = point;
  }, [isDrawing, isErasing, disabled, context, getPointerPosition, isEraserButton]);

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

      // Check for eraser button
      const erasing = e.button === 5 || (e.buttons & 32) !== 0 || e.pointerType === 'eraser';
      if (erasing) {
        context.globalCompositeOperation = 'destination-out';
        context.lineWidth = 20;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.lineWidth = 3;
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
      setIsErasing(false);
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
  }, [isDrawing, disabled, context, getPointerPosition]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex justify-between items-center p-2 bg-gray-100 rounded-t-xl">
        <span className="text-sm font-medium text-gray-600">Scratch Paper</span>
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
        className="flex-1 bg-white border-2 border-gray-200 rounded-b-xl overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          className={`w-full h-full ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
          style={{
            touchAction: 'none',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 19px, #e5e7eb 19px, #e5e7eb 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, #e5e7eb 19px, #e5e7eb 20px)',
          }}
        />
      </div>
    </div>
  );
});
