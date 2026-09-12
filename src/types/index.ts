// Theme options for word problems
export type Theme =
  | 'football'
  | 'baseball'
  | 'princesses'
  | 'pokemon'
  | 'minecraft'
  | 'lego'
  | 'standard'
  | 'custom';

export const THEME_LABELS: Record<Theme, string> = {
  football: 'Football',
  baseball: 'Baseball',
  princesses: 'Princesses',
  pokemon: 'Pokémon',
  minecraft: 'Minecraft',
  lego: 'Lego',
  standard: 'Standard',
  custom: 'Custom',
};

// Grade levels K-12
export type GradeLevel = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';

export const GRADE_LEVELS: GradeLevel[] = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

// Math topics
export type Topic =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'fractions'
  | 'decimals'
  | 'percentages'
  | 'word-problems'
  | 'integers'
  | 'exponents-roots'
  | 'statistics'
  | 'pre-algebra'
  | 'algebra'
  | 'geometry'
  | 'trigonometry'
  | 'pre-calculus'
  | 'calculus';

export const TOPICS: Topic[] = [
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'fractions',
  'decimals',
  'percentages',
  'integers',
  'exponents-roots',
  'statistics',
  'word-problems',
  'pre-algebra',
  'algebra',
  'geometry',
  'trigonometry',
  'pre-calculus',
  'calculus',
];

export const TOPIC_LABELS: Record<Topic, string> = {
  'addition': 'Addition',
  'subtraction': 'Subtraction',
  'multiplication': 'Multiplication',
  'division': 'Division',
  'fractions': 'Fractions',
  'decimals': 'Decimals',
  'percentages': 'Percentages',
  'integers': 'Integers',
  'exponents-roots': 'Exponents & Roots',
  'statistics': 'Statistics & Probability',
  'word-problems': 'Word Problems',
  'pre-algebra': 'Pre-Algebra',
  'algebra': 'Algebra',
  'geometry': 'Geometry',
  'trigonometry': 'Trigonometry',
  'pre-calculus': 'Pre-Calculus',
  'calculus': 'Calculus',
};

// Difficulty levels returned by OpenAI
export type Difficulty = 'easy' | 'medium' | 'hard' | 'super-hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'super-hard'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  'easy': 'E',
  'medium': 'M',
  'hard': 'H',
  'super-hard': 'SH',
};

export const DIFFICULTY_FULL_LABELS: Record<Difficulty, string> = {
  'easy': 'Easy',
  'medium': 'Medium',
  'hard': 'Hard',
  'super-hard': 'Super Hard',
};

// Topic difficulty settings - which difficulties are enabled for each topic
export type TopicDifficultySettings = Record<Topic, Difficulty[]>;

// Session type: fixed number of questions or timed
export type SessionType = 'count' | 'timed';

// Session mode: chill (can finish question after time) or race (hard stop)
export type SessionMode = 'chill' | 'race';

// Question presentation: a word problem/story, or a bare numerical expression.
export type QuestionFormat = 'word' | 'numerical';

export const QUESTION_FORMATS: QuestionFormat[] = ['word', 'numerical'];

export const QUESTION_FORMAT_LABELS: Record<QuestionFormat, string> = {
  word: 'Word Problems',
  numerical: 'Numerical Problems',
};

export const QUESTION_FORMAT_DESCRIPTIONS: Record<QuestionFormat, string> = {
  word: 'Story-based problems with a theme',
  numerical: 'Just the equation, e.g. 936 ÷ 24 = ?',
};

// Session configuration
export interface SessionConfig {
  theme: Theme;
  customTheme?: string;
  gradeLevel?: GradeLevel; // Optional - used when not selecting topics
  topics?: Topic[]; // Optional - used when selecting specific topics (mutually exclusive with gradeLevel)
  customTopics?: string[]; // Optional - free-text topics entered by the user (topics mode)
  topicDifficulties?: TopicDifficultySettings; // Difficulty settings per topic
  questionFormats?: QuestionFormat[]; // Which presentation styles to draw from (defaults to word)
  sessionType: SessionType;
  questionCount?: number;
  timeMinutes?: number;
  mode: SessionMode;
}

// Question from OpenAI
export interface GeneratedQuestion {
  question: string;
  answer: string;
  explanation: string;
  genre: string;
  subTopic: string;
  difficulty: Difficulty;
}

// Question record in session
export interface Question {
  id: string;
  sessionId: string;
  questionText: string;
  correctAnswer: string;
  explanation: string;
  genre: string;
  subTopic: string;
  difficulty: Difficulty;
  userAnswer?: string;
  isCorrect?: boolean;
  timeSpentSeconds?: number;
  questionOrder: number;
  createdAt: Date;
}

// Session record
export interface Session {
  id: string;
  userId: string;
  theme: Theme;
  customTheme?: string;
  gradeLevel?: GradeLevel;
  topics?: Topic[];
  customTopics?: string[]; // Free-text topics entered by the user (topics mode)
  topicDifficulties?: TopicDifficultySettings; // Per-topic difficulty settings (topics mode)
  questionFormats?: QuestionFormat[]; // Which presentation styles were used
  sessionType: SessionType;
  sessionValue: number; // question count or minutes
  mode: SessionMode;
  startedAt: Date;
  endedAt?: Date;
  totalCorrect: number;
  totalAttempted: number;
}

// Rebuild a session configuration from a past session record, so a previous
// session can be re-run with the exact same settings.
export function sessionToConfig(session: Session): SessionConfig {
  return {
    theme: session.theme,
    customTheme: session.customTheme,
    gradeLevel: session.gradeLevel,
    topics: session.topics,
    customTopics: session.customTopics,
    topicDifficulties: session.topicDifficulties,
    questionFormats: session.questionFormats,
    sessionType: session.sessionType,
    questionCount: session.sessionType === 'count' ? session.sessionValue : undefined,
    timeMinutes: session.sessionType === 'timed' ? session.sessionValue : undefined,
    mode: session.mode,
  };
}

// User profile
export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
}

// Keypad configuration based on grade level or topics
export interface KeypadConfig {
  showDecimal: boolean;
  showNegative: boolean;
  showFraction: boolean;
}

export function getKeypadConfig(gradeLevel?: GradeLevel, topics?: Topic[], customTopics?: string[]): KeypadConfig {
  // If any topics (preset or custom) are selected, show all keypad options
  if ((topics && topics.length > 0) || (customTopics && customTopics.length > 0)) {
    return {
      showDecimal: true,
      showNegative: true,
      showFraction: true,
    };
  }

  // Otherwise, base it on grade level
  const gradeNum = !gradeLevel ? 3 : (gradeLevel === 'K' ? 0 : parseInt(gradeLevel));
  return {
    showDecimal: gradeNum >= 3,
    showNegative: gradeNum >= 6,
    showFraction: gradeNum >= 3,
  };
}
