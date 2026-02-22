import React from 'react'
import Navbar from '@/components/layout/navbar'
import Footer from '@/components/layout/footer'
import BottomNav from '@/components/layout/bottom-nav'
import NewsHero from './components/news-hero'
import LatestNews from './components/latest-news'
import ContactInfo from './components/contact-info'
import ContentBlock from './components/content-block'
import SliderCard from './components/slider-card'
import NewsTopics from './components/news-topisc'

const page = () => {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0">
      <Navbar/>
      <NewsHero/>
      <LatestNews/>
      <ContactInfo/>
      <SliderCard/>
      <NewsTopics/>
      <ContentBlock/>
      <Footer/>
      <BottomNav/>
    </div>
  )
}

export default page
