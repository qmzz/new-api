/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import {
  getAccountRateLimitStatus,
  type AccountRateLimitMetric,
} from '@/features/dashboard/api'

function Metric({
  label,
  metric,
}: {
  label: string
  metric: AccountRateLimitMetric
}) {
  const { t, i18n } = useTranslation()
  const limited = metric.limit > 0
  const percent = limited
    ? Math.min(100, (metric.used / metric.limit) * 100)
    : 0

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between gap-3 text-xs'>
        <span className='text-muted-foreground font-medium'>{label}</span>
        <span className='font-mono tabular-nums'>
          {limited
            ? `${metric.used} / ${metric.limit}`
            : `${metric.used} · ${t('Unlimited')}`}
        </span>
      </div>
      <Progress value={percent} className='gap-0' />
      {metric.reset_at > 0 && (
        <div className='text-muted-foreground flex items-center gap-1 text-xs'>
          <Clock3 className='size-3' aria-hidden='true' />
          <span>
            {t('Reset at:')}{' '}
            {new Date(metric.reset_at * 1000).toLocaleString(
              i18n.language
            )}
          </span>
        </div>
      )}
    </div>
  )
}

export function RateLimitStatus() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['account-rate-limit-status'],
    queryFn: getAccountRateLimitStatus,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  })
  const windows = query.data?.data ?? []

  if (!query.isLoading && windows.length === 0) return null

  return (
    <section className='bg-card rounded-lg border p-4 shadow-xs sm:p-5'>
      <div className='mb-4'>
        <h3 className='text-base font-semibold'>{t('Request Limits')}</h3>
      </div>
      {query.isLoading ? (
        <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
      ) : (
        <div className='grid gap-4 md:grid-cols-2'>
          {windows.map((window) => (
            <div
              key={window.key}
              className='bg-background/60 space-y-4 rounded-lg border p-3'
            >
              <h4 className='text-sm font-semibold'>
                {t(
                  window.key === 'five_hour'
                    ? '5-Hour Window'
                    : 'Weekly Window'
                )}
              </h4>
              <Metric label={t('Total requests')} metric={window.total} />
              <Metric
                label={t('Successful requests')}
                metric={window.success}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
