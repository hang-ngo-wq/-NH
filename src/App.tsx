import { useState, useEffect, useRef } from "react";
import { 
  Database,
  Image as ImageIcon,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Clock
} from "lucide-react";

import Header from "./components/Header";
import InputSection from "./components/InputSection";
import ProgressIndicator from "./components/ProgressIndicator";
import ResultsSection from "./components/ResultsSection";

import { ImageItem, ProcessingProgress, HashCache } from "./types";
import { calculatePHash } from "./utils/imageHash";

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(90);
  const [progress, setProgress] = useState<ProcessingProgress>({
    total: 0,
    current: 0,
    success: 0,
    failed: 0,
    isProcessing: false,
    statusText: "",
  });

  const [lightboxImage, setLightboxImage] = useState<ImageItem | null>(null);
  const [hashCache, setHashCache] = useState<HashCache>(() => {
    try {
      const stored = localStorage.getItem("pHash_cache_store_v1");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Track the abort signal to cancel intermediate downloads safely if requested
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStopRequestedRef = useRef<boolean>(false);

  // Sync cache changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("pHash_cache_store_v1", JSON.stringify(hashCache));
    } catch (e) {
      console.warn("localStorage quota exceeded, could not persist image pHash cache.", e);
    }
  }, [hashCache]);

  // Append new images (local files or remote URLs) to queue
  const handleAddImages = (urls: string[], files: File[]) => {
    const newItems: ImageItem[] = [];

    // Add remote URLs
    urls.forEach((url, i) => {
      // Avoid uploading literal duplicates of URL strings already present
      if (images.some((img) => img.originalUrl === url || img.url === url)) {
        return;
      }
      
      const fileName = url.split("/").pop()?.split("?")[0] || `remote_image_${Date.now()}_${i}`;
      const uniqueId = `rem_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
      
      // We will load remote images through a local API proxy to guarantee bypass of CORS restrictions safely!
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;

      newItems.push({
        id: uniqueId,
        source: "url",
        url: proxyUrl,
        originalUrl: url,
        name: fileName,
        status: "pending",
        hash: null,
        error: null,
        dimensions: null,
      });
    });

    // Add local File objects
    files.forEach((file, i) => {
      const uniqueId = `loc_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
      newItems.push({
        id: uniqueId,
        source: "file",
        url: URL.createObjectURL(file), // Direct local blob
        originalUrl: file.name,
        name: file.name,
        size: file.size,
        status: "pending",
        hash: null,
        error: null,
        dimensions: null,
      });
    });

    if (newItems.length === 0) return;

    setImages((prev) => [...prev, ...newItems]);

    // Automatically trigger queue processing on adding elements
    setTimeout(() => {
      triggerBatchProcessing([...images, ...newItems]);
    }, 100);
  };

  // Perform parallel processing of images in multiple batches to maintain extreme performance
  const triggerBatchProcessing = async (currentImages: ImageItem[]) => {
    const pending = currentImages.filter((img) => img.status === "pending" || img.status === "error");
    if (pending.length === 0) return;

    // Reset loop states
    isStopRequestedRef.current = false;
    abortControllerRef.current = new AbortController();

    setProgress({
      total: pending.length,
      current: 0,
      success: 0,
      failed: 0,
      isProcessing: true,
      statusText: "Bắt đầu tải và lập chỉ mục hàm băm ảnh...",
    });

    // Loop through sequentially to prevent overwhelming system memory
    // concurrency count = 3 workers
    const concurrency = 3;
    let index = 0;
    let completedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    const runWorker = async () => {
      while (index < pending.length && !isStopRequestedRef.current) {
        const itemToProcess = pending[index];
        index++; // Increment index for subsequent worker fetch checks

        if (!itemToProcess) continue;

        // Mark item as processing
        setImages((prev) =>
          prev.map((img) =>
            img.id === itemToProcess.id ? { ...img, status: "processing" } : img
          )
        );

        setProgress((prev) => ({
          ...prev,
          statusText: `Đang xử lý: ${itemToProcess.name}`,
        }));

        try {
          const cacheKey = itemToProcess.originalUrl || itemToProcess.url;
          let calculated: { hash: string; width: number; height: number };

          if (hashCache[cacheKey]) {
            calculated = hashCache[cacheKey];
          } else {
            // Read image from blob URL or Remote Proxy URL
            // Pass actual file or proxy URL
            const processSource = itemToProcess.source === "file" 
              ? currentImages.find(i => i.id === itemToProcess.id)?.url // blob URL matching index
              : itemToProcess.url; // proxy URL

            calculated = await calculatePHash(processSource || itemToProcess.url);
            
            // Save hash calculation inside memory cache store
            setHashCache((prev) => ({
              ...prev,
              [cacheKey]: {
                hash: calculated.hash,
                width: calculated.width,
                height: calculated.height,
              },
            }));
          }

          // Update success state of item
          setImages((prev) =>
            prev.map((img) =>
              img.id === itemToProcess.id
                ? {
                    ...img,
                    status: "success",
                    hash: calculated.hash,
                    dimensions: { width: calculated.width, height: calculated.height },
                  }
                : img
            )
          );

          successCount++;
        } catch (err: any) {
          console.error("Lỗi phân tích ID: " + itemToProcess.id, err);
          
          setImages((prev) =>
            prev.map((img) =>
              img.id === itemToProcess.id
                ? {
                    ...img,
                    status: "error",
                    error: err?.message || "Lỗi nạp hoặc tạo pHash",
                  }
                : img
            )
          );
          failedCount++;
        }

        completedCount++;
        
        // Push intermediate update
        setProgress((prev) => ({
          ...prev,
          current: completedCount,
          success: successCount,
          failed: failedCount,
        }));
      }
    };

    // Initialize parallel workers
    const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () => runWorker());
    await Promise.all(workers);

    // Conclude progress reporting
    setProgress((prev) => ({
      ...prev,
      isProcessing: false,
      statusText: isStopRequestedRef.current 
        ? "Tiến trình đã được người dùng dừng lại." 
        : `Phân tích hoàn tất! Thành công: ${successCount}, Thất bại: ${failedCount}`,
    }));
  };

  const handleAbort = () => {
    isStopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setProgress((prev) => ({
      ...prev,
      isProcessing: false,
      statusText: "Đang dừng các tác vụ xử lý hình ảnh đang xếp hàng...",
    }));
  };

  const handleRemoveImages = (idsToRemove: string[]) => {
    setImages((prev) => prev.filter((img) => !idsToRemove.includes(img.id)));
  };

  const handleClearAll = () => {
    if (confirm("Bạn có chắc chắn muốn xóa toàn bộ danh sách hình ảnh đã tải lên?")) {
      handleAbort();
      setImages([]);
      setProgress({
        total: 0,
        current: 0,
        success: 0,
        failed: 0,
        isProcessing: false,
        statusText: "",
      });
    }
  };

  // Lightbox navigational controls
  const handleNavLightbox = (dir: "prev" | "next") => {
    if (!lightboxImage) return;
    const sIndex = images.findIndex((img) => img.id === lightboxImage.id);
    if (sIndex === -1) return;

    let targetIndex = dir === "next" ? sIndex + 1 : sIndex - 1;
    if (targetIndex < 0) targetIndex = images.length - 1;
    if (targetIndex >= images.length) targetIndex = 0;

    setLightboxImage(images[targetIndex]);
  };

  // Keyboard accessibility for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxImage) return;
      if (e.key === "ArrowLeft") handleNavLightbox("prev");
      if (e.key === "ArrowRight") handleNavLightbox("next");
      if (e.key === "Escape") setLightboxImage(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage, images]);

  const clearHashCache = () => {
    if (confirm("Xóa bộ nhớ cache? Tất cả các hash ảnh sẽ phải tính toán lại từ đầu.")) {
      setHashCache({});
      localStorage.removeItem("pHash_cache_store_v1");
      alert("Đã xóa bộ nhớ cache băm ảnh thành công.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/70" id="main-app-shell">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Core Settings / Metrics cards indicator banner */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-4.5 flex items-center gap-4.5 shadow-3xs">
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-xs text-slate-400 font-medium">Hàng đợi hình ảnh</span>
              <span className="text-xl font-extrabold text-slate-800 font-mono" id="metrics-panel-total">
                {images.length}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4.5 flex items-center gap-4.5 shadow-3xs">
            <div className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-xs text-slate-400 font-medium">Số ảnh đã lưu Cache</span>
              <span className="text-xl font-extrabold text-slate-800 font-mono" id="metrics-panel-cache">
                {Object.keys(hashCache).length}
              </span>
            </div>
            <button
              onClick={clearHashCache}
              className="ml-auto rounded-lg border border-slate-200/60 hover:border-slate-300 font-semibold px-2 py-1 text-[10px] text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
            >
              Clear Cache
            </button>
          </div>

          <div className="rounded-2xl border border-rose-50 bg-rose-50/20 p-4.5 flex items-center gap-4.5 shadow-3xs">
            <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-xs text-slate-400 font-medium text-rose-800">Ảnh phân tích lỗi</span>
              <span className="text-xl font-extrabold text-rose-600 font-mono" id="metrics-panel-failed">
                {images.filter((img) => img.status === "error").length}
              </span>
            </div>
          </div>
        </div>

        {/* Input Section Frame wrapper */}
        <InputSection
          onAddImages={handleAddImages}
          onClearAll={handleClearAll}
          isLoading={progress.isProcessing}
          totalLoaded={images.length}
        />

        {/* Dynamic processing status board */}
        <ProgressIndicator progress={progress} onAbort={handleAbort} />

        {/* Image Error Alert Summary section */}
        {images.some((i) => i.status === "error") && (
          <div className="rounded-2xl bg-rose-50/50 border border-rose-100 p-4" id="error-summary-alert">
            <div className="flex gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-950">Có một số ảnh nguồn bị lỗi không thể tải về từ bên ngoài:</h4>
                <p className="text-[11px] text-rose-700/90 mt-1 max-w-4xl line-clamp-3 leading-relaxed">
                  Nguyên nhân chủ yếu do máy chủ ảnh bên thứ ba cấu hình chính sách chặn CORS (ví dụ các trang bảo mật, link hết hạn). Hệ thống đã tự động thử tải thông qua Proxy nội bộ, tuy nhiên một số máy chủ bảo vệ chặt chẽ vẫn từ chối. Bạn có thể thay thế bằng file ảnh gốc download trực tiếp về máy rồi kéo thả vào ô tải lên.
                </p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => {
                      const failedIds = images.filter((i) => i.status === "error").map((i) => i.id);
                      handleRemoveImages(failedIds);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-200"
                  >
                    Gỡ các tệp lỗi khỏi danh sách ({images.filter((i) => i.status === "error").length})
                  </button>
                  <button
                    onClick={() => triggerBatchProcessing(images)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Thử phân tích lại các ảnh lỗi
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Computed results clustering section */}
        <div className="border-t border-slate-100 pt-6">
          <ResultsSection
            images={images}
            onRemoveImages={handleRemoveImages}
            onViewImage={setLightboxImage}
            similarityThreshold={similarityThreshold}
            setSimilarityThreshold={setSimilarityThreshold}
          />
        </div>
      </main>

      {/* Full-Screen Lightbox Viewport */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-4 backdrop-blur-xs select-none"
          id="custom-lightbox-overlay"
        >
          {/* Header controls of lightbox */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white md:left-6 md:right-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-slate-400">Xem ảnh chi tiết</span>
              <h3 className="text-sm font-semibold truncate max-w-[280px] sm:max-w-xl" id="lightbox-filename">
                {lightboxImage.name}
              </h3>
            </div>
            
            <button
              id="btn-close-lightbox"
              onClick={() => setLightboxImage(null)}
              className="rounded-full bg-slate-800/80 p-2 text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Controls */}
          <button
            id="lightbox-btn-prev"
            onClick={() => handleNavLightbox("prev")}
            className="absolute left-4 z-20 rounded-full bg-slate-900/40 p-3.5 text-slate-300 hover:bg-slate-900/80 hover:text-white transition-all md:left-8 cursor-pointer border border-slate-800"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button
            id="lightbox-btn-next"
            onClick={() => handleNavLightbox("next")}
            className="absolute right-4 z-20 rounded-full bg-slate-900/40 p-3.5 text-slate-300 hover:bg-slate-900/80 hover:text-white transition-all md:right-8 cursor-pointer border border-slate-800"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Core main large visual component */}
          <div className="max-h-[75vh] max-w-[85vw] overflow-hidden flex items-center justify-center relative">
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="max-h-[75vh] max-w-[85vw] rounded-lg shadow-2xl object-contain object-center"
            />
          </div>

          {/* Bottom details card metadata bar of lightbox */}
          <div className="absolute bottom-6 mx-auto w-full max-w-xl rounded-2xl bg-slate-900/90 border border-slate-800 p-4 text-xs text-slate-300 backdrop-blur-sm space-y-2 text-center">
            <div className="flex justify-between items-center text-slate-400 border-b border-slate-800 pb-2">
              <span>Độ phân giải thực: {lightboxImage.dimensions ? `${lightboxImage.dimensions.width}px x ${lightboxImage.dimensions.height}px` : "N/A"}</span>
              <span className="capitalize px-2 py-0.5 rounded-sm bg-slate-800 text-[10px] font-bold text-indigo-400">Source: {lightboxImage.source}</span>
            </div>
            <div className="flex gap-2 justify-center font-mono text-[10px] sm:text-xs">
              <span className="text-slate-400">pHash:</span>
              <span className="font-bold text-white tracking-widest selection:bg-indigo-600 select-all">
                {lightboxImage.hash || "Chưa tính toán"}
              </span>
            </div>
            {lightboxImage.source === "url" && (
              <p className="truncate text-slate-500 text-[10px]" title={lightboxImage.originalUrl}>
                URL: {lightboxImage.originalUrl}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
