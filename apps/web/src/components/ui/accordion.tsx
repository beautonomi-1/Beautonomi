"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  // Separate children into text content and button elements
  const childrenArray = React.Children.toArray(children);
  const textChildren: React.ReactNode[] = [];
  const buttonChildren: React.ReactNode[] = [];

  const isButtonElement = (child: React.ReactNode): boolean => {
    if (!React.isValidElement(child)) return false;
    
    // Check if it's a native button element
    if (child.type === 'button') return true;
    
    // Check if it's a Button component by checking displayName
    if (typeof child.type === 'object' && child.type !== null) {
      const componentType = child.type as any;
      if (componentType.displayName === 'Button') return true;
    }
    
    // Check props for Button-like characteristics
    const props = child.props as any;
    if (props && (props.variant !== undefined || props.size === 'icon' || props['aria-haspopup'])) {
      // Additional check: if it has button-like props but isn't explicitly a div/span, treat as button
      if (child.type !== 'div' && child.type !== 'span' && child.type !== 'p') {
        return true;
      }
    }
    
    return false;
  };

  childrenArray.forEach((child) => {
    if (isButtonElement(child)) {
      buttonChildren.push(child);
    } else {
      textChildren.push(child);
    }
  });

  return (
    <AccordionPrimitive.Header className="flex">
      <div className="flex flex-1 items-center justify-between w-full">
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn(
            "flex flex-1 items-center justify-between py-2 mb-3 font-normal transition-all [&[data-state=open]>svg]:rotate-180",
            className
          )}
          {...props}
        >
          <span className="flex-1">
            {textChildren}
          </span>
          <ChevronDown className="h-6 w-6 shrink-0 transition-transform duration-200" />
        </AccordionPrimitive.Trigger>
        {buttonChildren.length > 0 && (
          <div 
            className="flex items-center gap-2 ml-2"
            onClick={(e) => {
              // Prevent accordion toggle when clicking action buttons
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              // Also prevent on mouse down to avoid any interaction issues
              e.stopPropagation();
            }}
          >
            {buttonChildren}
          </div>
        )}
      </div>
    </AccordionPrimitive.Header>
  );
})
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm md:text-lg text-secondary font-normal  transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div className={cn("pb-4 pt-0", className)}>{children}</div>
  </AccordionPrimitive.Content>
))

AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
