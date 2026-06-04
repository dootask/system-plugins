import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { parseModelNames } from "@/lib/aibot"
import { cn } from "@/lib/utils"

type ModelTableRow = {
  id: string
  value: string
  label: string
}

type ModelTableCellKey = "value" | "label"

const createRowId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12)

const serializeRows = (rows: ModelTableRow[]) =>
  rows
    .map((row) => ({
      value: row.value.trim(),
      label: row.label.trim(),
    }))
    .filter((row) => row.value)
    .map((row) => (row.label && row.label !== row.value ? `${row.value}|${row.label}` : row.value))
    .join("\n")

const parseRows = (value: string, previousRows: ModelTableRow[] = []) => {
  return parseModelNames(value).map((item, index) => {
    const id = previousRows[index]?.id ?? `row-${createRowId()}`
    return {
      id,
      value: item.value,
      label: item.label,
    }
  })
}

const createRow = (): ModelTableRow => ({
  id: `row-${createRowId()}`,
  value: "",
  label: "",
})

export interface ModelListTableProps {
  value: string
  onChange: (next: string) => void
  modelLabel: string
  displayLabel: string
  actionLabel: string
  addButtonLabel: string
  emptyLabel: string
  removeLabel: string
  modelPlaceholder: string
  labelPlaceholder: string
  maxLength?: number
  disabled?: boolean
}

export const ModelListTable = ({
  value,
  onChange,
  modelLabel,
  displayLabel,
  actionLabel,
  addButtonLabel,
  emptyLabel,
  removeLabel,
  modelPlaceholder,
  labelPlaceholder,
  maxLength,
  disabled,
}: ModelListTableProps) => {
  const [rows, setRows] = useState<ModelTableRow[]>(() => parseRows(value))
  const rowsRef = useRef(rows)
  const lastSerializedRef = useRef(value)
  const activeCellRef = useRef<{ rowId: string; key: ModelTableCellKey } | null>(null)

  const serializedValue = useMemo(() => serializeRows(rows), [rows])

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    if (value === lastSerializedRef.current) {
      return
    }
    lastSerializedRef.current = value
    setRows((previous) => {
      const next = parseRows(value, previous)
      rowsRef.current = next
      return next
    })
  }, [value])

  const commitRows = useCallback(
    (rowsToCommit: ModelTableRow[]) => {
      const serialized = serializeRows(rowsToCommit)
      if (serialized === lastSerializedRef.current) {
        return
      }
      lastSerializedRef.current = serialized
      onChange(serialized)
    },
    [onChange],
  )

  const updateRows = useCallback(
    (updater: (prev: ModelTableRow[]) => ModelTableRow[], commit: boolean) => {
      setRows((prev) => {
        const next = updater(prev)
        rowsRef.current = next
        if (commit) {
          commitRows(next)
        }
        return next
      })
    },
    [commitRows],
  )

  const handleCellFocus = useCallback((rowId: string, key: ModelTableCellKey) => {
    activeCellRef.current = { rowId, key }
  }, [])

  const handleCellBlur = useCallback(() => {
    activeCellRef.current = null
    commitRows(rowsRef.current)
  }, [commitRows])

  const handleCellChange = useCallback(
    (rowId: string, key: "value" | "label", nextValue: string) => {
      updateRows(
        (prev) =>
          prev.map((row) => (row.id === rowId ? { ...row, [key]: nextValue } : row)),
        false,
      )
    },
    [updateRows],
  )

  const handleRemoveRow = useCallback(
    (rowId: string) => {
      updateRows((prev) => prev.filter((row) => row.id !== rowId), true)
    },
    [updateRows],
  )

  const handleMoveRow = useCallback(
    (rowId: string, delta: number) => {
      updateRows(
        (prev) => {
          const currentIndex = prev.findIndex((row) => row.id === rowId)
          if (currentIndex === -1) {
            return prev
          }
          const targetIndex = currentIndex + delta
          if (targetIndex < 0 || targetIndex >= prev.length) {
            return prev
          }
          const next = [...prev]
          const [item] = next.splice(currentIndex, 1)
          next.splice(targetIndex, 0, item)
          return next
        },
        true,
      )
    },
    [updateRows],
  )

  const handleAddRow = useCallback(() => {
    updateRows((prev) => [...prev, createRow()], true)
  }, [updateRows])

  const columns = useMemo<ColumnDef<ModelTableRow>[]>(
    () => [
      {
        accessorKey: "value",
        header: () => modelLabel,
        cell: ({ row }) => (
          <Input
            value={row.original.value}
            placeholder={modelPlaceholder}
            onChange={(event) => handleCellChange(row.original.id, "value", event.target.value)}
            disabled={disabled}
            onFocus={() => handleCellFocus(row.original.id, "value")}
            onBlur={handleCellBlur}
            data-model-cell={`${row.original.id}-value`}
          />
        ),
      },
      {
        accessorKey: "label",
        header: () => displayLabel,
        cell: ({ row }) => (
          <Input
            value={row.original.label}
            placeholder={labelPlaceholder}
            onChange={(event) => handleCellChange(row.original.id, "label", event.target.value)}
            disabled={disabled}
            onFocus={() => handleCellFocus(row.original.id, "label")}
            onBlur={handleCellBlur}
            data-model-cell={`${row.original.id}-label`}
          />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">{actionLabel}</span>,
        cell: ({ row, table }) => {
          const index = table.getRowModel().rows.findIndex((item) => item.id === row.id)
          const isFirst = index === 0
          const isLast = index === table.getRowModel().rows.length - 1
          return (
            <div className="flex items-center justify-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleMoveRow(row.original.id, -1)}
                disabled={disabled || isFirst}
              >
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Move up</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleMoveRow(row.original.id, 1)}
                disabled={disabled || isLast}
              >
                <ArrowDown className="h-4 w-4" />
                <span className="sr-only">Move down</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveRow(row.original.id)}
                disabled={disabled}
                className="h-8 w-8"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{removeLabel}</span>
              </Button>
            </div>
          )
        },
        meta: {
          headerClassName: "w-[120px]",
          cellClassName: "text-center",
        },
      },
    ],
    [
      actionLabel,
      disabled,
      displayLabel,
      handleCellBlur,
      handleCellChange,
      handleCellFocus,
      handleMoveRow,
      handleRemoveRow,
      labelPlaceholder,
      modelLabel,
      modelPlaceholder,
      removeLabel,
    ],
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  })

  useLayoutEffect(() => {
    const active = activeCellRef.current
    if (!active) {
      return
    }
    if (typeof document === "undefined") {
      return
    }
    const selector = `[data-model-cell="${active.rowId}-${active.key}"]`
    const element = document.querySelector<HTMLInputElement>(selector)
    if (!element || element === document.activeElement) {
      return
    }
    element.focus()
    const length = element.value.length
    element.setSelectionRange?.(length, length)
  }, [rows])

  useEffect(() => {
    return () => {
      activeCellRef.current = null
    }
  }, [])

  const currentLength = serializedValue.length
  const isAddDisabled =
    disabled ||
    (typeof maxLength === "number" && maxLength > 0 && currentLength >= maxLength)

  return (
    <div className="rounded-md border">
      <div className="overflow-hidden border-b">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      header.column.columnDef.meta?.headerClassName,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(cell.column.columnDef.meta?.cellClassName)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-16 text-center text-sm text-muted-foreground">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="m-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          disabled={isAddDisabled}
        >
          {addButtonLabel}
        </Button>
      </div>
    </div>
  )
}
