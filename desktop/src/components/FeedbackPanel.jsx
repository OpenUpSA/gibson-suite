import React from 'react'
import { useForm, ValidationError } from '@formspree/react'
import './FeedbackPanel.css'

const FeedbackPanel = () => {
  const [state, handleSubmit] = useForm('mpqejjvn')

  return (
    <div className="feedback-panel">
      <div className="split-options-header" style={{ padding: '20px 20px 0' }}>Feedback</div>

      {state.succeeded ? (
        <div className="feedback-success">
          <p>Thanks for your feedback!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="feedback-form">
          <label htmlFor="fb-email">
            Email <span className="feedback-optional">(optional)</span>
          </label>
          <input
            id="fb-email"
            type="email"
            name="email"
            placeholder="your@email.com"
            autoComplete="email"
          />
          <ValidationError field="email" prefix="Email" errors={state.errors} className="feedback-field-error" />

          <label htmlFor="fb-message">Message</label>
          <textarea
            id="fb-message"
            name="message"
            required
            rows={6}
            placeholder="Tell us what you think, report a bug, or suggest a feature…"
          />
          <ValidationError field="message" prefix="Message" errors={state.errors} className="feedback-field-error" />

          <button type="submit" disabled={state.submitting} className="feedback-submit">
            {state.submitting ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      )}
    </div>
  )
}

export default FeedbackPanel
