import test from "node:test";
import assert from "node:assert/strict";
import { createCaseStore } from "./caseStore.js";

test("creates only a trimmed title, leaving ownership to the database", async () => {
  let inserted;
  const client = { from(table) {
    assert.equal(table, "cases");
    return { insert(value) { inserted = value; return { select(columns) {
      assert.equal(columns, "id,owner_id,title,created_at");
      return { single: async () => ({ data: { id: "1", title: value.title }, error: null }) };
    } }; } };
  } };
  const row = await createCaseStore(client).create("  My case  ");
  assert.deepEqual(inserted, { title: "My case" });
  assert.equal(row.title, "My case");
});

test("rejects empty and oversized titles before accessing the database", async () => {
  const store = createCaseStore(null);
  await assert.rejects(store.create("   "), /case name/);
  await assert.rejects(store.create("x".repeat(201)), /case name/);
});

test("reads recent cases with a bounded query and surfaces database errors", async () => {
  const failure = new Error("permission denied");
  const client = { from(table) {
    assert.equal(table, "cases");
    return { select(columns) {
      assert.equal(columns, "id,owner_id,title,created_at");
      return { order(field, options) {
        assert.equal(field, "created_at");
        assert.deepEqual(options, { ascending: false });
        return { limit: async count => { assert.equal(count, 50); return { error: failure }; } };
      } };
    } };
  } };
  await assert.rejects(createCaseStore(client).list(), /permission denied/);
});

test("loads a specific case including its saved work", async () => {
  const saved = { id: "case-a", transcript1: "First answer", transcript2: "Second answer", results: { findings: [] }, review_notes: {} };
  const client = { from: table => {
    assert.equal(table, "cases");
    return { select: fields => {
      assert.match(fields, /transcript1,transcript2,results,review_notes/);
      return { eq: (field, id) => {
        assert.equal(field, "id"); assert.equal(id, "case-a");
        return { single: async () => ({ data: saved }) };
      } };
    } };
  } };
  assert.deepEqual(await createCaseStore(client).get("case-a"), saved);
});

test("saves both texts, findings and notes without modifying ownership", async () => {
  let payload;
  const client = { from: () => ({ update: value => {
    payload = value;
    return { eq: (field, id) => {
      assert.equal(field, "id"); assert.equal(id, "case-a");
      return { select: fields => {
        assert.equal(fields, "id");
        return { single: async () => ({ data: { id } }) };
      } };
    } };
  } }) };
  const draft = { texts: ["At home", "Went outside"], results: [{ type: "DIRECT" }], seconds: 8.4, notes: { 0: "Review time" }, reviewed: { 0: true }, owner_id: "another-user", title: "ignored" };
  await createCaseStore(client).save("case-a", draft);
  assert.deepEqual(payload, { transcript1: "At home", transcript2: "Went outside", results: { findings: draft.results, elapsedSeconds: 8.4 }, review_notes: { notes: draft.notes, reviewed: draft.reviewed, documents: [null, null] } });
});

test("save fails visibly when RLS updates no row or database rejects update", async () => {
  const draft = { texts: ["a", "b"], results: null, notes: {}, reviewed: {} };
  const client = result => ({ from: () => ({ update: () => ({ eq: () => ({ select: () => ({ single: async () => result }) }) }) }) });
  await assert.rejects(createCaseStore(client({ data: null })).save("other-case", draft), /Nothing was saved/);
  await assert.rejects(createCaseStore(client({ error: new Error("permission denied") })).save("other-case", draft), /permission denied/);
});

test("deletes only the specified saved case and requires its returned ID", async () => {
  const fake = response => ({ from(table) {
    assert.equal(table, "cases");
    return { delete: () => ({ eq(field, id) {
      assert.equal(field, "id"); assert.equal(id, "owned-case");
      return { select(fields) { assert.equal(fields, "id"); return { single: async () => response }; } };
    } }) };
  } });
  assert.deepEqual(await createCaseStore(fake({ data: { id: "owned-case" } })).remove("owned-case"), { id: "owned-case" });
  await assert.rejects(createCaseStore(fake({ data: null })).remove("owned-case"), /not deleted/);
  await assert.rejects(createCaseStore(fake({ data: { id: "wrong-case" } })).remove("owned-case"), /not deleted/);
  await assert.rejects(createCaseStore(fake({ error: new Error("permission denied") })).remove("owned-case"), /permission denied/);
  await assert.rejects(createCaseStore(null).remove("sample"), /saved case/);
});
