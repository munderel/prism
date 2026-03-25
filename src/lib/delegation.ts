export function resolveAssignee(process: { assigneeId?: string | null; delegateId?: string | null; delegateUntil?: Date | string | null }): string | null {
  if (process.delegateId && process.delegateUntil) {
    const until = new Date(process.delegateUntil);
    if (until >= new Date()) return process.delegateId;
  }
  return process.assigneeId ?? null;
}
