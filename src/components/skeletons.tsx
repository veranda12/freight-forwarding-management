import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function ListSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="rounded-md border">
        <Skeleton className="h-9 w-full rounded-none" />
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-80" /></div>
      <Card><CardContent className="grid grid-cols-2 gap-px p-4 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="space-y-1.5 px-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-20" /></div>)}
      </CardContent></Card>
      <Skeleton className="h-4 w-24" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-7 w-72" /><Skeleton className="h-4 w-56" /></div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-10 w-full max-w-lg rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64 w-full rounded-lg" /><Skeleton className="h-64 w-full rounded-lg" /></div>
    </div>
  );
}
