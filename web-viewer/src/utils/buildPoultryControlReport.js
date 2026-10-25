import dayjs from 'dayjs'

function dateRange(from, to) {
  const dates = []
  let cur = dayjs(from)
  const end = dayjs(to)
  while (!cur.isAfter(end)) {
    dates.push(cur.format('YYYY-MM-DD'))
    cur = cur.add(1, 'day')
  }
  return dates
}

function buildLookup(arr, dateFn, flockFn, valFn) {
  const map = {}
  arr.forEach(r => {
    const d = dateFn(r)
    const f = flockFn(r) ?? 'all'
    if (!map[d]) map[d] = {}
    map[d][f] = (map[d][f] || 0) + valFn(r)
  })
  return map
}

export function buildPoultryControlHtml({ flocks, mortalityBeforeMap, mortality, feed, water, health, from, to, settings }) {
  const farmName = settings?.farm_name || 'Eldesign Poultry Farm'
  const farmLocation = settings?.farm_location || ''
  const dates = dateRange(from, to)

  const mortalityLookup = buildLookup(mortality, r => r.date, r => r.flock_id, r => r.count)
  const feedLookup      = buildLookup(feed,      r => r.date, r => r.flock_id, r => r.quantity_kg)
  const waterLookup     = buildLookup(water,     r => r.date, r => r.flock_id, r => r.litres)

  const healthLookup = {}
  health.forEach(r => {
    const d = r.date
    const f = r.flock_id ?? 'all'
    if (!healthLookup[d]) healthLookup[d] = {}
    healthLookup[d][f] = r.treatments || ''
  })

  function getVal(lookup, date, flockId, fallback = '') {
    return lookup[date]?.[flockId] ?? lookup[date]?.['all'] ?? fallback
  }

  const tableStyle = `border-collapse:collapse;width:100%;font-size:15px;font-family:Arial,sans-serif;`
  const thStyle = `border:1px solid #000;padding:5px 6px;text-align:center;background:#f5f5f5;font-weight:bold;vertical-align:middle;`
  const tdStyle = `border:1px solid #000;padding:5px 6px;text-align:center;vertical-align:middle;`
  const tdLeftStyle = tdStyle + 'text-align:left;'

  function buildFlockTable(flock) {
    const cumulativeBefore = mortalityBeforeMap[flock.id] || 0
    let openingBirds = Math.max((flock.initial_bird_count || 0) - cumulativeBefore, 0)

    const rows = dates.map(date => {
      const dead      = getVal(mortalityLookup, date, flock.id, 0)
      const feedKg    = getVal(feedLookup,      date, flock.id, 0)
      const litres    = getVal(waterLookup,     date, flock.id, 0)
      const treatment = getVal(healthLookup,    date, flock.id, '')

      const opening = openingBirds
      const closing = Math.max(opening - dead, 0)
      openingBirds = closing

      return `
        <tr>
          <td style="${tdLeftStyle}">${dayjs(date).format('DD/MM/YYYY')}</td>
          <td style="${tdStyle}">${opening}</td>
          <td style="${tdStyle}">${dead > 0 ? dead : ''}</td>
          <td style="${tdStyle}">${closing}</td>
          <td style="${tdStyle}">${feedKg > 0 ? feedKg.toFixed(1) + ' kg' : ''}</td>
          <td style="${tdStyle}">${treatment}</td>
          <td style="${tdStyle}">${litres > 0 ? litres.toFixed(0) + ' L' : ''}</td>
        </tr>
      `
    }).join('')

    return `
      <div style="page-break-after:always;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:17px;font-weight:bold;color:#555;">${farmName}${farmLocation ? ' — ' + farmLocation : ''}</div>
          <div style="font-size:20px;font-weight:bold;margin:6px 0;letter-spacing:1px;">POULTRY CONTROL RECORD</div>
          <div style="font-size:16px;color:#555;">
            Flock: <strong>${flock.name}</strong> &nbsp;|&nbsp;
            Period: <strong>${dayjs(from).format('DD MMM YYYY')} – ${dayjs(to).format('DD MMM YYYY')}</strong>
          </div>
        </div>
        <table style="${tableStyle}">
          <thead>
            <tr>
              <th style="${thStyle};width:90px;">Date</th>
              <th style="${thStyle}">Opening Stock</th>
              <th style="${thStyle}">Mortality</th>
              <th style="${thStyle}">Closing Stock</th>
              <th style="${thStyle}">Feed</th>
              <th style="${thStyle}">Vaccination and Drugs</th>
              <th style="${thStyle}">Water</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  }

  const body = flocks.map(buildFlockTable).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #fff; padding: 24px; }
    @page { size: A4 portrait; margin: 18mm 14mm; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${body}</body>
</html>`
}
