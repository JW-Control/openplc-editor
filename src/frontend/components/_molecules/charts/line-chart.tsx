import { useId, useMemo } from 'react'
import Chart from 'react-apexcharts'

type LineChartProps = {
  data: { x: number; y: number }[]
  isBool?: boolean
  range: number
  now: number
  startTime: number
  label?: string
}

const graphColors = ['#E5B300', '#3FB950', '#2F81F7', '#DB6D28', '#A371F7', '#DA3633']

const getNiceTickInterval = (rangeSeconds: number): number => {
  const candidate = rangeSeconds / 5
  const niceValues = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]
  for (const nice of niceValues) {
    if (nice >= candidate) return nice
  }
  return niceValues[niceValues.length - 1]
}

const formatElapsedLabel = (elapsedSeconds: number): string => {
  if (elapsedSeconds < 60) return `${Math.round(elapsedSeconds)}s`
  if (elapsedSeconds < 3600) {
    const minutes = Math.floor(elapsedSeconds / 60)
    const seconds = Math.round(elapsedSeconds % 60)
    return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`
  }
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.round((elapsedSeconds % 3600) / 60)
  return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`
}

const LineChart = ({ data, isBool = false, range, now, startTime, label }: LineChartProps) => {
  const chartId = useId()

  const elapsedSeconds = useMemo(() => (now - startTime) / 1000, [now, startTime])

  const chartOptions = useMemo(() => {
    const tickInterval = getNiceTickInterval(range)
    const xMin = elapsedSeconds - range
    const xMax = elapsedSeconds

    return {
      chart: {
        id: chartId,
        // Disabled: every new sample eased into place over 500ms while the
        // x-axis window was also sliding in real time (a new poll lands
        // every 100ms), so a step transition visibly "jittered" — animating
        // and re-windowing at once. An oscilloscope-style trace needs each
        // sample to snap in immediately, not animate.
        animations: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: false },
        background: 'transparent',
      },
      colors: graphColors,
      xaxis: {
        type: 'numeric' as const,
        min: xMin,
        max: xMax,
        tickAmount: Math.max(2, Math.ceil(range / tickInterval)),
        labels: {
          show: true,
          formatter: (val: string) => formatElapsedLabel(Number(val)),
          style: { colors: '#9ca3af', fontSize: '10px' },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        // BOOL: exactly two ticks, pinned to the real 0/1 values — the
        // previous -0.2/1.2 padding made the gridlines land off those
        // values, so the labelled ticks never actually lined up with the
        // flat high/low segments. The flat line sitting flush on the plot
        // edge is a minor cosmetic trade-off, not worth reintroducing value
        // padding for (see the `grid` comment below for why that's risky).
        // This whole yaxis shape mirrors the original code (isBool ? X :
        // undefined for every field) — only the BOOL-branch numbers changed.
        min: isBool ? 0 : undefined,
        max: isBool ? 1 : undefined,
        // tickAmount: 1 (a single interval) is ALSO suspected to trip the
        // same ApexCharts layout bug — its per-label-width math likely
        // assumes >= 2 intervals. Kept at the original, previously-safe 2
        // (0, 0.5, 1 — the 0.5 tick is unlabeled below, harmless) rather
        // than risk another crash for a cosmetic single-line difference.
        tickAmount: isBool ? 2 : undefined,
        labels: {
          show: true,
          style: { colors: '#9ca3af', fontSize: '10px' },
          formatter: isBool ? (val: number) => (val <= 0 ? 'FALSE' : val >= 1 ? 'TRUE' : '') : undefined,
        },
      },
      grid: {
        borderColor: '#374151',
        strokeDashArray: 3,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        // NOT setting `padding` here at all — found via
        // node_modules/apexcharts/src/modules/dimensions/Dimensions.js:
        // `this.gridPad = this.w.config.grid.padding` is used unguarded
        // later (`this.gridPad.left`, `.right`, …). Passing `padding:
        // undefined` for the non-bool branch overwrote ApexCharts' own
        // default padding object with a literal `undefined` during options
        // merge, so `this.gridPad` became `undefined` and any `.left`/`.right`
        // read threw exactly the reported
        // "Cannot read properties of undefined (reading 'left')" — this was
        // the actual root cause of every "observe a variable" crash in this
        // file, not the yaxis min/max/tickAmount changes suspected earlier.
        // Omitting the key entirely lets ApexCharts keep its own default.
      },
      // PLC values update once per scan cycle, not continuously — a 'smooth'
      // spline between samples implies interpolated intermediate values that
      // never actually existed (e.g. a counter's CV "ramping" through 2.3,
      // 2.7... between ticks). 'stepline' draws the flat-then-jump shape that
      // actually matches discrete scan-cycle data, for both BOOL and numeric
      // series.
      stroke: { curve: 'stepline' as const, width: 2 },
      tooltip: { enabled: false },
      states: {
        hover: { filter: { type: 'none' } },
        active: { filter: { type: 'none' } },
      },
      markers: { size: 0 },
      theme: { mode: 'dark' as const },
    }
  }, [chartId, isBool, range, elapsedSeconds])

  const chartSeries = useMemo(
    () => [
      {
        name: 'value',
        data: data.map((point) => ({
          x: (point.x - startTime) / 1000,
          y: point.y,
        })),
      },
    ],
    [data, startTime],
  )

  return (
    <div className='relative w-full'>
      {label && <div className='absolute left-12 top-1 z-10 text-xs font-medium text-neutral-400'>{label}</div>}
      <Chart options={chartOptions} series={chartSeries} type='line' height={150} />
    </div>
  )
}

export { LineChart }
