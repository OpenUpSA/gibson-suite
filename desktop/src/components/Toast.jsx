import { Icon } from '@iconify/react'
import './Toast.css'

// Bottom-right toast — used to tell the user their previous session was
// restored from local storage, with a one-click way back to defaults.
const Toast = ({ message, actionLabel, onAction, onDismiss }) => (
  <div className="app-toast">
    <Icon icon="fluent:info-20-regular" width="16" height="16" className="app-toast-icon" />
    <span className="app-toast-message">{message}</span>
    {actionLabel && onAction && (
      <button type="button" className="app-toast-action" onClick={onAction}>
        {actionLabel}
      </button>
    )}
    <button type="button" className="app-toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
      <Icon icon="fluent:dismiss-20-regular" width="14" height="14" />
    </button>
  </div>
)

export default Toast
