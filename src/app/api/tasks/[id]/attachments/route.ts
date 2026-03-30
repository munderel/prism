import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTaskAccess, authError } from '@/lib/auth-guard';
import { parseBody, createAttachmentSchema } from '@/lib/schemas';
import { validateFileUrl } from '@/lib/url-validation';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'audio/mpeg',
  'application/zip',
]);

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

  const parsed = await parseBody(request, createAttachmentSchema);
  if ('error' in parsed) return parsed.error;
  const { fileName, fileUrl, fileSize, mimeType } = parsed.data;

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return Response.json(
      { error: `Unsupported file type: ${mimeType}` },
      { status: 400 }
    );
  }

  const urlResult = validateFileUrl(fileUrl);
  if ('error' in urlResult) {
    return Response.json({ error: urlResult.error }, { status: 400 });
  }

  const attachment = await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName,
      fileUrl: urlResult.url,
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
