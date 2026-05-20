'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { WorkBlockEditor } from '@/components/calendar/WorkBlockEditor';
import { Loader2, AlertTriangle } from 'lucide-react';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) {
      const err = new Error('Failed to fetch work block') as Error & { status: number };
      err.status = r.status;
      throw err;
    }
    return r.json();
  });

export default function WorkBlockEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: workBlock, error, isLoading } = useSWR(
    id ? `/api/work-blocks/${id}` : null,
    fetcher
  );

  const handleClose = () => router.back();
  const handleSave = () => router.back();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error) {
    const status = (error as Error & { status?: number }).status;
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-10 w-10 text-red-400" />
          <p className="text-[var(--text-primary)] font-semibold">
            {status === 404
              ? 'Work block not found'
              : status === 403
              ? "You don't have access to this work block"
              : 'Failed to load work block'}
          </p>
          <button
            onClick={() => router.back()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <WorkBlockEditor
        workBlock={workBlock}
        fullPage
        onClose={handleClose}
        onSave={handleSave}
      />
    </div>
  );
}
