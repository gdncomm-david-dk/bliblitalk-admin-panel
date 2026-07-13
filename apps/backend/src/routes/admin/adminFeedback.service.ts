import { Attendance, RegistrationStatus } from "@repo/shared-types";
import type {
  AdminEventFeedbackDTO,
  AdminFeedbackCommentDTO,
  FeedbackDimensionAverages,
  StarDistributionEntry,
  WordCloudEntry,
} from "@repo/shared-types";
import { prisma } from "../../db/client";
import { AppError } from "../../middleware/error";

// Common English filler words excluded from the word cloud so it highlights topics,
// not grammar — there's no NLP library in this stack, just frequency counting.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "was", "were", "have", "has", "had",
  "not", "very", "really", "would", "could", "session", "event", "great", "good",
  "more", "much", "just", "also", "but", "are", "you", "your", "our", "all", "some",
  "than", "into", "about", "will", "can", "such",
]);

function extractWordCloud(comments: string[]): WordCloudEntry[] {
  const counts = new Map<string, number>();
  for (const text of comments) {
    const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
    for (const word of words) {
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({ word, count }));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/** Feedback aggregate for the event workspace's Feedback tab. */
export async function getEventFeedback(eventId: string): Promise<AdminEventFeedbackDTO> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new AppError("NOT_FOUND", "Event not found", 404);

  const [feedbacks, presentCount] = await Promise.all([
    prisma.feedback.findMany({
      where: { eventId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.registration.count({
      where: {
        eventId,
        attendance: Attendance.PRESENT,
        status: { notIn: [RegistrationStatus.CANCELLED, RegistrationStatus.REJECTED] },
      },
    }),
  ]);

  const responses = feedbacks.length;
  const completionRate = presentCount > 0 ? Math.round((responses / presentCount) * 100) : 0;

  const averages: FeedbackDimensionAverages = {
    overall: average(feedbacks.map((f) => f.overallRating)),
    topic: average(feedbacks.map((f) => f.topicRating)),
    qna: average(feedbacks.map((f) => f.qnaRating)),
    content: average(feedbacks.map((f) => f.contentRating)),
    speaker: average(feedbacks.map((f) => f.speakerRating)),
    venue: average(feedbacks.map((f) => f.venueRating)),
    timing: average(feedbacks.map((f) => f.timingRating)),
  };

  const recommenders = feedbacks.filter((f) => f.npsScore >= 9).length;
  const recommendationRate = responses > 0 ? Math.round((recommenders / responses) * 100) : 0;

  // Bucket 1-10 overall ratings into 1-5 stars, then present 5 -> 1 (★★★★★ down to ★).
  const starBuckets = [0, 0, 0, 0, 0];
  for (const f of feedbacks) {
    const stars = Math.min(5, Math.max(1, Math.round(f.overallRating / 2)));
    starBuckets[stars - 1]! += 1;
  }
  const starDistribution: StarDistributionEntry[] = starBuckets
    .map((count, i) => ({ stars: i + 1, count }))
    .reverse();

  const wordCloud = extractWordCloud(
    feedbacks.map((f) => f.comments).filter((c): c is string => Boolean(c)),
  );

  const comments: AdminFeedbackCommentDTO[] = feedbacks
    .filter((f) => f.comments)
    .map((f) => ({
      id: f.id,
      userName: f.user.name,
      overallRating: f.overallRating,
      comments: f.comments,
      takeaway: f.takeaway,
      createdAt: f.createdAt.toISOString(),
    }));

  return { responses, completionRate, averages, recommendationRate, starDistribution, wordCloud, comments };
}
