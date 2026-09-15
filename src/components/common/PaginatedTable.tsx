import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginatedTableProps<T> {
  data: T[];
  pageSize?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
  className?: string;
}

export function PaginatedTable<T>({
  data,
  pageSize = 25,
  renderItem,
  keyExtractor,
  className = '',
}: PaginatedTableProps<T>) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(data.length / pageSize);

  const paged = useMemo(() => {
    const start = page * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  if (totalPages <= 1) {
    return (
      <div className={className}>
        {paged.map((item, i) => (
          <div key={keyExtractor(item)}>{renderItem(item, page * pageSize + i)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {paged.map((item, i) => (
        <div key={keyExtractor(item)}>{renderItem(item, page * pageSize + i)}</div>
      ))}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/60">
        <span className="text-[11px] text-slate-500">
          Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i;
            } else if (page < 4) {
              pageNum = i;
            } else if (page > totalPages - 5) {
              pageNum = totalPages - 7 + i;
            } else {
              pageNum = page - 3 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-7 h-7 rounded-lg text-[11px] font-medium ${
                  page === pageNum
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {pageNum + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
