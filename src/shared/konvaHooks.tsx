import { useEffect, useRef, useState } from "react";

export function useContainerSize(minWidth = 320, minHeight = 320) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: minWidth, height: minHeight });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setSize({
        width: Math.max(minWidth, element.clientWidth),
        height: Math.max(minHeight, element.clientHeight),
      });
    update();
    if (typeof window.ResizeObserver === "function") {
      const observer = new window.ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", update);
    const pollId = window.setInterval(update, 250);
    return () => {
      window.removeEventListener("resize", update);
      window.clearInterval(pollId);
    };
  }, [minHeight, minWidth]);

  return { ref, size };
}

export function useLoadedImage(src?: string | null, fallbackSrc?: string | null) {
  const [state, setState] = useState<{ image: HTMLImageElement | null; usedFallback: boolean }>({
    image: null,
    usedFallback: false,
  });

  useEffect(() => {
    const primary = String(src || "").trim();
    const fallback = String(fallbackSrc || "").trim();
    if (!primary && !fallback) {
      setState({ image: null, usedFallback: false });
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setState({ image: img, usedFallback: false });
    img.onerror = () => {
      if (!fallback || primary === fallback) {
        setState({ image: null, usedFallback: false });
        return;
      }
      const fallbackImg = new window.Image();
      fallbackImg.crossOrigin = "anonymous";
      fallbackImg.onload = () => setState({ image: fallbackImg, usedFallback: true });
      fallbackImg.onerror = () => setState({ image: null, usedFallback: false });
      fallbackImg.src = fallback;
    };
    img.src = primary || fallback;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, fallbackSrc]);

  return state;
}

export function buildHitCanvas(image: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return ctx;
}
