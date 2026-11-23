// Consecutive free hours of one weekday become one block: [from, to) in hours.
export function freeRuns(blocks: { weekday: number; hour: number }[], weekday: number) {
  const hours = blocks.filter((b) => b.weekday === weekday).map((b) => b.hour).sort((a, b) => a - b), runs: [number, number][] = [];
  for (const h of hours) { const last = runs.at(-1); if (last && last[1] === h) last[1] = h + 1; else runs.push([h, h + 1]); }
  return runs;
}
