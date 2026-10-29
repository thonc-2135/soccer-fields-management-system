/** Most bookings one cron run handles per batch (keeps each transaction short). */
export const EXPIRE_BATCH_SIZE = 200;
/** Batches per run; the next tick continues if more remain. */
export const MAX_EXPIRE_BATCHES = 10;
/** Longer than any run should take, shorter than the interval so a crashed run does not block the next. */
export const CRON_LOCK_SECONDS = 120;
