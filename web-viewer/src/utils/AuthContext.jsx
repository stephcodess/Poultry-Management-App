import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import bcrypt from 'bcryptjs'

const AuthContext = createContext(null)

const PERMISSIONS = {
  owner:  { write: true,  manage_users: true,  manage_settings: true },
  admin:  { write: true,  manage_users: true,  manage_settings: true },
  editor: { write: true,  manage_users: false, manage_settings: false },
  viewer: { write: false, manage_users: false, manage_settings: false },
  none:   { write: false, manage_users: false, manage_settings: false },
}

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
      .single()

    if (error || !data) return { error: 'Invalid email or password.' }
    if (!data.is_active) return { error: 'Account is inactive.' }
    if (data.role === 'none') return { error: 'This account does not have app access.' }
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

  function can(permission) {
    const perms = PERMISSIONS[session?.role] || PERMISSIONS.none
    return !!perms[permission]
  }

  return (
    <AuthContext.Provider value={{ session, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
