import React, { createContext, useContext, useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../supabaseClient'

const MonthContext = createContext(null)

export function MonthProvider({ children }) {
  const [monthYear, setMonthYear] = useState(dayjs().format('YYYY-MM'))
  const [months, setMonths] = useState([dayjs().format('YYYY-MM')])

  useEffect(() => {
    async function loadMonths() {
      const { data } = await supabase
        .from('production')
        .select('month_year')
        .order('month_year', { ascending: false })
      if (data && data.length) {
        const unique = [...new Set(data.map(r => r.month_year))]
        setMonths(unique)
        setMonthYear(unique[0])
      }
    }
    loadMonths()
  }, [])

  return (
    <MonthContext.Provider value={{ monthYear, setMonthYear, months }}>
      {children}
    </MonthContext.Provider>
  )
}

export function useMonth() { return useContext(MonthContext) }
