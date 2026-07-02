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
import type { TFunction } from 'i18next'

export const INVITE_CODE_STATUS = {
  ENABLED: 1,
  DISABLED: 2,
  USED: 3,
} as const

export const INVITE_CODE_STATUS_VALUES = Object.values(INVITE_CODE_STATUS).map(
  String
) as [string, ...string[]]

export const INVITE_CODE_STATUSES: Record<
  number,
  { labelKey: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  [INVITE_CODE_STATUS.ENABLED]: {
    labelKey: 'Enabled',
    variant: 'success',
  },
  [INVITE_CODE_STATUS.DISABLED]: {
    labelKey: 'Disabled',
    variant: 'warning',
  },
  [INVITE_CODE_STATUS.USED]: {
    labelKey: 'Used',
    variant: 'neutral',
  },
}

export const INVITE_CODE_FILTER_EXPIRED = 'expired'

export function getInviteCodeStatusOptions(t: TFunction) {
  return [
    { value: String(INVITE_CODE_STATUS.ENABLED), label: t('Enabled') },
    { value: String(INVITE_CODE_STATUS.DISABLED), label: t('Disabled') },
    { value: String(INVITE_CODE_STATUS.USED), label: t('Used') },
    { value: INVITE_CODE_FILTER_EXPIRED, label: t('Expired') },
  ]
}

export const INVITE_CODE_VALIDATION = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 20,
  COUNT_MIN: 1,
  COUNT_MAX: 100,
} as const

export function getInviteCodeFormErrorMessages(t: TFunction) {
  return {
    NAME_LENGTH_INVALID: t('Name must be between 1 and 20 characters'),
    COUNT_INVALID: t('Count must be between 1 and 100'),
  }
}

export const SUCCESS_MESSAGES = {
  INVITE_CODE_CREATED: 'Invite code(s) created successfully',
  INVITE_CODE_UPDATED: 'Invite code updated successfully',
  INVITE_CODE_DELETED: 'Invite code deleted successfully',
  INVITE_CODE_ENABLED: 'Invite code enabled successfully',
  INVITE_CODE_DISABLED: 'Invite code disabled successfully',
} as const
