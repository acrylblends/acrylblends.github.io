import uiRegistryJson from "../data/ui-registry.json";

export type UiRegistryItem = {
  id: string; version: string; surfaces: string[]; summary: string;
  props: string[]; origin: string; from: string; source: string;
};
export type UiRegistryDocument = { generatedAt: string; package: string; repository: string; items: UiRegistryItem[] };

export const uiRegistry = uiRegistryJson as UiRegistryDocument;
