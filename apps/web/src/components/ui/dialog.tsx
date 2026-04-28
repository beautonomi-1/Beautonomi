"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] touch-manipulation data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const FOCUSABLE =
  "button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean
    /** When true, omit the default sr-only "Dialog" title — children must include a visible `DialogTitle` for a11y. */
    suppressFallbackTitle?: boolean
  }
>(({ className, children, hideClose, suppressFallbackTitle, "aria-describedby": ariaDescribedby, onOpenAutoFocus, onPointerDownOutside, onInteractOutside, ...props }, ref) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const mergedRef = (node: HTMLDivElement | null) => {
    (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };
  const handleOpenAutoFocus = (e: Event) => {
    onOpenAutoFocus?.(e);
    if (e.defaultPrevented) return;
    // Move focus into dialog so the trigger (in aria-hidden root) doesn't retain focus
    e.preventDefault();
    requestAnimationFrame(() => {
      const el = contentRef.current;
      const first = el?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
  };
  const isAddressAutocompletePortalTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest("[data-address-autocomplete-listbox='true']"));
  const handlePointerDownOutside: React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Content
  >["onPointerDownOutside"] = (e) => {
    onPointerDownOutside?.(e);
    if (e.defaultPrevented) return;
    if (isAddressAutocompletePortalTarget(e.detail.originalEvent.target)) {
      e.preventDefault();
    }
  };
  const handleInteractOutside: React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Content
  >["onInteractOutside"] = (e) => {
    onInteractOutside?.(e);
    if (e.defaultPrevented) return;
    if (isAddressAutocompletePortalTarget(e.target)) {
      e.preventDefault();
    }
  };
  return (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={mergedRef}
      aria-describedby={ariaDescribedby ?? undefined}
      onOpenAutoFocus={handleOpenAutoFocus}
      onPointerDownOutside={handlePointerDownOutside}
      onInteractOutside={handleInteractOutside}
      className={cn(
        "fixed z-[9999] left-[50%] top-[50%] grid w-full max-w-[95vw] sm:max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white sm:bg-white p-4 sm:p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-none sm:rounded-xl m-0 sm:m-4 overflow-hidden max-h-[95vh] overflow-y-auto",
        className
      )}
      {...props}
    >
      {!suppressFallbackTitle ? (
        <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
      ) : null}
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-3 sm:right-4 top-3 sm:top-4 z-10 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground p-2 sm:p-2.5 touch-manipulation active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center">
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
