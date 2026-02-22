import Navbar from '@/components/layout/navbar'
import React from 'react'
import UpcomingTalent from './upcoming-talent-cards'
import Footer from '@/components/layout/footer'

const page = () => {
  return (
    <div>
      <Navbar/>
      <UpcomingTalent/>
      <Footer/>
    </div>
  )
}

export default page
