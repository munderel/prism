import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
  });

  return Response.json(attachments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const body = await request.json();
  const { fileName, fileUrl, fileSize, mimeType } = body;

  if (!fileName || !fileUrl || !fileSize || !mimeType) {
    return Response.json(
      { error: 'fileName, fileUrl, fileSize, and mimeType are required' },
      { status: 400 }
    );
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
    },
  });

  return Response.json(attachment, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const auth = await requireTaskAccess(taskId);
  if ('error' in auth) return authError(auth);

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get('attachmentId');

  if (!attachmentId) {
    return Response.json({ error: 'attachmentId query param is required' }, { status: 400 });
  }

  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.taskId !== taskId) {
    return Response.json({ error: 'Attachment not found' }, { status: 404 });
  }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } });

  return Response.json({ ok: true });
}
