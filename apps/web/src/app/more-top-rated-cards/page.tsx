import React from 'react'
import Cards from './cards'
import Footer from '@/components/layout/footer'
import Navbar from '@/components/layout/navbar'

const page = () => {
  return (
    <div>
      <Navbar/>
      <Cards/>
      <Footer/>
    </div>
  )
}

export default page
