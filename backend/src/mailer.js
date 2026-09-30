import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number.parseInt(process.env.SMTP_PORT || '587', 10);
const transport = process.env.MAIL_MODE === 'json'
  ? nodemailer.createTransport({ jsonTransport: true })
  : smtpHost
    ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === 'true' || smtpPort === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    })
    : null;

export const emailConfigured = Boolean(transport);

export function sendEmail({ to, subject, text }) {
  if (!transport) throw new Error('SMTP is not configured');
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error('EMAIL_FROM or SMTP_USER must be configured');
  return transport.sendMail({ from, to, subject, text });
}