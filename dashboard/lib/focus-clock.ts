/** Wall-clock time remains accurate when the browser throttles background timers. */
export function remainingSeconds(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function parseChapters(input: string): number[] {
  const match = input.match(/\bchapters?\s+((?:\d+)(?:\s*(?:,\s*(?:and\s+)?|and\s+|to\s+|[-–]\s*)\d+)*)\b/i);
  if (!match) return [];
  const suffix = input.slice(match.index! + match[0].length);
  if (/^\.\d|^\s*(?:[-–,]|to\b|and\b)/i.test(suffix)) return [];
  const output = new Set<number>();
  for (const part of match[1].split(/,|\band\b/i).map(value => value.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*(?:-|to|–)\s*(\d+)$/i);
    const from = Number(range ? range[1] : part), to = Number(range ? range[2] : part);
    if (from < 1 || to < from || to > 999 || to - from >= 30) return [];
    for (let n = from; n <= to; n++) output.add(n);
    if (output.size > 30) return [];
  }
  return [...output];
}
