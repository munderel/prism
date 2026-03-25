'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import { m } from 'framer-motion';
import { Building2, User, Target } from 'lucide-react';

const GoalStackTree = dynamic(
  () => import('@/components/goals/GoalStackTree').then((mod) => ({ default: mod.GoalStackTree })),
  { loading: () => <div className="text-gray-500 py-8 text-center">Loading...</div> }
);
import { YamlImportExport } from '@/components/goals/YamlImportExport';

export default function GoalsPage() {
  const { data: session } = useSession();
  const { data: stacksData, isLoading, mutate: mutateStacks } = useSWR('/api/stacks');
  const stacks = useMemo(() => (Array.isArray(stacksData) ? stacksData : []), [stacksData]);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStackName, setNewStackName] = useState('');

  const isAdmin = session?.user?.isAdmin ?? false;

  // Auto-select first stack when data loads
  useEffect(() => {
    if (stacks.length > 0 && !selectedStackId) {
      setSelectedStackId(stacks[0].id);
    }
  }, [stacks, selectedStackId]);

  const selectedStack = stacks.find((s) => s.id === selectedStackId);

  const handleCreateStack = () => {
    setShowCreateForm(true);
  };

  const handleSubmitCreate = async () => {
    const name = newStackName.trim();
    if (!name) return;

    const res = await fetch('/api/stacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (res.ok) {
      const stack = await res.json();
      setNewStackName('');
      setShowCreateForm(false);
      await mutateStacks();
      setSelectedStackId(stack.id);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to create stack');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading stacks...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
          <Target className="h-6 w-6 text-prism-indigo" />
          Goal Stack
        </h1>
        {selectedStack && (
          <YamlImportExport
            stackId={selectedStack.id}
            stackName={selectedStack.name}
            onImportComplete={() => {
              setTreeRefreshKey((k) => k + 1);
            }}
          />
        )}
      </div>

      {/* Stack tabs */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
        {stacks.map((stack) => (
          <button
            key={stack.id}
            onClick={() => setSelectedStackId(stack.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              selectedStackId === stack.id
                ? 'bg-prism-indigo/15 text-prism-indigo border border-prism-indigo/25'
                : 'text-gray-400 border border-white/[0.06] hover:border-white/[0.1] hover:text-white'
            }`}
          >
            {stack.isCompany ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
            {stack.name}
            <span className="text-xs text-gray-600">({stack._count?.goals ?? 0})</span>
          </button>
        ))}
        <button
          onClick={handleCreateStack}
          className="rounded-lg border border-dashed border-gray-700 px-4 py-2 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
        >
          + New Stack
        </button>
      </div>

      {/* Inline create form */}
      {showCreateForm && (
        <div className="mb-6 glass-panel p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Create New Stack</h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newStackName}
              onChange={(e) => setNewStackName(e.target.value)}
              placeholder="Stack name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmitCreate();
                if (e.key === 'Escape') { setShowCreateForm(false); setNewStackName(''); }
              }}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-white text-sm focus:border-prism-indigo focus:outline-none"
            />
            <button
              onClick={handleSubmitCreate}
              disabled={!newStackName.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewStackName(''); }}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      {selectedStack ? (
        <m.div
          key={`${selectedStackId}-${treeRefreshKey}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <GoalStackTree
            stackId={selectedStack.id}
            isCompanyStack={selectedStack.isCompany}
            isAdmin={isAdmin}
          />
        </m.div>
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-4">
            No goal stacks yet. Create one to get started!
          </p>
          <button
            onClick={handleCreateStack}
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Create Your First Stack
          </button>
        </div>
      )}
    </div>
  );
}
