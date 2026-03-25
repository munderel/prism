import type { ChatMessage } from './openrouter';

/**
 * Breaks a book into reading groups with quiz points.
 */
export function bookBreakdownPrompt(title: string, description?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are a training curriculum designer. You break books into structured reading plans with reading groups and quiz checkpoints. Always respond with valid JSON only, no extra commentary.',
    },
    {
      role: 'user',
      content: `Break down the following book into reading groups with quiz points.

Book title: ${title}
${description ? `Description: ${description}` : ''}

Return JSON in this format:
{
  "title": "string",
  "totalChapters": number,
  "readingGroups": [
    {
      "groupNumber": number,
      "label": "string (e.g. 'Chapters 1-3')",
      "chapterStart": number,
      "chapterEnd": number,
      "summary": "string (1-2 sentence overview of this section)",
      "estimatedMinutes": number,
      "quizAfter": true
    }
  ],
  "quizPoints": [
    {
      "afterGroup": number,
      "focusTopics": ["string"]
    }
  ]
}`,
    },
  ];
}

/**
 * Breaks a course into modules and lessons.
 */
export function courseBreakdownPrompt(title: string, syllabus?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are a training curriculum designer. You structure courses into modules and lessons with clear learning outcomes. Always respond with valid JSON only, no extra commentary.',
    },
    {
      role: 'user',
      content: `Break down the following course into modules and lessons.

Course title: ${title}
${syllabus ? `Syllabus / description:\n${syllabus}` : ''}

Return JSON in this format:
{
  "title": "string",
  "totalModules": number,
  "modules": [
    {
      "moduleNumber": number,
      "title": "string",
      "description": "string",
      "lessons": [
        {
          "lessonNumber": number,
          "title": "string",
          "objective": "string",
          "estimatedMinutes": number
        }
      ],
      "quizAfter": true
    }
  ]
}`,
    },
  ];
}

/**
 * Generates 5 comprehension questions for a given material and chapter range.
 */
export function quizGenerationPrompt(material: string, chapterRange: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an assessment expert. You create comprehension quiz questions that test understanding, not just recall. Always respond with valid JSON only, no extra commentary.',
    },
    {
      role: 'user',
      content: `Generate 5 comprehension questions for the following material.

Material: ${material}
Chapter range: ${chapterRange}

Return JSON in this format:
{
  "material": "string",
  "chapterRange": "string",
  "questions": [
    {
      "id": number,
      "question": "string",
      "type": "multiple_choice" | "short_answer",
      "options": ["string"] | null,
      "correctAnswer": "string",
      "explanation": "string (why this is the correct answer)"
    }
  ]
}

Include a mix of multiple-choice (with 4 options) and short-answer questions.`,
    },
  ];
}

/**
 * Grades user answers with feedback.
 */
export function quizCheckPrompt(
  questions: { id: number; question: string; correctAnswer: string }[],
  userAnswers: { id: number; answer: string }[]
): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an assessment grader. You evaluate answers fairly, provide constructive feedback, and identify areas for improvement. Always respond with valid JSON only, no extra commentary.',
    },
    {
      role: 'user',
      content: `Grade the following quiz answers.

Questions and correct answers:
${JSON.stringify(questions, null, 2)}

User answers:
${JSON.stringify(userAnswers, null, 2)}

Return JSON in this format:
{
  "totalQuestions": number,
  "correctCount": number,
  "score": number,
  "results": [
    {
      "questionId": number,
      "correct": boolean,
      "userAnswer": "string",
      "correctAnswer": "string",
      "feedback": "string (explain why right or wrong, encourage learning)"
    }
  ],
  "overallFeedback": "string (summary of performance and study suggestions)"
}`,
    },
  ];
}

/**
 * Decomposes a task/goal into clear sub-steps (power-down decomposition).
 */
export function clearGoalsPrompt(title: string, description?: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are a goal decomposition expert. You break vague or large goals into clear, actionable sub-steps that can each be completed in a single sitting. Always respond with valid JSON only, no extra commentary.',
    },
    {
      role: 'user',
      content: `Decompose the following goal into clear, actionable sub-steps.

Goal title: ${title}
${description ? `Description: ${description}` : ''}

Return JSON in this format:
{
  "originalGoal": "string",
  "subSteps": [
    {
      "stepNumber": number,
      "title": "string (short, action-oriented)",
      "description": "string (what specifically to do)",
      "estimatedMinutes": number,
      "deliverable": "string (what marks this step as done)"
    }
  ],
  "totalEstimatedMinutes": number
}`,
    },
  ];
}

/**
 * Suggests daily tasks for a weekly goal based on existing tasks.
 */
export function taskSuggestionPrompt(
  weeklyGoal: string,
  existingTasks: string[]
): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are a productivity coach. You suggest concrete daily tasks that move a weekly goal forward, avoiding duplication with existing tasks. Always respond with valid JSON only, no extra commentary.',
    },
    {
      role: 'user',
      content: `Suggest daily tasks to achieve the following weekly goal.

Weekly goal: ${weeklyGoal}

Existing tasks already planned:
${existingTasks.length > 0 ? existingTasks.map((t, i) => `${i + 1}. ${t}`).join('\n') : '(none)'}

Return JSON in this format:
{
  "weeklyGoal": "string",
  "suggestedTasks": [
    {
      "title": "string",
      "description": "string",
      "estimatedMinutes": number,
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "suggestedDay": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday"
    }
  ]
}

Suggest 3-5 tasks. Do not duplicate existing tasks. Spread tasks across the work week.`,
    },
  ];
}
