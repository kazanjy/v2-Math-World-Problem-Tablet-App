import { createSession, saveQuestion, updateSession } from './supabase';
import { getLocalSessions, getLocalSessionQuestions, removeLocalSession } from './localStorage';

// Fuse everything from a local (pre-sign-in) session into the user's backend
// account: each local session is recreated under the real user (keeping its
// original start date), its questions are uploaded with answers/correctness,
// and its totals are set. Each session is removed from local storage as soon
// as it has been migrated, so a partial failure keeps only the leftovers for
// the next attempt and never produces duplicates.
export async function migrateLocalDataToSupabase(userId: string): Promise<{ migrated: number; failed: number }> {
  let migrated = 0;
  let failed = 0;

  for (const local of getLocalSessions()) {
    try {
      const created = await createSession({
        userId,
        theme: local.theme,
        customTheme: local.customTheme,
        gradeLevel: local.gradeLevel,
        topics: local.topics,
        customTopics: local.customTopics,
        topicDifficulties: local.topicDifficulties,
        questionFormats: local.questionFormats,
        sessionType: local.sessionType,
        sessionValue: local.sessionValue,
        mode: local.mode,
        startedAt: local.startedAt,
      });
      if (!created) {
        failed++;
        continue;
      }

      for (const q of getLocalSessionQuestions(local.id)) {
        await saveQuestion({
          sessionId: created.id,
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          genre: q.genre,
          subTopic: q.subTopic,
          difficulty: q.difficulty,
          userAnswer: q.userAnswer,
          isCorrect: q.isCorrect,
          timeSpentSeconds: q.timeSpentSeconds,
          questionOrder: q.questionOrder,
        });
      }

      await updateSession(created.id, {
        endedAt: local.endedAt,
        totalCorrect: local.totalCorrect,
        totalAttempted: local.totalAttempted,
      });

      removeLocalSession(local.id);
      migrated++;
    } catch (error) {
      console.error('Failed to migrate local session', local.id, error);
      failed++;
    }
  }

  return { migrated, failed };
}
