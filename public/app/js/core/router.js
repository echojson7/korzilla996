/* Hash-адрес ↔ страница манифеста: #/orders?status=new → { page, params, query }. */

export function parse(index) {
  const [path = "", queryText = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const hit = index.match(path);
  return { page: hit?.page ?? null, params: hit?.params ?? {}, query: new URLSearchParams(queryText), path, hash: location.hash || "#/" };
}

export const go = (hash) => {
  if (location.hash !== hash) location.hash = hash;
};

/* Фильтры в адрес без новой записи истории: patch { key: value | null }. */
export function patchQuery(index, route, patch) {
  const query = new URLSearchParams(route.query);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") query.delete(key);
    else query.set(key, value);
  }
  history.replaceState(null, "", index.href(route.page.id, { params: route.params, query }));
  return query;
}
