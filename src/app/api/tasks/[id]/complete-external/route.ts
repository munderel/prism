import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCompletionToken } from '@/lib/completion-token';

function htmlResponse(body: string, status = 200) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prism - Task Completion</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f8f9fa;
      color: #1a1a1a;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 2.5rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      text-align: center;
      max-width: 420px;
    }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0 0 1.5rem; font-size: 0.95rem; }
    a {
      display: inline-block;
      padding: 0.6rem 1.5rem;
      background: #2563eb;
      color: white;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 500;
    }
    a:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`,
    {
      status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
}

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
