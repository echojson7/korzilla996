/* Портал один: компания Korzilla. Слои — модули портала по порядку. */

export const loadLayers = () => import("./layers.js").then((module) => module.default);

export default {
  app: { title: "Korzilla 996", home: "overview", storageKey: "k996" },
  default: "korzilla",
  sites: [
    { id: "korzilla", name: "Korzilla", domain: "", logo: null, layers: ["portal"] },
  ],
};
