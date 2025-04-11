'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleAuth = async (isRegister: boolean) => {
    setLoading(true)
    setMessage('')
    const { error } = isRegister
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setMessage(error.message)
    } else {
        if (!isRegister) {
          window.location.href = '/dashboard'
        } else {
          setMessage('Revisa tu correo para confirmar tu cuenta.')
        }
      }
      
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Login / Registro</h1>
      <input
        type="email"
        placeholder="Correo"
        className="border p-2 w-full mb-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        className="border p-2 w-full mb-4"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="flex gap-4">
        <button
          onClick={() => handleAuth(false)}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Iniciar sesión
        </button>

        <button
          onClick={() => handleAuth(true)}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Registrarse
        </button>
      </div>

      {loading && <p className="mt-4 text-gray-500">Cargando...</p>}
      {message && <p className="mt-2 text-red-600">{message}</p>}
    </div>
  )
}
