import React from 'react'
import AmbassadorHero from './components/ambassador-hero'
import ContentBlock from './components/content-block'
import HowItWorks from './components/how-it-works'
import Support from './components/support'
import AmbassadoeFaq from './components/ambassador-faq'

const page = () => {
  return (
    <div>
      <AmbassadorHero/>
      <ContentBlock/>
      <HowItWorks/>
      <Support/>
      <AmbassadoeFaq/>
    </div>
  )
}

export default page
