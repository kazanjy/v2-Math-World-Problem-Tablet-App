// Theme options for word problems
export type Theme =
  | 'football'
  | 'baseball'
  | 'princesses'
  | 'pokemon'
  | 'minecraft'
  | 'standard'
  | 'custom';

export const THEME_LABELS: Record<Theme, string> = {
  football: 'Football',
  baseball: 'Baseball',
  princesses: 'Princesses',
  pokemon: 'Pokémon',
  minecraft: 'Minecraft',
  standard: 'Standard',
  custom: 'Custom',
};

// Grade levels K-12
export type GradeLevel = 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';

export const GRADE_LEVELS: GradeLevel[] = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

// Session type: fixed number of questions or timed
export type SessionType = 'count' | 'timed';

// Session mode: chill (can finish question after time) or race (hard stop)
export type SessionMode = 'chill' | 'race';

// Session configuration
export interface SessionConfig {
  theme: Theme;
  customTheme?: string;
  gradeLevel: GradeLevel;
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
}

// Question record in session
export interface Question {
  id: string;
  sessionId: string;
  questionText: string;
  correctAnswer: string;
  explanation: string;
  genre: string;
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
  gradeLevel: GradeLevel;
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

// Keypad configuration based on grade level
export interface KeypadConfig {
  showDecimal: boolean;
  showNegative: boolean;
  showFraction: boolean;
}

export function getKeypadConfig(gradeLevel: GradeLevel): KeypadConfig {
  const gradeNum = gradeLevel === 'K' ? 0 : parseInt(gradeLevel);
  return {
    showDecimal: gradeNum >= 3,
    showNegative: gradeNum >= 6,
    showFraction: gradeNum >= 3,
  };
}
