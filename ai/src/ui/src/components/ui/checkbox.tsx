import * as React from "react"

export interface CheckboxProps {
  id?: string
  checked?: boolean
  /** 半选状态（视觉上的“部分选中”），通过原生 input.indeterminate 实现 */
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  children?: React.ReactNode
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ id, checked, indeterminate, onCheckedChange, disabled, className = "", children }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)

    const setRefs = React.useCallback(
      (el: HTMLInputElement | null) => {
        innerRef.current = el
        if (typeof ref === "function") {
          ref(el)
        } else if (ref) {
          ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = el
        }
      },
      [ref],
    )

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = Boolean(indeterminate)
      }
    }, [indeterminate, checked])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
    }

    return (
      <label
        htmlFor={id}
        className={`flex items-center gap-2 cursor-pointer ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      >
        <input
          ref={setRefs}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary disabled:cursor-not-allowed"
        />
        {children && <span className="text-sm">{children}</span>}
      </label>
    )
  }
)

Checkbox.displayName = "Checkbox"
