import { IconStyles } from '../../../data/constants/icon-styles'
import { cn } from '../../../utils/cn'
import { IIconProps } from '../Types/iconTypes'

export const JwplcSimIcon = (props: IIconProps) => {
  const { className, stroke, size = 'sm', ...res } = props
  const sizeClasses = IconStyles.sizeClasses.small[size]
  const color = stroke || '#B4D0FE'
  return (
    <svg
      viewBox='0 0 22 22'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      className={cn(`${sizeClasses}`, className)}
      {...res}
    >
      <rect x='2' y='3' width='18' height='13' rx='1.5' stroke={color} strokeWidth='1.6' />
      <path d='M9 6.75V12.25L13.75 9.5L9 6.75Z' fill={color} />
      <path d='M7 19.25H15' stroke={color} strokeWidth='1.6' strokeLinecap='round' />
    </svg>
  )
}
