import React, { createContext, useContext, useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { supabase } from '../supabaseClient'

const MonthContext = createContext(null)

export function MonthProvider({ children }) {
  const [monthYear, setMonthYear] = useState(dayjs().format('YYYY-MM'))

  useEffect(() => {
    // Find the most recent month that actually has data
    supabase.from('production').select('month_year').order('month_year', { ascending: false }).limit(1)
      .then(({ data }) => {
        const val = data?.[0]?.month_year
        if (val && /^\d{4}-\d{2}$/.test(val)) {
          setMonthYear(val)
        }
      })
  }, [])

  return (
    <MonthContext.Provider value={{ monthYear, setMonthYear }}>
      {children}
    </MonthContext.Provider>
  )
}

export function useMonth() { return useContext(MonthContext) }
