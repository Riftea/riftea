// src/components/AuthButtons.jsx
'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import React from 'react'

export default function AuthButtons() {
  const { data: session } = useSession()

  if (!session) {
    return (
      <div className="flex gap-3">
        <button
          onClick={() => signIn('google')}
          className="px-4 py-2 rounded-lg border shadow-sm"
        >
          Iniciar con Google
        </button>
        <button
          onClick={() => signIn('facebook')}
          className="px-4 py-2 rounded-lg border shadow-sm"
        >
          Iniciar con Facebook
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-3 items-center">
      <img
        src={session.user?.image ?? '/avatar.png'}
        alt="avatar"
        className="w-8 h-8 rounded-full"
      />
      <span>{session.user?.name}</span>
      <button onClick={() => signOut()} className="px-3 py-1 rounded bg-gray-100">
        Salir
      </button>
    </div>
  )
}
