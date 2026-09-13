import { test } from "node:test";
import assert from "node:assert/strict";
import { authDisplayName, toPublicAuthUser } from "../src/lib/auth-user";

test("toPublicAuthUser keeps a display name and email", () => {
  assert.deepEqual(
    toPublicAuthUser({
      sub: "auth0|1",
      name: "Alex",
      nickname: "a",
      email: "alex@example.com",
    }),
    { name: "Alex", email: "alex@example.com" },
  );
});

test("toPublicAuthUser falls back to nickname and ignores empty sessions", () => {
  assert.equal(toPublicAuthUser(null), null);
  assert.deepEqual(toPublicAuthUser({ sub: "auth0|2", nickname: "jordan" }), {
    name: "jordan",
    email: null,
  });
  assert.equal(
    authDisplayName({ name: null, email: "sam@example.com" }),
    "sam@example.com",
  );
});
