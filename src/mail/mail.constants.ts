export const MAIL_QUEUE = 'mail';

export enum MailJob {
  ACTIVATION = 'activation',
  BOOKING_CANCELLED = 'booking-cancelled',
  BOOKING_APPROVED = 'booking-approved',
  BOOKING_REJECTED = 'booking-rejected',
  BOOKING_EXPIRED = 'booking-expired',
}

export interface ActivationMailData {
  to: string;
  name: string;
  link: string;
  /** Language of the request that triggered the mail (en | vi). */
  lang: string;
}

/** Language used when the mail is not triggered by a request (cron jobs). */
export const DEFAULT_MAIL_LANG = 'vi';

export interface BookingMailData {
  to: string;
  name: string;
  fieldName: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  lang: string;
}

export type BookingCancelledMailData = BookingMailData;
export type BookingApprovedMailData = BookingMailData;
export type BookingExpiredMailData = BookingMailData;

export interface BookingRejectedMailData extends BookingMailData {
  reason: string;
}

export type MailJobData = ActivationMailData | BookingMailData;
