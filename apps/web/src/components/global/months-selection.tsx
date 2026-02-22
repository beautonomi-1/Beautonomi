"use client"

import React, { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion'

export default function Component() {
  const [months, setMonths] = useState(4)
  const circleRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const previousAngle = useRef(0)
  const rotations = useRef(0)

  const angle = useMotionValue(120) // Start at 4 months (120 degrees)
  const springAngle = useSpring(angle, { stiffness: 700, damping: 30 })
  const monthsMotionValue = useTransform(springAngle, (latest) => {
    const totalAngle = latest + rotations.current * 360
    const calculatedMonths = (totalAngle / 360) * 12
    return ((calculatedMonths - 1 + 12) % 12) + 1 // Ensure it's always between 1 and 12
  })

  useEffect(() => {
    const unsubscribe = monthsMotionValue.onChange((latest) => {
      setMonths(Math.round(latest))
    })
    return () => unsubscribe()
  }, [monthsMotionValue])

  const handleMouseDown = () => {
    isDragging.current = true
  }

  const handleMouseUp = () => { 
    isDragging.current = false
  }

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (isDragging.current && circleRef.current) {
      const rect = circleRef.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const mouseX = event.clientX
      const mouseY = event.clientY 

      const dx = mouseX - centerX
      const dy = mouseY - centerY
      let newAngle = Math.atan2(dy, dx) * (180 / Math.PI)
      newAngle = (newAngle + 360) % 360

      // Detect and account for full rotations
      const angleDiff = newAngle - previousAngle.current
      if (angleDiff > 180) {
        rotations.current--
      } else if (angleDiff < -180) {
        rotations.current++
      }

      angle.set(newAngle)
      previousAngle.current = newAngle
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <svg
        ref={circleRef}
        width="300"
        height="300"
        viewBox="0 0 300 300"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        className="cursor-grab active:cursor-grabbing"
      >
        <circle
          cx="150"
          cy="150"
          r="145"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="24"
        />
        {[...Array(12)].map((_, i) => (
          <circle
            key={i}
            cx={150 + 145 * Math.cos((i * 30 - 90) * (Math.PI / 180))}
            cy={150 + 145 * Math.sin((i * 30 - 90) * (Math.PI / 180))}
            r="2"
            fill="#D1D5DB"
          />
        ))}
        <motion.path
          d="M150,5 A145,145 0 1,1 149.99,5"
          fill="none"
          stroke="#FF385C"
          strokeWidth="14"
          strokeLinecap="round"
          style={{
            pathLength: useTransform(monthsMotionValue, (v) => (v - 1) / 12),
            rotate: 90,
            transformOrigin: 'center',
          }}
        />
        <motion.g
          style={{ rotate: useTransform(springAngle, (v) => v - 90), transformOrigin: 'center' }}
        >
          <circle
            cx="295"
            cy="150"
            r="10"
            fill="white"
            stroke="#E5E7EB"
            strokeWidth="2"
          />
          <circle
            cx="295"
            cy="150"
            r="4"
            fill="#FF385C"
          />
        </motion.g>
        <circle cx="150" cy="150" r="120" fill="white" />
        <text x="150" y="160" textAnchor="middle" fontSize="72" fontWeight="bold" fill="#111827">
          {months}
        </text>
        <text x="150" y="200" textAnchor="middle" fontSize="20" fill="#6B7280">
          {months === 1 ? 'month' : 'months'}
        </text>
      </svg>
    </div>
  )
}