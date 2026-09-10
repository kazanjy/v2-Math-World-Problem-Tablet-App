import type { GradeLevel, Theme, Topic, TopicDifficultySettings } from '../types';

// Shape of the parameters the client sends to the /api/generate-question
// serverless function. The prompt-building logic itself lives inside that
// function (api/generate-question.ts) so the function stays self-contained and
// doesn't import across the src/ boundary (which the Vercel runtime can't
// resolve).
export interface GenerateQuestionParams {
  theme: Theme;
  customTheme?: string;
  gradeLevel?: GradeLevel;
  topics?: Topic[];
  customTopics?: string[];
  topicDifficulties?: TopicDifficultySettings;
  previousQuestion?: string;
  previousGenre?: string;
  previousSubTopic?: string;
  recentSubTopics?: string[];
  selectedTopic?: string;
  isRetry?: boolean;
  retryGenre?: string;
  retrySubTopic?: string;
}
