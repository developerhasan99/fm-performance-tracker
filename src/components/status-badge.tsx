import type { FulfillmentStatus } from "@prisma/client";
import { statusLabels } from "@/lib/dashboard";

export function StatusBadge({ status }: { status: FulfillmentStatus }) {
  return <span className={`status-badge ${status}`}>{statusLabels[status]}</span>;
}
