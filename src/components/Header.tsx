import { Images, Zap, Cpu } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-slate-100 bg-white shadow-xs">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2 text-white shadow-md">
              <Images className="h-6 w-6" id="logo-icon" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl" id="app-title">
                Duplicate Image Finder
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm" id="app-subtitle">
                Tìm kiếm và lọc ảnh trùng lặp hoặc tương đồng sử dụng thuật toán Perceptual Hashing (pHash)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
            <span className="flex items-baseline gap-1 rounded-sm bg-slate-50 px-2 py-1 text-slate-600 border border-slate-100">
              <Cpu className="h-3 w-3 self-center text-indigo-500" />
              pHash 64-bit
            </span>
            <span className="flex items-baseline gap-1 rounded-sm bg-slate-50 px-2 py-1 text-slate-600 border border-slate-100">
              <Zap className="h-3 w-3 self-center text-amber-500 animate-pulse" />
              Full-Stack Proxy Enabler
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
