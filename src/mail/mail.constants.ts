export const MAIL_QUEUE = 'mail';

export enum MailJob {
  ACTIVATION = 'activation',
}

export interface ActivationMailData {
  to: string;
  name: string;
  link: string;
  /** Language of the request that triggered the mail (en | vi). */
  lang: string;
}
