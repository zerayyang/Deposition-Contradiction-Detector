import { documentMetadata } from "./documentStore.js";

const columns = "id,owner_id,title,created_at";

export function createCaseStore(client) {
  return {
    async list() {
      const { data, error } = await client.from("cases").select(columns)
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
    async get(id) {
      const { data, error } = await client.from("cases")
        .select(`${columns},transcript1,transcript2,results,review_notes`).eq("id", id).single();
      if (error) throw error;
      if (!data) throw new Error("Case not found or access denied.");
      return data;
    },
    async save(id, draft) {
      // Never send ownership or identifiers in the update payload.
      const payload = {
        transcript1: draft.texts[0], transcript2: draft.texts[1],
        results: draft.results === null ? null : { findings: draft.results, elapsedSeconds: draft.seconds },
        review_notes: { notes: draft.notes, reviewed: draft.reviewed, documents: [0,1].map(index => documentMetadata(draft.files?.[index])) },
      };
      const { data, error } = await client.from("cases").update(payload).eq("id", id).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Nothing was saved. Check that you own this case and have update permission.");
      return data;
    },
    async remove(id) {
      if (!id || id === "sample") throw new Error("Select a saved case to delete.");
      const { data, error } = await client.from("cases").delete().eq("id", id).select("id").single();
      if (error) throw error;
      if (!data || data.id !== id) throw new Error("Case was not deleted. Check ownership and delete permission.");
      return data;
    },
    async create(value) {
      const title = value.trim();
      if (!title || title.length > 200) throw new Error("Enter a case name between 1 and 200 characters.");
      // Supabase assigns owner_id from the signed-in user's session.
      const { data, error } = await client.from("cases").insert({ title }).select(columns).single();
      if (error) throw error;
      return data;
    },
  };
}
