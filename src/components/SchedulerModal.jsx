import { useState } from 'react'

/**
 * SchedulerModal
 *
 * Lets the parent configure a channel to play on a recurring schedule:
 *   "Play every X minutes for Y minutes"
 *
 * Only active when global play is running.
 */
export default function SchedulerModal({ channel, onSave, onClose }) {
  const [enabled, setEnabled]               = useState(channel.schedule.enabled)
  const [intervalMinutes, setIntervalMinutes] = useState(channel.schedule.intervalMinutes)
  const [durationMinutes, setDurationMinutes] = useState(channel.schedule.durationMinutes)

  function handleSave() {
    onSave(channel.id, { enabled, intervalMinutes, durationMinutes })
  }

  // Clamp helpers
  const clampInterval = v => Math.max(1, Math.min(60, v))
  const clampDuration = v => Math.max(1, Math.min(intervalMinutes - 1 || 1, v))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Schedule settings">
        <div className="modal-header">
          <span className="modal-icon">{channel.icon}</span>
          <h2 className="modal-title">Schedule: {channel.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {/* Enable toggle */}
          <label className="toggle-row">
            <span className="toggle-row-label">Enable schedule</span>
            <button
              className={`toggle-btn large ${enabled ? 'on' : 'off'}`}
              onClick={() => setEnabled(v => !v)}
            >
              {enabled ? 'ON' : 'OFF'}
            </button>
          </label>

          {enabled && (
            <>
              <p className="modal-desc">
                When playing, this sound will fade in every{' '}
                <strong>{intervalMinutes} {intervalMinutes === 1 ? 'minute' : 'minutes'}</strong>{' '}
                and play for{' '}
                <strong>{durationMinutes} {durationMinutes === 1 ? 'minute' : 'minutes'}</strong>{' '}
                before fading out.
              </p>

              {/* Interval slider */}
              <div className="modal-slider-group">
                <label className="modal-slider-label">
                  Play every
                  <span className="modal-value">{intervalMinutes} min</span>
                </label>
                <input
                  type="range"
                  className="volume-slider modal-slider"
                  min={2}
                  max={60}
                  step={1}
                  value={intervalMinutes}
                  onChange={e => {
                    const v = clampInterval(parseInt(e.target.value))
                    setIntervalMinutes(v)
                    if (durationMinutes >= v) setDurationMinutes(v - 1 || 1)
                  }}
                  style={{ '--fill': `${((intervalMinutes - 2) / 58) * 100}%`, '--color': channel.color }}
                />
                <div className="slider-tick-row">
                  <span>2 min</span><span>30 min</span><span>60 min</span>
                </div>
              </div>

              {/* Duration slider */}
              <div className="modal-slider-group">
                <label className="modal-slider-label">
                  For how long
                  <span className="modal-value">{durationMinutes} min</span>
                </label>
                <input
                  type="range"
                  className="volume-slider modal-slider"
                  min={1}
                  max={Math.max(1, intervalMinutes - 1)}
                  step={1}
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(clampDuration(parseInt(e.target.value)))}
                  style={{
                    '--fill': `${((durationMinutes - 1) / Math.max(1, intervalMinutes - 2)) * 100}%`,
                    '--color': channel.color,
                  }}
                />
                <div className="slider-tick-row">
                  <span>1 min</span>
                  <span>{Math.floor((intervalMinutes - 1) / 2)} min</span>
                  <span>{intervalMinutes - 1} min</span>
                </div>
              </div>

              <div className="modal-preview">
                <span className="modal-preview-icon">⏰</span>
                <span>
                  Starts silent → plays at {Math.round(intervalMinutes)} min →{' '}
                  stops at {Math.round(intervalMinutes + durationMinutes)} min →{' '}
                  repeats
                </span>
              </div>
            </>
          )}

          {!enabled && (
            <p className="modal-desc muted">
              This sound will play continuously whenever you hit Play.
              Turn on scheduling to have it fade in and out on a timer — great
              for shushing or heartbeat intervals.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn save"
            onClick={handleSave}
            style={{ '--color': channel.color }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
