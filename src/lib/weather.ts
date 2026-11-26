export type Place = {
  name: string
  latitude: number
  longitude: number
  admin?: string
  country?: string
}

export type HourWeather = {
  time: string // local ISO, e.g. 2026-11-26T07:00
  temperature: number // °C
  feelsLike: number // °C
  precipProbability: number // %
  precipitation: number // mm
  windSpeed: number // km/h
  uvIndex: number
  weatherCode: number
  isDay: boolean
}

export type Forecast = {
  timezone: string
  hours: HourWeather[]
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'

export async function fetchForecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'wind_speed_10m',
      'uv_index',
      'weather_code',
      'is_day',
    ].join(','),
    forecast_days: '3',
    timezone: 'auto',
  })
  const res = await fetch(`${FORECAST_URL}?${params}`, { signal })
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`)
  const data = await res.json()
  const h = data.hourly
  const hours: HourWeather[] = h.time.map((time: string, i: number) => ({
    time,
    temperature: h.temperature_2m[i],
    feelsLike: h.apparent_temperature[i],
    precipProbability: h.precipitation_probability[i] ?? 0,
    precipitation: h.precipitation[i] ?? 0,
    windSpeed: h.wind_speed_10m[i],
    uvIndex: h.uv_index[i] ?? 0,
    weatherCode: h.weather_code[i],
    isDay: h.is_day[i] === 1,
  }))
  return { timezone: data.timezone, hours }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' })
  const res = await fetch(`${GEOCODE_URL}?${params}`, { signal })
  if (!res.ok) throw new Error(`Place search returned ${res.status}`)
  const data = await res.json()
  return (data.results ?? []).map((r: Record<string, unknown>) => ({
    name: r.name as string,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    admin: r.admin1 as string | undefined,
    country: r.country as string | undefined,
  }))
}

export function weatherLabel(code: number): { icon: string; text: string } {
  if (code === 0) return { icon: '☀️', text: 'Clear' }
  if (code <= 2) return { icon: '🌤️', text: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', text: 'Overcast' }
  if (code === 45 || code === 48) return { icon: '🌫️', text: 'Fog' }
  if (code >= 51 && code <= 57) return { icon: '🌦️', text: 'Drizzle' }
  if (code >= 61 && code <= 67) return { icon: '🌧️', text: 'Rain' }
  if (code >= 71 && code <= 77) return { icon: '🌨️', text: 'Snow' }
  if (code >= 80 && code <= 82) return { icon: '🌧️', text: 'Showers' }
  if (code === 85 || code === 86) return { icon: '🌨️', text: 'Snow showers' }
  if (code >= 95) return { icon: '⛈️', text: 'Thunderstorm' }
  return { icon: '🌡️', text: 'Mixed' }
}
