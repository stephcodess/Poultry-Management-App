import React, { createContext, useContext, useState } from 'react'
import dayjs from 'dayjs'

const MonthContext = createContext(null)

export function MonthProvider({ children }) {
  const [monthYear, setMonthYear] = useState(dayjs().format('YYYY-MM'))
  return (
    <MonthContext.Provider value={{ monthYear, setMonthYear }}>
      {children}
    </MonthContext.Provider>
  )
}

export function useMonth() {
  return useContext(MonthContext)
}
