'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import {
  Lightbulb,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle,
  XCircle,
  Zap,
  Archive,
} from 'lucide-react';

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const SORT_OPTIONS = [
  { value: 'iceScore', label: 'ICE Score' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
];

const statusColors: Record<string, string> = {
  SUBMITTED: 'text-blue-400 bg-blue-600/20 border-blue-600/30',
  UNDER_REVIEW: 'text-yellow-400 bg-yellow-600/20 border-yellow-600/30',
  APPROVED: 'text-green-400 bg-green-600/20 border-green-600/30',
  REJECTED: 'text-red-400 bg-red-600/20 border-red-600/30',
  CONVERTED: 'text-purple-400 bg-purple-600/20 border-purple-600/30',
  ARCHIVED: 'text-gray-400 bg-gray-600/20 border-gray-600/30',
};

export default function IdeasPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.isAdmin ?? false;

  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('iceScore');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build SWR key
  const sortParam = sortBy === 'oldest' ? 'createdAt' : sortBy === 'newest' ? 'createdAt' : 'iceScore';
  const swrKey = `/api/ideas?status=${statusFilter}&sort=${sortParam}&search=${encodeURIComponent(search)}&page=${page}&limit=20`;

  const { data, isLoading, mutate } = useSWR(swrKey);
  const ideas = data?.ideas ?? [];
  const totalPages = data?.totalPages ?? 1;

  // For "newest" we use createdAt desc (default), for "oldest" we need to reverse client-side
  const sortedIdeas = sortBy === 'oldest' ? [...ideas].reverse() : ideas;

  const updateStatus = useCallback(
    async (id: string, newStatus: string) => {
      const res = await fetch(`/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) mutate();
    },
    [mutate]
  );

  const convertToTask = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/ideas/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        router.push('/tasks');
      }
    },
    [router]
  );

  const selectClass =
    'rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-prism-indigo" />
          Ideas
        </h1>
        <Link
          href="/ideas/new"
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Idea
        </Link>
      </div>

      {/* Filter / Sort Bar */}
      <div className="glass-panel p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search ideas..."
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] pl-9 pr-3 py-2 text-[var(--text-primary)] text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Ideas List */}
      {isLoading ? (
        <div className="text-[var(--text-muted)] text-sm py-12 text-center">Loading ideas...</div>
      ) : sortedIdeas.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <p className="text-[var(--text-muted)]">No ideas found. Create one to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedIdeas.map((idea: any) => {
            const isExpanded = expandedId === idea.id;
            return (
              <div key={idea.id} className="glass-panel overflow-hidden">
                {/* Card Header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--hover-bg)] transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {idea.title}
                      </span>
                      {idea.process && (
                        <span className="text-xs text-[var(--text-muted)] truncate">
                          {idea.process.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                      <span>{idea.author?.name ?? 'Unknown'}</span>
                      <span>&middot;</span>
                      <span>{new Date(idea.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* ICE Score Badge */}
                  <span className="shrink-0 inline-flex items-center rounded-md border border-indigo-600/30 bg-indigo-600/20 px-2 py-0.5 text-xs font-semibold text-indigo-400">
                    ICE {idea.iceScore?.toFixed(1) ?? '—'}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                      statusColors[idea.status] ?? 'text-[var(--text-muted)]'
                    }`}
                  >
                    {idea.status.replace('_', ' ')}
                  </span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-color)] px-4 py-4">
                    {/* Description */}
                    <div className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap mb-4">
                      {idea.description}
                    </div>

                    {/* Scores */}
                    <div className="flex gap-4 mb-4 text-xs">
                      <span className="text-[var(--text-muted)]">
                        Impact: <span className="text-[var(--text-primary)] font-medium">{idea.impactScore}</span>
                      </span>
                      <span className="text-[var(--text-muted)]">
                        Confidence: <span className="text-[var(--text-primary)] font-medium">{idea.confidenceScore}</span>
                      </span>
                      <span className="text-[var(--text-muted)]">
                        Ease: <span className="text-[var(--text-primary)] font-medium">{idea.easeScore}</span>
                      </span>
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && idea.status !== 'CONVERTED' && (
                      <div className="flex flex-wrap gap-2">
                        {idea.status !== 'UNDER_REVIEW' && (
                          <button
                            onClick={() => updateStatus(idea.id, 'UNDER_REVIEW')}
                            className="flex items-center gap-1 rounded-lg border border-yellow-600/30 bg-yellow-600/10 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-600/20 transition-colors"
                          >
                            <Eye className="h-3 w-3" />
                            Review
                          </button>
                        )}
                        {idea.status !== 'APPROVED' && (
                          <button
                            onClick={() => updateStatus(idea.id, 'APPROVED')}
                            className="flex items-center gap-1 rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/20 transition-colors"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Approve
                          </button>
                        )}
                        {idea.status !== 'REJECTED' && (
                          <button
                            onClick={() => updateStatus(idea.id, 'REJECTED')}
                            className="flex items-center gap-1 rounded-lg border border-red-600/30 bg-red-600/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/20 transition-colors"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </button>
                        )}
                        <button
                          onClick={() => convertToTask(idea.id)}
                          className="flex items-center gap-1 rounded-lg border border-purple-600/30 bg-purple-600/10 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/20 transition-colors"
                        >
                          <Zap className="h-3 w-3" />
                          Convert to Task
                        </button>
                        {idea.status !== 'ARCHIVED' && (
                          <button
                            onClick={() => updateStatus(idea.id, 'ARCHIVED')}
                            className="flex items-center gap-1 rounded-lg border border-gray-600/30 bg-gray-600/10 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-600/20 transition-colors"
                          >
                            <Archive className="h-3 w-3" />
                            Archive
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && page < totalPages && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)] px-6 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--glass-border)] transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
