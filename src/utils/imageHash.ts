import { ImageGroup } from "../types";

/**
 * Perceptual Image Hashing (pHash) implementation in TypeScript.
 * Uses 2D Discrete Cosine Transform (DCT) on 32x32 grayscale image representation.
 */

/**
 * Loads an image from a source URL and returns an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Allow reading pixels of CORS-enabled remote hosts
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      reject(new Error("Lỗi tải ảnh: Link hỏng hoặc bị chặn CORS. Công cụ sẽ tự động thử qua Proxy."));
    };
    img.src = src;
  });
}

/**
 * Gets grayscale pixel values and resizes the image to 32x32
 */
export function getGrayscale32x32(img: HTMLImageElement): number[][] {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  
  if (!ctx) {
    throw new Error("Không thể khởi tạo canvas 2D context");
  }

  // Draw image stretched to 32x32
  ctx.drawImage(img, 0, 0, 32, 32);
  const imgData = ctx.getImageData(0, 0, 32, 32);
  const data = imgData.data;

  const matrix: number[][] = [];
  for (let y = 0; y < 32; y++) {
    const row: number[] = [];
    for (let x = 0; x < 32; x++) {
      const idx = (y * 32 + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Standard luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      row.push(gray);
    }
    matrix.push(row);
  }
  
  return matrix;
}

/**
 * Computes 2D Discrete Cosine Transform (DCT) for the top-left 8x8 coefficients of a 32x32 matrix.
 * This is highly optimized as we only calculate the 64 coefficients we actually need!
 */
export function computeDCT8x8(matrix: number[][]): number[][] {
  const dct: number[][] = [];
  const N = 32;

  // Precompute cosines for speed optimization
  const cosMap: number[][] = [];
  for (let i = 0; i < N; i++) {
    cosMap[i] = [];
    for (let u = 0; u < 8; u++) {
      cosMap[i][u] = Math.cos(((2 * i + 1) * u * Math.PI) / (2 * N));
    }
  }

  for (let u = 0; u < 8; u++) {
    const row: number[] = [];
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          sum += matrix[i][j] * cosMap[i][u] * cosMap[j][v];
        }
      }

      const alphaU = u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
      const alphaV = v === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
      row.push(alphaU * alphaV * sum);
    }
    dct.push(row);
  }

  return dct;
}

/**
 * Generates a 64-bit hex perceptual hash (pHash) from the 8x8 DCT matrix
 */
export function generateHashFromDCT(dct: number[][]): string {
  // Extract values, excluding the DC coefficient at (0,0) for lighting invariance
  const flatValues: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue;
      flatValues.push(dct[u][v]);
    }
  }

  // Calculate mean of the 63 AC coefficients
  const sum = flatValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / flatValues.length;

  // Build binary hash: 1 if coefficient >= mean, 0 otherwise
  // We use 64 bits. For mapping, we can include the DC coefficient (comparing it to the mean too) or set index 0 to 0.
  // Best practice: comparing all 64 coefficients to the mean of AC coefficients provides robust results.
  let binaryString = "";
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      const val = dct[u][v];
      binaryString += val >= mean ? "1" : "0";
    }
  }

  // Convert binary string to 16-character hexadecimal string
  let hexString = "";
  for (let i = 0; i < 64; i += 4) {
    const nibble = binaryString.substring(i, i + 4);
    const hex = parseInt(nibble, 2).toString(16);
    hexString += hex;
  }

  return hexString;
}

/**
 * Main function to retrieve pHash and size metrics of an image
 * Handles both local File objects and URLs.
 * Resolves CORS issues dynamically using server proxy when needed.
 */
export async function calculatePHash(
  source: string | File,
  useProxy = true
): Promise<{ hash: string; width: number; height: number }> {
  let imgSource = "";
  let isURL = false;

  if (source instanceof File) {
    imgSource = URL.createObjectURL(source);
  } else {
    imgSource = source;
    isURL = true;
  }

  try {
    let img: HTMLImageElement;
    try {
      img = await loadImage(imgSource);
    } catch (err) {
      if (isURL && useProxy) {
        // Fallback to proxy-mediated loading
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(imgSource)}`;
        img = await loadImage(proxyUrl);
      } else {
        throw err;
      }
    }

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // Run custom browser transformations
    const grayscaleMatrix = getGrayscale32x32(img);
    const dctMatrix = computeDCT8x8(grayscaleMatrix);
    const hash = generateHashFromDCT(dctMatrix);

    // Clean up local blob URLs
    if (source instanceof File) {
      URL.revokeObjectURL(imgSource);
    }

    return { hash, width, height };
  } catch (error: any) {
    if (source instanceof File) {
      URL.revokeObjectURL(imgSource);
    }
    throw new Error(error?.message || "Lỗi xử lý hình ảnh.");
  }
}

/**
 * Calculates the Hamming Distance between two 64-bit hexadecimal hashes
 * Returns number between 0 and 64 (0 means identical, 64 is opposite).
 */
export function getHammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    // Return maximum distance if hashes are malformed
    return 64;
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const val1 = parseInt(hash1[i], 16);
    const val2 = parseInt(hash2[i], 16);
    let xor = val1 ^ val2;
    // Count population bit count (standard bitwise popcount)
    while (xor > 0) {
      if (xor & 1) distance++;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Translates proximity of two hashes into percentage similarity (70% - 100%)
 */
export function getSimilarityPercent(hash1: string, hash2: string): number {
  const distance = getHammingDistance(hash1, hash2);
  const similarity = (1 - distance / 64) * 100;
  return Number(similarity.toFixed(2));
}

/**
 * Group images based on similarity threshold.
 * Uses Single-Linkage Clustering or Leader-Following cluster allocation.
 * Returns an array of similarity groups.
 */
export function clusterSimilarImages(
  items: Array<{ id: string; hash: string | null }>,
  similarityThreshold: number // 70 to 100
): ImageGroup[] {
  const activeItems = items.filter((item) => item.hash !== null) as Array<{
    id: string;
    hash: string;
  }>;

  const groups: ImageGroup[] = [];
  const assignedItemIds = new Set<string>();

  // Sort items or pick leaders. Leader standard algorithm is fast and intuitive:
  // Step through each item. If close to an existing group leader, add to group. Otherwise start a new group.
  for (const item of activeItems) {
    if (assignedItemIds.has(item.id)) continue;

    let bestGroupIdx = -1;
    let maxSimilarity = 0;
    let minDistance = 64;

    for (let g = 0; g < groups.length; g++) {
      const leaderId = groups[g].representativeId;
      const leaderHash = activeItems.find((i) => i.id === leaderId)?.hash;

      if (leaderHash) {
        const sim = getSimilarityPercent(item.hash, leaderHash);
        const dist = getHammingDistance(item.hash, leaderHash);
        if (sim >= similarityThreshold && sim > maxSimilarity) {
          maxSimilarity = sim;
          minDistance = dist;
          bestGroupIdx = g;
        }
      }
    }

    if (bestGroupIdx !== -1) {
      groups[bestGroupIdx].items.push({
        id: item.id,
        similarity: maxSimilarity,
        distance: minDistance,
      });
      assignedItemIds.add(item.id);
    } else {
      // Create a new cluster group
      const newGroupId = `group_${item.id}`;
      groups.push({
        id: newGroupId,
        representativeId: item.id,
        items: [
          {
            id: item.id,
            similarity: 100,
            distance: 0,
          },
        ],
      });
      assignedItemIds.add(item.id);
    }
  }

  // Filter out singleton groups (groups with only 1 image) as they do not have any duplicates
  // Wait! Do we want to keep them or screen them? Usually we show "Trùng" and "Tương đồng" groups.
  // We can filter for groups with items.length > 1. Let's return all, and let the UI filter them dynamically, so we can display stats!
  return groups;
}
