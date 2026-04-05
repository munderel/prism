import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCompletionToken, getBaseUrl } from '@/lib/completion-token';
import { htmlResponse as html } from '@/lib/html-response';

const htmlResponse = (body: string, status = 200) => html(body, 'Task Completion', status);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;
  const { searchParams } = request.nextUrl;
  const token = searchParams.get('token');
  const userId = searchParams.get('userId');

  if (!token || !userId) {
    return htmlResponse(
      `<div class="icon">&#10060;</div>
       <h1>Missing Parameters</h1>
       <p>The completion link is invalid. Please try again from your calendar event.</p>`,
      400,
    );
  }

  const isValid = (() => {
    try { return verifyCompletionToken(taskId, userId, token); }
    catch { return false; }
  })();

  if (!isValid) {
    return htmlResponse(
      `<div class="icon">&#128274;</div>
       <h1>Unauthorized</h1>
       <p>This completion link is invalid or has been tampered with.</p>`,
      403,
    );
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task) {
    return htmlResponse(
      `<div class="icon">&#10067;</div>
       <h1>Task Not Found</h1>
       <p>This task no longer exists.</p>`,
      404,
    );
  }

  if (task.ownerId !== userId) {
    return htmlResponse(
      `<div class="icon">&#128274;</div>
       <h1>Unauthorized</h1>
       <p>You are not the owner of this task.</p>`,
      403,
    );
  }

  if (task.status === 'DONE') {
    return htmlResponse(
      `<div class="icon">&#9989;</div>
       <h1>Task Was Already Completed</h1>
       <p>This task was marked as done on ${task.completedAt ? task.completedAt.toLocaleDateString() : 'a previous date'}.</p>
       <a href="${getBaseUrl()}">Open Prism</a>`,
    );
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'DONE', completedAt: new Date() },
  });

  return htmlResponse(
    `<div class="icon">&#127881;</div>
     <h1>Task Marked Complete!</h1>
     <p>Nice work. This task has been marked as done.</p>
     <a href="${getBaseUrl()}">Open Prism</a>`,
  );
}
