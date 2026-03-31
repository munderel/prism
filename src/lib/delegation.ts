interface DelegationSource {
  assigneeId?: string | null;
  delegateId?: string | null;
  delegateUntil?: Date | string | null;
}

export function resolveAssignee(process: DelegationSource): string | null {
  if (process.delegateId && process.delegateUntil) {
    const until = new Date(process.delegateUntil);
    if (until >= new Date()) return process.delegateId;
  }
  return process.assigneeId ?? null;
}
