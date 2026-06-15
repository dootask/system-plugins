import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { cn } from '#/lib/utils'
import type { UserLite } from '#/lib/types'

/** 取昵称首字作头像占位。 */
function initial(nickname: string): string {
  const s = nickname.trim()
  return s ? s.slice(0, 1) : '?'
}

/** 单独头像（带昵称首字回退）。 */
export function UserAvatar({
  user,
  size = 'sm',
  className,
}: {
  user: UserLite
  size?: 'default' | 'sm' | 'lg'
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {user.avatar ? <AvatarImage src={user.avatar} alt={user.nickname} /> : null}
      <AvatarFallback>{initial(user.nickname)}</AvatarFallback>
    </Avatar>
  )
}

/** 头像 + 昵称的内联展示（参与人/时间线/列表发起人通用）。 */
export function UserChip({
  user,
  size = 'sm',
  className,
  nameClassName,
}: {
  user: UserLite
  size?: 'default' | 'sm' | 'lg'
  className?: string
  nameClassName?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <UserAvatar user={user} size={size} />
      <span className={cn('truncate', nameClassName)}>{user.nickname}</span>
    </span>
  )
}
