export interface FieldListItem {
  id: number;
  name: string;
  address: string;
  type: { id: number; name: string };
  thumbnail: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgRating: number;
  reviewCount: number;
  isFavorite: boolean;
}

export interface FieldDetail {
  id: number;
  name: string;
  description: string | null;
  address: string;
  status: string;
  type: { id: number; name: string; capacity: number };
  images: { id: number; url: string; isThumbnail: boolean }[];
  prices: { id: number; startTime: string; endTime: string; price: number }[];
  weekendSurchargePercent: number;
  slotMinutes: number;
  openTime: string;
  closeTime: string;
  avgRating: number;
  reviewCount: number;
  isFavorite: boolean;
}

/** Postgres returns `time` as HH:mm:ss; the API exposes HH:mm. */
export const toHHmm = (time: string): string => time.slice(0, 5);

/** Raw row produced by the list query (see FieldsService.findAll). */
export interface FieldListRow {
  id: number;
  name: string;
  address: string;
  avg_rating: string;
  review_count: number;
  type_id: number;
  type_name: string;
  min_price: string | null;
  max_price: string | null;
  total: string;
}

export const toFieldListItem = (
  row: FieldListRow,
  thumbnail: string | null,
  isFavorite: boolean,
): FieldListItem => ({
  id: row.id,
  name: row.name,
  address: row.address,
  type: { id: row.type_id, name: row.type_name },
  thumbnail,
  minPrice: row.min_price === null ? null : Number(row.min_price),
  maxPrice: row.max_price === null ? null : Number(row.max_price),
  avgRating: Number(row.avg_rating),
  reviewCount: row.review_count,
  isFavorite,
});
