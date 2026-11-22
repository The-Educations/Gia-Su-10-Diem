// The boot mark in index.html draws for about 760 ms from the moment it
// appears, then opens onto the app once React has rendered. A slow network
// only lengthens the wait, never the motion.
const DRAWN_MS = 760;
const OPEN_MS = 280;

declare global {
  interface Window {
    __bootAt?: number;
  }
}

export function finishBoot() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  const shown = performance.now() - (window.__bootAt ?? 0);
  const timer = setTimeout(() => {
    boot.dataset.done = "";
    setTimeout(() => boot.remove(), OPEN_MS);
  }, Math.max(0, DRAWN_MS - shown));
  return () => clearTimeout(timer);
}
