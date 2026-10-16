# Database Design – ghi chú

ERD: [02-erd.drawio](02-erd.drawio) (mở bằng draw.io / diagrams.net). DB: MySQL/PostgreSQL + TypeORM. 18 bảng.

## Nhóm bảng
| Nhóm | Bảng |
|------|------|
| Tài khoản | `users`, `account_tokens`, `refresh_tokens` |
| Sân | `field_types`, `fields`, `field_images`, `field_prices`, `settings` |
| Đặt sân | `bookings`, `booking_slots`, `booking_price_items`, `vouchers` |
| Tương tác | `reviews`, `comments`, `favorites`, `activities` |

## Quan hệ (1 – N trừ khi ghi khác)
- users 1–N account_tokens, refresh_tokens, bookings, reviews, comments, activities
- field_types 1–N fields · fields 1–N field_images, field_prices, bookings, reviews
- vouchers 1–N bookings (nullable) · bookings 1–N booking_slots, booking_price_items
- reviews 1–N comments · comments 1–N comments (self, `parent_id`)
- users N–N fields qua `favorites` (PK ghép `user_id, field_id`)

## Quyết định thiết kế quan trọng
1. **Chống trùng giờ bằng DB:** `booking_slots` có `UNIQUE(field_id, slot_date, slot_start)`. Mỗi booking sinh 1+ dòng slot (90 phút/slot) trong 1 transaction; trùng → lỗi duplicate → trả 409. Khi `CANCELLED/REJECTED` thì xóa slot để nhả giờ. Tránh race condition mà không cần lock phức tạp.
2. **Snapshot giá:** `booking_price_items` lưu giá từng đoạn (pro-rata theo phút) tại thời điểm đặt, nên đổi `field_prices` sau này không làm sai đơn cũ. `bookings` cũng lưu `subtotal/discount/total`.
3. **Giá:** `field_prices` theo khung giờ (17-21h đắt nhất, admin cấu hình). Cuối tuần +10% lấy từ `settings.weekend_surcharge_percent`; `slot_minutes=90`.
4. **Điều kiện review:** kiểm tra user có booking `APPROVED/COMPLETED` ở sân đó; `UNIQUE(user_id, field_id)` trên `reviews`.
5. **Denormalize:** `fields.avg_rating`, `review_count` cập nhật khi thêm/sửa/xóa review để list sân không phải `AVG()` mỗi lần.
6. **Comment lồng nhau:** `parent_id` tự tham chiếu (adjacency list); API dựng cây 2 cấp trên một query theo `review_id`.
7. **Timeline:** `activities` ghi bằng event, append-only; đọc theo `(user_id, created_at DESC)`.
8. **Soft delete** (`deleted_at`) cho `users`, `fields`, `reviews`, `comments`. Xóa sân chặn nếu còn booking PENDING/APPROVED có `booking_date >= hôm nay`.
9. **Token:** chỉ lưu hash của token kích hoạt/refresh, không lưu plaintext.

## Index đề xuất
| Bảng | Index |
|------|-------|
| users | UNIQUE(email); (role, is_active) |
| fields | (type_id); (status, deleted_at); FULLTEXT(name, address) hoặc LIKE cho keyword |
| field_prices | UNIQUE(field_id, start_time) |
| bookings | (user_id, created_at DESC); (field_id, booking_date, status); (status, created_at) |
| booking_slots | UNIQUE(field_id, slot_date, slot_start); (booking_id) |
| reviews | UNIQUE(user_id, field_id) WHERE deleted_at IS NULL (partial, để review đã xóa mềm không chặn review mới); (field_id, created_at DESC) |
| comments | (review_id, parent_id, created_at) |
| favorites | PK(user_id, field_id); (field_id) |
| activities | (user_id, created_at DESC) |
| vouchers | UNIQUE(code) |
| account_tokens / refresh_tokens | (user_id); (token_hash); (expires_at) cho cron dọn dẹp |

## Ghi chú triển khai
- Id dùng `integer identity` (không phải bigint) để TypeORM trả về number.
- Thêm CHECK: giờ mở cửa 06:00–23:00, `start < end`, rating 1–5, `PERCENT <= 100`, số tiền >= 0.
- Migration: `...100` auth tokens, `...200` fields + settings (seed `weekend_surcharge_percent=10`, `slot_minutes=90`), `...300` vouchers + bookings, `...400` reviews/comments/favorites/activities.
