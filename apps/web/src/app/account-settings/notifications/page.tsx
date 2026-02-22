"use client";
import React from 'react'
import Notificationtabs from './components/tab'
import AuthGuard from '@/components/auth/auth-guard'

const page = () => {
  return (
    <AuthGuard>
      <Notificationtabs/>
    </AuthGuard>
  )
}

export default page