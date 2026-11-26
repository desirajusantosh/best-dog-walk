# Best Dog Walk

A web app that shows the best times to walk your dog, scored hour by hour from the local forecast.

- Uses your location (or a city search) and the free [Open-Meteo](https://open-meteo.com/) API. No API key or backend needed.
- Scores each hour for heat, hot pavement, rain, storms and wind, and highlights the best walk windows for today and the next two days.
- °C/°F toggle, light and dark mode, installable as a home-screen app (PWA).

Ported from the original Android (Jetpack Compose) app.

## Develop

```bash
npm install
npm run dev
```

## Deploy

Static site. On Vercel, import the repo; `vercel.json` sets the Vite build (`npm run build`, output `dist`).

Scoring lives in `src/lib/score.ts`.
