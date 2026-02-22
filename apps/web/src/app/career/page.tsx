import React from 'react'
import CreativePlace from './components/creative-place'
import Navbar from './components/navbar'
import Nextroles from './components/next-roles'
import SliderCard from './components/ongoing-slider-card'
import Discover from './components/discover'

const page = () => {
  return (
    <div>
      <Navbar/>
      <Discover/>
      <CreativePlace/>
      <Nextroles/>
      <SliderCard/>
    </div>
  )
}

export default page