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

    for (let fi = 0; fi < functions.length; fi++) {
      const fnData = functions[fi];
      if (!fnData.name) continue;

      const fn = await tx.businessFunction.create({
        data: {
          name: fnData.name,
          description: fnData.description || null,
          sortOrder: fi,
        },
      });

      const processes = [];
      if (Array.isArray(fnData.processes)) {
        for (let pi = 0; pi < fnData.processes.length; pi++) {
          const procData = fnData.processes[pi];
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
          if (Array.isArray(procData.steps)) {
            for (let si = 0; si < procData.steps.length; si++) {
              const stepData = procData.steps[si];
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
          }

          processes.push({ ...proc, steps });
        }
      }

      created.push({ ...fn, processes });
    }

    return created;
  });

  return Response.json({ imported: result }, { status: 201 });
}
