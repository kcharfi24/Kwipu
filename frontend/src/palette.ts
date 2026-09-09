import chroma from "chroma-js";

/**
 * BatchPalette generates a perceptually distinct palette for a given set of categories.
 * It uses CIEDE2000 Delta E to ensure maximum visual distance.
 */
export class BatchPalette {
  private registry: Map<string, string> = new Map();
  private storageKey: string = "kwipu-palette-registry";

  constructor(private chromaVal = 65, private lightnessVal = 55) {
    this.loadFromStorage();
  }

  /**
   * Generates a palette of N colors that are perceptually far apart.
   * Uses a farthest-point sampling strategy in HCL space.
   */
  private generateDistinctColors(n: number): string[] {
    if (n <= 0) return [];
    if (n === 1) return [chroma.hcl(0, this.chromaVal, this.lightnessVal).hex()];

    const candidates: string[] = [];
    // We sample 360 points around the hue circle
    const pool = Array.from({ length: 360 }, (_, i) =>
      chroma.hcl(i, this.chromaVal, this.lightnessVal)
    );

    // Start with a deterministic seed hue (0)
    candidates.push(pool[0].hex());

    while (candidates.length < n) {
      let bestCandidate = pool[0];
      let maxMinDistance = -1;

      for (const p of pool) {
        let minDistanceToSelected = Infinity;
        for (const selected of candidates) {
          const dist = chroma.deltaE(p, chroma(selected));
          if (dist < minDistanceToSelected) {
            minDistanceToSelected = dist;
          }
        }

        if (minDistanceToSelected > maxMinDistance) {
          maxMinDistance = minDistanceToSelected;
          bestCandidate = p;
        }
      }
      candidates.push(bestCandidate.hex());
    }

    return candidates;
  }

  /**
   * Assigns colors to a batch of categories.
   * Clusters are sorted by frequency so larger clusters get "first" colors.
   */
  public assign(categories: string[]): void {
    if (categories.length === 0) return;

    // Count frequencies
    const counts = new Map<string, number>();
    for (const cat of categories) {
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }

    // Sort unique categories by frequency (descending)
    const sortedCats = Array.from(counts.keys()).sort((a, b) => {
      const freqDiff = counts.get(b)! - counts.get(a)!;
      return freqDiff !== 0 ? freqDiff : a.localeCompare(b);
    });

    // Check if we already have these exact categories assigned
    const currentKeys = Array.from(this.registry.keys()).sort().join("|");
    const newKeys = Array.from(sortedCats).sort().join("|");

    if (currentKeys !== newKeys) {
      const colors = this.generateDistinctColors(sortedCats.length);
      const newRegistry = new Map<string, string>();
      sortedCats.forEach((cat, i) => {
        newRegistry.set(cat, colors[i]);
      });

      this.registry = newRegistry;
      this.saveToStorage();
    }
  }

  public getColor(category: string, theme: "dark" | "light" = "dark"): string {
    // Special cases handled outside or here?
    // main.ts handles Chunk and Default separately, but we can provide a fallback.
    const color = this.registry.get(category);
    if (!color) return theme === "dark" ? "#94a3b8" : "#475569";

    // We can adjust lightness slightly for theme if needed,
    // but HCL(65, 55) is usually a good middle ground.
    return color;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.registry = new Map(Object.entries(data));
      }
    } catch (e) {
      console.warn("Failed to load palette from storage", e);
    }
  }

  private saveToStorage(): void {
    try {
      const data = Object.fromEntries(this.registry.entries());
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save palette to storage", e);
    }
  }
}

export const palette = new BatchPalette();
