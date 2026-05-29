export interface ImageItem {
  id: string;              // Unique identifier (UUID or index)
  source: "url" | "file";  // Where it came from
  url: string;             // Blob URL (for local files) or proxy URL/raw URL (for remote)
  originalUrl?: string;    // Raw URL entered by user if visual proxy URL is used
  name: string;            // Filename or clean label derived from URL
  size?: number;           // File size in bytes if local
  status: "pending" | "processing" | "success" | "error";
  hash: string | null;     // 16-character hex representation of 64-bit pHash
  error: string | null;    // Error message if any
  dimensions: {
    width: number;
    height: number;
  } | null;
}

export interface ImageGroup {
  id: string;
  representativeId: string; // The "original" or first image representing this group
  items: Array<{
    id: string;             // Member image ID
    similarity: number;     // Similarity percentage (0 - 100)
    distance: number;       // Hamming distance (0 - 64)
  }>;
}

export interface HashCache {
  [key: string]: {
    hash: string;
    width: number;
    height: number;
  };
}

export interface ProcessingProgress {
  total: number;
  current: number;
  success: number;
  failed: number;
  isProcessing: boolean;
  statusText: string;
}
