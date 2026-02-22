import React from 'react'
import ExperienceHero from './components/experience-hero'
import EventDetails from './components/event-details'
import HostProfile from './components/host-profile'
import FeaturesExperience from './features-experience'
import BookingRequest from './booking-request'

const page = () => {
  return (
    <div>
      <ExperienceHero/>
      <EventDetails/>
      <HostProfile/>
      <FeaturesExperience/>
      <BookingRequest/>
    </div>
  )
}

export default page
