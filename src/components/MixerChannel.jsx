/**
 * MixerChannel — one card in the mixer grid.
 *
 * Shows:
 *  - Icon + name + description
 *  - Active toggle (add/remove from mix)
 *  - Volume slider (only visible when active)
 *  - Schedule button (opens SchedulerModal)
 *  - Optional remove button (for uploaded files)
 */
export default function MixerChannel({
  channel,
  isPlaying,
  onToggle,
  onVolumeChange,
  onOpenScheduler,
  onRemove,
}) {
  const { id, name, icon, color, description, active, volume, schedule } = channel

  const scheduleLabel = schedule.enabled
    ? `Every ${schedule.intervalMinutes}m for ${schedule.durationMinutes}m`
    : null

  return (
    <div
      className={`channel-card ${active ? 'active' : ''}`}
      style={{ '--channel-color': color }}
    >
      {/* Top row: icon + name + action buttons */}
      <div className="channel-header">
        <div className="channel-identity">
          <span className="channel-icon">{icon}</span>
          <div className="channel-name-wrap">
            <span className="channel-name">{name}</span>
            {scheduleLabel && (
              <span className="schedule-badge">⏰ {scheduleLabel}</span>
            )}
          </div>
        </div>

        <div className="channel-actions">
          {/* Schedule button */}
          <button
            className={`action-btn ${schedule.enabled ? 'scheduled' : ''}`}
            onClick={() => onOpenScheduler(id)}
            title="Set schedule"
            aria-label="Set schedule"
          >
            ⏰
          </button>

          {/* Remove button (uploads only) */}
          {onRemove && (
            <button
              className="action-btn remove-btn"
              onClick={() => onRemove(id)}
              title="Remove"
              aria-label="Remove sound"
            >
              ✕
            </button>
          )}

          {/* Active toggle */}
          <button
            className={`toggle-btn ${active ? 'on' : 'off'}`}
            onClick={() => onToggle(id)}
            aria-label={active ? 'Remove from mix' : 'Add to mix'}
            title={active ? 'Remove from mix' : 'Add to mix'}
          >
            {active ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="channel-description">{description}</p>
      )}

      {/* Volume slider — only shown when active */}
      {active && (
        <div className="volume-row">
          <span className="volume-label">Vol</span>
          <div className="slider-wrap">
            <input
              type="range"
              className="volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={e => onVolumeChange(id, parseFloat(e.target.value))}
              style={{ '--fill': `${volume * 100}%`, '--color': color }}
              aria-label={`${name} volume`}
            />
          </div>
          <span className="volume-pct">{Math.round(volume * 100)}%</span>
        </div>
      )}

      {/* Active indicator glow */}
      {active && isPlaying && !schedule.enabled && (
        <div className="playing-indicator">
          <span className="pulse-dot" style={{ background: color }} />
          <span className="playing-text">playing</span>
        </div>
      )}
      {active && isPlaying && schedule.enabled && (
        <div className="playing-indicator">
          <span className="pulse-dot sched" style={{ background: color }} />
          <span className="playing-text">scheduled</span>
        </div>
      )}
    </div>
  )
}
