import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpSecure = this.configService.get<boolean>('SMTP_SECURE', false);

    if (!smtpHost || !smtpPort) {
      this.logger.warn('SMTP not configured. Email notifications will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? {
        user: smtpUser,
        pass: smtpPass,
      } : undefined,
    });

    this.logger.log('Email transporter initialized');
  }

  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string; success: boolean; error?: string }> {
    if (!this.transporter) {
      return {
        messageId: '',
        success: false,
        error: 'Email transporter not configured',
      };
    }

    try {
      const fromAddress = this.configService.get<string>(
        'EMAIL_FROM_ADDRESS',
        'noreply@ai-pipeline.app',
      );
      const fromName = this.configService.get<string>(
        'EMAIL_FROM_NAME',
        'AI Pipeline',
      );

      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
        headers: options.headers,
      });

      this.logger.log(`Email sent to ${options.to}: ${info.messageId}`);

      return {
        messageId: info.messageId,
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${error.message}`,
        error.stack,
      );
      return {
        messageId: '',
        success: false,
        error: error.message,
      };
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  isConfigured(): boolean {
    return !!this.transporter;
  }
}
