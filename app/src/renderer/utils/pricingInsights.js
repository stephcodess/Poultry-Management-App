/**
 * Calculates pricing intelligence from month/annual data.
 * Returns everything needed to render the pricing section in modals and PDFs.
 */
export function calcPricingInsights({ totalExpenses, grossRevenue, cratesSold, projectedCrates }) {
  const hasSales = cratesSold > 0

  const actualAvgPrice   = hasSales ? grossRevenue / cratesSold : 0
  const breakEvenPrice   = hasSales ? totalExpenses / cratesSold : 0
  const surplusPerCrate  = actualAvgPrice - breakEvenPrice   // +ve = profitable, -ve = loss
  const costRatio        = grossRevenue > 0 ? (totalExpenses / grossRevenue) * 100 : 0

  // For "next month" projections use projectedCrates (caller provides avg of recent months)
  const projected = projectedCrates > 0 ? projectedCrates : cratesSold

  // Price needed to hit each target margin (expenses / projected / (1 - margin))
  const targets = projected > 0 ? [
    { label: 'Break Even',  margin: 0,    price: totalExpenses / projected },
    { label: '10% Profit',  margin: 0.10, price: totalExpenses / (projected * (1 - 0.10)) },
    { label: '20% Profit',  margin: 0.20, price: totalExpenses / (projected * (1 - 0.20)) },
    { label: '30% Profit',  margin: 0.30, price: totalExpenses / (projected * (1 - 0.30)) },
  ] : []

  // Minimum crates to sell at current avg price to break even
  const minCratesAtCurrentPrice = actualAvgPrice > 0
    ? Math.ceil(totalExpenses / actualAvgPrice) : null

  // Extra crates needed beyond current if currently at a loss
  const extraCratesNeeded = (hasSales && surplusPerCrate < 0 && actualAvgPrice > 0)
    ? Math.ceil(Math.abs(netLoss(totalExpenses, grossRevenue)) / actualAvgPrice) : null

  return {
    hasSales,
    actualAvgPrice,
    breakEvenPrice,
    surplusPerCrate,
    costRatio,
    projected,
    targets,
    minCratesAtCurrentPrice,
    extraCratesNeeded,
    cratesSold,
    grossRevenue,
    totalExpenses,
  }
}

function netLoss(exp, rev) { return rev - exp }
