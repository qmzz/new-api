import type { TFunction } from 'i18next'
import { z } from 'zod'

import {
  INVITE_CODE_VALIDATION,
  getInviteCodeFormErrorMessages,
} from '../constants'
import type { InviteCodeFormData, InviteCode } from '../types'

export function getInviteCodeFormSchema(t: TFunction) {
  const msg = getInviteCodeFormErrorMessages(t)
  return z.object({
    name: z
      .string()
      .min(INVITE_CODE_VALIDATION.NAME_MIN_LENGTH, msg.NAME_LENGTH_INVALID)
      .max(INVITE_CODE_VALIDATION.NAME_MAX_LENGTH, msg.NAME_LENGTH_INVALID),
    expired_time: z.date().optional(),
    count: z
      .number()
      .min(INVITE_CODE_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
      .max(INVITE_CODE_VALIDATION.COUNT_MAX, msg.COUNT_INVALID)
      .optional(),
  })
}

export type InviteCodeFormValues = {
  name: string
  expired_time?: Date
  count?: number
}

export const INVITE_CODE_FORM_DEFAULT_VALUES: InviteCodeFormValues = {
  name: '',
  expired_time: undefined,
  count: 1,
}

export function transformFormDataToPayload(
  data: InviteCodeFormValues
): InviteCodeFormData {
  return {
    name: data.name,
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
    count: data.count || 1,
  }
}

export function transformInviteCodeToFormDefaults(
  code: InviteCode
): InviteCodeFormValues {
  return {
    name: code.name,
    expired_time:
      code.expired_time > 0 ? new Date(code.expired_time * 1000) : undefined,
    count: 1,
  }
}
