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
import { zodResolver } from '@hookform/resolvers/zod'
import { Code2, Palette } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Button } from '@/components/design-system/button'
import { Input } from '@/components/design-system/input'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { RateLimitVisualEditor } from './rate-limit-visual-editor'

const createGroupJSONValidator =
  (successAllowZero: boolean) => (value: string | undefined) => {
    if (!value || value.trim() === '') return true
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return false
      }
      const minSuccess = successAllowZero ? 0 : 1
      for (const [, val] of Object.entries(parsed)) {
        if (!Array.isArray(val) || val.length !== 2) {
          return false
        }
        if (typeof val[0] !== 'number' || typeof val[1] !== 'number') {
          return false
        }
        if (val[0] < 0 || val[1] < minSuccess) {
          return false
        }
        if (val[0] > 2147483647 || val[1] > 2147483647) {
          return false
        }
      }
      return true
    } catch {
      return false
    }
  }

const createRateLimitSchema = (t: (key: string) => string) =>
  z.object({
    ModelRequestRateLimitEnabled: z.boolean(),
    ModelRequestRateLimitDurationMinutes: z.number().min(0),
    ModelRequestRateLimitCount: z.number().min(0).max(100000000),
    ModelRequestRateLimitSuccessCount: z.number().min(1).max(100000000),
    ModelRequestRateLimitGroup: z
      .string()
      .optional()
      .refine(createGroupJSONValidator(false), {
        message: t('Invalid JSON format or values out of allowed range'),
      }),
    AccountFiveHourRateLimitEnabled: z.boolean(),
    AccountFiveHourRateLimitCount: z.number().min(0).max(100000000),
    AccountFiveHourRateLimitSuccessCount: z.number().min(0).max(100000000),
    AccountFiveHourRateLimitGroup: z
      .string()
      .optional()
      .refine(createGroupJSONValidator(true), {
        message: t('Invalid JSON format or values out of allowed range'),
      }),
    AccountWeeklyRateLimitEnabled: z.boolean(),
    AccountWeeklyRateLimitCount: z.number().min(0).max(100000000),
    AccountWeeklyRateLimitSuccessCount: z.number().min(0).max(100000000),
    AccountWeeklyRateLimitGroup: z
      .string()
      .optional()
      .refine(createGroupJSONValidator(true), {
        message: t('Invalid JSON format or values out of allowed range'),
      }),
  })

type RateLimitFormValues = z.infer<ReturnType<typeof createRateLimitSchema>>

type RateLimitSectionProps = {
  defaultValues: RateLimitFormValues
}

// Field names for one rate-limit window. `duration` is only present on the
// short model-request window; the 5-hour and weekly windows are fixed-length.
type WindowFieldNames = {
  enabled: keyof RateLimitFormValues
  count: keyof RateLimitFormValues
  success: keyof RateLimitFormValues
  group: keyof RateLimitFormValues
  duration?: keyof RateLimitFormValues
}

type RateLimitWindowCardProps = {
  control: React.ComponentProps<typeof FormField>['control']
  fields: WindowFieldNames
  enableLabel: string
  enableDescription: string
  showDuration: boolean
  // When false (model window), success count falls back to 1 and min is 1,
  // matching the original behavior. Account-level windows allow 0 = unlimited.
  successAllowZero?: boolean
}

// Renders one rate-limit window block: enable toggle, optional duration input,
// total/success counts, and the per-group config editor (visual or JSON).
// Shared by the model, 5-hour, and weekly windows to avoid triplicated markup.
function RateLimitWindowCard({
  control,
  fields,
  enableLabel,
  enableDescription,
  showDuration,
  successAllowZero = false,
}: RateLimitWindowCardProps) {
  const successMin = successAllowZero ? 0 : 1
  const successFallback = successAllowZero ? 0 : 1
  const { t } = useTranslation()
  const [useVisualEditor, setUseVisualEditor] = useState(true)

  return (
    <div className='bg-muted/20 col-span-full rounded-xl border p-4'>
      <div className='space-y-4'>
        <FormField
          control={control}
          name={fields.enabled as never}
          render={({ field }) => (
            <SettingsSwitchItem>
              <SettingsSwitchContent>
                <FormLabel>{t(enableLabel)}</FormLabel>
                <FormDescription>{t(enableDescription)}</FormDescription>
              </SettingsSwitchContent>
              <FormControl>
                <Switch
                  checked={field.value as boolean}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </SettingsSwitchItem>
          )}
        />

        <div className='grid gap-4 md:grid-cols-3'>
          {showDuration && fields.duration && (
            <FormField
              control={control}
              name={fields.duration as never}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Limit period')}</FormLabel>
                  <FormControl>
                    <div className='flex items-center gap-2'>
                      <Input
                        type='number'
                        min={0}
                        step={1}
                        value={field.value as number}
                        onChange={(e) =>
                          field.onChange(Number.parseInt(e.target.value) || 0)
                        }
                      />
                      <span className='text-muted-foreground text-sm'>
                        {t('minutes')}
                      </span>
                    </div>
                  </FormControl>
                  <FormDescription>
                    {t('Time window for rate limiting')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={control}
            name={fields.count as never}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Max requests per period')}</FormLabel>
                <FormControl>
                  <div className='flex items-center gap-2'>
                    <Input
                      type='number'
                      min={0}
                      max={100000000}
                      step={1}
                      value={field.value as number}
                      onChange={(e) =>
                        field.onChange(Number.parseInt(e.target.value) || 0)
                      }
                    />
                    <span className='text-muted-foreground text-sm'>
                      {t('times')}
                    </span>
                  </div>
                </FormControl>
                <FormDescription>
                  {t('Including failed requests, 0 = unlimited')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={fields.success as never}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Max successful requests')}</FormLabel>
                <FormControl>
                  <div className='flex items-center gap-2'>
                    <Input
                      type='number'
                      min={successMin}
                      max={100000000}
                      step={1}
                      value={field.value as number}
                      onChange={(e) =>
                        field.onChange(
                          Number.parseInt(e.target.value) || successFallback
                        )
                      }
                    />
                    <span className='text-muted-foreground text-sm'>
                      {t('times')}
                    </span>
                  </div>
                </FormControl>
                <FormDescription>
                  {t('Only successful requests')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={control}
          name={fields.group as never}
          render={({ field }) => (
            <FormItem>
              <div className='flex items-center justify-between'>
                <FormLabel>{t('Group-based rate limits')}</FormLabel>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setUseVisualEditor(!useVisualEditor)}
                >
                  {useVisualEditor ? (
                    <>
                      <Code2 className='mr-2 h-4 w-4' />
                      {t('JSON Mode')}
                    </>
                  ) : (
                    <>
                      <Palette className='mr-2 h-4 w-4' />
                      {t('Visual Mode')}
                    </>
                  )}
                </Button>
              </div>
              <FormControl>
                {useVisualEditor ? (
                  <RateLimitVisualEditor
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    successAllowZero={successAllowZero}
                  />
                ) : (
                  <Textarea
                    rows={8}
                    placeholder={`{\n  "default": [200, 100],\n  "vip": [0, 1000]\n}`}
                    className='font-mono text-sm'
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                )}
              </FormControl>
              {!useVisualEditor && (
                <FormDescription>
                  <div className='space-y-1 text-xs'>
                    <p className='font-semibold'>{t('Format:')}</p>
                    <ul className='list-inside list-disc space-y-0.5 pl-2'>
                      <li>
                        {t('JSON object:')}{' '}
                        {`{"groupName": [maxRequests, maxSuccess]}`}
                      </li>
                      <li>
                        {t('Example:')}{' '}
                        {`{"default": [200, 100], "vip": [0, 1000]}`}
                      </li>
                      <li>
                        {t(
                          successAllowZero
                            ? 'maxRequests ≥ 0, maxSuccess ≥ 0, both ≤ 2,147,483,647'
                            : 'maxRequests ≥ 0, maxSuccess ≥ 1, both ≤ 2,147,483,647'
                        )}
                      </li>
                      <li>
                        {t(
                          'Group config overrides global limits, shares the same period'
                        )}
                      </li>
                    </ul>
                  </div>
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}

export function RateLimitSection({ defaultValues }: RateLimitSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const rateLimitSchema = createRateLimitSchema(t)

  const form = useForm<RateLimitFormValues>({
    resolver: zodResolver(rateLimitSchema),
    mode: 'onChange', // Enable real-time validation
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const onSubmit = async (values: RateLimitFormValues) => {
    const updates = Object.entries(values).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof RateLimitFormValues]
    )

    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value: value ?? '' })
    }
  }

  return (
    <SettingsSection title={t('Rate Limiting')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save rate limits'
          />
          <RateLimitWindowCard
            control={form.control}
            fields={{
              enabled: 'ModelRequestRateLimitEnabled',
              duration: 'ModelRequestRateLimitDurationMinutes',
              count: 'ModelRequestRateLimitCount',
              success: 'ModelRequestRateLimitSuccessCount',
              group: 'ModelRequestRateLimitGroup',
            }}
            enableLabel='Enable rate limiting'
            enableDescription='This controls model request rate limiting. Web/API route throttling is configured by environment variables and may still return 429.'
            showDuration
          />
          <RateLimitWindowCard
            control={form.control}
            fields={{
              enabled: 'AccountFiveHourRateLimitEnabled',
              count: 'AccountFiveHourRateLimitCount',
              success: 'AccountFiveHourRateLimitSuccessCount',
              group: 'AccountFiveHourRateLimitGroup',
            }}
            enableLabel={t('Enable 5-hour account rate limiting')}
            enableDescription={t(
              'Limits total and successful requests per account over a rolling 5-hour window. Applies after model-level checks.'
            )}
            showDuration={false}
            successAllowZero
          />
          <RateLimitWindowCard
            control={form.control}
            fields={{
              enabled: 'AccountWeeklyRateLimitEnabled',
              count: 'AccountWeeklyRateLimitCount',
              success: 'AccountWeeklyRateLimitSuccessCount',
              group: 'AccountWeeklyRateLimitGroup',
            }}
            enableLabel={t('Enable weekly account rate limiting')}
            enableDescription={t(
              'Limits total and successful requests per account over a rolling 7-day (weekly) window. Applies after model-level checks.'
            )}
            showDuration={false}
            successAllowZero
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
