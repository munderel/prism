export function computeIceScore(impact: number, confidence: number, ease: number): number {
  return Math.round((impact * confidence * ease) / 3 * 100) / 100;
}

export function formatCarsDescription(context: string, attempts: string, request: string, stakes: string): string {
  return `**Context:** ${context}\n**Attempts:** ${attempts}\n**Request:** ${request}\n**Stakes:** ${stakes}`;
}

export function formatPicsDescription(problem: string, idea: string, cost: string, stakes: string): string {
  return `**Problem:** ${problem}\n**Idea:** ${idea}\n**Cost:** ${cost}\n**Stakes:** ${stakes}`;
}
