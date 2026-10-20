import React, { useState, useEffect } from 'react'
import styles from './Table.module.css'

const PAGE_SIZE = 15

export default function Table({ columns, data, emptyMessage = 'No records found.', pageSize = PAGE_SIZE }) {
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever data changes (month switch, add/delete, etc.)
  useEffect(() => { setPage(1) }, [data])

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
  const start = (page - 1) * pageSize
  const slice = data.slice(start, start + pageSize)
  const showPager = data.length > pageSize

  return (
    <div>
      <div className={styles.wrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={styles.th}
                  style={{ textAlign: col.align || 'left', width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              slice.map((row, i) => (
                <tr key={row.id ?? (start + i)} className={styles.tr}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={styles.td}
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPager && (
        <div className={styles.pager}>
          <span className={styles.pagerInfo}>
            Showing {start + 1}–{Math.min(start + pageSize, data.length)} of {data.length}
          </span>
          <div className={styles.pagerControls}>
            <button
              className={styles.pagerBtn}
              onClick={() => setPage(1)}
              disabled={page === 1}
              title="First page"
            >«</button>
            <button
              className={styles.pagerBtn}
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              title="Previous"
            >‹</button>

            {/* page number pills — show up to 5 around current */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === '…'
                  ? <span key={`ellipsis-${i}`} className={styles.pagerEllipsis}>…</span>
                  : <button
                      key={p}
                      className={`${styles.pagerBtn} ${p === page ? styles.pagerBtnActive : ''}`}
                      onClick={() => setPage(p)}
                    >{p}</button>
              )
            }

            <button
              className={styles.pagerBtn}
              onClick={() => setPage(p => p + 1)}
              disabled={page === totalPages}
              title="Next"
            >›</button>
            <button
              className={styles.pagerBtn}
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              title="Last page"
            >»</button>
          </div>
        </div>
      )}
    </div>
  )
}
