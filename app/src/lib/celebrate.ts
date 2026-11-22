// A short burst of paper bits from a point (or the screen centre). Used for the
// moments that matter: money arrived, an offer accepted, a lesson confirmed.
const COLORS = ["#852f36", "#c99a3c", "#3a5a3c", "#2e5070", "#f6e1e1"];

export function celebrate(from?: HTMLElement | null) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = from?.getBoundingClientRect();
  const x = box ? box.left + box.width / 2 : innerWidth / 2,
    y = box ? box.top + box.height / 2 : innerHeight / 3;
  const layer = document.createElement("div");
  layer.className = "celebrate";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 28; i++) {
    const bit = document.createElement("span"),
      angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4,
      distance = 70 + Math.random() * 110;
    bit.style.cssText = `left:${x}px;top:${y}px;background:${COLORS[i % COLORS.length]};--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance - 40}px;--r:${Math.random() * 540 - 270}deg;animation-delay:${Math.random() * 60}ms`;
    if (i % 3 === 0) bit.dataset.round = "";
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1100);
}
