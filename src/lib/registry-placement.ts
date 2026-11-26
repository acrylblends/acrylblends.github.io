// Where each published starter sits in the site's 100-category taxonomy. The registry's own index.json carries the publisher's short category
// (starter, finance, productivity, ...), which is not the taxonomy; this map is the site's presentation of it and is written by hand when an entry lands.
import { categories } from "./content";
import discovered from "../../registry/discovered.json";

export interface Placement {
  category: string;
  /** A Blend discovered in its own repository may sit in a category only, when none of its topics names a subcategory. */
  subcategory?: string;
}

/** A discovered Blend's placement comes from its own blend.yaml and topics (scripts/sync-blends.ts); the hand-written one wins for an entry in registry/blends/. */
const discoveredPlacement: Record<string, Placement> = Object.fromEntries((discovered.entries as { id: string; placement: Placement }[]).map((e) => [e.id, e.placement]));
export const placementFor = (id: string): Placement | undefined => registryPlacement[id] ?? discoveredPlacement[id];

/** The entries that have a taxonomy placement, with it; an entry without one is not shown in the browser until someone places it. */
export function placeEntries<T extends { id: string }>(entries: readonly T[]): Array<{ entry: T; placement: Placement }> {
  return entries
    .map((entry) => ({ entry, placement: placementFor(entry.id) }))
    .filter((item): item is { entry: T; placement: Placement } => item.placement !== undefined);
}

/**
 * A Blend's address: under its category and subcategory, `/blends/ai/ade/acryl.ade`, so the URL says where it sits. An entry without a
 * placement keeps the flat `/blends/b/<id>`, the address every Blend had before (that route still answers and forwards here).
 */
export function blendPath(id: string): string {
  const placement = placementFor(id);
  const category = placement && categories.find((c) => c.name === placement.category);
  const sub = category?.subs.find((s) => s.name === placement?.subcategory);
  return category && sub ? `/blends/${category.slug}/${sub.slug}/${id}` : `/blends/b/${id}`;
}

export const registryPlacement: Record<string, Placement> = {
  "acryl.ade": { category: "AI", subcategory: "Agent Development Environment (ADE)" },
  "acrylblends.acryl-ade-eb": { category: "AI", subcategory: "Agent Development Environment (ADE)" },
  "acryl.sde": { category: "AI", subcategory: "Synthetic Data Engine (SDE)" },
  "acryl.aos": { category: "System", subcategory: "Agentic operating systems" },
  "acryl.control-center": { category: "Software Marketplaces", subcategory: "Agentic Applications Marketplace" },
  "acrylblends.notes-desktop": { category: "Application", subcategory: "Productivity" },
  "acrylblends.chat": { category: "AI", subcategory: "AI assistants" },
  "acrylblends.agent": { category: "AI", subcategory: "AI agents" },
  "acrylblends.productivity-hub": { category: "Application", subcategory: "Productivity" },
  "acrylblends.small-crm": { category: "Business", subcategory: "CRM" },
  "acrylblends.small-crm-eb": { category: "Business", subcategory: "CRM" },
  "acrylblends.workflow-automation": { category: "Automation", subcategory: "Workflow automation" },
  "acrylblends.workflow-automation-eb": { category: "Automation", subcategory: "Workflow automation" },
  "acrylblends.simulation-morrow-lab": { category: "Simulation", subcategory: "Physics simulation" },
  "acrylblends.virtualization-hyperplane": { category: "Virtualization", subcategory: "Virtual machines" },
  "acrylblends.remote-relay": { category: "Remote Computing", subcategory: "SSH clients" },
  "acrylblends.storage-vaultline": { category: "Storage", subcategory: "Object storage" },
  "acrylblends.distributed-meshwatch": { category: "Distributed Systems", subcategory: "Distributed coordination" },
  "acrylblends.messaging-pulsebus": { category: "Messaging Infrastructure", subcategory: "Event buses" },
  "acrylblends.middleware-gatehouse": { category: "Middleware", subcategory: "API gateways" },
  "acrylblends.runtime-runlevel": { category: "Runtime", subcategory: "Language runtimes" },
  "acrylblends.libraries-foundry": { category: "Libraries & Frameworks", subcategory: "Libraries" },
  "acrylblends.api-orbit-console": { category: "API / SDK", subcategory: "API clients" },
  "acrylblends.integration-relaycraft": { category: "Integration", subcategory: "iPaaS" },
  "acrylblends.mobile-mobiary": { category: "Mobile", subcategory: "Progressive web apps" },
  "acrylblends.desktop-canvasmith": { category: "Desktop", subcategory: "Native desktop apps" },
  "acrylblends.electrobun-blank": { category: "Desktop", subcategory: "Electrobun apps" },
  "acrylblends.web-pagefoundry": { category: "Web", subcategory: "Websites" },
  "acrylblends.terminal-termforge": { category: "Terminal", subcategory: "Terminal emulators" },
  "acrylblends.xr-luma-space": { category: "Extended Reality", subcategory: "XR engines" },
  "acrylblends.hci-sensepath-lab": { category: "Human-Computer Interaction", subcategory: "Gesture recognition" },
  "acrylblends.localization-lingodesk": { category: "Localization", subcategory: "Translation management" },
  "acrylblends.accessibility-clearpath-audit": { category: "Accessibility", subcategory: "Screen readers" },
  "acrylblends.backup-restorepoint": { category: "Backup / Recovery", subcategory: "Disaster recovery" },
  "acrylblends.compliance-northstar-grc": { category: "Compliance / Governance", subcategory: "GRC" },
  "acrylblends.blockchain-blockscope": { category: "Blockchain", subcategory: "Blockchain nodes" },
  "acrylblends.decentralized-federary": { category: "Decentralized", subcategory: "Federated systems" },
  "acrylblends.p2p-swarmdrop": { category: "Peer-to-Peer", subcategory: "File sharing" },
  "acrylblends.system-monitor": { category: "System", subcategory: "System utilities" },
  "acrylblends.snippets": { category: "Developer", subcategory: "Code editors" },
  "acrylblends.prompt-lab": { category: "AI", subcategory: "AI assistants" },
  "acrylblends.csv-explorer": { category: "Data", subcategory: "Data platforms" },
  "acrylblends.web-analytics": { category: "Analytics", subcategory: "Web analytics" },
  "acrylblends.cloud-costs": { category: "Cloud", subcategory: "Cloud management" },
  "acrylblends.deploy-board": { category: "DevOps", subcategory: "CI/CD" },
  "acrylblends.uptime": { category: "Networking", subcategory: "Network management" },
  "acrylblends.photo-gallery": { category: "Media", subcategory: "Graphics" },
  "acrylblends.content-machine": { category: "Media", subcategory: "Content creation" },
  "acrylblends.moodboard": { category: "3D / CAD / Design", subcategory: "3D" },
  "acrylblends.lab-notebook": { category: "Scientific & Engineering", subcategory: "Science" },
  "acrylblends.vuln-tracker": { category: "Cybersecurity", subcategory: "Security operations" },
  "acrylblends.link-shortener": { category: "Internet", subcategory: "Internet publishing" },
  "acrylblends.maintenance-log": { category: "Industrial", subcategory: "Manufacturing" },
  "acrylblends.tennis": { category: "Gaming", subcategory: "Games" },
  "acrylblends.airspace": { category: "Gaming", subcategory: "Games" },
  "acrylblends.open-city": { category: "Gaming", subcategory: "Games" },
  "acrylblends.valley": { category: "Gaming", subcategory: "Games" },
  "acrylblends.tower-defense": { category: "Gaming", subcategory: "Games" },
  "acrylblends.corridor": { category: "Gaming", subcategory: "Games" },
  "acrylblends.action-rpg": { category: "Gaming", subcategory: "Games" },
  "acrylblends.robot-missions": { category: "Robotics", subcategory: "Motion planning" },
  "acrylblends.sensor-dashboard": { category: "Embedded / IoT", subcategory: "IoT platforms" },
  "acrylblends.vehicle-log": { category: "Automotive", subcategory: "Infotainment" },
  "acrylblends.flight-logbook": { category: "Aerospace / Aviation", subcategory: "Navigation" },
};
