import type { ActivityType } from '../../common/enums/activity-type.enum.js';

export interface ActivityItem {
  id: number;
  type: ActivityType;
  createdAt: Date;
  field: { id: number; name: string } | null;
  refType: string | null;
  refId: number | null;
  metadata: Record<string, unknown>;
}
