import { Button } from '@/components/ui/button'
import React from 'react'

const UpcomingEvents = () => {
  return (
    <div className="max-w-3xl mx-auto border-b pb-32 mb-10 px-4">
      <h1 className="text-[32px] font-extrabold mb-7">Upcoming Events</h1>
<p className='text-base font-light text-secondary mb-12'>There are currently no events or presentations scheduled.</p>
       <div className="">
        <Button variant="destructive">Show all events and presentations</Button>
      </div>
    </div>
  )
}

export default UpcomingEvents
