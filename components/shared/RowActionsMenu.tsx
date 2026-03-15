'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

interface RowActionsMenuProps {
  children: ReactNode
  className?: string
}

export function RowActionsMenu({
  children,
  className = '',
}: RowActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      // Use double requestAnimationFrame to ensure menu is fully rendered and measured
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updatePosition()
        })
      })
    } else {
      setPosition(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handleScroll = () => {
      updatePosition()
    }

    // Support both mouse and touch events for Android
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen])

  const updatePosition = () => {
    if (!buttonRef.current) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const spacing = 8
    const estimatedMenuHeight = 250 // Conservative estimate for menu with multiple items
    const estimatedMenuWidth = 192 // w-48 = 192px

    // Try to get actual menu dimensions if available
    let menuHeight = estimatedMenuHeight
    let menuWidth = estimatedMenuWidth
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect()
      if (menuRect.height > 0) menuHeight = menuRect.height
      if (menuRect.width > 0) menuWidth = menuRect.width
    }

    // Calculate position
    let top: number
    let left: number

    // Check available space
    const spaceBelow = viewportHeight - buttonRect.bottom - spacing
    const spaceAbove = buttonRect.top - spacing
    const minRequiredSpace = menuHeight + spacing + 20 // Add buffer for safety

    // Aggressive logic: only open downward if there's definitely enough space (with buffer)
    // Otherwise, always open upward to prevent clipping
    // Also check if button is in bottom 30% of viewport - if so, prefer upward
    const buttonPositionRatio = buttonRect.top / viewportHeight
    const isNearBottom = buttonPositionRatio > 0.7

    const shouldOpenDownward = !isNearBottom && spaceBelow >= minRequiredSpace && spaceBelow > spaceAbove

    if (shouldOpenDownward) {
      // Open downward
      top = buttonRect.bottom + spacing
      // Double-check it fits
      if (top + menuHeight > viewportHeight - spacing) {
        // Doesn't fit, open upward instead
        top = Math.max(spacing, buttonRect.top - menuHeight - spacing)
      }
    } else {
      // Open upward - ensure it doesn't go above viewport
      top = Math.max(spacing, buttonRect.top - menuHeight - spacing)
    }

    // Final safety check: ensure menu doesn't go below viewport
    if (top + menuHeight > viewportHeight - spacing) {
      top = Math.max(spacing, viewportHeight - menuHeight - spacing)
    }

    // Horizontal positioning - align to right edge of button
    left = buttonRect.right - menuWidth

    // Ensure menu doesn't go off-screen to the left
    if (left < 8) {
      left = 8
    }

    // Ensure menu doesn't go off-screen to the right
    if (left + menuWidth > viewportWidth - 8) {
      left = viewportWidth - menuWidth - 8
    }

    setPosition({ top, left })

    // If menu is rendered, update position again with actual dimensions
    if (menuRef.current && isOpen) {
      requestAnimationFrame(() => {
        const actualMenuRect = menuRef.current?.getBoundingClientRect()
        if (actualMenuRect) {
          const actualHeight = actualMenuRect.height
          const actualWidth = actualMenuRect.width
          
          // If dimensions changed significantly, recalculate
          if (Math.abs(actualHeight - menuHeight) > 10 || Math.abs(actualWidth - menuWidth) > 10) {
            updatePosition()
          }
          
          // Final check: ensure menu is fully visible
          const finalTop = parseFloat(actualMenuRect.top.toString())
          const finalBottom = finalTop + actualHeight
          
          if (finalBottom > viewportHeight - spacing) {
            // Menu is still clipped, force it upward
            const newTop = Math.max(spacing, buttonRect.top - actualHeight - spacing)
            if (newTop !== position?.top) {
              setPosition({ top: newTop, left: position?.left || left })
            }
          }
        }
      })
    }
  }

  const handleToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const menuContent = isOpen && position && typeof window !== 'undefined' && (
    <div
      ref={menuRef}
      className="fixed bg-white rounded-md shadow-lg z-[99999] border border-gray-200 min-w-[192px] max-h-[calc(100vh-16px)] overflow-y-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        WebkitTapHighlightColor: 'transparent',
      }}
      role="menu"
      aria-orientation="vertical"
      onClick={(e) => {
        // Close menu when clicking on menu items
        const target = e.target as HTMLElement
        if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a, button')) {
          setIsOpen(false)
        }
      }}
      onTouchStart={(e) => {
        // Prevent event bubbling on touch
        e.stopPropagation()
      }}
    >
      <div className="py-1">
        {children}
      </div>
    </div>
  )

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        onTouchStart={(e) => {
          // Prevent double-tap zoom on Android
          e.preventDefault()
          handleToggle(e)
        }}
        className="p-2 hover:bg-gray-200 active:bg-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 min-w-[44px] min-h-[44px] w-[44px] h-[44px] flex items-center justify-center touch-manipulation cursor-pointer"
        style={{
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
        aria-label="Actions"
        aria-expanded={isOpen}
        aria-haspopup="true"
        type="button"
      >
        <MoreVertical className="w-5 h-5 text-gray-700" strokeWidth={2} />
      </button>
      {typeof window !== 'undefined' && menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}

