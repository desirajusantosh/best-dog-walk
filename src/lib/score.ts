import type { HourWeather } from './weather'

export type Rating = 'great' | 'good' | 'fair' | 'poor' | 'avoid'

export type HourScore = {
  hour: HourWeather
  score: number // 0–100
  rating: Rating
  warnings: string[]
}

/** Rough asphalt temperature in sun: air temp plus solar gain driven by UV. */
export function estimatePavementC(h: HourWeather): number {
  if (!h.isDay) return h.temperature
  return h.temperature + Math.min(h.uvIndex, 11) * 2.6
}

export function scoreHour(h: HourWeather): HourScore {
  const warnings: string[] = []
  let score = 100
  const t = h.feelsLike

  // Temperature comfort for dogs: ideal roughly 8–20 °C feels-like.
  if (t > 20) score -= (t - 20) * 5
  if (t < 8) score -= (8 - t) * 2.5
  if (t >= 29) warnings.push('Heatstroke risk: keep it very short')
  else if (t >= 25) warnings.push('Warm: bring water, find shade')
  if (t <= -10) warnings.push('Very cold: protect paws, short walk')
  else if (t <= 0) warnings.push('Freezing: watch for ice and salt')

  // Hot pavement (the 7-second hand test threshold is about 52 °C).
  const pave = estimatePavementC(h)
  if (pave >= 52) {
    score -= 35
    warnings.push('Pavement likely too hot for paws')
  } else if (pave >= 45) {
    score -= 15
    warnings.push('Pavement may be hot: stick to grass')
  }

  // Rain
  score -= h.precipProbability * 0.45
  if (h.precipitation >= 2) score -= 15
  if (h.precipProbability >= 60) warnings.push('Rain likely')

  // Storms
  if (h.weatherCode >= 95) {
    score -= 50
    warnings.push('Thunderstorms')
  }

  // Wind
  if (h.windSpeed > 25) score -= (h.windSpeed - 25) * 1.2
  if (h.windSpeed >= 40) warnings.push('Strong wind')

  // Darkness is fine but less ideal.
  if (!h.isDay) score -= 10

  score = Math.round(Math.max(0, Math.min(100, score)))
  return { hour: h, score, rating: ratingFor(score), warnings }
}

export function ratingFor(score: number): Rating {
  if (score >= 80) return 'great'
  if (score >= 65) return 'good'
  if (score >= 45) return 'fair'
  if (score >= 25) return 'poor'
  return 'avoid'
}

export const ratingText: Record<Rating, string> = {
  great: 'Great',
  good: 'Good',
  fair: 'Okay',
  poor: 'Poor',
  avoid: 'Avoid',
}

export type WalkWindow = { start: HourScore; end: HourScore; avg: number }

/**
 * Best walk windows among waking hours (6:00–22:00): runs of consecutive hours
 * rated "good" or better, ranked by average score. Falls back to the single
 * best hours when nothing is good.
 */
export function bestWindows(scores: HourScore[], limit = 3): WalkWindow[] {
  const waking = scores.filter((s) => {
    const hr = Number(s.hour.time.slice(11, 13))
    return hr >= 6 && hr <= 22
  })
  const windows: WalkWindow[] = []
  let run: HourScore[] = []
  const flush = () => {
    if (run.length) {
      const avg = run.reduce((a, s) => a + s.score, 0) / run.length
      windows.push({ start: run[0], end: run[run.length - 1], avg })
    }
    run = []
  }
  for (const s of waking) {
    if (s.score >= 65) run.push(s)
    else flush()
  }
  flush()
  if (!windows.length) {
    return [...waking]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => ({ start: s, end: s, avg: s.score }))
  }
  return windows.sort((a, b) => b.avg - a.avg).slice(0, limit)
}
