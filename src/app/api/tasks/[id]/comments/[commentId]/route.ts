import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authError } from '@/lib/auth-guard';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { commentId } = await params;
  const auth = await requireAuth();
  if ('error' in auth) return authError(auth);

  const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });
  if (!comment) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Only author or admin can delete
  if (comment.authorId !== auth.userId && !auth.session.user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Cascade deletes mentions via Prisma onDelete: Cascade
  await prisma.taskComment.delete({ where: { id: commentId } });

  return Response.json({ ok: true });
}
