import type { ValueTransformer } from 'typeorm';

/** Postgres `numeric` comes back as string; expose it as number. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? null : Number(value)),
};
