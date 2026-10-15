import assert from "node:assert/strict";
import test from "node:test";

import { validatePlayerIds } from "../src/validation.js";

test("requires player_ids", () => {
  assert.deepEqual(validatePlayerIds({}), {
    ok: false,
    error: "player_ids is required.",
  });
});

test("requires player_ids to be an array", () => {
  assert.equal(validatePlayerIds({ player_ids: "11604" }).ok, false);
});

test("rejects more than 100 IDs", () => {
  const result = validatePlayerIds({
    player_ids: Array.from({ length: 101 }, (_, index) => String(index)),
  });
  assert.equal(result.ok, false);
});

test("trims IDs and removes duplicates while preserving order", () => {
  assert.deepEqual(
    validatePlayerIds({ player_ids: ["11604", " 11618 ", "11604"] }),
    { ok: true, playerIds: ["11604", "11618"] },
  );
});

test("rejects non-string IDs", () => {
  assert.equal(validatePlayerIds({ player_ids: [11604] }).ok, false);
});
