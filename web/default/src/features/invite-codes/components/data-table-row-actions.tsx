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
import type { Row } from '@tanstack/react-table'
import { Copy, Eye, Pencil, Power, PowerOff, Trash } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import {
  deleteInviteCode,
  updateInviteCodeStatus,
} from '../api'
import { INVITE_CODE_STATUS } from '../constants'
import { type InviteCode } from '../types'
import { useInviteCodes } from './invite-codes-provider'

interface DataTableRowActionsProps<TData> {
  row: Row<TData>
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const { t } = useTranslation()
  const { setOpen, setCurrentRow, triggerRefresh } = useInviteCodes()
  const { copyToClipboard } = useCopyToClipboard()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const code = row.original as InviteCode

  const handleToggleStatus = async () => {
    const newStatus =
      code.status === INVITE_CODE_STATUS.ENABLED
        ? INVITE_CODE_STATUS.DISABLED
        : INVITE_CODE_STATUS.ENABLED
    try {
      const result = await updateInviteCodeStatus(code.id, newStatus)
      if (result.success) {
        triggerRefresh()
      }
    } catch {
      toast.error(t('Failed to update invite code status'))
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteInviteCode(code.id)
      if (result.success) {
        toast.success(t('Invite code deleted successfully'))
        triggerRefresh()
        setShowDeleteConfirm(false)
      }
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className='hover:bg-muted flex size-8 items-center justify-center rounded-md border'
                    aria-label={t('Open menu')}
                  />
                }
              >
                <Pencil className='size-4' />
              </button>
              <TooltipContent>
                <p>{t('Actions')}</p>
              </TooltipContent>
            </Tooltip>
          }
        />
        <DropdownMenuContent align='end' className='w-40'>
          <DropdownMenuItem
            onClick={() => {
              copyToClipboard(code.key)
              toast.success(t('Copied!'))
            }}
          >
            <Copy className='size-4' />
            {t('Copy')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setCurrentRow(code)
              setOpen('view')
            }}
          >
            <Eye className='size-4' />
            {t('View')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setCurrentRow(code)
              setOpen('update')
            }}
          >
            <Pencil className='size-4' />
            {t('Edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleToggleStatus}>
            {code.status === INVITE_CODE_STATUS.ENABLED ? (
              <>
                <PowerOff className='size-4' />
                {t('Disable')}
              </>
            ) : (
              <>
                <Power className='size-4' />
                {t('Enable')}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteConfirm(true)}
            className='text-destructive'
          >
            <Trash className='size-4' />
            {t('Delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        destructive
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        handleConfirm={handleDelete}
        isLoading={isDeleting}
        className='max-w-md'
        title={t('Delete Invite Code')}
        desc={t('This will permanently delete invite code') + ` "${code.name}". ${t('This action cannot be undone.')}`}
        confirmText={t('Delete')}
      />
    </>
  )
}
