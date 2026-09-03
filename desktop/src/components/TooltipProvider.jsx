import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './TooltipProvider.css'

const TooltipProvider = () => {
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    const moveTitleToTooltip = (element) => {
      const title = element.getAttribute('title')
      if (title === null) return
      element.dataset.tooltip = title
      element.removeAttribute('title')
    }

    const moveTitlesIn = (node) => {
      if (!(node instanceof Element)) return
      moveTitleToTooltip(node)
      node.querySelectorAll('[title]').forEach(moveTitleToTooltip)
    }

    const showTooltip = (element) => {
      const label = element?.dataset.tooltip
      if (!label) return
      const bounds = element.getBoundingClientRect()
      const side = bounds.left < 140 ? 'right' : bounds.right > window.innerWidth - 140 ? 'left' : 'center'
      setTooltip({
        label,
        side,
        left: side === 'right' ? bounds.right + 8 : side === 'left' ? bounds.left - 8 : bounds.left + bounds.width / 2,
        top: bounds.bottom + 8,
      })
    }

    const hideTooltip = () => setTooltip(null)
    const getTrigger = (target) => target instanceof Element ? target.closest('[data-tooltip]') : null
    const onPointerOver = (event) => showTooltip(getTrigger(event.target))
    const onPointerOut = (event) => {
      if (getTrigger(event.target) !== getTrigger(event.relatedTarget)) hideTooltip()
    }
    const onFocusIn = (event) => showTooltip(getTrigger(event.target))
    const onFocusOut = () => hideTooltip()

    moveTitlesIn(document.body)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') moveTitleToTooltip(mutation.target)
        mutation.addedNodes.forEach(moveTitlesIn)
      })
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title'],
    })
    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', hideTooltip, true)
    window.addEventListener('resize', hideTooltip)

    return () => {
      observer.disconnect()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', hideTooltip, true)
      window.removeEventListener('resize', hideTooltip)
    }
  }, [])

  if (!tooltip) return null

  return createPortal(
    <div
      className={`app-tooltip app-tooltip--${tooltip.side}`}
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.label}
    </div>,
    document.body,
  )
}

export default TooltipProvider