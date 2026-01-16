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
  | 'pre-algebra'
  | 'algebra'
  | 'geometry';

export const TOPICS: Topic[] = [
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'fractions',
  'decimals',
  'percentages',
  'word-problems',
  'pre-algebra',
  'algebra',
  'geometry',
];

export const TOPIC_LABELS: Record<Topic, string> = {
  'addition': 'Addition',
  'subtraction': 'Subtraction',
  'multiplication': 'Multiplication',
  'division': 'Division',
  'fractions': 'Fractions',
  'decimals': 'Decimals',
  'percentages': 'Percentages',
  'word-problems': 'Word Problems',
  'pre-algebra': 'Pre-Algebra',
  'algebra': 'Algebra',
  'geometry': 'Geometry',
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

// Session configuration
export interface SessionConfig {
  theme: Theme;
  customTheme?: string;
  gradeLevel?: GradeLevel; // Optional - used when not selecting topics
  topics?: Topic[]; // Optional - used when selecting specific topics (mutually exclusive with gradeLevel)
  topicDifficulties?: TopicDifficultySettings; // Difficulty settings per topic
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
  sessionType: SessionType;
  sessionValue: number; // question count or minutes
  mode: SessionMode;
  startedAt: Date;
  endedAt?: Date;
  totalCorrect: number;
  totalAttempted: number;
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

export function getKeypadConfig(gradeLevel?: GradeLevel, topics?: Topic[]): KeypadConfig {
  // If topics are selected, show all keypad options
  if (topics && topics.length > 0) {
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
