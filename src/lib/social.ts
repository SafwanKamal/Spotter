export type SocialSort = "trending" | "top" | "latest";

export type SocialExercise = "Squat" | "Deadlift" | "Mobility";

export type TrainerProfile = {
  name: string;
  handle: string;
  specialty: string;
  initials: string;
};

export type SocialPost = {
  id: string;
  trainer: TrainerProfile;
  publishedAt: string;
  title: string;
  caption: string;
  exercise: SocialExercise;
  duration: string;
  tip: string;
  baseVotes: number;
};

export const SOCIAL_POSTS: SocialPost[] = [
  {
    id: "bracing-before-depth",
    trainer: {
      name: "Maya Chen",
      handle: "@coachmaya",
      specialty: "Strength foundations",
      initials: "MC",
    },
    publishedAt: "2026-09-12T15:20:00-05:00",
    title: "Brace before you chase depth",
    caption:
      "A repeatable front squat starts before the descent. Set your breath and torso, then let the knees and hips move together.",
    exercise: "Squat",
    duration: "0:24",
    tip: "Compare the torso position at the start and at the lowest point instead of judging depth alone.",
    baseVotes: 482,
  },
  {
    id: "deadlift-wedge",
    trainer: {
      name: "Andre Brooks",
      handle: "@andrebuilds",
      specialty: "Barbell technique",
      initials: "AB",
    },
    publishedAt: "2026-09-11T18:10:00-05:00",
    title: "Use the floor before the bar leaves it",
    caption:
      "Think about pushing the floor away. The bar should begin moving as your whole position rises—not after your hips have already changed height.",
    exercise: "Deadlift",
    duration: "0:31",
    tip: "Pause the clip at lift-off and check whether shoulders and hips begin rising together.",
    baseVotes: 391,
  },
  {
    id: "ankle-prep",
    trainer: {
      name: "Nia Alvarez",
      handle: "@movebynia",
      specialty: "Mobility and warm-ups",
      initials: "NA",
    },
    publishedAt: "2026-09-10T07:45:00-05:00",
    title: "A two-minute ankle check before squats",
    caption:
      "Use this as a readiness check, not a flexibility contest. Keep the heel down and notice whether one side feels meaningfully different.",
    exercise: "Mobility",
    duration: "0:42",
    tip: "Record both sides from the same distance so the comparison is useful.",
    baseVotes: 276,
  },
];

export function totalVotes(post: SocialPost, votes: ReadonlySet<string>) {
  return post.baseVotes + (votes.has(post.id) ? 1 : 0);
}

export function rankSocialPosts(
  posts: readonly SocialPost[],
  sort: SocialSort,
  votes: ReadonlySet<string>,
) {
  return [...posts].sort((left, right) => {
    if (sort === "latest")
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    const voteDifference = totalVotes(right, votes) - totalVotes(left, votes);
    if (voteDifference !== 0) return voteDifference;
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });
}
