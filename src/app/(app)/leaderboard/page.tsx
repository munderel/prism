'use client';

import { useState, useEffect } from 'react';
import { Trophy, Flame, CheckCircle2, Star } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LeaderboardPage() {
  const [data, setData] = useState<any>({ leaderboard: [], publicWins: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-400" />
          Leaderboard
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rankings */}
        <div className="lg:col-span-2 space-y-3">
          {data.leaderboard.map((user: any, i: number) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-4"
            >
              <span className={`text-2xl font-bold ${
                i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-gray-600'
              }`}>
                #{i + 1}
              </span>

              {user.image ? (
                <img src={user.image} alt="" className="h-10 w-10 rounded-full" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                  {user.name?.[0] ?? '?'}
                </div>
              )}

              <div className="flex-1">
                <span className="text-white font-medium">{user.name}</span>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
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
                </div>
              </div>

              <span className="text-lg font-bold text-indigo-400">{user.score}</span>
            </motion.div>
          ))}
        </div>

        {/* Public Wins feed */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" />
              Recent Wins
            </h3>
            <div className="space-y-3">
              {data.publicWins.map((win: any) => (
                <motion.div
                  key={win.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="rounded-lg bg-gray-800/50 p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {win.user?.image ? (
                      <img src={win.user.image} alt="" className="h-5 w-5 rounded-full" />
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-gray-700" />
                    )}
                    <span className="text-xs font-medium text-gray-300">{win.user?.name}</span>
                  </div>
                  <p className="text-sm text-white">{win.message}</p>
                  {win.goal && (
                    <p className="text-xs text-indigo-400 mt-1">{win.goal.title}</p>
                  )}
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(win.createdAt).toLocaleDateString()}
                  </p>
                </motion.div>
              ))}
              {data.publicWins.length === 0 && (
                <p className="text-xs text-gray-600">No wins yet. Complete tasks to earn them!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
