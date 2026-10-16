# B1. API Endpoints – Soccer Fields Management System

Base URL: `/api/v1` · Auth: `Authorization: Bearer <accessToken>` · Ngôn ngữ: header `Accept-Language: vi|en` (i18n)

## 0. Quy ước chung

**Quy tắc nghiệp vụ đã chốt**
- Mỗi lượt đặt = **1 slot cố định 90 phút**. Giờ mở cửa 06:00, đóng cửa tối đa 23:00, đặt trong ngày (không qua đêm).
- 11 slot/ngày: 06:00-07:30, 07:30-09:00, 09:00-10:30, 10:30-12:00, 12:00-13:30, 13:30-15:00, 15:00-16:30, 16:30-18:00, 18:00-19:30, 19:30-21:00, 21:00-22:30. Client chỉ gửi `date` + `startTime`, server tự tính `endTime = startTime + 90'` (hoặc cho đặt nhiều slot liên tiếp: `slots` = số slot, mặc định 1).
- Giá theo khung giờ do admin cấu hình; **17:00-21:00 là khung đắt nhất**; các khung khác tùy admin (bằng nhau/tăng/giảm). Vì slot 90' không khớp ranh giới 17h/21h nên slot giao nhiều khung được **tính theo phút** (pro-rata).
- **Cuối tuần (T7, CN) cộng 10%** trên giá khung giờ (`weekendSurchargePercent = 10`, lưu config).
- Role: enum `USER | ADMIN`.

**Response thành công**
```json
{ "success": true, "data": { }, "message": "..." }
```
**Response danh sách (phân trang)**
```json
{ "success": true, "data": [ ], "meta": { "page": 1, "limit": 10, "total": 57, "totalPages": 6 } }
```
**Response lỗi**
```json
{ "success": false, "statusCode": 400, "message": "...", "errors": [ { "field": "email", "message": "..." } ] }
```
**Query phân trang chung**: `page` (default 1), `limit` (default 10, max 50), `sort` (vd `createdAt:desc`).

**Mã lỗi hay gặp**: 400 validate · 401 chưa login/token sai · 403 sai quyền / tài khoản inactive · 404 không tìm thấy · 409 trùng (email, trùng giờ đặt) · 422 vi phạm rule nghiệp vụ.

**Trạng thái đơn đặt (Booking.status)**: `PENDING` → `APPROVED` | `REJECTED` | `CANCELLED` (user hủy khi PENDING) | `COMPLETED` (cron sau khi hết giờ).

**Phân quyền**: 🌐 Guest (public) · 👤 User · 🛡 Admin

---

## 1. Auth

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 1.1 | POST | `/auth/register` | 🌐 | Đăng ký, gửi mail kích hoạt (queue) |
| 1.2 | GET | `/auth/activate?token=` | 🌐 | Kích hoạt tài khoản qua link mail |
| 1.3 | POST | `/auth/resend-activation` | 🌐 | Gửi lại mail kích hoạt |
| 1.4 | POST | `/auth/login` | 🌐 | Đăng nhập |
| 1.5 | POST | `/auth/refresh` | 🌐 | Cấp lại access token |
| 1.6 | POST | `/auth/logout` | 👤🛡 | Đăng xuất (revoke refresh token) |
| 1.7 | GET | `/auth/me` | 👤🛡 | Thông tin tài khoản hiện tại |

**1.1 POST /auth/register**
- Body: `{ "name": string, "email": string, "password": string, "phone"?: string }`
- Validate password: ≥ 8 ký tự, có ít nhất 3 trong 4 loại (thường, HOA, số, ký tự đặc biệt).
- 201: `{ "data": { "id": 1, "email": "a@x.com", "isActive": false } }`
- 409 nếu email tồn tại.

**1.2 GET /auth/activate** → 200 `{ "message": "Account activated" }`; 400 nếu token hết hạn/sai.

**1.4 POST /auth/login**
- Body: `{ "email", "password" }`
- 200: `{ "data": { "accessToken", "refreshToken", "expiresIn": 900, "user": { "id", "name", "email", "role" } } }`
- Access token (JWT) sống 15 phút (`JWT_EXPIRES_IN=900`); refresh token là chuỗi ngẫu nhiên, sống 7 ngày, chỉ lưu hash trong bảng `refresh_tokens`.
- 401 sai thông tin; 403 chưa kích hoạt hoặc bị admin inactive.

**1.5 POST /auth/refresh** Body `{ "refreshToken" }` → `{ "accessToken", "refreshToken", "expiresIn", "user" }`
- Rotation: mỗi lần refresh thu hồi token cũ và cấp token mới. Dùng lại token đã thu hồi → 401 và thu hồi toàn bộ phiên của user đó.

**1.6 POST /auth/logout** Body (tùy chọn) `{ "refreshToken" }` – đưa access token vào blacklist (Redis) và thu hồi refresh token nếu có gửi kèm.

---

## 2. Fields (Sân) – Public

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 2.1 | GET | `/fields` | 🌐 | Danh sách + tìm kiếm + lọc kết hợp |
| 2.2 | GET | `/fields/:id` | 🌐 | Chi tiết sân |
| 2.3 | GET | `/fields/:id/availability?date=` | 🌐 | Khung giờ (slot 90 phút) rảnh/đã đặt theo ngày |
| 2.4 | GET | `/fields/:id/reviews` | 🌐 | Danh sách đánh giá của sân |
| 2.5 | GET | `/field-types` | 🌐 | Danh sách loại sân (cho filter) |

**2.1 GET /fields** – Query (tất cả optional, kết hợp AND):
- `keyword` (tìm theo tên/địa chỉ/mô tả)
- `typeId` (loại sân; có thể nhiều: `typeId=1,2`)
- `minPrice`, `maxPrice` (giá/giờ)
- `date` (YYYY-MM-DD) + `startTime`, `endTime` (HH:mm) → chỉ sân còn trống trong khung này
- `minRating`
- `page`, `limit`, `sort` (`price:asc`, `rating:desc`, `createdAt:desc`)
- Response item:
```json
{ "id": 1, "name": "Sân A1", "address": "...", "type": { "id": 1, "name": "Sân 7" },
  "thumbnail": "https://.../1.jpg", "minPrice": 200000, "maxPrice": 350000,
  "avgRating": 4.5, "reviewCount": 12, "isFavorite": false }
```
(`isFavorite` chỉ có giá trị khi gửi kèm token, optional auth.)

**2.2 GET /fields/:id**
```json
{ "id": 1, "name": "Sân A1", "description": "...", "address": "...", "status": "ACTIVE",
  "type": { "id": 1, "name": "Sân 7", "capacity": 14 },
  "images": [ { "id": 1, "url": "..." } ],
  "prices": [ { "id": 1, "startTime": "06:00", "endTime": "17:00", "price": 200000 },
              { "id": 2, "startTime": "17:00", "endTime": "21:00", "price": 350000 },
              { "id": 3, "startTime": "21:00", "endTime": "23:00", "price": 200000 } ],
  "weekendSurchargePercent": 10, "slotMinutes": 90,
  "openTime": "06:00", "closeTime": "23:00", "avgRating": 4.5, "reviewCount": 12 }
```

**2.3 GET /fields/:id/availability?date=2026-11-01**
```json
{ "date": "2026-11-01", "isWeekend": true, "slots": [
  { "startTime": "06:00", "endTime": "07:30", "status": "AVAILABLE", "price": 330000 },
  { "startTime": "07:30", "endTime": "09:00", "status": "BOOKED" },
  { "startTime": "09:00", "endTime": "10:30", "status": "PENDING" } ] }
```
`status`: `AVAILABLE | PENDING | BOOKED | PAST`.

---

## 3. Bookings (Đặt sân) – User

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 3.1 | POST | `/bookings/preview` | 👤 | Tính giá trước (kèm voucher) |
| 3.2 | POST | `/bookings` | 👤 | Tạo đơn đặt sân |
| 3.3 | GET | `/bookings/me` | 👤 | Lịch sử đặt (mới nhất trước) |
| 3.4 | GET | `/bookings/:id` | 👤 | Chi tiết đơn của mình |
| 3.5 | PATCH | `/bookings/:id/cancel` | 👤 | Hủy đơn (chỉ khi PENDING), gửi mail |
| 3.6 | POST | `/vouchers/validate` | 👤 | Kiểm tra mã giảm giá |

**3.1/3.2 Body**
```json
{ "fieldId": 1, "date": "2026-11-01", "startTime": "18:00", "slots": 1,
  "voucherCode": "SALE10", "note": "..." }
```
- `startTime` phải là đầu một slot hợp lệ (06:00, 07:30, ... 21:00); `slots` ≥ 1 (mặc định 1), `endTime` ≤ 23:00; không đặt slot đã qua; không qua đêm.
- 409 nếu trùng với đơn `PENDING/APPROVED` khác (check trong transaction + lock).
- 422 voucher hết hạn/hết lượt/không đủ điều kiện.
- Response 3.1/3.2:
```json
{ "id": 10, "field": { "id": 1, "name": "Sân A1" }, "date": "2026-11-01",
  "startTime": "16:30", "endTime": "18:00", "status": "PENDING",
  "priceBreakdown": [ { "from": "16:30", "to": "17:00", "unitPrice": 200000, "minutes": 30, "amount": 100000 },
                      { "from": "17:00", "to": "18:00", "unitPrice": 350000, "minutes": 60, "amount": 350000 } ],
  "weekendSurchargePercent": 10, "subtotal": 495000, "discount": 49500, "total": 445500,
  "voucher": { "code": "SALE10" } }
```
(3.1 không có `id`/`status`, không lưu DB.)

**3.3 GET /bookings/me** – Query: `status`, `fromDate`, `toDate`, `page`, `limit`. Sort cố định `createdAt desc`.

**3.5** → 200 đơn với `status: CANCELLED`; 422 nếu status ≠ PENDING; 403 nếu không phải chủ đơn.

**3.6 POST /vouchers/validate** Body `{ "code", "amount" }` → `{ "valid": true, "discount": 70000 }`

---

## 4. Reviews & Comments

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 4.1 | POST | `/fields/:id/reviews` | 👤 | Đánh giá sân |
| 4.2 | PATCH | `/reviews/:id` | 👤 | Sửa review của mình |
| 4.3 | DELETE | `/reviews/:id` | 👤🛡 | Xóa review (chủ review hoặc admin) |
| 4.4 | POST | `/reviews/:id/comments` | 👤 | Bình luận / trả lời bình luận |
| 4.5 | GET | `/reviews/:id/comments` | 🌐 | Cây bình luận |
| 4.6 | DELETE | `/comments/:id` | 👤🛡 | Xóa bình luận |

**4.1 Body** `{ "rating": 1-5, "content": string }` – 403 nếu chưa có booking `APPROVED/COMPLETED` ở sân này; 409 nếu đã đánh giá (1 review/user/sân – cần chốt).
**4.4 Body** `{ "content": string, "parentId"?: number }` (parentId = comment cha → bình luận của bình luận).
**4.5 Response**: `[ { "id", "content", "user": {id,name,avatar}, "createdAt", "replies": [ ... ] } ]`, phân trang theo comment gốc.

---

## 5. Favorites

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 5.1 | POST | `/fields/:id/favorite` | 👤 | Đánh dấu yêu thích |
| 5.2 | DELETE | `/fields/:id/favorite` | 👤 | Bỏ yêu thích |
| 5.3 | GET | `/favorites` | 👤 | Danh sách sân yêu thích (phân trang) |

5.1/5.2 idempotent → `{ "data": { "fieldId": 1, "isFavorite": true } }`.

---

## 6. Timeline hoạt động – User (Advance)

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 6.1 | GET | `/activities/me` | 👤 | Timeline của mình, mới nhất trước |

Query: `type` (`BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_APPROVED, BOOKING_REJECTED, REVIEW_CREATED, COMMENT_CREATED, FAVORITE_ADDED, FAVORITE_REMOVED`), `fromDate`, `toDate`, `page`, `limit`.
Item: `{ "id", "type", "createdAt", "field": {id,name}, "refId", "metadata": {} }`.
Ghi log bằng event (`@nestjs/event-emitter`) từ các service, không chặn request.

---

## 7. Admin – Bookings

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 7.1 | GET | `/admin/bookings` | 🛡 | Danh sách + filter |
| 7.2 | GET | `/admin/bookings/:id` | 🛡 | Chi tiết |
| 7.3 | PATCH | `/admin/bookings/:id/approve` | 🛡 | Chấp nhận, gửi mail |
| 7.4 | PATCH | `/admin/bookings/:id/reject` | 🛡 | Từ chối (`{ "reason" }`), gửi mail |
| 7.5 | GET | `/admin/bookings/calendar?from=&to=&fieldId=` | 🛡 | Dữ liệu hiển thị trực quan (calendar) |

7.1 Query: `status`, `fieldId`, `userId`, `fromDate`, `toDate` (theo ngày đá), `createdFrom`, `createdTo` (theo ngày đặt), `keyword` (tên/email user), `page`, `limit`, `sort`.
7.3/7.4: chỉ khi `PENDING`, ngược lại 422. Re-check trùng giờ khi approve.
7.5 Response: `[ { "bookingId", "fieldId", "fieldName", "user": {id,name}, "start": "2026-11-01T18:00", "end": "2026-11-01T20:00", "status" } ]`.

## 8. Admin – Fields (CRUD)

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 8.1 | POST | `/admin/fields` | 🛡 | Tạo sân (kèm loại sân + bảng giá) |
| 8.2 | GET | `/admin/fields` | 🛡 | Danh sách (gồm cả sân inactive) |
| 8.3 | GET | `/admin/fields/:id` | 🛡 | Chi tiết |
| 8.4 | PATCH | `/admin/fields/:id` | 🛡 | Cập nhật |
| 8.5 | DELETE | `/admin/fields/:id` | 🛡 | Xóa (soft delete) |
| 8.6 | POST | `/admin/fields/:id/images` | 🛡 | Upload nhiều ảnh (`multipart/form-data`, field `images[]`, max 10, ≤ 5MB, jpg/png/webp) |
| 8.7 | DELETE | `/admin/fields/:id/images/:imageId` | 🛡 | Xóa 1 ảnh |
| 8.8 | PUT | `/admin/fields/:id/prices` | 🛡 | Thay bảng giá theo khung giờ |
| 8.9 | GET | `/admin/fields/:id/schedule?date=` | 🛡 | Lịch đặt: giờ đã đặt, giờ rảnh |
| 8.10 | CRUD | `/admin/field-types` | 🛡 | Quản lý loại sân |

**8.1 Body**
```json
{ "name": "Sân A1", "description": "...", "address": "...", "openTime": "06:00", "closeTime": "23:00",
  "typeId": 1,
  "type": { "name": "Sân 7", "capacity": 14 },
  "prices": [ { "startTime": "06:00", "endTime": "17:00", "price": 200000 },
              { "startTime": "17:00", "endTime": "21:00", "price": 350000 },
              { "startTime": "21:00", "endTime": "23:00", "price": 200000 } ] }
```
(`typeId` hoặc `type` – tạo loại sân mới cùng lúc.) Validate: khung giá không chồng lấn, phủ kín giờ mở cửa; `openTime ≥ 06:00`, `closeTime ≤ 23:00`. Giá cuối tuần không nhập tay, hệ thống tự cộng 10%.
**8.5**: 422 nếu còn đơn `PENDING` hoặc `APPROVED` ở tương lai.
**8.9 Response**: giống 2.3 nhưng slot kèm thông tin booking (`bookingId`, `user`).

## 9. Admin – Users

| # | Method | Endpoint | Quyền | Mô tả |
|---|--------|----------|-------|-------|
| 9.1 | GET | `/admin/users` | 🛡 | Danh sách (`keyword`, `isActive`, `role`, `page`, `limit`) |
| 9.2 | GET | `/admin/users/:id` | 🛡 | Chi tiết (kèm thống kê số đơn đặt) |
| 9.3 | PATCH | `/admin/users/:id/status` | 🛡 | Body `{ "isActive": boolean }` |

Không cho admin tự khóa chính mình.

## 10. Admin – Vouchers (bổ sung để hỗ trợ mã giảm giá)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST/GET/PATCH/DELETE | `/admin/vouchers[/:id]` | Body: `code, type (PERCENT\|FIXED), value, maxDiscount, minOrderAmount, usageLimit, perUserLimit, startAt, endAt, isActive` |

## 11. Trigger / Job nền (không phải endpoint)

| Job | Kỹ thuật | Mô tả |
|-----|----------|-------|
| Mail kích hoạt, mail hủy đơn, mail duyệt/từ chối | `@nestjs/bull` + Redis | Đẩy vào queue `mail` |
| Auto `COMPLETED` booking sau giờ đá | `@nestjs/schedule` (Cron mỗi 15 phút) | |
| Auto hủy/hết hạn đơn PENDING quá hạn (vd 24h) | `@nestjs/schedule` | Tùy chọn, cần chốt |
| Xóa token kích hoạt hết hạn | `@nestjs/schedule` (hằng ngày) | |
| Seeder (admin, field types, fields, vouchers) | CLI `nest-commander` | `npm run seed` |

## 12. Ma trận phân quyền tóm tắt

| Nhóm | Guest | User | Admin |
|------|:-----:|:----:|:-----:|
| Register/Login/Activate | ✅ | ✅ | ✅ |
| Xem/Tìm sân, availability, review, comment | ✅ | ✅ | ✅ |
| Đặt/Hủy/Lịch sử, Review, Comment, Favorite, Timeline | ❌ | ✅ | ❌ |
| Quản lý booking/sân/user/voucher | ❌ | ❌ | ✅ |

## 13. Đã chốt / còn mở
Đã chốt: slot 90 phút, mở 06:00 – đóng 23:00, không qua đêm, giá đắt nhất 17-21h, cuối tuần +10%, role enum.
Còn mở (đề xuất mặc định):
1. Mỗi user 1 review/sân (đề xuất: 1).
2. Ngày lễ có phụ thu không? (đề xuất: không, chỉ cuối tuần).
3. Đơn PENDING quá hạn có tự hủy không? (đề xuất: tự hủy sau 24h hoặc khi sát giờ đá, bằng cron).
4. Cho đặt nhiều slot liên tiếp hay chỉ 1 slot? (đề xuất: cho, tối đa 3).
