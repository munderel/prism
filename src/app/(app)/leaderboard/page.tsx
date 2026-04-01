'use client';

import { Trophy, Flame, CheckCircle2, Star, Target } from 'lucide-react';
import { m } from 'framer-motion';
import useSWR from 'swr';

const RANK_COLORS = ['text-yellow-400', 'text-gray-400', 'text-orange-400'] as const;

function getRankColor(index: number): string {
  return RANK_COLORS[index] ?? 'text-[var(--text-secondary)]';
}

export default function LeaderboardPage() {
  const { data: raw, isLoading } = useSWR('/api/leaderboard');
  const leaderboard = raw?.leaderboard ?? [];
  const publicWins = raw?.publicWins ?? [];

  if (isLoading) return <div className="text-[var(--text-muted)] py-12 text-center">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" />
          Leaderboard
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rankings */}
        <div className="lg:col-span-2 space-y-3">
          {leaderboard.map((user: any, i: number) => (
            <m.div
              key={user.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 glass-panel px-5 py-4"
            >
              <span className={`text-2xl font-bold ${getRankColor(i)}`}>
                #{i + 1}
              </span>

              {user.image ? (
                <img src={user.image} alt="" className="h-10 w-10 rounded-full" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-[var(--border-color)] flex items-center justify-center text-[var(--text-primary)] font-bold">
                  {user.name?.[0] ?? '?'}
                </div>
              )}

              <div className="flex-1">
                <span className="text-[var(--text-primary)] font-medium">{user.name}</span>
                <div className="flex items-center gap-4 mt-1 text-xs text-[var(--text-muted)]">
                  <span className="flex items-center gap-1">
                    <Flame className="h-3 w-3 text-yellow-400" />
                    {user.streak} day streak
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-400" />
                    {user.tasksCompleted} tasks
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-purple-400" />
                    {user.reviewsCompleted} reviews
                  </span>
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-teal-400" />
                    {user.aimScore ?? 0} aim pts
                  </span>
                </div>
              </div>

              <span className="text-lg font-bold text-indigo-400">{user.score}</span>
            </m.div>
          ))}
        </div>

        {/* Public Wins feed */}
        <div className="lg:col-span-1">
          <div className="glass-panel p-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" />
              Recent Wins
            </h3>
            <div className="space-y-3">
              {publicWins.map((win: any) => (
                <m.div
                  key={win.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-lg bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {win.user?.image ? (
                      <img src={win.user.image} alt="" className="h-5 w-5 rounded-full" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-[var(--border-color)]" />
                    )}
                    <span className="text-xs font-medium text-[var(--text-secondary)]">{win.user?.name}</span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">{win.message}</p>
                  {win.goal && (
                    <p className="text-xs text-indigo-400 mt-1">{win.goal.title}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {new Date(win.createdAt).toLocaleDateString()}
                  </p>
                </m.div>
              ))}
              {publicWins.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No wins yet. Complete tasks to earn them!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
