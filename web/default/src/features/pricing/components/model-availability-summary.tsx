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
import { ArrowLeft, ExternalLink, RotateCcw } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { EXCLUDED_GROUPS, FILTER_ALL } from '../constants'
import { usePricingData } from '../hooks/use-pricing-data'
import { getAvailableGroups } from '../lib/model-helpers'
import type { PricingModel, PricingVendor } from '../types'
import { LoadingSkeleton } from './loading-skeleton'
import { SearchBar } from './search-bar'

const AVAILABILITY_FILTERS = {
  ALL: 'all',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
} as const

type AvailabilityFilter =
  (typeof AVAILABILITY_FILTERS)[keyof typeof AVAILABILITY_FILTERS]

type AvailabilityRow = {
  model: PricingModel
  groups: string[]
  isAvailable: boolean
}

function getSearchText(model: PricingModel, groups: string[]): string {
  return [
    model.model_name,
    model.vendor_name,
    model.description,
    model.tags,
    groups.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function SummaryMetric(props: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border p-4', props.className)}>
      <div className='text-2xl font-semibold tabular-nums'>
        {props.value.toLocaleString()}
      </div>
      <div className='text-muted-foreground mt-1 text-xs'>{props.label}</div>
    </div>
  )
}

function FilterSelect(props: {
  value: string
  onValueChange: (value: string) => void
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <Select
      value={props.value}
      onValueChange={(value) => {
        if (value) props.onValueChange(value)
      }}
    >
      <SelectTrigger className={cn('w-full sm:w-44', props.className)}>
        <SelectValue placeholder={props.label} />
      </SelectTrigger>
      <SelectContent align='start'>{props.children}</SelectContent>
    </Select>
  )
}

function VendorFilterItems(props: { vendors: PricingVendor[] }) {
  const { t } = useTranslation()

  return (
    <>
      <SelectItem value={FILTER_ALL}>{t('All Vendors')}</SelectItem>
      {props.vendors.map((vendor) => (
        <SelectItem key={vendor.id} value={String(vendor.id)}>
          {vendor.name}
        </SelectItem>
      ))}
    </>
  )
}

function ModelAvailabilityRow(props: {
  row: AvailabilityRow
  groupRatio: Record<string, number>
}) {
  const { t } = useTranslation()
  const { model, groups, isAvailable } = props.row
  const iconKey = model.icon || model.vendor_icon
  const modelIcon = iconKey ? getLobeIcon(iconKey, 18) : null
  const detailsHref = `/pricing/${encodeURIComponent(model.model_name)}`
  const shownGroups = groups.slice(0, 8)
  const hiddenGroupCount = Math.max(groups.length - shownGroups.length, 0)

  return (
    <a
      href={detailsHref}
      className='hover:bg-muted/30 block rounded-lg border p-3 transition-colors'
    >
      <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_minmax(220px,0.9fr)] lg:items-center'>
        <div className='min-w-0'>
          <div className='flex min-w-0 items-center gap-2'>
            <span className='shrink-0'>{modelIcon}</span>
            <span className='truncate font-mono text-sm font-medium'>
              {model.model_name}
            </span>
            <ExternalLink className='text-muted-foreground/50 size-3.5 shrink-0' />
          </div>
          <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs'>
            {model.vendor_name && <span>{model.vendor_name}</span>}
            {model.supported_endpoint_types?.slice(0, 2).map((type) => (
              <StatusBadge
                key={type}
                label={type}
                copyable={false}
                variant='neutral'
                size='sm'
              />
            ))}
          </div>
        </div>

        <div className='flex items-center gap-2 lg:justify-center'>
          <StatusBadge
            label={isAvailable ? t('Available') : t('Unavailable')}
            variant={isAvailable ? 'success' : 'warning'}
            copyable={false}
          />
          <span className='text-muted-foreground font-mono text-xs'>
            {groups.length.toLocaleString()}
          </span>
        </div>

        <div className='min-w-0'>
          {isAvailable ? (
            <div className='flex flex-wrap gap-1.5'>
              {shownGroups.map((group) => (
                <GroupBadge
                  key={group}
                  group={group}
                  ratio={props.groupRatio[group] || 1}
                  size='sm'
                />
              ))}
              {hiddenGroupCount > 0 && (
                <StatusBadge
                  label={t('+{{count}} more', { count: hiddenGroupCount })}
                  copyable={false}
                  variant='neutral'
                />
              )}
            </div>
          ) : (
            <span className='text-muted-foreground text-sm'>
              {t('No usable group is enabled for this model.')}
            </span>
          )}
        </div>
      </div>
    </a>
  )
}

export function ModelAvailabilitySummary() {
  const { t } = useTranslation()
  const [searchInput, setSearchInput] = useState('')
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AvailabilityFilter>(AVAILABILITY_FILTERS.ALL)
  const [groupFilter, setGroupFilter] = useState(FILTER_ALL)
  const [vendorFilter, setVendorFilter] = useState(FILTER_ALL)

  const { models, vendors, groupRatio, usableGroup, isLoading } =
    usePricingData()

  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {})
        .filter((group) => !EXCLUDED_GROUPS.includes(group))
        .sort((a, b) => a.localeCompare(b)),
    [usableGroup]
  )

  const rows = useMemo<AvailabilityRow[]>(
    () =>
      (models || []).map((model) => {
        const groups = getAvailableGroups(model, usableGroup || {}).sort(
          (a, b) => a.localeCompare(b)
        )
        return {
          model,
          groups,
          isAvailable: groups.length > 0,
        }
      }),
    [models, usableGroup]
  )

  const summary = useMemo(() => {
    const availableModelCount = rows.filter((row) => row.isAvailable).length
    return {
      totalModels: rows.length,
      availableModels: availableModelCount,
      unavailableModels: rows.length - availableModelCount,
      usableGroups: availableGroups.length,
    }
  }, [availableGroups.length, rows])

  const filteredRows = useMemo(() => {
    const query = searchInput.trim().toLowerCase()

    return rows.filter((row) => {
      if (query && !getSearchText(row.model, row.groups).includes(query)) {
        return false
      }

      if (
        availabilityFilter === AVAILABILITY_FILTERS.AVAILABLE &&
        !row.isAvailable
      ) {
        return false
      }

      if (
        availabilityFilter === AVAILABILITY_FILTERS.UNAVAILABLE &&
        row.isAvailable
      ) {
        return false
      }

      if (groupFilter !== FILTER_ALL && !row.groups.includes(groupFilter)) {
        return false
      }

      if (
        vendorFilter !== FILTER_ALL &&
        String(row.model.vendor_id ?? '') !== vendorFilter
      ) {
        return false
      }

      return true
    })
  }, [availabilityFilter, groupFilter, rows, searchInput, vendorFilter])

  const hasActiveFilters = Boolean(
    searchInput.trim() ||
    availabilityFilter !== AVAILABILITY_FILTERS.ALL ||
    groupFilter !== FILTER_ALL ||
    vendorFilter !== FILTER_ALL
  )

  const clearFilters = () => {
    setSearchInput('')
    setAvailabilityFilter(AVAILABILITY_FILTERS.ALL)
    setGroupFilter(FILTER_ALL)
    setVendorFilter(FILTER_ALL)
  }

  if (isLoading) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='mx-auto w-full max-w-[1600px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
          <LoadingSkeleton viewMode='table' />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto w-full max-w-[1600px] px-3 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 xl:px-8'>
        <header className='mb-5 pt-5 sm:mb-6 sm:pt-8'>
          <Button
            variant='ghost'
            size='sm'
            className='mb-4 gap-1.5'
            render={<a href='/pricing' />}
          >
            <ArrowLeft className='size-4' />
            {t('Model Square')}
          </Button>

          <div className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
            <div>
              <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
                {t('Model Availability')}
              </h1>
              <p className='text-muted-foreground mt-2 max-w-2xl text-sm'>
                {t(
                  'Review which usable groups are enabled for every model in one place.'
                )}
              </p>
            </div>

            {hasActiveFilters && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={clearFilters}
                className='w-fit gap-1.5'
              >
                <RotateCcw className='size-4' />
                {t('Clear Filters')}
              </Button>
            )}
          </div>
        </header>

        <section className='mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <SummaryMetric
            label={t('Total Models')}
            value={summary.totalModels}
          />
          <SummaryMetric
            label={t('Available Models')}
            value={summary.availableModels}
          />
          <SummaryMetric
            label={t('Unavailable Models')}
            value={summary.unavailableModels}
          />
          <SummaryMetric
            label={t('Usable Groups')}
            value={summary.usableGroups}
          />
        </section>

        <section className='rounded-xl border p-3'>
          <div className='grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center'>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onClear={() => setSearchInput('')}
              placeholder={t('Search model name, provider, or group...')}
            />

            <div className='grid gap-2 sm:grid-cols-3 lg:flex lg:items-center'>
              <FilterSelect
                value={availabilityFilter}
                onValueChange={(value) =>
                  setAvailabilityFilter(value as AvailabilityFilter)
                }
                label={t('Availability')}
              >
                <SelectItem value={AVAILABILITY_FILTERS.ALL}>
                  {t('All Statuses')}
                </SelectItem>
                <SelectItem value={AVAILABILITY_FILTERS.AVAILABLE}>
                  {t('Available')}
                </SelectItem>
                <SelectItem value={AVAILABILITY_FILTERS.UNAVAILABLE}>
                  {t('Unavailable')}
                </SelectItem>
              </FilterSelect>

              <FilterSelect
                value={groupFilter}
                onValueChange={setGroupFilter}
                label={t('Group')}
              >
                <SelectItem value={FILTER_ALL}>{t('All Groups')}</SelectItem>
                {availableGroups.map((group) => (
                  <SelectItem key={group} value={group}>
                    {group}
                  </SelectItem>
                ))}
              </FilterSelect>

              <FilterSelect
                value={vendorFilter}
                onValueChange={setVendorFilter}
                label={t('Vendor')}
              >
                <VendorFilterItems vendors={vendors || []} />
              </FilterSelect>
            </div>
          </div>

          <div className='text-muted-foreground mt-3 flex items-baseline gap-1 text-sm'>
            <span className='text-foreground font-semibold tabular-nums'>
              {filteredRows.length.toLocaleString()}
            </span>
            <span>{filteredRows.length === 1 ? t('model') : t('models')}</span>
            {hasActiveFilters && (
              <span className='text-muted-foreground/60 text-xs'>
                / {rows.length.toLocaleString()}
              </span>
            )}
          </div>
        </section>

        <section className='mt-4 space-y-2'>
          {filteredRows.length > 0 ? (
            filteredRows.map((row) => (
              <ModelAvailabilityRow
                key={row.model.model_name}
                row={row}
                groupRatio={groupRatio || {}}
              />
            ))
          ) : (
            <div className='rounded-xl border p-10 text-center'>
              <h2 className='font-medium'>{t('No Models Found')}</h2>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t('No models match your current filters.')}
              </p>
            </div>
          )}
        </section>
      </PageTransition>
    </PublicLayout>
  )
}
