export function arrangeCases(rows, order) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const known = [...new Set(order)].filter(id => byId.has(id));
  if (known.length === 0) return rows;
  const knownIds = new Set(known);
  return [...rows.filter(row => !knownIds.has(row.id)), ...known.map(id => byId.get(id))];
}

export function moveCase(rows, sourceId, targetId, after = false) {
  if (sourceId === targetId || !rows.some(row => row.id === sourceId) || !rows.some(row => row.id === targetId)) return rows;
  const moving = rows.find(row => row.id === sourceId);
  const remaining = rows.filter(row => row.id !== sourceId);
  const index = remaining.findIndex(row => row.id === targetId) + (after ? 1 : 0);
  return [...remaining.slice(0, index), moving, ...remaining.slice(index)];
}

export function swapCases(rows, sourceId, targetId) {
  const source = rows.findIndex(row => row.id === sourceId);
  const target = rows.findIndex(row => row.id === targetId);
  if (source < 0 || target < 0 || source === target) return rows;
  const next = [...rows];
  [next[source], next[target]] = [next[target], next[source]];
  return next;
}
