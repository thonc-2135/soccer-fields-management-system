export interface FavoriteState {
  fieldId: number;
  isFavorite: boolean;
}

export interface FavoriteFieldItem {
  id: number;
  name: string;
  address: string;
  type: { id: number; name: string };
  thumbnail: string | null;
  avgRating: number;
  reviewCount: number;
  favoritedAt: Date;
}
