import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatPercent } from '../utils/format'

type ProgressChartProps = {
  data: any[]
  refEl?: React.Ref<HTMLDivElement>
  large?: boolean
}

export default function ProgressChart({ data, refEl, large }: ProgressChartProps) {
  return (
    <div className={`chart ${large ? 'large' : ''}`} ref={refEl}>
      {data.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="week" tickFormatter={week => `W${week}`} />
            <YAxis tickFormatter={value => formatPercent(value)} domain={[0, 100]} />
            <Tooltip formatter={value => formatPercent(value)} />
            <Legend />
            <Area type="monotone" name="Planned" dataKey="plannedCum" stroke="#5578db" fill="#5578db22" />
            <Area type="monotone" name="Actual" dataKey="actualCum" stroke="#12a889" fill="#12a88922" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="empty">No progress data available.</p>
      )}
    </div>
  )
}
