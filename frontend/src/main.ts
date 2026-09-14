import RuntimeForceGraph3D, {
  type ConfigOptions,
  type ForceGraph3DInstance,
  type LinkObject,
  type NodeObject,
} from "3d-force-graph";
import * as THREE from "three";
import { palette } from "./palette";
import {
  SCHEMA_VERSION,
  type ApiErrorResponse,
  type ExpandResponse,
  type GraphLink,
  type GraphNode,
  type HealthResponse,
  type QueryRequest,
  type QueryResponse,
  type SchemaVersion,
  type SnapshotResponse,
  type SnapshotStats,
} from "./types";
import { marked } from "marked";

type ForceGraph3DConstructor = {
  new <
    NodeType extends NodeObject = NodeObject,
    LinkType extends LinkObject<NodeType> = LinkObject<NodeType>,
  >(
    element: HTMLElement,
    configOptions?: ConfigOptions,
  ): ForceGraph3DInstance<NodeType, LinkType>;
};

const ForceGraph3D = RuntimeForceGraph3D as ForceGraph3DConstructor;

export type Theme = "dark" | "light";

// SVG Icons
const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const ICON_CODE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
const ICON_EXPAND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const ICON_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;

// Dynamic, deterministic, infinite color generator for any category & cluster
export function getDynamicCategoryColor(category: string, theme: Theme = currentTheme): string {
  if (category === "Chunk") {
    return theme === "dark" ? "#475569" : "#64748b";
  }
  if (!category || category === "Default" || category === "untagged" || category === "None") {
    return theme === "dark" ? "#94a3b8" : "#475569";
  }

  return palette.getColor(category, theme);
}

export const THEME_PALETTES = {
  dark: {
    bg: "#050814", // Deep rich cosmic blue-black
    linkSemantic: "rgba(148, 163, 184, 0.28)",
    linkProvenance: "rgba(100, 116, 139, 0.12)",
    highlight: "#38bdf8",
    highlightLink: "rgba(56, 189, 248, 0.95)",
    dim: "rgba(255, 255, 255, 0.04)",
    dimLink: "rgba(255, 255, 255, 0.02)",
    particle: "#38bdf8",
    tooltipBg: "rgba(10, 15, 30, 0.95)",
    tooltipFg: "#f8fafc",
    tooltipBorder: "rgba(56, 189, 248, 0.35)",
  },
  light: {
    bg: "#f8fafc", // Crisp clean slate
    linkSemantic: "rgba(71, 85, 105, 0.32)",
    linkProvenance: "rgba(100, 116, 139, 0.12)",
    highlight: "#2563eb",
    highlightLink: "rgba(37, 99, 235, 0.95)",
    dim: "rgba(15, 23, 42, 0.05)",
    dimLink: "rgba(15, 23, 42, 0.02)",
    particle: "#2563eb",
    tooltipBg: "rgba(255, 255, 255, 0.96)",
    tooltipFg: "#0f172a",
    tooltipBorder: "rgba(37, 99, 235, 0.3)",
  },
} as const;

let currentTheme: Theme = (localStorage.getItem("kwipu-theme") as Theme) || "dark";
let COLORS = THEME_PALETTES[currentTheme];
let activeCategoryFilter: string | null = null;
let hoveredNode: GraphNode | null = null;
let hoveredNeighbors = new Set<string>();

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Elemento UI mancante: ${selector}`);
  return element;
}

function createApiBaseUrl(configuredValue: string | undefined): URL {
  const configured = configuredValue?.trim() || "/api";
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(configured);
  const source = hasScheme ? configured : `/${configured.replace(/^\/+/, "")}`;
  const url = new URL(source, window.location.origin);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`VITE_API_BASE non valido: protocollo ${url.protocol}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("VITE_API_BASE non può contenere credenziali, query o fragment");
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

const API_BASE_URL = createApiBaseUrl(import.meta.env.VITE_API_BASE);

function apiUrl(path: string, query?: URLSearchParams): string {
  const url = new URL(path.replace(/^\/+/, ""), API_BASE_URL);
  if (query) url.search = query.toString();
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return isRecord(value) && "detail" in value;
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!isRecord(item)) return String(item);
        const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
        const message = typeof item.msg === "string" ? item.msg : JSON.stringify(item);
        return location ? `${location}: ${message}` : message;
      })
      .join("; ");
  }
  if (detail == null) return "";
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

async function createHttpError(response: Response): Promise<Error> {
  let detail = "";
  const body = await response.text();
  if (body) {
    try {
      const payload: unknown = JSON.parse(body);
      if (isApiErrorResponse(payload)) {
        detail = formatDetail(payload.detail);
      } else {
        detail = formatDetail(payload);
      }
    } catch {
      detail = body.trim();
    }
  }

  const status = `${response.status} ${response.statusText}`.trim();
  return new Error(detail ? `${status} · ${detail}` : status);
}

function assertSchemaVersion(
  payload: unknown,
  endpoint: string,
): asserts payload is { schema_version: SchemaVersion } {
  const received = isRecord(payload) ? payload.schema_version : undefined;
  if (received !== SCHEMA_VERSION) {
    const value = received == null ? "mancante" : JSON.stringify(received);
    throw new Error(
      `Schema API incompatibile per ${endpoint}: atteso ${SCHEMA_VERSION}, ricevuto ${value}`,
    );
  }
}

async function fetchVersioned<ResponseType extends { schema_version: SchemaVersion }>(
  endpoint: string,
  init?: RequestInit,
  query?: URLSearchParams,
): Promise<ResponseType> {
  const response = await fetch(apiUrl(endpoint, query), init);
  if (!response.ok) throw await createHttpError(response);

  const payload: unknown = await response.json();
  assertSchemaVersion(payload, endpoint);
  return payload as ResponseType;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getNodeCategory(node: GraphNode): string {
  if (node.type === "chunk") return "Chunk";
  const cat = node.fm?.category as string | undefined;
  return cat || "Default";
}

function getNodeBaseColor(node: GraphNode): string {
  const cat = getNodeCategory(node);
  return getDynamicCategoryColor(cat, currentTheme);
}

let highlightedIds = new Set<string>();
let visibleNodeIds = new Set<string>();
let activeModel = "";
let sceneCounts: { nodes: number; links: number } | null = null;
let healthState:
  | { status: "loading" }
  | { status: HealthResponse["status"] }
  | { status: "error"; message: string } = { status: "loading" };
let lastQueryVisibility: {
  citedNodeIds: string[];
  highlightNodeIds: string[];
} | null = null;
let graphRequestGeneration = 0;
let graphAbortController: AbortController | null = null;
let queryRequestGeneration = 0;
let queryAbortController: AbortController | null = null;
let previewRequestGeneration = 0;
let previewAbortController: AbortController | null = null;

const elGraph = requireElement<HTMLElement>("#graph");
const elStats = requireElement<HTMLElement>("#stats");
const elHover = requireElement<HTMLElement>("#hover");
const elSceneMeta = requireElement<HTMLElement>("#scene-meta");
const elLegend = requireElement<HTMLElement>("#legend-pills");
const elChunks = requireElement<HTMLInputElement>("#opt-chunks");
const elNoisy = requireElement<HTMLInputElement>("#opt-noisy");
const elMinDeg = requireElement<HTMLInputElement>("#opt-mindeg");
const elMinDegVal = requireElement<HTMLElement>("#opt-mindeg-val");
const elReload = requireElement<HTMLButtonElement>("#reload");
const elQ = requireElement<HTMLTextAreaElement>("#q");
const elAsk = requireElement<HTMLButtonElement>("#ask");
const elAskStatus = requireElement<HTMLElement>("#ask-status");
const elAnswerBox = requireElement<HTMLElement>("#answer-box");
const elAnswer = requireElement<HTMLElement>("#answer");
const elCited = requireElement<HTMLElement>("#cited");
const elClearHighlight = requireElement<HTMLButtonElement>("#clear-highlight");
const elCopyQueryMermaid = requireElement<HTMLButtonElement>("#copy-query-mermaid");
const elPreview = requireElement<HTMLElement>("#preview");
const elPreviewTitle = requireElement<HTMLElement>("#preview-title");
const elPreviewBody = requireElement<HTMLElement>("#preview-body");
const elPreviewClose = requireElement<HTMLButtonElement>("#preview-close");
const elPreviewCopyMermaid = requireElement<HTMLButtonElement>("#preview-copy-mermaid");
const elPreviewHandle = requireElement<HTMLElement>("#preview-handle");

// Resize logic for Preview Panel
let isResizing = false;
const MIN_PREVIEW_WIDTH = 420;
const SIDEBAR_WIDTH = 320;
const MARGIN = 18;

function getSafePreviewWidth(requestedWidth: number): number {
  const maxWidth = window.innerWidth - SIDEBAR_WIDTH - (MARGIN * 2);
  return Math.min(maxWidth, Math.max(MIN_PREVIEW_WIDTH, requestedWidth));
}

const storedWidth = localStorage.getItem("kwipu-preview-width");
if (storedWidth) {
  elPreview.style.width = `${getSafePreviewWidth(parseInt(storedWidth))}px`;
}

elPreviewHandle.addEventListener("mousedown", (e) => {
  isResizing = true;
  elPreviewHandle.classList.add("active");
  document.body.style.cursor = "ew-resize";
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  // Calculate new width: window width - mouse X - right margin
  const requestedWidth = window.innerWidth - e.clientX - MARGIN;
  const safeWidth = getSafePreviewWidth(requestedWidth);

  elPreview.style.width = `${safeWidth}px`;
  localStorage.setItem("kwipu-preview-width", String(safeWidth));
});

window.addEventListener("mouseup", () => {
  if (isResizing) {
    isResizing = false;
    elPreviewHandle.classList.remove("active");
    document.body.style.cursor = "";
  }
});

const elMermaidModal = requireElement<HTMLElement>("#mermaid-modal");
const elMermaidModalClose = requireElement<HTMLButtonElement>("#mermaid-modal-close");
const elMermaidModalBody = requireElement<HTMLElement>("#mermaid-modal-body");
const elMermaidZoomIn = requireElement<HTMLButtonElement>("#mermaid-zoom-in");
const elMermaidZoomOut = requireElement<HTMLButtonElement>("#mermaid-zoom-out");
const elMermaidZoomReset = requireElement<HTMLButtonElement>("#mermaid-zoom-reset");
const elMermaidZoomLevel = requireElement<HTMLElement>("#mermaid-zoom-level");

let currentSnapshot: SnapshotResponse | null = null;
let currentPreviewNode: GraphNode | null = null;

// Shared Three.js Geometry & Material Caches for extreme 60fps rendering performance
const SPHERE_GEO_CACHE = new Map<number, THREE.SphereGeometry>();
const GLOW_GEO_CACHE = new Map<number, THREE.SphereGeometry>();
const RING_GEO_CACHE = new Map<number, THREE.RingGeometry>();

function getOrCreateSphereGeo(radius: number): THREE.SphereGeometry {
  const key = Math.round(radius * 10) / 10;
  let geo = SPHERE_GEO_CACHE.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(radius, 16, 16);
    SPHERE_GEO_CACHE.set(key, geo);
  }
  return geo;
}

function getOrCreateGlowGeo(radius: number): THREE.SphereGeometry {
  const key = Math.round(radius * 10) / 10;
  let geo = GLOW_GEO_CACHE.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(radius * 1.22, 12, 12);
    GLOW_GEO_CACHE.set(key, geo);
  }
  return geo;
}

function getOrCreateRingGeo(radius: number): THREE.RingGeometry {
  const key = Math.round(radius * 10) / 10;
  let geo = RING_GEO_CACHE.get(key);
  if (!geo) {
    geo = new THREE.RingGeometry(radius * 1.4, radius * 1.7, 24);
    RING_GEO_CACHE.set(key, geo);
  }
  return geo;
}

const MATERIAL_CACHE = new Map<string, THREE.Material>();

function getOrCreateNodeMaterial(colorHex: string, opacity: number, emissiveIntensity: number): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${opacity.toFixed(2)}_${emissiveIntensity.toFixed(2)}`;
  let mat = MATERIAL_CACHE.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.2,
      metalness: 0.2,
      transparent: opacity < 1.0,
      opacity: opacity,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: emissiveIntensity,
    });
    MATERIAL_CACHE.set(key, mat);
  }
  return mat;
}

function getOrCreateGlowMaterial(colorHex: string, opacity: number): THREE.MeshBasicMaterial {
  const key = `glow_${colorHex}_${opacity.toFixed(2)}`;
  let mat = MATERIAL_CACHE.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
    });
    MATERIAL_CACHE.set(key, mat);
  }
  return mat;
}

// Create 3D Force Graph instance with high-performance cached meshes & smoothed physics
const Graph = new ForceGraph3D<GraphNode, GraphLink>(elGraph)
  .backgroundColor(COLORS.bg)
  .nodeRelSize(5)
  .warmupTicks(60) // Pre-calculate physics so initial load is instant and stable
  .cooldownTicks(80) // Stop computing forces when settled to free GPU/CPU
  .cooldownTime(4000)
  .nodeThreeObject((node: GraphNode) => {
    const cat = getNodeCategory(node);
    const colorHex = getNodeBaseColor(node);
    const degree = node.degree ?? 1;
    const radius =
      node.type === "chunk"
        ? 2.2
        : Math.max(3.2, Math.min(15, Math.sqrt(degree) * 3.4));

    const group = new THREE.Group();

    // 1. Core Sphere (Cached Geometry & Material)
    const sphereGeo = getOrCreateSphereGeo(radius);
    const sphereMat = getOrCreateNodeMaterial(colorHex, 0.95, currentTheme === "dark" ? 0.3 : 0.12);
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.name = "coreSphere";
    group.add(sphere);

    // 2. Translucent outer glow bubble (Cached)
    const glowGeo = getOrCreateGlowGeo(radius);
    const glowMat = getOrCreateGlowMaterial(colorHex, 0.12);
    const glowSphere = new THREE.Mesh(glowGeo, glowMat);
    glowSphere.name = "glowSphere";
    group.add(glowSphere);

    // 3. Glowing halo ring for top hub nodes
    if (degree >= 8) {
      const ringGeo = getOrCreateRingGeo(radius);
      const ringMat = getOrCreateGlowMaterial(colorHex, 0.4);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.name = "haloRing";
      ring.lookAt(Graph.camera().position);
      group.add(ring);
    }

    return group;
  })
  .nodeThreeObjectExtend(false)
  .nodeLabel((node) => {
    const cat = getNodeCategory(node);
    const color = getNodeBaseColor(node);
    const name = escapeHtml(node.name ?? node.file_name ?? node.id);
    const degreeBadge =
      node.degree != null
        ? `<span style="opacity:0.85; font-size:10px; margin-left:6px; padding:2px 6px; background:rgba(255,255,255,0.12); border-radius:4px;">${node.degree} connections</span>`
        : "";

    return `<div style="
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 12px;
      color: ${COLORS.tooltipFg};
      background: ${COLORS.tooltipBg};
      padding: 8px 12px;
      border: 1px solid ${COLORS.tooltipBorder};
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      backdrop-filter: blur(10px);
      line-height: 1.4;
      pointer-events: none;
    ">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; box-shadow: 0 0 8px ${color};"></span>
        <strong style="font-weight:600; font-size:13px;">${name}</strong>
        ${degreeBadge}
      </div>
      <div style="font-size:11px; opacity:0.75; font-family:monospace; margin-top:2px;">${escapeHtml(
        cat,
      )} · ${node.type}</div>
    </div>`;
  })
  .linkColor((link: GraphLink) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source.id;
    const targetId = typeof link.target === "string" ? link.target : link.target.id;

    if (highlightedIds.size > 0) {
      const highlighted = highlightedIds.has(sourceId) || highlightedIds.has(targetId);
      return highlighted ? COLORS.highlightLink : COLORS.dimLink;
    }

    if (hoveredNode) {
      const isConnected =
        sourceId === hoveredNode.id || targetId === hoveredNode.id;
      if (isConnected) {
        return COLORS.highlightLink;
      }
      return COLORS.dimLink;
    }

    // Thread coloring by source cluster
    const sourceNode = typeof link.source === "object" ? link.source : undefined;
    if (sourceNode) {
      const sourceColor = getNodeBaseColor(sourceNode);
      return currentTheme === "dark"
        ? sourceColor + "44" // 27% alpha in dark mode
        : sourceColor + "55"; // 33% alpha in light mode
    }

    return link.kind === "provenance" ? COLORS.linkProvenance : COLORS.linkSemantic;
  })
  .linkWidth((link: GraphLink) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source.id;
    const targetId = typeof link.target === "string" ? link.target : link.target.id;

    if (highlightedIds.size > 0) {
      return highlightedIds.has(sourceId) || highlightedIds.has(targetId) ? 2.2 : 0.2;
    }

    if (hoveredNode) {
      return sourceId === hoveredNode.id || targetId === hoveredNode.id ? 2.0 : 0.2;
    }

    return link.kind === "provenance" ? 0.6 : 1.2;
  })
  .linkCurvature(0.14)
  .linkDirectionalParticles((link: GraphLink) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source.id;
    const targetId = typeof link.target === "string" ? link.target : link.target.id;

    if (highlightedIds.size > 0) {
      return highlightedIds.has(sourceId) || highlightedIds.has(targetId) ? 4 : 0;
    }
    if (hoveredNode) {
      return sourceId === hoveredNode.id || targetId === hoveredNode.id ? 3 : 0;
    }
    return 1;
  })
  .linkDirectionalParticleSpeed(0.005)
  .linkDirectionalParticleWidth((link: GraphLink) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source.id;
    const targetId = typeof link.target === "string" ? link.target : link.target.id;

    if (highlightedIds.size > 0 || hoveredNode) {
      const active =
        highlightedIds.has(sourceId) ||
        highlightedIds.has(targetId) ||
        sourceId === hoveredNode?.id ||
        targetId === hoveredNode?.id;
      return active ? 2.4 : 1.0;
    }
    return 1.4;
  })
  .linkDirectionalParticleColor((link: GraphLink) => {
    const sourceNode = typeof link.source === "object" ? link.source : undefined;
    if (sourceNode) {
      return getNodeBaseColor(sourceNode);
    }
    return COLORS.particle;
  })
  .onNodeHover((node) => {
    hoveredNode = node;
    hoveredNeighbors.clear();
    if (node) {
      const links = Graph.graphData().links as GraphLink[];
      links.forEach((l) => {
        const sId = typeof l.source === "string" ? l.source : l.source.id;
        const tId = typeof l.target === "string" ? l.target : l.target.id;
        if (sId === node.id) hoveredNeighbors.add(tId);
        if (tId === node.id) hoveredNeighbors.add(sId);
      });
    }
    showHover(node);
    updateNodeVisuals();
    Graph.linkColor(Graph.linkColor()).linkWidth(Graph.linkWidth());
  })
  .onNodeClick((node) => openPreview(node));

function updateNodeVisuals() {
  const nodes = Graph.graphData().nodes as GraphNode[];
  const hasHighlight = highlightedIds.size > 0;
  const hasHover = hoveredNode !== null;

  nodes.forEach((node) => {
    const group = (node as unknown as { __threeObj?: THREE.Group }).__threeObj;
    if (!group) return;

    const isHighlighted = highlightedIds.has(node.id);
    const isHovered = hoveredNode?.id === node.id;
    const isHoverNeighbor = hoveredNeighbors.has(node.id);
    const cat = getNodeCategory(node);
    const isFiltered = activeCategoryFilter !== null && activeCategoryFilter !== cat;

    let colorHex = getNodeBaseColor(node);
    let opacity = 0.95;
    let emissiveIntensity = currentTheme === "dark" ? 0.3 : 0.12;

    if (hasHighlight) {
      if (isHighlighted) {
        colorHex = COLORS.highlight;
        opacity = 1.0;
        emissiveIntensity = 0.8;
      } else {
        colorHex = COLORS.dim;
        opacity = 0.12;
        emissiveIntensity = 0;
      }
    } else if (hasHover) {
      if (isHovered) {
        opacity = 1.0;
        emissiveIntensity = 0.85;
      } else if (isHoverNeighbor) {
        opacity = 0.95;
        emissiveIntensity = 0.5;
      } else {
        opacity = 0.15;
        emissiveIntensity = 0;
      }
    } else if (isFiltered) {
      opacity = 0.12;
      emissiveIntensity = 0;
    }

    group.traverse((child: any) => {
      if (child instanceof THREE.Mesh) {
        if (child.name === "coreSphere") {
          child.material = getOrCreateNodeMaterial(colorHex, opacity, emissiveIntensity);
          const scale = isHovered ? 1.25 : 1.0;
          child.scale.set(scale, scale, scale);
        } else if (child.name === "glowSphere") {
          child.material = getOrCreateGlowMaterial(colorHex, isHovered || isHighlighted ? 0.35 : 0.12 * opacity);
        } else if (child.name === "haloRing") {
          child.material = getOrCreateGlowMaterial(
            isHighlighted || isHovered ? COLORS.highlight : colorHex,
            isHighlighted || isHovered ? 0.85 : 0.4 * opacity,
          );
        }
      }
    });
  });
}

// Setup Orbit & exploration toolbar handlers
const btnZoomIn = document.querySelector<HTMLButtonElement>("#btn-zoom-in");
const btnZoomOut = document.querySelector<HTMLButtonElement>("#btn-zoom-out");
const btnFit = document.querySelector<HTMLButtonElement>("#btn-fit");
const btnReheat = document.querySelector<HTMLButtonElement>("#btn-reheat");

if (btnZoomIn) {
  btnZoomIn.addEventListener("click", () => {
    const pos = Graph.cameraPosition();
    Graph.cameraPosition({ x: pos.x * 0.7, y: pos.y * 0.7, z: pos.z * 0.7 }, undefined, 400);
  });
}
if (btnZoomOut) {
  btnZoomOut.addEventListener("click", () => {
    const pos = Graph.cameraPosition();
    Graph.cameraPosition({ x: pos.x * 1.35, y: pos.y * 1.35, z: pos.z * 1.35 }, undefined, 400);
  });
}
if (btnFit) {
  btnFit.addEventListener("click", () => {
    Graph.zoomToFit(600, 50);
  });
}
if (btnReheat) {
  btnReheat.addEventListener("click", () => {
    Graph.d3ReheatSimulation();
  });
}

// Enable smooth orbit damping on Three.js controls
try {
  const controls = Graph.controls() as {
    enableDamping?: boolean;
    dampingFactor?: number;
    rotateSpeed?: number;
    zoomSpeed?: number;
  };
  if (controls) {
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.9;
  }
} catch {
  // Ignore if controls not yet ready
}

// Idle rotation — gentle, constellation feel.
let userInteracting = false;
let lastInteractionAt = 0;
let theta: number | null = null;
const IDLE_AFTER_MS = 2800;
const ROT_SPEED = 0.0010;

elGraph.addEventListener("pointerdown", () => {
  userInteracting = true;
  lastInteractionAt = Date.now();
});
window.addEventListener("pointerup", () => {
  userInteracting = false;
  lastInteractionAt = Date.now();
});
elGraph.addEventListener(
  "wheel",
  () => {
    lastInteractionAt = Date.now();
  },
  { passive: true },
);

function tickIdle() {
  requestAnimationFrame(tickIdle);
  if (userInteracting) return;
  if (highlightedIds.size > 0 || hoveredNode !== null) return;
  if (Date.now() - lastInteractionAt < IDLE_AFTER_MS) return;
  const position = Graph.cameraPosition();
  const distance = Math.hypot(position.x, position.z);
  if (distance < 1) return;
  if (theta === null) theta = Math.atan2(position.x, position.z);
  theta += ROT_SPEED;
  Graph.cameraPosition(
    {
      x: Math.sin(theta) * distance,
      y: position.y,
      z: Math.cos(theta) * distance,
    },
    undefined,
    0,
  );
}
requestAnimationFrame(tickIdle);

function renderLegend() {
  if (!elLegend) return;
  const nodes = currentSnapshot?.nodes ?? (Graph ? (Graph.graphData().nodes as GraphNode[]) : []);
  const categorySet = new Set<string>();
  for (const node of nodes) {
    const cat = getNodeCategory(node);
    if (cat && cat !== "Chunk" && cat !== "Default") {
      categorySet.add(cat);
    }
  }
  const categories = Array.from(categorySet).sort();

  elLegend.innerHTML = categories
    .map((cat) => {
      const color = getDynamicCategoryColor(cat, currentTheme);
      const isSelected = activeCategoryFilter === cat;
      return `<button class="legend-pill ${isSelected ? "active" : ""}" data-cat="${escapeHtml(
        cat,
      )}" style="--pill-color: ${color};">
        <span class="dot" style="background: ${color};"></span>
        <span class="label">${escapeHtml(cat)}</span>
      </button>`;
    })
    .join("");

  elLegend.querySelectorAll<HTMLButtonElement>(".legend-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const cat = pill.getAttribute("data-cat");
      if (activeCategoryFilter === cat) {
        activeCategoryFilter = null;
      } else {
        activeCategoryFilter = cat;
      }
      renderLegend();
      updateNodeVisuals();
    });
  });
}

function renderSceneMeta() {
  const counts = sceneCounts
    ? `${sceneCounts.nodes} nodes · ${sceneCounts.links} links`
    : "graph loading…";
  const health =
    healthState.status === "error"
      ? `health error · ${healthState.message}`
      : healthState.status === "loading"
        ? "health loading…"
        : `health ${healthState.status}`;
  const model = activeModel || "model unavailable";

  elSceneMeta.innerHTML = `
    <div>${escapeHtml(counts)}</div>
    <div>kwipu · ${escapeHtml(health)} · ${escapeHtml(model)}</div>
  `;
}

async function loadHealth() {
  try {
    const health = await fetchVersioned<HealthResponse>("health");
    activeModel = health.llm_model;
    healthState = { status: health.status };
  } catch (error) {
    activeModel = "";
    healthState = { status: "error", message: errorMessage(error) };
  }
  renderSceneMeta();
  if (lastQueryVisibility) refreshQueryVisibility();
}

async function loadGraph() {
  const requestGeneration = ++graphRequestGeneration;
  graphAbortController?.abort();
  const controller = new AbortController();
  graphAbortController = controller;
  const params = new URLSearchParams({
    include_chunks: String(elChunks.checked),
    drop_noisy: String(elNoisy.checked),
    min_degree: elMinDeg.value,
  });
  elStats.innerHTML = `<span class="key">loading…</span>`;
  try {
    const snapshot = await fetchVersioned<SnapshotResponse>(
      "graph/snapshot",
      { signal: controller.signal },
      params,
    );
    if (requestGeneration !== graphRequestGeneration) return;
    currentSnapshot = snapshot;

    // Batch optimize palette for all categories in this snapshot
    const categories = snapshot.nodes
      .map(n => getNodeCategory(n))
      .filter(c => c !== "Chunk" && c !== "Default");
    palette.assign(categories);

    Graph.graphData({ nodes: snapshot.nodes, links: snapshot.links });
    visibleNodeIds = new Set(snapshot.nodes.map((node) => node.id));
    sceneCounts = { nodes: snapshot.nodes.length, links: snapshot.links.length };
    elStats.innerHTML = formatStats(snapshot.stats);
    renderSceneMeta();
    renderLegend();
    if (lastQueryVisibility) refreshQueryVisibility();
  } catch (error) {
    if (requestGeneration !== graphRequestGeneration) return;
    elStats.innerHTML = `<span class="key">error: ${escapeHtml(errorMessage(error))}</span>`;
  } finally {
    if (graphAbortController === controller) graphAbortController = null;
  }
}

function formatStats(stats: SnapshotStats): string {
  const row = (key: string, value: string | number) =>
    `<span class="key">${key.padEnd(14, " ")}</span><span class="val">${value}</span>\n`;
  return [
    row("raw nodes", stats.total_nodes_raw),
    row("raw relations", stats.total_relations_raw),
    row("kept nodes", stats.kept_nodes),
    row("kept links", stats.kept_links),
    row("skipped noisy", stats.skipped_noisy),
  ].join("");
}

function showHover(node: GraphNode | null) {
  if (!node) {
    elHover.innerHTML = `<div class="empty">hover a node…</div>`;
    return;
  }
  const cat = getNodeCategory(node);
  const color = getNodeBaseColor(node);
  const frontmatterRows = Object.entries(node.fm)
    .map(
      ([key, value]) =>
        `<div><span class="k">${escapeHtml(key)}</span> · ${escapeHtml(String(value))}</div>`,
    )
    .join("");
  elHover.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color};"></span>
      <span class="name" style="margin-bottom:0;">${escapeHtml(
        node.name ?? node.file_name ?? node.id,
      )}</span>
    </div>
    <div class="meta">
      <div><span class="k">category</span> · <span style="color:${color}; font-weight:500;">${escapeHtml(
        cat,
      )}</span> · ${node.type}${node.degree != null ? ` · degree ${node.degree}` : ""}</div>
      ${
        node.file_name
          ? `<div><span class="k">file</span> · ${escapeHtml(node.file_name)}</div>`
          : ""
      }
      ${frontmatterRows}
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function refreshQueryVisibility() {
  if (!lastQueryVisibility) return;

  const visibleSources = lastQueryVisibility.citedNodeIds.filter((id) => visibleNodeIds.has(id));
  const visibleHighlights = lastQueryVisibility.highlightNodeIds.filter((id) =>
    visibleNodeIds.has(id),
  );
  highlightNodes(visibleHighlights);

  const modelLabel = activeModel ? ` · ${activeModel}` : "";
  elAskStatus.textContent =
    `${visibleSources.length}/${lastQueryVisibility.citedNodeIds.length} source(s) visible · ` +
    `${visibleHighlights.length}/${lastQueryVisibility.highlightNodeIds.length} highlight(s) visible` +
    modelLabel;
}

async function askQuestion() {
  const question = elQ.value.trim();
  if (!question) return;
  const requestGeneration = ++queryRequestGeneration;
  queryAbortController?.abort();
  const controller = new AbortController();
  queryAbortController = controller;

  elAsk.disabled = true;
  elAskStatus.classList.add("thinking");
  elAskStatus.textContent = "thinking";
  lastQueryVisibility = null;
  highlightNodes([]);
  elAnswerBox.hidden = true;
  try {
    const request: QueryRequest = { q: question };
    const data = await fetchVersioned<QueryResponse>("query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (requestGeneration !== queryRequestGeneration) return;
    elAnswer.innerHTML = renderMarkdownBlock(data.answer || "(no answer)");
    attachMermaidListeners(elAnswer);
    void renderMermaidBlocksIn(elAnswer);
    elCited.innerHTML = data.citations
      .map(
        (citation) =>
          `<span class="chip" data-node-id="${escapeHtml(
            citation.node_id,
          )}" title="Click to focus in 3D graph">${escapeHtml(
            citation.file_name || citation.node_id,
          )}</span>`,
      )
      .join("");

    elCited.querySelectorAll<HTMLElement>(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const nodeId = chip.getAttribute("data-node-id");
        if (!nodeId) return;
        const nodes = Graph.graphData().nodes as GraphNode[];
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          openPreview(node);
          highlightNodes([node.id]);
        }
      });
    });

    elAnswerBox.hidden = false;
    elAskStatus.classList.remove("thinking");

    const citedNodeIds = uniqueIds(data.cited_node_ids);
    const requestedHighlights = uniqueIds(data.highlight_node_ids);
    lastQueryVisibility = {
      citedNodeIds,
      highlightNodeIds: requestedHighlights.length > 0 ? requestedHighlights : citedNodeIds,
    };
    refreshQueryVisibility();
  } catch (error) {
    if (requestGeneration !== queryRequestGeneration) return;
    elAskStatus.classList.remove("thinking");
    elAskStatus.textContent = `error · ${errorMessage(error)}`;
  } finally {
    if (queryAbortController === controller) {
      queryAbortController = null;
      elAsk.disabled = false;
    }
  }
}

function highlightNodes(ids: string[]) {
  highlightedIds = new Set(ids);
  updateNodeVisuals();
  Graph.linkColor(Graph.linkColor());
}

function clearHighlight() {
  queryRequestGeneration += 1;
  queryAbortController?.abort();
  queryAbortController = null;
  elAsk.disabled = false;
  elAskStatus.classList.remove("thinking");
  lastQueryVisibility = null;
  highlightNodes([]);
  elAnswerBox.hidden = true;
  elAskStatus.textContent = "";
}

elAsk.addEventListener("click", askQuestion);
elQ.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    askQuestion();
  }
});
elClearHighlight.addEventListener("click", clearHighlight);
elPreviewClose.addEventListener("click", closePreview);

// ponytail: Clean Mermaid flowchart generator
function exportSubGraphToMermaid(nodeIds: Set<string> | null, focusNodeId?: string): string {
  if (!currentSnapshot) return "%% Graph snapshot is not loaded yet %%";
  const nodes = currentSnapshot.nodes.filter(
    (n) => nodeIds === null || nodeIds.has(n.id),
  );
  if (nodes.length === 0) return "%% No nodes selected %%";

  const keptIds = new Set(nodes.map((n) => n.id));
  const links = currentSnapshot.links.filter(
    (l) => keptIds.has(l.source) && keptIds.has(l.target),
  );

  // robust sanitization: Map IDs to safe short identifiers
  const idMap = new Map<string, string>();
  let idCounter = 0;
  const getSid = (id: string) => {
    let sid = idMap.get(id);
    if (!sid) {
      sid = `v${idCounter++}`;
      idMap.set(id, sid);
    }
    return sid;
  };

  const escapeLabel = (text: string) =>
    text.replace(/"/g, "'").replace(/[\[\]\(\)\{\}]/g, " ").trim();

  const isDark = currentTheme === "dark";
  const lines: string[] = [
    `%%{init: {'theme': '${isDark ? "dark" : "default"}'}}%%`,
    "flowchart TD"
  ];

  for (const node of nodes) {
    const sid = getSid(node.id);
    const label = escapeLabel(node.name ?? node.file_name ?? node.id);
    let line = "";
    if (node.type === "chunk") {
      line = `  ${sid}["📄 ${label}"]:::chunk`;
    } else {
      line = `  ${sid}(["${label}"]):::entity`;
    }
    if (node.id === focusNodeId) {
      line += ":::focus";
    }
    lines.push(line);
  }

  for (const link of links) {
    const s = getSid(link.source);
    const t = getSid(link.target);
    const lbl = escapeLabel(link.label || "");
    if (link.kind === "provenance") {
      lines.push(`  ${s} -.->|${lbl}| ${t}`);
    } else if (lbl) {
      lines.push(`  ${s} -->|${lbl}| ${t}`);
    } else {
      lines.push(`  ${s} --> ${t}`);
    }
  }

  lines.push("  classDef chunk fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#f8fafc;");
  lines.push("  classDef entity fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#ffffff;");
  lines.push("  classDef focus stroke:#38bdf8,stroke-width:3px;");

  return lines.join("\n");
}

async function copyToClipboard(text: string, button: HTMLElement, originalContent: string) {
  try {
    await navigator.clipboard.writeText(text);
    const isIcon = originalContent.includes("<svg");
    button.innerHTML = isIcon ? ICON_CHECK : "copied!";
    setTimeout(() => {
      button.innerHTML = originalContent;
    }, 2000);
  } catch {
    button.innerHTML = "failed";
    setTimeout(() => {
      button.innerHTML = originalContent;
    }, 2000);
  }
}

elCopyQueryMermaid.addEventListener("click", () => {
  if (!lastQueryVisibility || lastQueryVisibility.citedNodeIds.length === 0) {
    const code = exportSubGraphToMermaid(visibleNodeIds.size > 0 ? visibleNodeIds : null);
    void copyToClipboard(code, elCopyQueryMermaid, "export subgraph");
  } else {
    const focusIds = new Set([
      ...lastQueryVisibility.citedNodeIds,
      ...lastQueryVisibility.highlightNodeIds,
    ]);
    const code = exportSubGraphToMermaid(focusIds);
    void copyToClipboard(code, elCopyQueryMermaid, "export subgraph");
  }
});

elPreviewCopyMermaid.addEventListener("click", () => {
  if (!currentPreviewNode) return;
  const relatedIds = new Set<string>([currentPreviewNode.id]);
  if (currentSnapshot) {
    for (const link of currentSnapshot.links) {
      if (link.source === currentPreviewNode.id) relatedIds.add(link.target);
      if (link.target === currentPreviewNode.id) relatedIds.add(link.source);
    }
  }
  const code = exportSubGraphToMermaid(relatedIds, currentPreviewNode.id);
  void copyToClipboard(code, elPreviewCopyMermaid, ICON_SHARE);
});

// Deep Mermaid syntax cleaner, corrector, and normalizer
function normalizeMermaidCode(raw: string): string {
  let code = raw.trim();

  // Strip leading/trailing markdown code fences or backticks if enclosed
  code = code.replace(/^```+\s*(mermaid)?\s*\n?/i, "").replace(/\n?```+\s*$/i, "").trim();

  // Fix common LLM markdown artifacts (e.g. unescaped entities, stray angle brackets)
  code = code.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

  // Ensure Mermaid diagram starts with a valid directive if lines exist
  const lines = code.split("\n");
  const validDirectives = [
    "graph",
    "flowchart",
    "sequencediagram",
    "classdiagram",
    "statediagram",
    "erdiagram",
    "journey",
    "gantt",
    "pie",
    "quadrantchart",
    "requirementdiagram",
    "gitgraph",
    "c4context",
    "mindmap",
    "timeline",
    "zenuml",
    "sankey-beta",
    "xychart-beta",
    "block-beta",
    "packet-beta",
    "kanban",
    "architecture-beta",
  ];

  let firstDirectiveIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("%%")) continue;
    const firstWord = line.split(/[\s\t(:]+/)[0].toLowerCase();
    if (validDirectives.some((dir) => firstWord.startsWith(dir))) {
      firstDirectiveIdx = i;
      break;
    }
  }

  if (firstDirectiveIdx > 0) {
    code = lines.slice(firstDirectiveIdx).join("\n");
  } else if (firstDirectiveIdx === -1 && lines.length > 0) {
    // If no explicit chart directive but has arrows or relations, prepend flowchart TD
    const hasEdges = lines.some((l) => /-->|---|==>|-.->|--\s*\|/.test(l));
    if (hasEdges) {
      code = `flowchart TD\n${code}`;
    }
  }

  return code.trim();
}

let mermaidInitPromise: Promise<any> | null = null;
let currentMermaidTheme: Theme | null = null;

async function getMermaid(forceTheme?: Theme) {
  const targetTheme = forceTheme || currentTheme;
  const isDark = targetTheme === "dark";

  const themeConfig = {
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "Inter, -apple-system, system-ui, sans-serif",
    fontSize: 12,
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: "basis",
    },
    themeVariables: {
      darkMode: isDark,
      background: isDark ? "#080c1d" : "#ffffff",
      primaryColor: isDark ? "#1e293b" : "#f1f5f9",
      primaryBorderColor: isDark ? "#38bdf8" : "#2563eb",
      primaryTextColor: isDark ? "#f8fafc" : "#0f172a",
      lineColor: isDark ? "#94a3b8" : "#64748b",
      secondaryColor: isDark ? "#0f172a" : "#f8fafc",
      tertiaryColor: isDark ? "#1e293b" : "#f1f5f9",
      nodeBorder: isDark ? "#38bdf8" : "#2563eb",
      mainBkg: isDark ? "#0f172a" : "#ffffff",
      nodeTextColor: isDark ? "#f8fafc" : "#0f172a",
    },
  };

  if (!mermaidInitPromise || currentMermaidTheme !== targetTheme) {
    mermaidInitPromise = (async () => {
      try {
        const importEsm = new Function("url", "return import(url)");
        const mod =
          (window as any).mermaid ||
          (await importEsm("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")).default;
        if (mod) {
          mod.initialize(themeConfig);
          currentMermaidTheme = targetTheme;
          return mod;
        }
      } catch (err) {
        console.warn("Mermaid ESM dynamic import failed:", err);
      }
      return null;
    })();
  }
  return mermaidInitPromise;
}

let mermaidCounter = 0;

function attachMermaidListeners(container: HTMLElement) {
  container.querySelectorAll<HTMLButtonElement>(".copy-mermaid-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = btn.getAttribute("data-code") ?? "";
      void copyToClipboard(code, btn, ICON_COPY);
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".toggle-mermaid-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parent = btn.closest(".mermaid-diagram");
      const rawBlock = parent?.querySelector<HTMLElement>(".mermaid-raw");
      if (rawBlock) {
        const isHidden = rawBlock.style.display === "none";
        rawBlock.style.display = isHidden ? "block" : "none";
      }
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".expand-mermaid-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const parent = btn.closest(".mermaid-diagram");
      const code = parent?.getAttribute("data-mermaid-code");
      if (code) {
        void openMermaidModal(unescapeHtml(code));
      }
    });
  });
}

async function renderMermaidBlocksIn(container: HTMLElement) {
  const blocks = container.querySelectorAll<HTMLElement>(".mermaid-diagram");
  if (blocks.length === 0) return;
  const mermaid = await getMermaid();
  if (!mermaid) return;

  for (const block of blocks) {
    const rawEscaped = block.getAttribute("data-mermaid-code") || "";
    if (!rawEscaped) continue;
    const rawCode = normalizeMermaidCode(unescapeHtml(rawEscaped));
    const svgContainer = block.querySelector<HTMLElement>(".mermaid-svg-container");
    const rawBlock = block.querySelector<HTMLElement>(".mermaid-raw");
    const toggleBtn = block.querySelector<HTMLElement>(".toggle-mermaid-btn");
    const errorNotice = block.querySelector<HTMLElement>(".mermaid-error-notice");

    if (!svgContainer) continue;

    try {
      // Deep validation check before rendering
      if (typeof mermaid.parse === "function") {
        const isValid = await mermaid.parse(rawCode);
        if (isValid === false) throw new Error("Mermaid syntax validation returned false");
      }

      const id = `mermaid_svg_${++mermaidCounter}`;
      const { svg, bindFunctions } = await mermaid.render(id, rawCode);
      svgContainer.innerHTML = svg;
      svgContainer.style.display = "block";

      if (typeof bindFunctions === "function") {
        try {
          bindFunctions(svgContainer);
        } catch {
          // ignore optional binding errors
        }
      }

      if (errorNotice) errorNotice.remove();
      if (rawBlock) rawBlock.style.display = "none";
      if (toggleBtn) {
        toggleBtn.style.display = "inline-flex";
      }
    } catch (renderError) {
      console.warn("Mermaid rendering fallback triggered:", renderError);
      svgContainer.style.display = "none";
      if (rawBlock) rawBlock.style.display = "block";
      if (toggleBtn) toggleBtn.style.display = "none";

      // Render non-intrusive syntax diagnostic badge if failed
      if (!block.querySelector(".mermaid-error-notice")) {
        const notice = document.createElement("div");
        notice.className = "mermaid-error-notice";
        notice.innerHTML = `<span title="${escapeHtml(String(renderError))}">⚠️ raw syntax mode</span>`;
        block.querySelector(".mermaid-actions")?.prepend(notice);
      }
    }
  }
}

let mermaidModalScale = 1;
let mermaidModalTranslateX = 0;
let mermaidModalTranslateY = 0;
let isMermaidModalPanning = false;
let mermaidModalStartX = 0;
let mermaidModalStartY = 0;

function updateMermaidModalTransform() {
  const container = elMermaidModalBody.querySelector<HTMLElement>(".mermaid-svg-container");
  if (container) {
    container.style.transform = `translate(${mermaidModalTranslateX}px, ${mermaidModalTranslateY}px) scale(${mermaidModalScale})`;
  }
  elMermaidZoomLevel.textContent = `${Math.round(mermaidModalScale * 100)}%`;
}

function resetMermaidModalZoom() {
  mermaidModalScale = 1;
  mermaidModalTranslateX = 0;
  mermaidModalTranslateY = 0;
  updateMermaidModalTransform();
}

function zoomMermaidModal(factor: number, centerX?: number, centerY?: number) {
  const prevScale = mermaidModalScale;
  const newScale = Math.min(Math.max(mermaidModalScale * factor, 0.2), 5);
  if (newScale === prevScale) return;

  if (centerX !== undefined && centerY !== undefined) {
    const rect = elMermaidModalBody.getBoundingClientRect();
    const offsetX = centerX - rect.left;
    const offsetY = centerY - rect.top;
    mermaidModalTranslateX = offsetX - ((offsetX - mermaidModalTranslateX) / prevScale) * newScale;
    mermaidModalTranslateY = offsetY - ((offsetY - mermaidModalTranslateY) / prevScale) * newScale;
  }
  mermaidModalScale = newScale;
  updateMermaidModalTransform();
}

elMermaidZoomIn.addEventListener("click", () => zoomMermaidModal(1.25));
elMermaidZoomOut.addEventListener("click", () => zoomMermaidModal(0.8));
elMermaidZoomReset.addEventListener("click", () => resetMermaidModalZoom());

elMermaidModalBody.addEventListener("wheel", (e: WheelEvent) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 0.85;
  zoomMermaidModal(factor, e.clientX, e.clientY);
}, { passive: false });

elMermaidModalBody.addEventListener("mousedown", (e: MouseEvent) => {
  if (e.button !== 0) return; // Only left click
  isMermaidModalPanning = true;
  mermaidModalStartX = e.clientX - mermaidModalTranslateX;
  mermaidModalStartY = e.clientY - mermaidModalTranslateY;
});

window.addEventListener("mousemove", (e: MouseEvent) => {
  if (!isMermaidModalPanning) return;
  mermaidModalTranslateX = e.clientX - mermaidModalStartX;
  mermaidModalTranslateY = e.clientY - mermaidModalStartY;
  updateMermaidModalTransform();
});

window.addEventListener("mouseup", () => {
  isMermaidModalPanning = false;
});

async function openMermaidModal(code: string) {
  resetMermaidModalZoom();
  elMermaidModalBody.innerHTML = `<div class="mermaid-svg-container modal-panzoom-content"></div>`;
  elMermaidModal.hidden = false;
  const container = elMermaidModalBody.querySelector<HTMLElement>(".mermaid-svg-container")!;
  const mermaid = await getMermaid();
  if (!mermaid) return;

  try {
    const id = `mermaid_modal_svg_${++mermaidCounter}`;
    const { svg, bindFunctions } = await mermaid.render(id, normalizeMermaidCode(code));
    container.innerHTML = svg;
    if (typeof bindFunctions === "function") {
      bindFunctions(container);
    }
  } catch (err) {
    container.innerHTML = `<pre class="mermaid-raw"><code>${escapeHtml(code)}</code></pre><div class="mermaid-error-notice">Render failed: ${escapeHtml(String(err))}</div>`;
  }
}

elMermaidModalClose.addEventListener("click", () => {
  elMermaidModal.hidden = true;
});

elMermaidModal.addEventListener("click", (e) => {
  if (e.target === elMermaidModal) {
    elMermaidModal.hidden = true;
  }
});

async function openPreview(node: GraphNode) {
  currentPreviewNode = node;

  // Show copy links button ONLY if node has relationships in current snapshot
  const hasLinks = currentSnapshot?.links.some(
    (l) => l.source === node.id || l.target === node.id,
  );
  elPreviewCopyMermaid.innerHTML = ICON_SHARE;
  elPreviewCopyMermaid.style.display = hasLinks ? "inline-flex" : "none";

  const requestGeneration = ++previewRequestGeneration;
  previewAbortController?.abort();
  const controller = new AbortController();
  previewAbortController = controller;

  // Tween camera toward the node
  if (node.x != null && node.y != null && node.z != null) {
    const distance = 140;
    const radialDistance = Math.max(1, Math.hypot(node.x, node.y, node.z));
    const ratio = 1 + distance / radialDistance;
    Graph.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      800,
    );
  }
  elPreviewTitle.textContent = node.name ?? node.file_name ?? node.id;
  elPreviewBody.innerHTML = `<em style="color: var(--fg-mute)">loading…</em>`;
  elPreview.hidden = false;
  try {
    const params = new URLSearchParams({ node_id: node.id });
    const data = await fetchVersioned<ExpandResponse>(
      "expand",
      { signal: controller.signal },
      params,
    );
    if (requestGeneration !== previewRequestGeneration) return;
    elPreviewTitle.textContent = data.file_name;
    elPreviewBody.innerHTML = `
      ${renderMarkdownBlock(data.markdown)}
      <div class="preview-meta">${escapeHtml(data.file_path)}</div>
    `;
    attachMermaidListeners(elPreviewBody);
    void renderMermaidBlocksIn(elPreviewBody);
  } catch (error) {
    if (requestGeneration !== previewRequestGeneration) return;
    elPreviewBody.innerHTML = `<em style="color: var(--fg-mute)">${escapeHtml(
      errorMessage(error),
    )}</em>`;
  } finally {
    if (previewAbortController === controller) previewAbortController = null;
  }
}

elPreviewBody.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(".wikilink");
  if (!target) return;
  event.preventDefault();
  const noteName = target.getAttribute("data-target")?.toLowerCase().trim();
  if (!noteName) return;
  const nodes = Graph.graphData().nodes as GraphNode[];
  const match = nodes.find(
    (n) =>
      n.name?.toLowerCase() === noteName ||
      n.file_name?.toLowerCase().replace(/\.md$/, "") === noteName ||
      n.id.toLowerCase() === noteName,
  );
  if (match) {
    openPreview(match);
    highlightNodes([match.id]);
  } else {
    elQ.value = `Explain ${noteName}`;
    askQuestion();
  }
});

function closePreview() {
  currentPreviewNode = null;
  previewRequestGeneration += 1;
  previewAbortController?.abort();
  previewAbortController = null;
  elPreview.hidden = true;
}

function unescapeHtml(value: string): string {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.documentElement.textContent || value;
}

// Configure marked with Kwipu extensions
marked.use({
  gfm: true,
  breaks: true,
});

// Wikilink Extension: [[Target|Label]]
const wikilinkExtension = {
  name: "wikilink",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("[[");
  },
  tokenizer(src: string) {
    const rule = /^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: "wikilink",
        raw: match[0],
        target: match[1],
        label: match[2] || match[1],
      };
    }
    return undefined;
  },
  renderer(token: any) {
    return `<a href="#" class="wikilink" data-target="${escapeHtml(token.target)}">${escapeHtml(token.label)}</a>`;
  },
};

marked.use({
  extensions: [wikilinkExtension],
  renderer: {
    code(token: any) {
      if (token.lang === "mermaid") {
        const code = token.text.trim();
        return `
          <div class="mermaid-diagram" data-mermaid-code="${escapeHtml(code)}">
            <div class="mermaid-diagram-head">
              <span>Mermaid Diagram</span>
              <div class="mermaid-actions">
                <button class="link-btn expand-mermaid-btn" title="Expand Diagram">${ICON_EXPAND}</button>
                <button class="link-btn toggle-mermaid-btn" title="Show/Hide Code">${ICON_CODE}</button>
                <button class="link-btn copy-mermaid-btn" title="Copy Mermaid Code" data-code="${escapeHtml(code)}">${ICON_COPY}</button>
              </div>
            </div>
            <div class="mermaid-svg-container" style="display:none;"></div>
            <pre class="mermaid-raw"><code>${escapeHtml(code)}</code></pre>
          </div>`;
      }
      return false; // Return false to use default renderer
    },
  },
});

function renderMarkdownBlock(source: string): string {
  let yamlHtml = "";
  const content = source.replace(/^---\n([\s\S]*?)\n---\n?/, (_, yaml: string) => {
    const rows = yaml
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          const k = line.slice(0, colonIdx).trim();
          const v = line.slice(colonIdx + 1).trim();
          return `<div><span style="color: var(--fg); font-weight: 500;">${k}:</span> <span style="color: var(--fg-soft);">${v}</span></div>`;
        }
        return `<div>${line}</div>`;
      })
      .join("");
    yamlHtml = `<div class="preview-meta" style="margin: 0 0 14px; border-top:none; padding-top:0; border-bottom: 1px solid var(--line); padding-bottom: 10px;">${rows}</div>`;
    return "";
  });

  const html = marked.parse(content) as string;
  return yamlHtml + html;
}

elReload.addEventListener("click", loadGraph);
elChunks.addEventListener("change", loadGraph);
elNoisy.addEventListener("change", loadGraph);
elMinDeg.addEventListener("input", () => {
  elMinDegVal.textContent = elMinDeg.value;
});
elMinDeg.addEventListener("change", loadGraph);

window.addEventListener("resize", () => {
  Graph.width(elGraph.clientWidth).height(elGraph.clientHeight);
});

const elThemeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle");

export function applyTheme(theme: Theme) {
  currentTheme = theme;
  COLORS = THEME_PALETTES[theme];
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("kwipu-theme", theme);
  if (elThemeToggle) {
    elThemeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    elThemeToggle.title = `Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`;
  }
  if (Graph) {
    Graph.backgroundColor(COLORS.bg);
    updateNodeVisuals();
    Graph.linkColor(Graph.linkColor());
  }
  renderLegend();
}

if (elThemeToggle) {
  elThemeToggle.addEventListener("click", () => {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
}

// Apply persisted or default theme
applyTheme(currentTheme);

renderSceneMeta();
void (async () => {
  await loadHealth();
  await loadGraph();
})();

// Expose hooks for tests & debugging
Object.assign(window, {
  __kwipu: {
    Graph,
    openPreview,
    askQuestion,
    clearHighlight,
    applyTheme,
  },
});

