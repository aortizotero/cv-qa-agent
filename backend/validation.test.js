import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHistory, MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH } from "./validation.js";

test("accepts an empty history", () => {
  assert.equal(validateHistory([]), true);
});

test("accepts a well-formed history", () => {
  assert.equal(
    validateHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]),
    true
  );
});

test("rejects a non-array", () => {
  assert.equal(validateHistory("not an array"), false);
  assert.equal(validateHistory(null), false);
  assert.equal(validateHistory(undefined), false);
});

test("rejects a history longer than MAX_HISTORY_MESSAGES", () => {
  const tooLong = Array.from({ length: MAX_HISTORY_MESSAGES + 1 }, () => ({
    role: "user",
    content: "x",
  }));
  assert.equal(validateHistory(tooLong), false);
});

test("rejects an invalid role", () => {
  assert.equal(validateHistory([{ role: "system", content: "x" }]), false);
});

test("rejects non-string content", () => {
  assert.equal(validateHistory([{ role: "user", content: 123 }]), false);
});

test("rejects a message longer than MAX_MESSAGE_LENGTH", () => {
  const tooLong = "x".repeat(MAX_MESSAGE_LENGTH + 1);
  assert.equal(validateHistory([{ role: "user", content: tooLong }]), false);
});

test("accepts a message exactly at MAX_MESSAGE_LENGTH", () => {
  const exact = "x".repeat(MAX_MESSAGE_LENGTH);
  assert.equal(validateHistory([{ role: "user", content: exact }]), true);
});
