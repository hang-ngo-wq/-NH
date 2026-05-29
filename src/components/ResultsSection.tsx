import { useState, useMemo } from "react";
import { 
  Sliders, 
  Trash2, 
  Download, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  FileDown, 
  Eye, 
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Info
} from "lucide-react";
import { ImageItem, ImageGroup } from "../types";
import { clusterSimilarImages, getSimilarityPercent } from "../utils/imageHash";

interface ResultsSectionProps {
  images: ImageItem[];
  onRemoveImages: (ids: string[]) => void;
  onViewImage: (img: ImageItem) => void;
  similarityThreshold: number;
  setSimilarityThreshold: (value: number) => void;
}

export default function ResultsSection({
  images,
  onRemoveImages,
  onViewImage,
  similarityThreshold,
  setSimilarityThreshold,
}: ResultsSectionProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<"all" | "exact" | "similar" | "unique">("all");

  const processedImages = useMemo(() => {
    return images.filter((img) => img.status === "success" && img.hash);
  }, [images]);

  // Compute groupings dynamically based on slider threshold
  const groups = useMemo(() => {
    if (processedImages.length === 0) return [];
    return clusterSimilarImages(processedImages, similarityThreshold);
  }, [processedImages, similarityThreshold]);

  // Categorize groupings
  const stats = useMemo(() => {
    let duplicatedCount = 0;
    let uniqueCount = 0;
    const exactMatchGroups: ImageGroup[] = [];
    const partialMatchGroups: ImageGroup[] = [];
    const uniqueGroups: ImageGroup[] = [];

    for (const group of groups) {
      if (group.items.length > 1) {
        // Find if this group has exact duplicates (100% similarity)
        const isExact = group.items.every(
          (item) => item.similarity === 100
        );
        
        if (isExact) {
          exactMatchGroups.push(group);
        } else {
          partialMatchGroups.push(group);
        }
        
        // Members count (excluding the representation leader is the actual number of redundant copies)
        duplicatedCount += (group.items.length - 1);
      } else {
        uniqueGroups.push(group);
        uniqueCount++;
      }
    }

    return {
      total: processedImages.length,
      duplicatedCount,
      uniqueCount,
      exactMatchGroups,
      partialMatchGroups,
      uniqueGroups,
      totalGroups: groups.length
    };
  }, [groups, processedImages]);

  // Filter groups according to user selection
  const filteredGroups = useMemo(() => {
    if (filterType === "exact") return stats.exactMatchGroups;
    if (filterType === "similar") return stats.partialMatchGroups;
    if (filterType === "unique") return stats.uniqueGroups;
    return groups; // "all" show everything including singletons if desired
  }, [groups, filterType, stats]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // Keep leader, remove all duplicate records (the rest in the group)
  const handleRemoveDuplicates = () => {
    const toRemove: string[] = [];
    for (const group of groups) {
      if (group.items.length > 1) {
        // Collect all IDs in the group except the representation leader
        const duplicates = group.items
          .filter((item) => item.id !== group.representativeId)
          .map((item) => item.id);
        toRemove.push(...duplicates);
      }
    }

    if (toRemove.length === 0) {
      alert("Không tìm thấy tệp trùng lặp nào tại ngưỡng tương đồng hiện tại.");
      return;
    }

    if (
      confirm(
        `Bạn có chắc chắn muốn xóa ${toRemove.length} ảnh trùng khỏi danh sách xử lý?`
      )
    ) {
      onRemoveImages(toRemove);
    }
  };

  // Export filtered list as clean CSV containing master/keep images
  const exportCleanedCSV = () => {
    const leaders = new Set<string>();
    for (const group of groups) {
      leaders.add(group.representativeId);
    }

    // Keep unique images as well
    const cleanList = images.filter((img) => {
      // If it failed or is still pending, we might want to keep or skip. 
      // Safe option: If we analyzed it and it is a duplicate (not a group leader), omit it.
      if (img.status === "success" && img.hash) {
        return leaders.has(img.id);
      }
      return true; // Keep errors / pending for triage
    });

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Source,Original URL / Path,pHash,Dimensions\n";

    cleanList.forEach((img) => {
      const origUrl = img.originalUrl || img.url;
      const dims = img.dimensions ? `${img.dimensions.width}x${img.dimensions.height}` : "N/A";
      const row = [
        `="${img.id}"`, // Avoid scientific notation in Excel
        `="${img.name.replace(/"/g, '""')}"`,
        img.source,
        `="${origUrl.replace(/"/g, '""')}"`,
        img.hash || "",
        dims,
      ].join(",");
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `image_finder_cleaned_${similarityThreshold}pct.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export full diagnostics analysis report
  const exportReportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Filename,Original URL,pHash,Group ID,Relationship,Similarity to Leader,Status\n";

    // Gather map of image to relationship details
    const memberDetails: Record<string, { groupId: string; rel: string; similarity: number }> = {};
    for (const group of groups) {
      const isMulti = group.items.length > 1;
      group.items.forEach((item) => {
        const isLeader = item.id === group.representativeId;
        memberDetails[item.id] = {
          groupId: group.id,
          rel: !isMulti ? "Unique" : isLeader ? "Original Leader" : "Duplicate/Similar copy",
          similarity: item.similarity,
        };
      });
    }

    images.forEach((img) => {
      const details = memberDetails[img.id];
      const origUrl = img.originalUrl || img.url;
      const row = [
        `="${img.id}"`,
        `="${img.name.replace(/"/g, '""')}"`,
        `="${origUrl.replace(/"/g, '""')}"`,
        img.hash || "",
        details ? `="${details.groupId}"` : "",
        details ? details.rel : "Unprocessed",
        details ? `${details.similarity}%` : "",
        img.status,
      ].join(",");
      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "image_similarity_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (processedImages.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center" id="empty-results-box">
        <Layers className="mx-auto h-12 w-12 text-slate-300 mb-3" />
        <h3 className="text-sm font-semibold text-slate-700">Chưa có kết quả phân tích</h3>
        <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
          Nhập và chạy tiến trình phân tích URL hình ảnh ở bên trên để phát hiện ảnh trùng lập hoặc gần giống nhau.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="results-section-container">
      {/* Settings Panel & Stats Overview */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex-1 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-indigo-500" />
              Cấu hình độ tương đồng
            </h3>
            
            <div className="flex items-center gap-4">
              <input
                id="threshold-slider"
                type="range"
                min="70"
                max="100"
                step="1"
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                className="h-1.5 w-full max-w-xs cursor-pointer appearance-none rounded-lg bg-slate-100 accent-indigo-600 focus:outline-hidden"
              />
              <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-sm font-bold text-indigo-700 font-mono" id="threshold-badge">
                {similarityThreshold}%
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-lg">
              {similarityThreshold === 100 
                ? "Chỉ phát hiện những ảnh giống nhau tuyệt đối (chữ ký số pHash khớp hoàn toàn)."
                : `Phát hiện ảnh trùng lặp từ ${similarityThreshold}% tương đồng trở lên (bỏ qua khác biệt về kích thước, định dạng, độ sáng nhẹ).`}
            </p>
          </div>

          <div className="h-px bg-slate-100 md:hidden" />

          {/* Core batch action triggers */}
          <div className="flex flex-wrap gap-2.5">
            <button
              id="btn-auto-remove"
              onClick={handleRemoveDuplicates}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-rose-700 transition-all cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              Lọc &amp; Xóa trùng lặp
            </button>
            <button
              id="btn-export-cleaned"
              onClick={exportCleanedCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
            >
              <FileDown className="h-4 w-4 text-indigo-500" />
              Tải CSV Đã Lọc
            </button>
            <button
              id="btn-export-report"
              onClick={exportReportCSV}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
            >
              <Download className="h-4 w-4 text-slate-500" />
              Báo cáo (.csv)
            </button>
          </div>
        </div>

        {/* Dynamic statistics section */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
          <div className="p-1">
            <span className="block text-xs text-slate-400 font-medium">Tổng số ảnh thành công</span>
            <span className="text-xl font-extrabold text-slate-800 font-mono" id="stats-success-total">
              {stats.total}
            </span>
          </div>
          <div className="p-1">
            <span className="block text-xs text-slate-400 font-medium">Tổng số nhóm phân loại</span>
            <span className="text-xl font-extrabold text-slate-800 font-mono" id="stats-groups-count">
              {stats.totalGroups}
            </span>
          </div>
          <div className="p-1">
            <span className="block text-xs text-slate-400 font-medium text-amber-600">Bản sao trùng/gần trùng</span>
            <span className="text-xl font-extrabold text-amber-600 font-mono" id="stats-dups-count">
              {stats.duplicatedCount}
            </span>
          </div>
          <div className="p-1">
            <span className="block text-xs text-slate-400 font-medium text-emerald-600">Ảnh riêng biệt, duy nhất</span>
            <span className="text-xl font-extrabold text-emerald-600 font-mono" id="stats-uniqs-count">
              {stats.uniqueCount}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setFilterType("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              filterType === "all"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Tất cả ({stats.totalGroups})
          </button>
          <button
            onClick={() => setFilterType("exact")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              filterType === "exact"
                ? "bg-white text-rose-700 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Trùng tuyệt đối ({stats.exactMatchGroups.length})
          </button>
          <button
            onClick={() => setFilterType("similar")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              filterType === "similar"
                ? "bg-white text-amber-700 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Ảnh tương đồng ({stats.partialMatchGroups.length})
          </button>
          <button
            onClick={() => setFilterType("unique")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
              filterType === "unique"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Duy nhất ({stats.uniqueCount})
          </button>
        </div>

        <p className="text-xs text-slate-400">
          * Đang hiển thị kết quả lọc theo chế độ chọn.
        </p>
      </div>

      {/* Group Cards Container */}
      <div className="space-y-4" id="groups-list-wrapper">
        {filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400 text-xs">
            Không tìm thấy nhóm hình ảnh nào phù hợp với bộ lọc đã chọn.
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isCollapsed = collapsedGroups[group.id] || false;
            const isSingle = group.items.length === 1;
            
            // Representative Image Info
            const leader = images.find((img) => img.id === group.representativeId);
            if (!leader) return null;

            // Determine if exact match grouping
            const isExactGroup = !isSingle && group.items.every(item => item.similarity === 100);

            return (
              <div
                key={group.id}
                className={`rounded-2xl border bg-white overflow-hidden transition-all ${
                  isSingle 
                    ? "border-slate-100 shadow-3xs" 
                    : isExactGroup 
                      ? "border-rose-100 shadow-sm ring-1 ring-rose-50/50" 
                      : "border-amber-100 shadow-sm ring-1 ring-amber-50/50"
                }`}
                id={`vis-group-${group.id}`}
              >
                {/* Cluster Header banner */}
                <div
                  className={`flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-slate-50/50 ${
                    isSingle 
                      ? "bg-slate-50/30" 
                      : isExactGroup 
                        ? "bg-rose-50/20" 
                        : "bg-amber-50/20"
                  }`}
                  onClick={() => toggleGroupCollapse(group.id)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-slate-400 hover:text-slate-600 transition-colors">
                      {isCollapsed ? (
                        <ChevronRight className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                    
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {isSingle ? "Hình ảnh riêng biệt" : `Nhóm kiểm tra: #${group.id.replace("group_", "")}`}
                        </span>
                        {!isSingle && (
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                            isExactGroup 
                              ? "bg-rose-50 text-rose-700 border border-rose-100" 
                              : "bg-amber-50 text-amber-700 border border-amber-100"
                          }`}>
                            {isExactGroup ? "Trùng tuyệt đối 100%" : "Có độ tương đồng cao"}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-mono">
                        <span>Đại diện: {leader.name.length > 30 ? `${leader.name.slice(0, 30)}...` : leader.name}</span>
                        <span>•</span>
                        <span>pHash: {leader.hash?.substring(0, 8)}...</span>
                        <span>•</span>
                        <span>{group.items.length} file ảnh</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isSingle && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const duplicates = group.items
                            .filter((item) => item.id !== group.representativeId)
                            .map((item) => item.id);
                          if (confirm(`Bạn muốn bỏ ${duplicates.length} bản sao trong nhóm này khỏi danh sách?`)) {
                            onRemoveImages(duplicates);
                          }
                        }}
                        className="rounded-lg border border-rose-100 bg-white p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 shadow-3xs cursor-pointer"
                        title="Xóa tất cả bản sao của nhóm này"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Grid container of identical matches */}
                {!isCollapsed && (
                  <div className="border-t border-slate-100/80 p-5 bg-white/50">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {group.items.map((member) => {
                        const mImg = images.find((img) => img.id === member.id);
                        if (!mImg) return null;
                        
                        const isLeader = member.id === group.representativeId;
                        const originalLocation = mImg.originalUrl || mImg.url;

                        return (
                          <div
                            key={member.id}
                            className={`group/card relative rounded-xl border overflow-hidden bg-white transition-all hover:shadow-md ${
                              isLeader
                                ? "border-indigo-200 ring-2 ring-indigo-500/10 shadow-3xs"
                                : "border-slate-100"
                            }`}
                          >
                            {/* Similarity Score Overlay for duplicates */}
                            {!isLeader && (
                              <div className="absolute top-2 left-2 z-10 rounded-lg bg-amber-600/90 text-[10px] sm:text-xs font-bold text-white px-2 py-1 shadow-xs font-mono">
                                Độc lập {member.similarity}%
                              </div>
                            )}

                            {isLeader && !isSingle && (
                              <div className="absolute top-2 left-2 z-10 rounded-lg bg-indigo-600/95 text-[10px] sm:text-xs font-bold text-white px-2 py-1 shadow-xs">
                                Ảnh gốc (Leader)
                              </div>
                            )}

                            {/* Image Visualizer Frame */}
                            <div className="relative aspect-video w-full bg-slate-50 flex items-center justify-center overflow-hidden border-b border-slate-100">
                              <img
                                src={mImg.url}
                                alt={mImg.name}
                                className="h-full w-full object-contain object-center transition-all duration-300 group-hover/card:scale-105"
                                loading="lazy"
                              />
                              
                              {/* Hover utilities */}
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover/card:opacity-100 flex items-center justify-center gap-2.5 transition-opacity duration-200">
                                <button
                                  onClick={() => onViewImage(mImg)}
                                  className="rounded-lg bg-white p-2 text-slate-800 shadow-md hover:bg-slate-50 transition-colors cursor-pointer"
                                  title="Xem ảnh cỡ lớn"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                {mImg.source === "url" && (
                                  <a
                                    href={originalLocation}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-lg bg-white p-2 text-slate-800 shadow-md hover:bg-slate-50 transition-colors cursor-pointer"
                                    title="Mở tab nguồn gốc"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Image detail specs info */}
                            <div className="p-3.5 space-y-2 text-xs">
                              <div className="space-y-0.5">
                                <h4
                                  className="font-semibold text-slate-800 truncate"
                                  title={mImg.name}
                                >
                                  {mImg.name}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <span className={`capitalize px-1.5 py-0.2 rounded-sm text-[9px] font-bold ${
                                    mImg.source === "url" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"
                                  }`}>
                                    {mImg.source}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    {mImg.dimensions 
                                      ? `${mImg.dimensions.width}x${mImg.dimensions.height}` 
                                      : "Kích thước trống"}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600 font-mono">
                                <div className="flex justify-between">
                                  <span>pHash:</span>
                                  <span className="font-bold text-slate-700 select-all" title={mImg.hash || ""}>
                                    {mImg.hash?.substring(0, 10)}...
                                  </span>
                                </div>
                                {!isLeader && (
                                  <div className="flex justify-between text-amber-700">
                                    <span>Distance:</span>
                                    <span>{member.distance}bits diff</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={originalLocation}>
                                  {originalLocation}
                                </span>
                                
                                <button
                                  onClick={() => onRemoveImages([mImg.id])}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded-sm transition-colors cursor-pointer"
                                  title="Gỡ ảnh khỏi danh sách"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
