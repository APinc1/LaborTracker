import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

interface PasswordResetEmailData {
  name: string;
  email: string;
  resetToken: string;
  resetUrl: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Check for email configuration from environment variables
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
    ) {
      this.config = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        from: process.env.SMTP_FROM,
      };

      this.transporter = nodemailer.createTransporter(this.config);
    }
  }

  generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.log('Email service not configured. Would send password reset email to:', data.email);
      console.log('Reset URL:', data.resetUrl);
      return false;
    }

    try {
      const mailOptions = {
        from: this.config.from,
        to: data.email,
        subject: 'Welcome! Set Your Password - Construction Management System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Welcome to Construction Management System</h2>
            <p>Hi ${data.name},</p>
            <p>A user account has been created for you in our Construction Management System. To get started, you'll need to set your password.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Click the button below to set your password:</strong></p>
              <a href="${data.resetUrl}" 
                 style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 5px; margin-top: 15px;">
                Set My Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${data.resetUrl}">${data.resetUrl}</a>
            </p>
            
            <p style="color: #666; font-size: 14px;">
              This link will expire in 24 hours for security purposes.
            </p>
            
            <p>If you have any questions, please contact your system administrator.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #888; font-size: 12px;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        `,
        text: `
Welcome to Construction Management System

Hi ${data.name},

A user account has been created for you in our Construction Management System. To get started, you'll need to set your password.

Click this link to set your password: ${data.resetUrl}

This link will expire in 24 hours for security purposes.

If you have any questions, please contact your system administrator.
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent successfully to:', data.email);
      return true;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.config !== null;
  }

  getRequiredEnvVars(): string[] {
    return [
      'SMTP_HOST - Your email server hostname (e.g., smtp.office365.com)',
      'SMTP_PORT - Port number (587 for TLS, 465 for SSL)',
      'SMTP_SECURE - true for SSL (port 465), false for TLS (port 587)',
      'SMTP_USER - Your email address',
      'SMTP_PASS - Your email password or app password',
      'SMTP_FROM - From email address (usually same as SMTP_USER)'
    ];
  }
}

export const emailService = new EmailService();