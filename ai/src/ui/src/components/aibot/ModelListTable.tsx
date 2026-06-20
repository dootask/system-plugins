import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  removeSelectedLabel: string
  modelPlaceholder: string
  labelPlaceholder: string
  maxLength?: number
  disabled?: boolean
  mcps?: MCPConfig[]
  onToggleModelMcp?: (modelId: string, mcpId: string, checked: boolean) => void
  onApplyModelMcpToAll?: (sourceModelId: string, allModelIds: string[]) => void
  // 新拉取加入的模型 code，命中行用背景色高亮
  highlightedValues?: string[]
}

export interface ModelListTableHandle {
  /** 同步读取当前最新序列化值（绕过 onChange 的 React 异步刷新，供保存时长度校验用） */
  getSerializedValue: () => string
}

export const ModelListTable = forwardRef<ModelListTableHandle, ModelListTableProps>(({
  value,
  onChange,
  modelLabel,
  displayLabel,
  actionLabel,
  addButtonLabel,
  emptyLabel,
  removeLabel,
  removeSelectedLabel,
  modelPlaceholder,
  labelPlaceholder,
  maxLength,
  disabled,
  mcps,
  onToggleModelMcp,
  onApplyModelMcpToAll,
  highlightedValues,
}, ref) => {
  const { t } = useI18n()
  const highlightedSet = useMemo(
    () => new Set((highlightedValues ?? []).filter(Boolean)),
    [highlightedValues],
  )
  const enabledMcps = useMemo(
    () => (mcps ?? []).filter((mcp) => mcp.enabled !== false),
    [mcps],
  )
  const [rows, setRows] = useState<ModelTableRow[]>(() => parseRows(value))
  const rowsRef = useRef(rows)
  const lastSerializedRef = useRef(value)
  const activeCellRef = useRef<{ rowId: string; key: ModelTableCellKey } | null>(null)
  // 勾选的行（按 row.id）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // 获取模型列表后，待自动勾选的模型 code（由 highlightedValues 触发，等行刷新后映射成 row.id）
  const pendingSelectValuesRef = useRef<Set<string> | null>(null)

  const serializedValue = useMemo(() => serializeRows(rows), [rows])
  const selectedCount = useMemo(
    () => rows.reduce((n, row) => (selectedIds.has(row.id) ? n + 1 : n), 0),
    [rows, selectedIds],
  )

  // 供父级保存时同步读取最新值（rowsRef 始终最新，不受 onChange 的异步 setState 影响）
  useImperativeHandle(
    ref,
    () => ({ getSerializedValue: () => serializeRows(rowsRef.current) }),
    [],
  )

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  // highlightedValues 变化 = 一次新的"获取模型列表"：自动勾选这些模型，原有列表保持不选；为空则清空选择
  useEffect(() => {
    const values = (highlightedValues ?? []).filter(Boolean)
    if (values.length === 0) {
      pendingSelectValuesRef.current = null
      setSelectedIds(new Set())
      return
    }
    const set = new Set(values)
    // value 若同帧变化（合并新模型），行尚未刷新 → 暂存，待下方 value 同步 effect 用最新行映射
    pendingSelectValuesRef.current = set
    // value 未变化时行已是最新，立即映射兜底
    setSelectedIds(
      new Set(rowsRef.current.filter((r) => set.has(r.value.trim())).map((r) => r.id)),
    )
  }, [highlightedValues])

  useEffect(() => {
    if (value === lastSerializedRef.current) {
      return
    }
    lastSerializedRef.current = value
    const next = parseRows(value, rowsRef.current)
    rowsRef.current = next
    setRows(next)
    const pending = pendingSelectValuesRef.current
    if (pending) {
      pendingSelectValuesRef.current = null
      setSelectedIds(new Set(next.filter((r) => pending.has(r.value.trim())).map((r) => r.id)))
    }
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

  const handleToggleAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? new Set(rowsRef.current.map((row) => row.id)) : new Set())
  }, [])

  const handleToggleRow = useCallback((rowId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(rowId)
      } else {
        next.delete(rowId)
      }
      return next
    })
  }, [])

  const handleRemoveSelected = useCallback(() => {
    updateRows((prev) => prev.filter((row) => !selectedIds.has(row.id)), true)
    setSelectedIds(new Set())
  }, [updateRows, selectedIds])

  const columns = useMemo<ColumnDef<ModelTableRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const allRows = table.getRowModel().rows
          const total = allRows.length
          const selected = allRows.reduce(
            (n, item) => (selectedIds.has(item.original.id) ? n + 1 : n),
            0,
          )
          return (
            <Checkbox
              checked={total > 0 && selected === total}
              indeterminate={selected > 0 && selected < total}
              disabled={disabled || total === 0}
              onCheckedChange={(checked) => handleToggleAll(checked)}
              className="justify-center"
            />
          )
        },
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            disabled={disabled}
            onCheckedChange={(checked) => handleToggleRow(row.original.id, checked)}
            className="justify-center"
          />
        ),
        meta: {
          headerClassName: "w-[40px]",
          cellClassName: "w-[40px] text-center",
        },
      },
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
        meta: {
          headerClassName: "min-w-[160px]",
          cellClassName: "min-w-[160px]",
        },
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
        meta: {
          headerClassName: "min-w-[160px]",
          cellClassName: "min-w-[160px]",
        },
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
      selectedIds,
      handleToggleAll,
      handleToggleRow,
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
      <div className="overflow-x-auto border-b">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "whitespace-nowrap",
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
                <TableRow
                  key={row.id}
                  className={cn(
                    highlightedSet.has(row.original.value.trim()) && "bg-muted/50",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("whitespace-nowrap", cell.column.columnDef.meta?.cellClassName)}
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
      <div className="m-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          disabled={isAddDisabled}
        >
          {addButtonLabel}
        </Button>
        {selectedCount > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleRemoveSelected}
            disabled={disabled}
          >
            {removeSelectedLabel} ({selectedCount})
          </Button>
        )}
      </div>
    </div>
  )
})

ModelListTable.displayName = "ModelListTable"
