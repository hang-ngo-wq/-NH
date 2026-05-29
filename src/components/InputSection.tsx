import React, { useState, useRef } from "react";
import { Link, Upload, FileSpreadsheet, Trash2, ArrowRight, HelpCircle } from "lucide-react";
import { ImageItem } from "../types";

interface InputSectionProps {
  onAddImages: (urls: string[], files: File[]) => void;
  onClearAll: () => void;
  isLoading: boolean;
  totalLoaded: number;
}

export default function InputSection({
  onAddImages,
  onClearAll,
  isLoading,
  totalLoaded,
}: InputSectionProps) {
  const [urlInput, setUrlInput] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Parse list of URLs, supporting simple multiline URLs or general CSV parsing
  const handleParseUrls = () => {
    if (!urlInput.trim()) return;
    
    // Split by newlines, carriage returns or commas, filter empty lines
    const parsed = urlInput
      .split(/[\n,;]/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http://") || u.startsWith("https://"));

    if (parsed.length > 0) {
      onAddImages(parsed, []);
      setUrlInput("");
    }
  };

  // Helper to extract URLs from text files (like Google Sheets exported CSVs)
  const extractUrlsFromText = (text: string): string[] => {
    // Look for anything beginning with http:// or https:// and ending before typical delimiters
    const urlRegex = /(https?:\/\/[^\s",;<>]+)/gi;
    const matches = text.match(urlRegex) || [];
    
    // Clean URLs by removing trailing parentheses, trailing commas/quotes
    return Array.from(
      new Set(
        matches.map((url) => {
          let clean = url;
          // Trim end character if it's typical trailing garbage in csv
          if (clean.endsWith(",") || clean.endsWith('"') || clean.endsWith("'")) {
            clean = clean.slice(0, -1);
          }
          return clean.trim();
        })
      )
    ).filter((u) => u.length > 5);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const urls = extractUrlsFromText(text);
      if (urls.length > 0) {
        onAddImages(urls, []);
      } else {
        alert("Không tìm thấy link ảnh nào trong file CSV này.");
      }
    };
    reader.readAsText(file);
    
    // Reset element to allow re-upload of same file
    if (e.target) e.target.value = "";
  };

  const handleImageFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      onAddImages([], files);
    }
    if (e.target) e.target.value = "";
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files || []) as File[];
    if (files.length > 0) {
      // Check if there are CSV/text files or image files
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      const textFiles = files.filter(
        (f) => f.type === "text/csv" || f.name.endsWith(".csv") || f.name.endsWith(".txt")
      );

      if (imageFiles.length > 0) {
        onAddImages([], imageFiles);
      }

      if (textFiles.length > 0) {
        // Read the first text file for URLs
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          const urls = extractUrlsFromText(text);
          if (urls.length > 0) {
            onAddImages(urls, []);
          }
        };
        reader.readAsText(textFiles[0]);
      }
    }
  };

  const triggerImageSelect = () => {
    fileInputRef.current?.click();
  };

  const triggerCSVSelect = () => {
    csvInputRef.current?.click();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" id="input-section-container">
      {/* Tab 1: URL input list */}
      <div className="col-span-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs lg:col-span-2">
        <label className="mb-2 block text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <Link className="h-4 w-4 text-indigo-500" />
          Dán danh sách URL hình ảnh
        </label>
        <p className="mb-3 text-xs text-slate-500">
          Nhập mỗi URL ảnh trên một dòng độc lập (hỗ trợ .jpg, .png, .webp, v.v.). Bạn có thể lấy từ Google Sheets.
        </p>

        <textarea
          id="url-textarea-input"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Ví dụ:&#10;https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5&#10;https://images.unsplash.com/photo-1544005313-94ddf0286df2"
          className="h-40 w-full rounded-xl border border-slate-200 p-3.5 text-sm font-mono text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
          disabled={isLoading}
        / >

        <div className="mt-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2">
            <button
              id="btn-import-urls"
              onClick={handleParseUrls}
              disabled={isLoading || !urlInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              Analyze URLs
              <ArrowRight className="h-4 w-4" />
            </button>

            {totalLoaded > 0 && (
              <button
                id="btn-clear-all"
                onClick={onClearAll}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                Xóa tất cả ({totalLoaded})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={csvInputRef}
              onChange={handleCSVUpload}
              accept=".csv,.txt"
              className="hidden"
            />
            <button
              id="btn-upload-csv"
              type="button"
              onClick={triggerCSVSelect}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Nhập từ CSV
            </button>
          </div>
        </div>
      </div>

      {/* Tab 2: Drag & drop upload files (local images) */}
      <div className="col-span-1">
        <div
          id="dropzone-area"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerImageSelect}
          className={`flex h-full min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
            dragActive
              ? "border-indigo-500 bg-indigo-50/50"
              : "border-slate-200 bg-slate-50/60 hover:bg-slate-50"
          } ${isLoading ? "pointer-events-none opacity-55" : ""}`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFilesUpload}
            multiple
            accept="image/*"
            className="hidden"
          />

          <div className={`mb-4 rounded-xl p-3 shadow-sm transition-all ${
            dragActive ? "bg-indigo-600 text-white" : "bg-white text-slate-400 border border-slate-100"
          }`}>
            <Upload className="h-6 w-6" />
          </div>

          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            Kéo thả ảnh hoặc Google Sheets CSV
          </h3>
          <p className="max-w-xs text-xs text-slate-400 px-2 line-clamp-2">
            Hỗ trợ kéo thả trực tiếp file ảnh từ máy của bạn hoặc file CSV chứa danh sách link ảnh.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
            Chọn file từ thiết bị
          </span>
        </div>
      </div>

      {/* Guide Card helper */}
      <div className="col-span-1 lg:col-span-3 rounded-2xl bg-indigo-50/40 border border-indigo-100/50 p-4.5 flex gap-3 text-slate-600 mt-2">
        <HelpCircle className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-slate-800">Mẹo lấy dữ liệu từ Google Sheets:</p>
          <p>
            1. Tại bảng tính Google Sheets, chọn cột chứa link ảnh rồi sao chép (Ctrl+C). dán trực tiếp vào ô nhập bên trái.
          </p>
          <p>
            2. Hoặc xuất bảng tính ra file CSV (Tệp &gt; Tải xuống &gt; Giá trị được phân tách bằng dấu phẩy) và kéo thả file CSV đó vào vùng bên phải. Hệ thống sẽ tự lọc toàn bộ link ảnh!
          </p>
        </div>
      </div>
    </div>
  );
}
