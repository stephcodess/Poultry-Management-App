import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import bcrypt from 'bcryptjs'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    const stored = localStorage.getItem('viewer_session')
    setSession(stored ? JSON.parse(stored) : null)
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, password_hash')
      .eq('email', email)
      .eq('is_active', 1)
      .single()

    if (error || !data) return { error: 'Invalid email or password.' }
    if (!data.password_hash) return { error: 'Account not yet activated.' }

    const valid = await bcrypt.compare(password, data.password_hash)
    if (!valid) return { error: 'Invalid email or password.' }

    const s = { id: data.id, name: data.name, email: data.email, role: data.role }
    localStorage.setItem('viewer_session', JSON.stringify(s))
    setSession(s)
    return { success: true }
  }

  function logout() {
    localStorage.removeItem('viewer_session')
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
