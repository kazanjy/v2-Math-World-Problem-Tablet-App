import { useCallback, useEffect, useState } from 'react';

// Vendor-prefixed Fullscreen API shims (iPadOS Safari exposes webkit-prefixed
// versions; the standard names cover Android Chrome and desktop browsers).
type FSDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FSElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const d = document as FSDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FSElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

// True when launched from the Home Screen as an installed web app — there is
// no browser chrome in that mode, so a fullscreen toggle is unnecessary.
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => !!getFullscreenElement());
  const supported = isFullscreenSupported();
  const isStandalone = isStandaloneApp();

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!getFullscreenElement());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const enter = useCallback(async () => {
    const el = document.documentElement as FSElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch (err) {
      console.warn('Fullscreen request failed:', err);
    }
  }, []);

  const exit = useCallback(async () => {
    const d = document as FSDocument;
    try {
      if (d.exitFullscreen) await d.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    } catch (err) {
      console.warn('Exit fullscreen failed:', err);
    }
  }, []);

  const toggle = useCallback(() => (getFullscreenElement() ? exit() : enter()), [enter, exit]);

  return { isFullscreen, supported, isStandalone, enter, exit, toggle };
}
