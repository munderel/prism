import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, authError } from '@/lib/auth-guard';
import { safeParseJson } from '@/lib/api-helpers';

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await safeParseJson(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const { functions } = body;

  if (!Array.isArray(functions) || functions.length === 0) {
    return Response.json({ error: 'functions array is required' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const [fi, fnData] of functions.entries()) {
      if (!fnData.name) continue;

      const fn = await tx.businessFunction.create({
        data: {
          name: fnData.name,
          description: fnData.description || null,
          sortOrder: fi,
        },
      });

      const processes = [];
      for (const [pi, procData] of (fnData.processes ?? []).entries()) {
        if (!procData.title) continue;

        const proc = await tx.process.create({
          data: {
            functionId: fn.id,
            title: procData.title,
            description: procData.description || null,
            cadence: procData.cadence || 'WEEKLY',
            sortOrder: pi,
          },
        });

        const steps = [];
        for (const [si, stepData] of (procData.steps ?? []).entries()) {
          if (!stepData.title) continue;

          const step = await tx.processStep.create({
            data: {
              processId: proc.id,
              title: stepData.title,
              description: stepData.description || null,
              sortOrder: si,
            },
          });
          steps.push(step);
        }

        processes.push({ ...proc, steps });
      }

      created.push({ ...fn, processes });
    }

    return created;
  });

  return Response.json({ imported: result }, { status: 201 });
}
