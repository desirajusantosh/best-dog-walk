import { useEffect, useMemo, useState } from 'react'
import { fetchForecast, searchPlaces, weatherLabel, type Forecast, type Place } from './lib/weather'
import { bestWindows, ratingText, scoreHour, type HourScore } from './lib/score'
import { load, save } from './lib/storage'
import './App.css'

type Unit = 'C' | 'F'

const fmtTemp = (c: number, unit: Unit) => `${Math.round(unit === 'C' ? c : c * 1.8 + 32)}°`
const fmtWind = (kmh: number, unit: Unit) => (unit === 'C' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh / 1.609)} mph`)

function fmtHour(time: string) {
  const h = Number(time.slice(11, 13))
  const suffix = h < 12 ? 'am' : 'pm'
  return `${h % 12 === 0 ? 12 : h % 12}${suffix}`
}

function dayLabel(date: string, index: number) {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  return new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: 'long' })
}

/** Current local time at the forecast location, formatted like the API's "YYYY-MM-DDTHH:00". */
function nowAt(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:00`
}

export default function App() {
  const [place, setPlace] = useState<Place | null>(() => load<Place | null>('bdw.place', null))
  const [unit, setUnit] = useState<Unit>(() => load<Unit>('bdw.unit', navigator.language === 'en-US' ? 'F' : 'C'))
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [status, setStatus] = useState<'idle' | 'locating' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dayIndex, setDayIndex] = useState(0)

  useEffect(() => save('bdw.unit', unit), [unit])

  useEffect(() => {
    if (!place) return
    save('bdw.place', place)
    const ctrl = new AbortController()
    setStatus('loading')
    setError(null)
    fetchForecast(place.latitude, place.longitude, ctrl.signal)
      .then((f) => {
        setForecast(f)
        setDayIndex(0)
        setStatus('idle')
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Could not load the forecast')
        setStatus('error')
      })
    return () => ctrl.abort()
  }, [place])

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setError('Your browser does not share location. Search for a city instead.')
      return
    }
    setStatus('locating')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setPlace({ name: 'Your location', latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {
        setStatus('idle')
        setError('Location was blocked. Search for your city instead.')
      },
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    )
  }

  const days = useMemo(() => {
    if (!forecast) return []
    const now = nowAt(forecast.timezone)
    const byDate = new Map<string, HourScore[]>()
    for (const h of forecast.hours) {
      if (h.time < now) continue
      const date = h.time.slice(0, 10)
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date)!.push(scoreHour(h))
    }
    return [...byDate.entries()].map(([date, scores]) => ({ date, scores }))
  }, [forecast])

  const day = days[dayIndex]
  const windows = day ? bestWindows(day.scores) : []

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>🐾</span>
          <div>
            <h1>Best Dog Walk</h1>
            <p className="tagline">The best times today to walk your dog, from the local forecast.</p>
          </div>
        </div>
        <div className="unit-toggle" role="group" aria-label="Temperature unit">
          {(['C', 'F'] as Unit[]).map((u) => (
            <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)} aria-pressed={unit === u}>
              °{u}
            </button>
          ))}
        </div>
      </header>

      <LocationBar
        place={place}
        locating={status === 'locating'}
        onLocate={useMyLocation}
        onPick={setPlace}
      />

      {error && <p className="error" role="alert">{error}</p>}

      {!place && status !== 'locating' && (
        <section className="empty">
          <p className="empty-icon" aria-hidden>🐕</p>
          <h2>Where are you walking?</h2>
          <p>Share your location or search for a city to see today's best walk times.</p>
        </section>
      )}

      {(status === 'loading' || status === 'locating') && <div className="spinner" aria-label="Loading" />}

      {status !== 'loading' && day && (
        <>
          <nav className="days" aria-label="Day">
            {days.map((d, i) => (
              <button key={d.date} className={i === dayIndex ? 'on' : ''} onClick={() => setDayIndex(i)}>
                {dayLabel(d.date, i)}
              </button>
            ))}
          </nav>

          <section className="best">
            <h2>Best times to walk</h2>
            {windows.length === 0 && <p className="muted">No daytime hours left. Check tomorrow.</p>}
            <ol>
              {windows.map((w, i) => (
                <li key={w.start.hour.time} className={`window r-${w.start.rating}`}>
                  <span className="rank">{i + 1}</span>
                  <div className="window-main">
                    <strong>
                      {fmtHour(w.start.hour.time)}
                      {w.end !== w.start && ` – ${fmtHour(addHour(w.end.hour.time))}`}
                    </strong>
                    <span className="muted">
                      {weatherLabel(w.start.hour.weatherCode).icon} {fmtTemp(w.start.hour.feelsLike, unit)} feels like
                      {w.start.hour.precipProbability > 0 && ` · ${w.start.hour.precipProbability}% rain`}
                    </span>
                  </div>
                  <span className="badge">{ratingText[w.start.rating]}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="hours">
            <h2>Hour by hour</h2>
            <ul>
              {day.scores.map((s) => (
                <HourRow key={s.hour.time} s={s} unit={unit} />
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="tips">
        <h2>Walk tips</h2>
        <ul>
          <li>Press the back of your hand on the pavement for 7 seconds. If it's too hot for you, it's too hot for paws.</li>
          <li>Bring water on warm days and on walks longer than 30 minutes.</li>
          <li>Flat-faced breeds, puppies and older dogs overheat faster. Go shorter when it's warm.</li>
          <li>In winter, rinse paws after walks to remove road salt.</li>
        </ul>
      </section>

      <footer className="foot">
        Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Walk scores are a
        guide only. Always watch your dog for signs of discomfort.
      </footer>
    </div>
  )
}

function addHour(time: string) {
  const h = (Number(time.slice(11, 13)) + 1) % 24
  return `${time.slice(0, 11)}${String(h).padStart(2, '0')}:00`
}

function HourRow({ s, unit }: { s: HourScore; unit: Unit }) {
  const w = weatherLabel(s.hour.weatherCode)
  return (
    <li className={`hour r-${s.rating}`}>
      <span className="hour-time">{fmtHour(s.hour.time)}</span>
      <span className="hour-icon" title={w.text} aria-label={w.text}>{!s.hour.isDay && s.hour.weatherCode <= 2 ? '🌙' : w.icon}</span>
      <span className="hour-temp">{fmtTemp(s.hour.feelsLike, unit)}</span>
      <span className="hour-bar" aria-hidden>
        <span style={{ width: `${s.score}%` }} />
      </span>
      <span className="hour-rating">{ratingText[s.rating]}</span>
      <span className="hour-detail muted">
        {s.hour.precipProbability}% rain · {fmtWind(s.hour.windSpeed, unit)}
        {s.warnings.length > 0 && <span className="warn"> · {s.warnings.join(' · ')}</span>}
      </span>
    </li>
  )
}

function LocationBar({
  place,
  locating,
  onLocate,
  onPick,
}: {
  place: Place | null
  locating: boolean
  onLocate: () => void
  onPick: (p: Place) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim().length < 2) return
    setSearching(true)
    setSearchError(null)
    try {
      const found = await searchPlaces(query.trim())
      setResults(found)
      if (!found.length) setSearchError('No places found.')
    } catch {
      setSearchError('Search failed. Check your connection.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <section className="location">
      {place && (
        <p className="current-place">
          📍 <strong>{place.name}</strong>
          {place.admin || place.country ? <span className="muted">, {[place.admin, place.country].filter(Boolean).join(', ')}</span> : null}
        </p>
      )}
      <div className="location-actions">
        <button className="primary" onClick={onLocate} disabled={locating}>
          {locating ? 'Locating…' : 'Use my location'}
        </button>
        <form onSubmit={submit} className="search" role="search">
          <input
            type="search"
            placeholder="Search city"
            aria-label="Search city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={searching}>{searching ? '…' : 'Search'}</button>
        </form>
      </div>
      {searchError && <p className="muted small">{searchError}</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button
                onClick={() => {
                  onPick(r)
                  setResults([])
                  setQuery('')
                }}
              >
                <strong>{r.name}</strong> <span className="muted">{[r.admin, r.country].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
