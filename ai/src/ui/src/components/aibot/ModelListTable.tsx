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
import { ArrowDown, ArrowUp, Plug, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { parseModelNames, THINKING_EFFORTS, type ThinkingEffort } from "@/lib/aibot"
import type { MCPConfig } from "@/data/mcp-config"
import { useI18n } from "@/lib/i18n-context"
import { cn } from "@/lib/utils"

type ModelTableRow = {
  id: string
  value: string
  label: string
  thinking: ThinkingEffort
}

type ModelTableCellKey = "value" | "label"

const createRowId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12)

const serializeRows = (rows: ModelTableRow[]) => {
  const items = rows
    .map((row) => ({
      id: row.value.trim(),
      name: row.label.trim(),
      thinking: row.thinking,
    }))
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id,
      name: row.name || row.id,
      thinking: row.thinking,
    }))
  return items.length ? JSON.stringify(items) : ""
}

const parseRows = (value: string, previousRows: ModelTableRow[] = []) => {
  return parseModelNames(value).map((item, index) => {
    const id = previousRows[index]?.id ?? `row-${createRowId()}`
    return {
      id,
      value: item.value,
      label: item.label,
      thinking: item.thinking,
    }
  })
}

const createRow = (): ModelTableRow => ({
  id: `row-${createRowId()}`,
  value: "",
  label: "",
  thinking: "off",
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
  mcps?: MCPConfig[]
  onToggleModelMcp?: (modelId: string, mcpId: string, checked: boolean) => void
  onApplyModelMcpToAll?: (sourceModelId: string, allModelIds: string[]) => void
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
  mcps,
  onToggleModelMcp,
  onApplyModelMcpToAll,
}: ModelListTableProps) => {
  const { t } = useI18n()
  const enabledMcps = useMemo(
    () => (mcps ?? []).filter((mcp) => mcp.enabled !== false),
    [mcps],
  )
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

  const handleThinkingChange = useCallback(
    (rowId: string, nextValue: ThinkingEffort) => {
      updateRows(
        (prev) => prev.map((row) => (row.id === rowId ? { ...row, thinking: nextValue } : row)),
        true,
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
        id: "thinking",
        header: () => t("sheet.models.column.thinking"),
        cell: ({ row }) => (
          <Select
            value={row.original.thinking}
            onValueChange={(next) => handleThinkingChange(row.original.id, next as ThinkingEffort)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-[88px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THINKING_EFFORTS.map((level) => (
                <SelectItem key={level} value={level}>
                  {t(`sheet.models.thinking.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
        meta: {
          headerClassName: "w-[100px]",
        },
      },
      {
        id: "mcp",
        header: () => t("sheet.models.column.mcp"),
        cell: ({ row, table }) => {
          const modelId = row.original.value.trim()
          const count = modelId
            ? enabledMcps.filter((mcp) =>
                (mcp.supportedModels ?? []).some((m) => m.id === modelId),
              ).length
            : 0
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 px-2.5"
                  disabled={disabled}
                >
                  <Plug className="h-3.5 w-3.5" />
                  <Badge variant="secondary" className="px-1.5">
                    {count}
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="border-b px-3 py-2.5 text-sm font-medium">
                  {t("sheet.models.mcpPickerTitle")}
                  {modelId && <span className="text-muted-foreground"> · {modelId}</span>}
                </div>
                {!modelId ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    {t("sheet.models.mcpNeedId")}
                  </p>
                ) : enabledMcps.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    {t("sheet.models.mcpEmpty")}
                  </p>
                ) : (
                  <>
                    <ScrollArea className="max-h-60">
                      <ul className="space-y-2 px-3 py-3">
                        {enabledMcps.map((mcp) => {
                          const checked = (mcp.supportedModels ?? []).some((m) => m.id === modelId)
                          return (
                            <li key={mcp.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`mcp-${mcp.id}-${row.original.id}`}
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={(next) =>
                                  onToggleModelMcp?.(modelId, mcp.id, next === true)
                                }
                              />
                              <label
                                htmlFor={`mcp-${mcp.id}-${row.original.id}`}
                                className="cursor-pointer text-sm leading-none"
                              >
                                {mcp.name}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </ScrollArea>
                    {onApplyModelMcpToAll && (
                      <div className="border-t p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          disabled={disabled}
                          onClick={() => {
                            const allModelIds = table
                              .getRowModel()
                              .rows.map((item) => item.original.value.trim())
                              .filter(Boolean)
                            onApplyModelMcpToAll(modelId, allModelIds)
                          }}
                        >
                          {t("sheet.models.mcpApplyAll")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </PopoverContent>
            </Popover>
          )
        },
        meta: {
          headerClassName: "w-[96px]",
          cellClassName: "text-center",
        },
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
      handleThinkingChange,
      labelPlaceholder,
      modelLabel,
      modelPlaceholder,
      removeLabel,
      t,
      enabledMcps,
      onToggleModelMcp,
      onApplyModelMcpToAll,
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
