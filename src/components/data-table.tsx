"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export type Facet = {
  columnId: string;
  label: string;
  options: { value: string; label: string }[];
};

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchKeys?: (keyof TData)[];
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  /** Kelas tambahan per baris, mis. menyorot data yang baru disimpan. */
  rowClassName?: (row: TData) => string | undefined;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  facets?: Facet[];
}

const PAGE_SIZES = [25, 50, 100];

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Cari…",
  searchKeys,
  pageSize = 25,
  onRowClick,
  rowClassName,
  toolbar,
  emptyTitle,
  facets,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: (row, _col, value) => {
      const needle = String(value).toLowerCase();
      if (searchKeys) {
        return searchKeys.some((k) =>
          String((row.original as any)[k] ?? "").toLowerCase().includes(needle)
        );
      }
      return Object.values(row.original as any).some((v) =>
        String(v ?? "").toLowerCase().includes(needle)
      );
    },
  });

  const activeFilters = columnFilters.length + (globalFilter ? 1 : 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>

        {facets?.map((f) => {
          const col = table.getColumn(f.columnId);
          const val = (col?.getFilterValue() as string) ?? "all";
          return (
            <Select key={f.columnId} value={val} onValueChange={(v) => col?.setFilterValue(v === "all" ? undefined : v)}>
              <SelectTrigger className="h-9 w-auto min-w-[9rem] gap-1">
                <span className="text-muted-foreground">{f.label}:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          );
        })}

        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setGlobalFilter(""); setColumnFilters([]); }}>
            <X className="h-4 w-4" /> Reset
          </Button>
        )}

        {toolbar && <div className="sm:ml-auto">{toolbar}</div>}
      </div>

      <div className="max-h-[calc(100vh-13rem)] overflow-auto rounded-md border scrollbar-thin">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 p-0">
                  <EmptyState title={emptyTitle ?? "Tidak ada data"} className="border-0" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} baris
          {table.getFilteredRowModel().rows.length !== data.length && ` (dari ${data.length})`}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[5.5rem]"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}/hal</SelectItem>)}</SelectContent>
          </Select>
          <span className="whitespace-nowrap">
            Hal {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
