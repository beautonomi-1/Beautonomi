"use client";
import React from 'react'
import LoginAccount from './component/tab'
import AuthGuard from '@/components/auth/auth-guard'

const page = () => {
  return (
    <AuthGuard>
      <LoginAccount/>
    </AuthGuard>
  )
}

export default page