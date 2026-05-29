import { XCircle, Loader2, CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { ProcessingProgress } from "../types";

interface ProgressIndicatorProps {
  progress: ProcessingProgress;
  onAbort: () => void;
}

export default function ProgressIndicator({ progress, onAbort }: ProgressIndicatorProps) {
  if (!progress.isProcessing && progress.current === 0) return null;

  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs" id="progress-indicator-box">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            {progress.isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" id="progress-spinner" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            {progress.isProcessing ? "Đang phân tích hình ảnh..." : "Đã hoàn thành phân tích"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono" id="progress-status-text">
            {progress.statusText || "Chờ xử lý..."}
          </p>
        </div>

        {progress.isProcessing && (
          <button
            id="btn-abort-processing"
            onClick={onAbort}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
          >
            <XCircle className="h-3.5 w-3.5" />
            Dừng tiến trình
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative w-full rounded-full bg-slate-100 h-2.5 overflow-hidden mb-4">
        <div
          id="progress-fill-bar"
          className="bg-indigo-600 h-full rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-center">
        <div className="rounded-xl bg-slate-50 border border-slate-100/50 p-2.5">
          <span className="block text-xs text-slate-400 font-medium">Tổng số ảnh</span>
          <span className="text-lg font-bold text-slate-800 font-mono" id="stats-total-progress">
            {progress.total}
          </span>
        </div>
        
        <div className="rounded-xl bg-slate-50 border border-slate-100/50 p-2.5">
          <span className="block text-xs text-slate-400 font-medium font-mono">Đã xử lý</span>
          <span className="text-lg font-bold text-indigo-600 font-mono" id="stats-current-progress">
            {progress.current} <span className="text-xs font-normal text-slate-400">({percent}%)</span>
          </span>
        </div>

        <div className="rounded-xl bg-emerald-50/50 border border-emerald-100/50 p-2.5">
          <span className="block text-xs text-emerald-600 font-medium">Thành công</span>
          <span className="text-lg font-bold text-emerald-600 font-mono" id="stats-success-progress">
            {progress.success}
          </span>
        </div>

        <div className="rounded-xl bg-rose-50/50 border border-rose-100/50 p-2.5">
          <span className="block text-xs text-rose-600 font-medium">Lỗi tải/Phân tích</span>
          <span className="text-lg font-bold text-rose-600 font-mono flex items-center justify-center gap-1" id="stats-failed-progress">
            {progress.failed}
            {progress.failed > 0 && <AlertTriangle className="h-3.5 w-3.5 text-rose-500 animate-bounce" />}
          </span>
        </div>
      </div>
    </div>
  );
}
