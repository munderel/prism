import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthFromRequest, requireAdmin, authError } from '@/lib/auth-guard';
import { parseBody, createBusinessFunctionSchema } from '@/lib/schemas';

export async function GET(request: NextRequest) {
  const auth = await requireAuthFromRequest(request);
  if ('error' in auth) return authError(auth);

  const functions = await prisma.businessFunction.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      processes: {
        orderBy: { sortOrder: 'asc' },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          delegate: { select: { id: true, name: true, email: true } },
          _count: { select: { steps: true } },
        },
      },
    },
  });

  return Response.json(functions);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return authError(auth);

  const parsed = await parseBody(request, createBusinessFunctionSchema);
  if ('error' in parsed) return parsed.error;
  const { name, description } = parsed.data;

  const fn = await prisma.businessFunction.create({
    data: { name, description: description || null },
  });

  return Response.json(fn, { status: 201 });
}
