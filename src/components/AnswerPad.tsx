import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface AnswerPadHandle {
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
  toImageDataUrl: () => string | null;
}

interface AnswerPadProps {
  disabled?: boolean;
  // Notifies the parent when undo becomes available/unavailable.
  onCanUndoChange?: (canUndo: boolean) => void;
}

const PEN_WIDTH = 4;
const UNDO_LIMIT = 30;

export const AnswerPad = forwardRef<AnswerPadHandle, AnswerPadProps>(function AnswerPad({ disabled, onCanUndoChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Once a stylus is detected, ignore touch (palm) input.
  const hasSeenPenRef = useRef(false);
  const hasContentRef = useRef(false);
  // Undo history: canvas snapshots captured before each stroke (newest last).
  const undoStackRef = useRef<string[]>([]);
  const [empty, setEmpty] = useState(true);

  // Start with undo unavailable (also resets on remount, i.e. each question).
  useEffect(() => {
    onCanUndoChange?.(false);
  }, [onCanUndoChange]);

  // Initialize / resize canvas (preserving the drawing, like the scratchpad).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newWidth = Math.round(rect.width * dpr);
      const newHeight = Math.round(rect.height * dpr);

      // Skip no-op resizes (touch scroll fires spurious resize events).
      if (canvas.width === newWidth && canvas.height === newHeight) return;

      const snapshot = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null;

      canvas.width = newWidth;
      canvas.height = newHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = PEN_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctxRef.current = ctx;

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

  const getPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const isPalmTouch = (e: React.PointerEvent): boolean => {
    if (e.pointerType === 'pen') hasSeenPenRef.current = true;
    return e.pointerType === 'touch' && hasSeenPenRef.current;
  };

  // Snapshot the canvas so the action that follows can be undone.
  const pushUndoSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stack = undoStackRef.current;
    stack.push(canvas.toDataURL());
    if (stack.length > UNDO_LIMIT) stack.shift();
    onCanUndoChange?.(true);
  }, [onCanUndoChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const ctx = ctxRef.current;
    if (disabled || !ctx || isPalmTouch(e)) return;

    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;

    // Remember the state before this stroke so it can be undone.
    pushUndoSnapshot();

    const point = getPoint(e);
    lastPointRef.current = point;

    ctx.beginPath();
    ctx.arc(point.x, point.y, PEN_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();

    if (!hasContentRef.current) {
      hasContentRef.current = true;
      setEmpty(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ctx = ctxRef.current;
    if (!drawingRef.current || disabled || !ctx || !lastPointRef.current || isPalmTouch(e)) return;

    e.preventDefault();
    const point = getPoint(e);

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    // Keep the pre-clear state so Clear can be undone too.
    if (hasContentRef.current) pushUndoSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasContentRef.current = false;
    setEmpty(true);
  }, [pushUndoSnapshot]);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const stack = undoStackRef.current;
    if (!canvas || !ctx || stack.length === 0) return;

    const snapshot = stack.pop()!;
    onCanUndoChange?.(stack.length > 0);

    const rect = canvas.getBoundingClientRect();
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = snapshot;

    // The restored snapshot may be blank (undoing the first stroke); treat any
    // remaining strokes as content so isEmpty()/placeholder stay in sync.
    const restoringToEmpty = stack.length === 0;
    hasContentRef.current = !restoringToEmpty;
    setEmpty(restoringToEmpty);
  }, [onCanUndoChange]);

  useImperativeHandle(ref, () => ({
    clear,
    undo,
    isEmpty: () => !hasContentRef.current,
    // Composite the strokes onto a white background so the vision model sees
    // dark ink on white rather than ink on transparency.
    toImageDataUrl: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const octx = out.getContext('2d');
      if (!octx) return null;
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(canvas, 0, 0);
      return out.toDataURL('image/png');
    },
  }), [clear, undo]);

  return (
    <div
      ref={containerRef}
      className="relative h-full bg-white border-2 border-gray-200 rounded-xl overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full ${disabled ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
        style={{ touchAction: 'none' }}
      />
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-gray-300 text-lg">✍️ Write your answer here</span>
        </div>
      )}
    </div>
  );
});
