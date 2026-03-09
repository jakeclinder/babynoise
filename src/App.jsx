import { useState, useRef, useCallback, useEffect } from 'react'
import { engine } from './audio/AudioEngine.js'
import MixerChannel from './components/MixerChannel.jsx'
import SchedulerModal from './components/SchedulerModal.jsx'

// ─── Default channel definitions ─────────────────────────────────────────────

const SYNTH_CHANNELS = [
  {
    id: 'white',
    name: 'White Noise',
    icon: '🌫️',
    color: '#90a4ae',
    type: 'synth',
    synthType: 'white',
    description: 'Full-spectrum noise — the classic hush',
  },
  {
    id: 'pink',
    name: 'Pink Noise',
    icon: '🌸',
    color: '#f48fb1',
    type: 'synth',
    synthType: 'pink',
    description: 'Warmer, softer — like steady rainfall',
  },
  {
    id: 'brown',
    name: 'Brown Noise',
    icon: '🍂',
    color: '#a1887f',
    type: 'synth',
    synthType: 'brown',
    description: 'Deep rumble — like a river or thunder in the distance',
  },
  {
    id: 'womb',
    name: 'Womb Rumble',
    icon: '🌊',
    color: '#ce93d8',
    type: 'synth',
    synthType: 'womb',
    description: 'Low-frequency drone — mimics the muffled underwater world of the womb',
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    icon: '💗',
    color: '#ef9a9a',
    type: 'synth',
    synthType: 'heartbeat',
    description: 'Steady lub-dub — the most familiar sound from the womb',
  },
  {
    id: 'shush',
    name: 'Shushing',
    icon: '🤫',
    color: '#81d4fa',
    type: 'synth',
    synthType: 'shush',
    description: 'Rhythmic shh-shh-shh — like a parent calming their baby',
  },
]

function makeDefaultState(defs) {
  return defs.map(def => ({
    ...def,
    active: false,      // whether this channel is in the mix
    volume: 0.6,
    schedule: {
      enabled: false,
      intervalMinutes: 5,
      durationMinutes: 1,
    },
  }))
}

let uploadCounter = 0

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [channels, setChannels] = useState(makeDefaultState(SYNTH_CHANNELS))
  const [uploadChannels, setUploadChannels] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [schedulerFor, setSchedulerFor] = useState(null) // channel id or null
  const [started, setStarted] = useState(false)          // AudioContext initiated
  const fileInputRef = useRef(null)
  const pendingUploadId = useRef(null)

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getChannel = useCallback((id) => {
    return (
      channels.find(c => c.id === id) ||
      uploadChannels.find(c => c.id === id)
    )
  }, [channels, uploadChannels])

  const updateChannel = useCallback((id, patch) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    setUploadChannels(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }, [])

  // ─── Audio lifecycle ──────────────────────────────────────────────────────

  async function startEngine() {
    await engine.init()
    setStarted(true)
  }

  function startChannel(ch) {
    if (ch.type === 'synth') {
      engine.startSynth(ch.id, ch.synthType)
    } else {
      engine.startFile(ch.id)
    }
    engine.setVolume(ch.id, ch.schedule.enabled ? 0 : ch.volume)

    if (ch.schedule.enabled) {
      engine.setScheduler(ch.id, ch.schedule.intervalMinutes, ch.schedule.durationMinutes)
    }
  }

  function stopChannel(ch) {
    engine.clearScheduler(ch.id)
    const chNode = engine.channels.get(ch.id)
    if (chNode) {
      engine._stopSources(chNode)
      chNode.gainNode.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.1)
    }
  }

  async function handleGlobalPlay() {
    if (!started) await startEngine()

    const allChannels = [...channels, ...uploadChannels]

    if (!isPlaying) {
      // Start all active channels
      for (const ch of allChannels) {
        if (ch.active) startChannel(ch)
      }
      setIsPlaying(true)
    } else {
      // Stop everything
      for (const ch of allChannels) {
        if (ch.active) {
          engine.clearScheduler(ch.id)
          const chNode = engine.channels.get(ch.id)
          if (chNode) {
            engine._stopSources(chNode)
            chNode.gainNode.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.1)
          }
        }
      }
      setIsPlaying(false)
    }
  }

  // ─── Channel toggle ───────────────────────────────────────────────────────

  async function handleToggle(id) {
    const ch = getChannel(id)
    if (!ch) return

    if (!started) await startEngine()

    const nextActive = !ch.active
    updateChannel(id, { active: nextActive })

    if (isPlaying) {
      if (nextActive) {
        startChannel({ ...ch, active: true })
      } else {
        engine.clearScheduler(id)
        const chNode = engine.channels.get(id)
        if (chNode) {
          engine._stopSources(chNode)
          chNode.gainNode.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.1)
        }
      }
    }
  }

  // ─── Volume change ────────────────────────────────────────────────────────

  function handleVolumeChange(id, vol) {
    updateChannel(id, { volume: vol })
    if (started) engine.setVolume(id, vol)
  }

  // ─── Scheduler ────────────────────────────────────────────────────────────

  function handleOpenScheduler(id) {
    setSchedulerFor(id)
  }

  function handleSaveScheduler(id, schedule) {
    updateChannel(id, { schedule })

    // If currently playing and active, restart with new schedule
    if (isPlaying) {
      const ch = getChannel(id)
      if (ch?.active) {
        engine.clearScheduler(id)
        if (schedule.enabled) {
          engine.setScheduler(id, schedule.intervalMinutes, schedule.durationMinutes)
        } else {
          engine.setVolume(id, ch.volume)
        }
      }
    }
    setSchedulerFor(null)
  }

  // ─── File upload ──────────────────────────────────────────────────────────

  function handleAddUpload() {
    pendingUploadId.current = `upload-${++uploadCounter}`
    fileInputRef.current.click()
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    const id = pendingUploadId.current
    if (!started) await startEngine()

    const arrayBuffer = await file.arrayBuffer()
    try {
      await engine.loadAudioFile(id, arrayBuffer)
    } catch {
      alert('Could not decode audio file. Please use MP3, WAV, OGG, or M4A.')
      return
    }

    const newChannel = {
      id,
      name: file.name.replace(/\.[^.]+$/, ''),
      icon: '📁',
      color: '#4db6ac',
      type: 'file',
      active: false,
      volume: 0.6,
      schedule: { enabled: false, intervalMinutes: 5, durationMinutes: 1 },
    }
    setUploadChannels(prev => [...prev, newChannel])
  }

  function handleRemoveUpload(id) {
    if (isPlaying) {
      const chNode = engine.channels.get(id)
      if (chNode) {
        engine._stopSources(chNode)
        chNode.gainNode.gain.setValueAtTime(0, engine.ctx?.currentTime ?? 0)
      }
    }
    engine.clearScheduler(id)
    engine.channels.delete(id)
    setUploadChannels(prev => prev.filter(c => c.id !== id))
  }

  // ─── Prevent screen sleep while playing (Wake Lock API) ──────────────────

  const wakeLockRef = useRef(null)

  useEffect(() => {
    if (isPlaying && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => {
        wakeLockRef.current = lock
      }).catch(() => {})
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [isPlaying])

  // ─── Render ───────────────────────────────────────────────────────────────

  const schedulerChannel = schedulerFor ? getChannel(schedulerFor) : null
  const anyActive = [...channels, ...uploadChannels].some(c => c.active)

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-title">
          <span className="header-moon">🌙</span>
          <h1>BabyNoise</h1>
        </div>
        <p className="header-sub">Your baby's personal soundscape</p>
      </header>

      {/* Global controls */}
      <div className="global-controls">
        <button
          className={`play-btn ${isPlaying ? 'playing' : ''} ${!anyActive ? 'disabled' : ''}`}
          onClick={handleGlobalPlay}
          disabled={!anyActive}
          aria-label={isPlaying ? 'Stop all sounds' : 'Play selected sounds'}
        >
          <span className="play-btn-icon">{isPlaying ? '⏹' : '▶'}</span>
          <span className="play-btn-label">{isPlaying ? 'Stop' : 'Play'}</span>
        </button>

        {!anyActive && (
          <p className="hint">Toggle at least one sound below to begin</p>
        )}
        {anyActive && !isPlaying && (
          <p className="hint">
            {[...channels, ...uploadChannels].filter(c => c.active).map(c => c.name).join(' · ')}
          </p>
        )}
        {isPlaying && (
          <p className="hint playing-hint">
            Now playing — keep the screen on or lock your phone
          </p>
        )}
      </div>

      {/* Synth channels */}
      <section className="channels-section">
        <h2 className="section-title">Built-in Sounds</h2>
        <div className="channels-grid">
          {channels.map(ch => (
            <MixerChannel
              key={ch.id}
              channel={ch}
              isPlaying={isPlaying}
              onToggle={handleToggle}
              onVolumeChange={handleVolumeChange}
              onOpenScheduler={handleOpenScheduler}
            />
          ))}
        </div>
      </section>

      {/* Upload channels */}
      <section className="channels-section">
        <h2 className="section-title">Your Sounds</h2>
        {uploadChannels.length === 0 && (
          <p className="upload-hint">
            Upload your own recordings — bath water, music, your voice, anything.
          </p>
        )}
        <div className="channels-grid">
          {uploadChannels.map(ch => (
            <MixerChannel
              key={ch.id}
              channel={ch}
              isPlaying={isPlaying}
              onToggle={handleToggle}
              onVolumeChange={handleVolumeChange}
              onOpenScheduler={handleOpenScheduler}
              onRemove={handleRemoveUpload}
            />
          ))}
        </div>

        <button className="add-upload-btn" onClick={handleAddUpload}>
          <span>+</span> Add a sound file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </section>

      {/* Scheduler modal */}
      {schedulerChannel && (
        <SchedulerModal
          channel={schedulerChannel}
          onSave={handleSaveScheduler}
          onClose={() => setSchedulerFor(null)}
        />
      )}

      <footer className="app-footer">
        <p>Tip: the Womb Rumble and Heartbeat channels reproduce the low frequencies babies felt in the womb — try them together.</p>
      </footer>
    </div>
  )
}
