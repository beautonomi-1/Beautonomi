import Navbar from '@/components/layout/navbar'
import React from 'react'
import HottestPicks from './hottest-pick-cards'
import Footer from '@/components/layout/footer'

const page = () => {
  return (
    <div>
      <Navbar/>
      <HottestPicks/>
      <Footer/>
    </div>
  )
}

export default page
