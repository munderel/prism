let idCounter = 1;
function nextId() {
  return `test-${idCounter++}`;
}

export function createGoal(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    title: 'Test Goal',
    description: '',
    level: 'STRATEGIC',
    status: 'IN_PROGRESS',
    progressPct: 50,
    parentId: null,
    stackId: 'stack-1',
    dueDate: null,
    sortOrder: 0,
    children: [],
    companyGoalLinks: [],
    ...overrides,
  };
}

export function createTask(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    title: 'Test Task',
    description: '',
    status: 'TODO',
    priority: 'MEDIUM',
    taskType: 'GOAL_STACK',
    dueDate: null,
    goalId: null,
    deliverable: null,
    recurrenceRule: null,
    timeBlockStart: null,
    timeBlockEnd: null,
    estimatedMinutes: 60,
    preferredTimeStart: null,
    preferredTimeEnd: null,
    isPinned: false,
    isAutoScheduled: false,
    goal: null,
    processExecution: null,
    _count: { comments: 0 },
    ...overrides,
  };
}

export function createStack(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    name: 'Test Stack',
    isCompany: false,
    ownerId: 'user-1',
    owner: { id: 'user-1', name: 'Test User' },
    _count: { goals: 0 },
    ...overrides,
  };
}

export function createComment(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    content: 'Test comment',
    authorId: 'user-1',
    author: { id: 'user-1', name: 'Test User', email: 'test@example.com', image: null },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMeeting(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    title: 'Test Meeting',
    description: '',
    cadence: 'WEEKLY',
    dayOfWeek: 1,
    timeStart: '09:00',
    timeEnd: '10:00',
    attendeeIds: [],
    createdById: 'user-1',
    ...overrides,
  };
}

export function createReview(overrides: Record<string, any> = {}) {
  return {
    id: nextId(),
    type: 'WEEKLY',
    checklistState: {},
    notes: '',
    completedAt: null,
    template: {
      checklistItems: ['Review goals', 'Plan next week', 'Update progress'],
      processSteps: [],
    },
    ...overrides,
  };
}

export function resetFixtureIds() {
  idCounter = 1;
}
