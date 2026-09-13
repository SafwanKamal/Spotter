import assert from "node:assert/strict";
import test from "node:test";
import { rankSocialPosts, SOCIAL_POSTS, totalVotes } from "../src/lib/social";

test("social feed ranks top posts without mutating its source", () => {
  const original = SOCIAL_POSTS.map((post) => post.id);
  const ranked = rankSocialPosts(SOCIAL_POSTS, "top", new Set());

  assert.deepEqual(
    ranked.map((post) => post.id),
    ["bracing-before-depth", "deadlift-wedge", "ankle-prep"],
  );
  assert.deepEqual(
    SOCIAL_POSTS.map((post) => post.id),
    original,
  );
});

test("a local upvote adds exactly one vote", () => {
  const post = SOCIAL_POSTS[0];
  assert.equal(totalVotes(post, new Set()), post.baseVotes);
  assert.equal(totalVotes(post, new Set([post.id])), post.baseVotes + 1);
});

test("latest sorting uses published timestamps", () => {
  const ranked = rankSocialPosts(SOCIAL_POSTS, "latest", new Set());
  assert.deepEqual(
    ranked.map((post) => post.id),
    ["bracing-before-depth", "deadlift-wedge", "ankle-prep"],
  );
});
