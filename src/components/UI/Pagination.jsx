export default function Pagination({ pagination, onChange }) {
  if (!pagination || pagination.pages <= 1) return null
  const { page, pages, total, limit } = pagination
  const start = (page - 1) * limit + 1
  const end   = Math.min(page * limit, total)

  const pages_arr = []
  let s = Math.max(1, page - 2), e = Math.min(pages, page + 2)
  if (e - s < 4) { s = Math.max(1, e - 4); e = Math.min(pages, s + 4) }
  for (let i = s; i <= e; i++) pages_arr.push(i)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white">
      <p className="text-sm text-gray-500">
        កំពុងបង្ហាញ <span className="font-medium text-gray-700">{start}-{end}</span> ក្នុងចំណោម <span className="font-medium text-gray-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹
        </button>
        {s > 1 && <><button onClick={() => onChange(1)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">1</button>{s > 2 && <span className="text-gray-400 px-1">…</span>}</>}
        {pages_arr.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors
              ${p === page ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 hover:bg-gray-50'}`}
          >
            {p}
          </button>
        ))}
        {e < pages && <><span className="text-gray-400 px-1">…</span><button onClick={() => onChange(pages)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">{pages}</button></>}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="px-2 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>
    </div>
  )
}