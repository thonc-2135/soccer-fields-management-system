export const MAIL_QUEUE = 'mail';

export enum MailJob {
  ACTIVATION = 'activation',
  BOOKING_CANCELLED = 'booking-cancelled',
}

export interface ActivationMailData {
  to: string;
  name: string;
  link: string;
  /** Language of the request that triggered the mail (en | vi). */
  lang: string;
}

export interface BookingCancelledMailData {
  to: string;
  name: string;
  fieldName: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  lang: string;
}

export type MailJobData = ActivationMailData | BookingCancelledMailData;
