/**
 * AudioEngine — wraps the Web Audio API for BabyNoise.
 *
 * Architecture:
 *   source(s) → gainNode → masterGain → destination
 *
 * Each channel has one gainNode (user volume) and one or more source nodes.
 * The scheduler fades the gainNode up/down on a timer.
 */

class AudioEngine {
  constructor() {
    this.ctx = null
    this.masterGain = null
    this.channels = new Map()   // id → { gainNode, sources, audioBuffer, userVolume }
    this.timers = new Map()     // id → { intervalId, durationTimeoutId }
    this.initialized = false
  }

  // ─── Init ────────────────────────────────────────────────────────────────

  async init() {
    if (this.initialized) return
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 1.0
    this.masterGain.connect(this.ctx.destination)

    // Pre-generate 20-second looping noise buffers
    this._white = this._makeWhiteNoise(20)
    this._pink  = this._makePinkNoise(20)
    this._brown = this._makeBrownNoise(20)
    this._heart = this._makeHeartbeatBuffer(72)

    this.initialized = true
  }

  // ─── Noise generators ────────────────────────────────────────────────────

  _makeWhiteNoise(dur) {
    const sr  = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(2, sr * dur, sr)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    return buf
  }

  _makePinkNoise(dur) {
    const sr  = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, sr * dur, sr)
    const d   = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.96900 * b2 + w * 0.1538520
      b3 = 0.86650 * b3 + w * 0.3104856
      b4 = 0.55000 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.0168980
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
    return buf
  }

  _makeBrownNoise(dur) {
    const sr  = this.ctx.sampleRate
    const buf = this.ctx.createBuffer(1, sr * dur, sr)
    const d   = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      d[i] = (last + 0.02 * w) / 1.02
      last = d[i]
      d[i] *= 3.5
      d[i] = Math.max(-1, Math.min(1, d[i]))
    }
    return buf
  }

  /** Synthesise a single lub-dub heartbeat cycle as a looping buffer. */
  _makeHeartbeatBuffer(bpm = 72) {
    const sr      = this.ctx.sampleRate
    const period  = Math.floor(sr * 60 / bpm)
    const buf     = this.ctx.createBuffer(1, period, sr)
    const d       = buf.getChannelData(0)

    const pulse = (offsetMs, amp, freq, decayMs) => {
      const off     = Math.floor(sr * offsetMs / 1000)
      const decay   = Math.floor(sr * decayMs  / 1000)
      const attack  = Math.floor(sr * 8        / 1000) // 8 ms attack
      for (let i = 0; i < decay && off + i < d.length; i++) {
        const env = i < attack
          ? i / attack
          : Math.exp(-3.5 * (i - attack) / decay)
        d[off + i] += amp * env * Math.sin(2 * Math.PI * freq * i / sr)
      }
    }

    pulse(0,   0.9, 62, 140)  // lub  – main thump
    pulse(200, 0.6, 58, 110)  // dub  – softer second beat
    return buf
  }

  // ─── Channel management ──────────────────────────────────────────────────

  _getOrCreate(id) {
    if (!this.channels.has(id)) {
      const gainNode = this.ctx.createGain()
      gainNode.gain.value = 0
      gainNode.connect(this.masterGain)
      this.channels.set(id, { gainNode, sources: [], audioBuffer: null, userVolume: 0.5 })
    }
    return this.channels.get(id)
  }

  _stopSources(ch) {
    ch.sources.forEach(s => { try { s.stop() } catch (_) {} })
    ch.sources = []
  }

  // ─── Start synth channels ────────────────────────────────────────────────

  startSynth(id, synthType) {
    if (!this.initialized) return
    const ch = this._getOrCreate(id)
    this._stopSources(ch)

    const { gainNode } = ch
    const sources = []

    switch (synthType) {
      case 'white': {
        const src = this.ctx.createBufferSource()
        src.buffer = this._white
        src.loop = true
        src.connect(gainNode)
        src.start()
        sources.push(src)
        break
      }

      case 'pink': {
        const src = this.ctx.createBufferSource()
        src.buffer = this._pink
        src.loop = true
        src.connect(gainNode)
        src.start()
        sources.push(src)
        break
      }

      case 'brown': {
        const src = this.ctx.createBufferSource()
        src.buffer = this._brown
        src.loop = true
        src.connect(gainNode)
        src.start()
        sources.push(src)
        break
      }

      case 'womb': {
        // Deep low-frequency rumble — mimics the underwater/womb soundscape.
        // Layers: fundamental at 55 Hz, second harmonic at 110 Hz,
        //         slow (~1.2 Hz) amplitude wobble, heavily low-passed brown noise.

        // Fundamental (A1 = 55 Hz)
        const osc1 = this.ctx.createOscillator()
        osc1.type = 'sine'
        osc1.frequency.value = 55
        const g1 = this.ctx.createGain()
        g1.gain.value = 0.45
        osc1.connect(g1); g1.connect(gainNode)
        osc1.start()
        sources.push(osc1)

        // Second harmonic
        const osc2 = this.ctx.createOscillator()
        osc2.type = 'sine'
        osc2.frequency.value = 110
        const g2 = this.ctx.createGain()
        g2.gain.value = 0.15
        osc2.connect(g2); g2.connect(gainNode)
        osc2.start()
        sources.push(osc2)

        // Third harmonic (faint)
        const osc3 = this.ctx.createOscillator()
        osc3.type = 'sine'
        osc3.frequency.value = 165
        const g3 = this.ctx.createGain()
        g3.gain.value = 0.06
        osc3.connect(g3); g3.connect(gainNode)
        osc3.start()
        sources.push(osc3)

        // Slow LFO modulating the fundamental amplitude
        const lfo = this.ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 1.2
        const lfoGain = this.ctx.createGain()
        lfoGain.gain.value = 0.12
        lfo.connect(lfoGain)
        lfoGain.connect(g1.gain)
        lfo.start()
        sources.push(lfo)

        // Very low-passed brown noise for texture
        const nSrc = this.ctx.createBufferSource()
        nSrc.buffer = this._brown
        nSrc.loop = true
        const lp = this.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 100
        lp.Q.value = 0.4
        const ng = this.ctx.createGain()
        ng.gain.value = 0.2
        nSrc.connect(lp); lp.connect(ng); ng.connect(gainNode)
        nSrc.start()
        sources.push(nSrc)
        break
      }

      case 'heartbeat': {
        const src = this.ctx.createBufferSource()
        src.buffer = this._heart
        src.loop = true
        // Gentle low-pass to keep it warm
        const lp = this.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 400
        src.connect(lp); lp.connect(gainNode)
        src.start()
        sources.push(src)
        break
      }

      case 'shush': {
        // Bandpass-filtered white noise with a rhythmic amplitude LFO
        // — sounds like a parent shushing.
        const nSrc = this.ctx.createBufferSource()
        nSrc.buffer = this._white
        nSrc.loop = true

        const bp = this.ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 3200
        bp.Q.value = 1.4

        // Add slight high-shelf brightness
        const shelf = this.ctx.createBiquadFilter()
        shelf.type = 'highshelf'
        shelf.frequency.value = 2000
        shelf.gain.value = 4

        // LFO at ~2.5 Hz gives a convincing shsh-shsh-shsh rhythm
        const lfo = this.ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 2.5

        const shushGain = this.ctx.createGain()
        shushGain.gain.value = 0.5

        const lfoGain = this.ctx.createGain()
        lfoGain.gain.value = 0.45

        lfo.connect(lfoGain)
        lfoGain.connect(shushGain.gain)

        nSrc.connect(bp); bp.connect(shelf); shelf.connect(shushGain)
        shushGain.connect(gainNode)

        nSrc.start()
        lfo.start()
        sources.push(nSrc, lfo)
        break
      }

      default:
        break
    }

    ch.sources = sources
  }

  // ─── File channels ───────────────────────────────────────────────────────

  async loadAudioFile(id, arrayBuffer) {
    if (!this.initialized) await this.init()
    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer)
    const ch = this._getOrCreate(id)
    ch.audioBuffer = audioBuffer
    return audioBuffer
  }

  startFile(id) {
    if (!this.initialized) return
    const ch = this.channels.get(id)
    if (!ch?.audioBuffer) return

    this._stopSources(ch)

    const src = this.ctx.createBufferSource()
    src.buffer = ch.audioBuffer
    src.loop = true
    src.connect(ch.gainNode)
    src.start()
    ch.sources = [src]
  }

  // ─── Volume ──────────────────────────────────────────────────────────────

  setVolume(id, vol) {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.userVolume = vol
    // Only update live gain if not currently faded out by scheduler
    if (!ch.schedulerMuted) {
      ch.gainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05)
    }
  }

  _fadeGainTo(id, target, durationSec = 1.0) {
    const ch = this.channels.get(id)
    if (!ch) return
    const now = this.ctx.currentTime
    ch.gainNode.gain.cancelScheduledValues(now)
    ch.gainNode.gain.setValueAtTime(ch.gainNode.gain.value, now)
    ch.gainNode.gain.linearRampToValueAtTime(target, now + durationSec)
  }

  // ─── Scheduler ───────────────────────────────────────────────────────────

  /**
   * Start a schedule for a channel: it will fade in every `intervalMin` minutes
   * and play for `durationMin` minutes, then fade out.
   * The channel must already be started (sources running) so its gain is what
   * the scheduler controls.
   */
  setScheduler(id, intervalMin, durationMin) {
    this.clearScheduler(id)

    const ch = this.channels.get(id)
    if (!ch) return

    // Mark as scheduler-muted initially (starts silent, plays on schedule)
    ch.schedulerMuted = true
    this._fadeGainTo(id, 0, 0.1)

    const intervalMs = intervalMin * 60 * 1000
    const durationMs = durationMin * 60 * 1000

    const trigger = () => {
      ch.schedulerMuted = false
      this._fadeGainTo(id, ch.userVolume, 1.5)

      const durationTimeout = setTimeout(() => {
        ch.schedulerMuted = true
        this._fadeGainTo(id, 0, 1.5)
      }, durationMs)

      const entry = this.timers.get(id)
      if (entry) entry.durationTimeoutId = durationTimeout
    }

    const intervalId = setInterval(trigger, intervalMs)
    this.timers.set(id, { intervalId, durationTimeoutId: null })
  }

  clearScheduler(id) {
    const t = this.timers.get(id)
    if (t) {
      clearInterval(t.intervalId)
      clearTimeout(t.durationTimeoutId)
      this.timers.delete(id)
    }
    const ch = this.channels.get(id)
    if (ch) ch.schedulerMuted = false
  }

  clearAllSchedulers() {
    for (const id of this.timers.keys()) this.clearScheduler(id)
  }

  // ─── Global stop ─────────────────────────────────────────────────────────

  stopAll() {
    this.clearAllSchedulers()
    for (const ch of this.channels.values()) {
      this._stopSources(ch)
      ch.gainNode.gain.setValueAtTime(0, this.ctx.currentTime)
      ch.schedulerMuted = false
    }
  }

  suspend() {
    return this.ctx?.suspend()
  }

  resume() {
    return this.ctx?.resume()
  }
}

// Singleton — one engine for the lifetime of the page
export const engine = new AudioEngine()
