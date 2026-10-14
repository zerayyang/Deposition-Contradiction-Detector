import test from "node:test";
import assert from "node:assert/strict";
import { arrangeCases, moveCase } from "./caseOrder.js";
const rows = ["sample", "a", "b", "c"].map(id => ({ id }));
const ids = list => list.map(row => row.id);
test("moves up and down without losing cases or mixing their data", () => {
  const down = moveCase(rows, "a", "c", true);
  assert.deepEqual(ids(down), ["sample", "b", "c", "a"]);
  assert.equal(down[3], rows[1]);
  assert.deepEqual(ids(moveCase(rows, "c", "a")), ["sample", "c", "a", "b"]);
  assert.deepEqual(ids(rows), ["sample", "a", "b", "c"]);
});
test("can reorder the sample and ignores invalid or identical destinations", () => {
  assert.deepEqual(ids(moveCase(rows, "sample", "c", true)), ["a", "b", "c", "sample"]);
  assert.equal(moveCase(rows, "missing", "a"), rows);
  assert.equal(moveCase(rows, "a", "a"), rows);
});
test("restores order, ignores deleted and duplicate IDs, includes new cases", () => {
  assert.deepEqual(ids(arrangeCases(rows, ["b", "gone", "b", "a", "sample"])), ["c", "b", "a", "sample"]);
  assert.equal(arrangeCases(rows, []), rows);
});

test("dropping on another case swaps exactly those two positions", async () => {
  const { swapCases } = await import("./caseOrder.js");
  const result = swapCases(rows, "sample", "c");
  assert.deepEqual(ids(result), ["c", "a", "b", "sample"]);
  assert.equal(result[0], rows[3]);
  assert.equal(result[3], rows[0]);
  assert.deepEqual(ids(rows), ["sample", "a", "b", "c"]);
  assert.equal(swapCases(rows, "a", "a"), rows);
  assert.equal(swapCases(rows, "a", "unknown"), rows);
});
