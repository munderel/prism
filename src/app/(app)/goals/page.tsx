'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Building2, User, Target } from 'lucide-react';
import { GoalStackTree } from '@/components/goals/GoalStackTree';
import { YamlImportExport } from '@/components/goals/YamlImportExport';

export default function GoalsPage() {
  const { data: session } = useSession();
  const [stacks, setStacks] = useState<any[]>([]);
  const [selectedStackId, setSelectedStackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.user?.isAdmin ?? false;

  const fetchStacks = async () => {
    const res = await fetch('/api/stacks');
    if (res.ok) {
      const data = await res.json();
      setStacks(data);
      if (data.length > 0 && !selectedStackId) {
        setSelectedStackId(data[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStack = stacks.find((s) => s.id === selectedStackId);

  const handleCreateStack = async () => {
    const name = prompt('Stack name:');
    if (!name) return;

    const res = await fetch('/api/stacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (res.ok) {
      const stack = await res.json();
      await fetchStacks();
      setSelectedStackId(stack.id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading stacks...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target className="h-6 w-6 text-indigo-400" />
          Goal Stack
        </h1>
        {selectedStack && (
          <YamlImportExport
            stackId={selectedStack.id}
            stackName={selectedStack.name}
            onImportComplete={() => {
              // Force tree refresh by toggling stack
              const id = selectedStackId;
              setSelectedStackId(null);
              setTimeout(() => setSelectedStackId(id), 0);
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
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                : 'text-gray-400 border border-gray-800 hover:border-gray-700 hover:text-white'
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

      {/* Tree */}
      {selectedStack ? (
        <motion.div
          key={selectedStackId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <GoalStackTree
            stackId={selectedStack.id}
            isCompanyStack={selectedStack.isCompany}
            isAdmin={isAdmin}
          />
        </motion.div>
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
