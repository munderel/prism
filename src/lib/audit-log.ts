import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface AuditLogInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function extractRequestMeta(request: Request): { ip: string | null; userAgent: string | null } {
  const h = request.headers;
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : h.get('x-real-ip');
  const userAgent = h.get('user-agent');
  return { ip: ip || null, userAgent: userAgent || null };
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? undefined,
        actorId: input.actorId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error('[audit-log] write failed', {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
