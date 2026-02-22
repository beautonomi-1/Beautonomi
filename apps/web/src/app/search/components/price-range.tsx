// 'use client'
// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

// const PriceRangeComponent: React.FC = () => {
//   const [range, setRange] = useState([57, 150]);
//   const sliderRef = useRef<HTMLDivElement>(null);
//   const isDragging = useRef(false);
//   const activeThumb = useRef<'min' | 'max' | null>(null);
//   const minPrice = 10;
//   const maxPrice = 380;

//   const numLines = 3;
//   const lineGap = 0.15;
//   const lineSpacing = (maxPrice - minPrice) / (numLines - 1 + lineGap * (numLines - 1));

//   const chartData = React.useMemo(() => {
//     const data = [];
//     for (let i = 0; i < 50; i++) {
//       data.push({
//         price: minPrice + i * ((maxPrice - minPrice) / 49),
//         frequency: Math.floor(Math.random() * 70) + 10
//       });
//     }
//     return data;
//   }, []);

//   const verticalLines = Array.from({ length: numLines }, (_, index) => minPrice + index * lineSpacing);

//   const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>, thumb: 'min' | 'max') => {
//     e.preventDefault();
//     isDragging.current = true;
//     activeThumb.current = thumb;
//     document.addEventListener('mousemove', handleMouseMove);
//     document.addEventListener('mouseup', handleMouseUp);
//   };

//   const handleMouseMove = useCallback((e: MouseEvent) => {
//     if (isDragging.current && sliderRef.current) {
//       const rect = sliderRef.current.getBoundingClientRect();
//       const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
//       const percent = x / rect.width;
//       const value = Math.round(percent * (maxPrice - minPrice) + minPrice);
//       setRange(prev => {
//         if (activeThumb.current === 'min') {
//           return [Math.min(value, prev[1] - 1), prev[1]];
//         } else {
//           return [prev[0], Math.max(value, prev[0] + 1)];
//         }
//       });
//     }
//   }, [maxPrice, minPrice]);

//   const handleMouseUp = useCallback(() => {
//     isDragging.current = false;
//     document.removeEventListener('mousemove', handleMouseMove);
//     document.removeEventListener('mouseup', handleMouseUp);
//   }, [handleMouseMove]);

//   useEffect(() => {
//     return () => {
//       document.removeEventListener('mousemove', handleMouseMove);
//       document.removeEventListener('mouseup', handleMouseUp);
//     };
//   }, [handleMouseMove, handleMouseUp]);

//   const getLeftPosition = (value: number) => {
//     return `${((value - minPrice) / (maxPrice - minPrice)) * 100}%`;
//   };

//   const filteredLines = verticalLines.filter(line => line >= range[0] && line <= range[1]);

//   return (
//     <div className="w-full mx-auto py-4">
//       <h2 className="text-lg font-medium Airbnb-medium text-secondary mb-2">Price range</h2>
//       <p className="text-sm text-secondary font-light Airbnb-light mb-4">Service prices before fees and taxes</p>

//       <div className="h-32 relative">
//         <ResponsiveContainer width="100%" height="100%">
//           <BarChart data={chartData} barCategoryGap={0} barGap={0}>
//             <Bar dataKey="frequency" animationDuration={0}>
//               {chartData.map((entry, index) => (
//                 <Cell
//                   key={`cell-${index}`}
//                   fill={entry.price >= range[0] && entry.price <= range[1] ? '#FF385C' : '#E5E7EB'}
//                 />
//               ))}
//             </Bar>
//             <XAxis dataKey="price" hide />
//             <YAxis hide />
//             {filteredLines.map((line, index) => (
//               <ReferenceLine
//                 key={`line-${index}`}
//                 x={line}
//                 stroke="#d1d5db"
//                 strokeDasharray="3 3"
//                 strokeWidth={2}
//               />
//             ))}
//           </BarChart>
//         </ResponsiveContainer>
//         <div
//           className="absolute bottom-0 left-0 right-0 h-12"
//           ref={sliderRef}
//         >
//           <div className="absolute bottom-2 left-0 right-0 h-0.5 bg-gray-200"></div>
//           <div
//             className="absolute bottom-2 h-0.5 bg-[#FF385C]"
//             style={{
//               left: getLeftPosition(range[0]),
//               right: `${100 - ((range[1] - minPrice) / (maxPrice - minPrice)) * 100}%`
//             }}
//           ></div>
//           <button
//             className="absolute bottom-0 w-6 h-6 bg-white rounded-full shadow-md transform -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-pink-500"
//             style={{ left: getLeftPosition(range[0]) }}
//             onMouseDown={(e) => handleMouseDown(e, 'min')}
//           ></button>
//           <button
//             className="absolute bottom-0 w-6 h-6 bg-white rounded-full shadow-md transform -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-pink-500"
//             style={{ left: getLeftPosition(range[1]) }}
//             onMouseDown={(e) => handleMouseDown(e, 'max')}
//           ></button>
//         </div>
//       </div>
//       <div className="mt-4 flex justify-between items-center">
//         <div className="mb-2">
//           <Label htmlFor="minPrice">Minimum</Label>
//           <div className='border border-destructive rounded-full w-20'>
//             <Input
//               id="minPrice"
//               value={`$${range[0]}`}
//               onChange={(e) => {
//                 const value = parseInt(e.target.value.replace('$', ''), 10);
//                 if (!isNaN(value)) {
//                   setRange([Math.min(value, range[1] - 1), range[1]]);
//                 }
//               }}
//               className='border rounded-full p-2'
//             />
//           </div>
//         </div>
//         <div className="mb-2">
//           <Label htmlFor="maxPrice">Maximum</Label>
//           <div className='border border-destructive rounded-full w-20'>
//             <Input
//               id="maxPrice"
//               value={`$${range[1]}`}
//               onChange={(e) => {
//                 const value = parseInt(e.target.value.replace('$', ''), 10);
//                 if (!isNaN(value)) {
//                   setRange([range[0], Math.max(value, range[0] + 1)]);
//                 }
//               }}
//               className='border rounded-full p-2'
//             />
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default PriceRangeComponent;

'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

const PriceRangeComponent: React.FC = () => {
  const [range, setRange] = useState([57, 150]);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const activeThumb = useRef<'min' | 'max' | null>(null);
  const minPrice = 10;
  const maxPrice = 380;

  const numLines = 3;
  const lineGap = 0.15;
  const lineSpacing = (maxPrice - minPrice) / (numLines - 1 + lineGap * (numLines - 1));

  const chartData = React.useMemo(() => {
    const data = [];
    for (let i = 0; i < 50; i++) {
      data.push({
        price: minPrice + i * ((maxPrice - minPrice) / 49),
        frequency: Math.floor(Math.random() * 70) + 10
      });
    }
    return data;
  }, []);

  const verticalLines = Array.from({ length: numLines }, (_, index) => minPrice + index * lineSpacing);

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (isDragging.current && sliderRef.current) {
      const rect = sliderRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percent = x / rect.width;
      const value = Math.round(percent * (maxPrice - minPrice) + minPrice);
      setRange(prev => {
        if (activeThumb.current === 'min') {
          return [Math.min(value, prev[1] - 1), prev[1]];
        } else {
          return [prev[0], Math.max(value, prev[0] + 1)];
        }
      });
    }
  }, [maxPrice, minPrice]);

  const handleEnd = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.removeEventListener('touchend', handleEnd);
  }, [handleMove]);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent, thumb: 'min' | 'max') => {
    e.preventDefault();
    isDragging.current = true;
    activeThumb.current = thumb;
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchend', handleEnd);
  }, [handleMove, handleEnd]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [handleMove, handleEnd]);

  const getLeftPosition = (value: number) => {
    return `${((value - minPrice) / (maxPrice - minPrice)) * 100}%`;
  };

  const filteredLines = verticalLines.filter(line => line >= range[0] && line <= range[1]);

  return (
    <div className="w-full mx-auto py-4">
      <h2 className="text-lg font-medium Airbnb-medium text-secondary mb-2">Price range</h2>
      <p className="text-sm text-secondary font-light Airbnb-light mb-4">Service prices before fees and taxes</p>

      <div className="h-32 relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap={0} barGap={0}>
            <Bar dataKey="frequency" animationDuration={0}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.price >= range[0] && entry.price <= range[1] ? '#FF385C' : '#E5E7EB'}
                />
              ))}
            </Bar>
            <XAxis dataKey="price" hide />
            <YAxis hide />
            {filteredLines.map((line, index) => (
              <ReferenceLine
                key={`line-${index}`}
                x={line}
                stroke="#d1d5db"
                strokeDasharray="3 3"
                strokeWidth={2}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div
          className="absolute bottom-0 left-0 right-0 h-12"
          ref={sliderRef}
        >
          <div className="absolute bottom-2 left-0 right-0 h-0.5 bg-gray-200"></div>
          <div
            className="absolute bottom-2 h-0.5 bg-[#FF385C]"
            style={{
              left: getLeftPosition(range[0]),
              right: `${100 - ((range[1] - minPrice) / (maxPrice - minPrice)) * 100}%`
            }}
          ></div>
          <button
            className="absolute bottom-0 w-6 h-6 bg-white rounded-full shadow-md transform -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-pink-500"
            style={{ left: getLeftPosition(range[0]) }}
            onMouseDown={(e) => handleStart(e, 'min')}
            onTouchStart={(e) => handleStart(e, 'min')}
          ></button>
          <button
            className="absolute bottom-0 w-6 h-6 bg-white rounded-full shadow-md transform -translate-x-1/2 focus:outline-none focus:ring-2 focus:ring-pink-500"
            style={{ left: getLeftPosition(range[1]) }}
            onMouseDown={(e) => handleStart(e, 'max')}
            onTouchStart={(e) => handleStart(e, 'max')}
          ></button>
        </div>
      </div>
      <div className="mt-4 flex justify-between items-center">
        <div className="mb-2">
          <Label htmlFor="minPrice">Minimum</Label>
          <div className='border border-gray-300 rounded-full w-24'>
            <Input
              id="minPrice"
              value={`$${range[0]}`}
              onChange={(e) => {
                const value = parseInt(e.target.value.replace('$', ''), 10);
                if (!isNaN(value)) {
                  setRange([Math.min(value, range[1] - 1), range[1]]);
                }
              }}
              className='border-none rounded-full p-2 text-center'
            />
          </div>
        </div>
        <div className="mb-2">
          <Label htmlFor="maxPrice">Maximum</Label>
          <div className='border border-gray-300 rounded-full w-24'>
            <Input
              id="maxPrice"
              value={`$${range[1]}`}
              onChange={(e) => {
                const value = parseInt(e.target.value.replace('$', ''), 10);
                if (!isNaN(value)) {
                  setRange([range[0], Math.max(value, range[0] + 1)]);
                }
              }}
              className='border-none rounded-full p-2 text-center'
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceRangeComponent;