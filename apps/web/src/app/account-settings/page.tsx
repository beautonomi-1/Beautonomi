"use client";
import React from 'react'
import AccountSettingsPage from './components/account-setting'
import AuthGuard from '@/components/auth/auth-guard'

const page = () => {
  return (
    <AuthGuard>
      <AccountSettingsPage/>
    </AuthGuard>
  )
}

export default page