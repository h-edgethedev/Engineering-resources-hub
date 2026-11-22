import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';

let transporter: Transporter | undefined;

export async function sendVerificationEmail(email: string, displayName: string, verificationUrl: string) {
  if (env.nodeEnv === 'test') return;
  if (!env.emailSmtpUrl || !env.emailFrom) {
    if (env.nodeEnv === 'development') {
      console.info(`[auth] Email verification link for ${email}: ${verificationUrl}`);
    }
    return;
  }

  transporter ??= nodemailer.createTransport(env.emailSmtpUrl);
  await transporter.sendMail({
    from: env.emailFrom,
    to: email,
    subject: 'Verify your Engineering Resources Hub email',
    text: `Hello ${displayName},\n\nVerify your email address to finish creating your Engineering Resources Hub account:\n${verificationUrl}\n\nThis link expires in 30 minutes. If you did not create this account, you can ignore this email.`,
  });
}
