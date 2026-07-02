export function isTimestampExpired(timestamp: number): boolean {
  if (timestamp === 0) return false
  return timestamp < Math.floor(Date.now() / 1000)
}

export function isInviteCodeExpired(
  expiredTime: number,
  status: number
): boolean {
  if (status === 3) return false
  if (expiredTime === 0) return false
  return isTimestampExpired(expiredTime)
}
