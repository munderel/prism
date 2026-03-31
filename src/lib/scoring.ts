export function computeIceScore(impact: number, confidence: number, ease: number): number {
  return Math.round(((impact * confidence * ease) / 3) * 100) / 100;
}

function formatLabeledFields(fields: [string, string][]): string {
  return fields.map(([label, value]) => `**${label}:** ${value}`).join('\n');
}

export function formatCarsDescription(context: string, attempts: string, request: string, stakes: string): string {
  return formatLabeledFields([
    ['Context', context],
    ['Attempts', attempts],
    ['Request', request],
    ['Stakes', stakes],
  ]);
}

export function formatPicsDescription(problem: string, idea: string, cost: string, stakes: string): string {
  return formatLabeledFields([
    ['Problem', problem],
    ['Idea', idea],
    ['Cost', cost],
    ['Stakes', stakes],
  ]);
}
