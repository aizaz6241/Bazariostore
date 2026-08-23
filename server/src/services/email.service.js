import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Create Nodemailer Transporter with Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || 'itxezooo@gmail.com',
    pass: process.env.EMAIL_PASS || 'vhqlxwhngiqhehbo',
  },
});

const DEFAULT_FROM = process.env.EMAIL_FROM || '"Bazario Support" <itxezooo@gmail.com>';

/**
 * Base Email Wrapper with Responsive Styling & Professional Branding
 */
function getEmailLayout({ title, preheader, bodyContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; }
    .email-container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; }
    .email-header { background: #0f172a; padding: 26px 30px; text-align: center; }
    .brand-logo { font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .brand-accent { color: #f59e0b; }
    .brand-tag { font-size: 11px; background: rgba(255,255,255,0.15); color: #94a3b8; padding: 3px 8px; border-radius: 20px; font-weight: 700; text-transform: uppercase; margin-left: 8px; letter-spacing: 0.5px; }
    .email-body { padding: 32px 30px; line-height: 1.6; font-size: 14.5px; color: #334155; }
    .email-heading { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
    .otp-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #0f172a; margin: 6px 0; display: inline-block; padding: 4px 12px; background: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0; }
    .otp-expiry { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 6px; }
    .btn-action { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 13px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 18px 0; }
    .btn-action:hover { background: #1e293b; }
    .security-notice { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin: 24px 0 10px; font-size: 12.5px; color: #92400e; line-height: 1.5; }
    .email-footer { background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; line-height: 1.5; }
    .footer-links { margin-bottom: 8px; }
    .footer-links a { color: #64748b; text-decoration: none; margin: 0 6px; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || title}
  </div>
  <div class="email-container">
    <div class="email-header">
      <div class="brand-logo">
        BAZARIO<span class="brand-accent">.</span>
        <span class="brand-tag">E-Commerce Ecosystem</span>
      </div>
    </div>
    <div class="email-body">
      ${bodyContent}
    </div>
    <div class="email-footer">
      <div class="footer-links">
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}">Storefront</a> •
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/seller/login">Seller Central</a> •
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/page/privacy">Privacy Policy</a>
      </div>
      <p style="margin: 0;">© ${new Date().getFullYear()} Bazario Global Commerce. All rights reserved.<br>This is an automated security email sent from a verified notification address.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Send 6-Digit Email Verification OTP (Customer or Seller Registration)
 */
export async function sendVerificationOtpEmail({ to, name = 'User', otp, role = 'Customer' }) {
  try {
    const roleLabel = role === 'seller' ? 'Seller Merchant Hub' : 'Customer Account';
    const bodyContent = `
      <h2 class="email-heading">Verify Your Email Address 🔐</h2>
      <p>Hello <b>${name}</b>,</p>
      <p>Thank you for signing up on Bazario ${roleLabel}. To complete your email verification, please enter the one-time verification code (OTP) below:</p>
      
      <div class="otp-card">
        <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">One-Time Verification Code</span>
        <div class="otp-code">${otp}</div>
        <div class="otp-expiry">⏱️ Valid for 10 minutes (Single Use)</div>
      </div>

      <div class="security-notice">
        <b>⚠️ Security Notice:</b> Never share this OTP with anyone, including Bazario support agents. Our team will never ask for your verification code.
      </div>
      
      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">If you did not request this registration, please ignore this email.</p>
    `;

    const html = getEmailLayout({
      title: `Bazario Verification Code: ${otp}`,
      preheader: `Your verification code is ${otp}. Valid for 10 minutes.`,
      bodyContent,
    });

    const info = await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject: `[Bazario] ${otp} is your verification code`,
      html,
    });

    console.log(`[Email-Sent] Verification OTP to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email-Error] Failed to send verification OTP to ${to}:`, error);
    throw error;
  }
}

/**
 * 2. Send Password Reset Email (Direct Link + 6-Digit OTP)
 */
export async function sendPasswordResetEmail({ to, name = 'User', resetUrl, otp, role = 'user' }) {
  try {
    const roleLabel = role === 'seller' ? 'Merchant Store' : role === 'admin' ? 'Super Admin' : 'Customer Account';
    const bodyContent = `
      <h2 class="email-heading">Password Reset Request 🔑</h2>
      <p>Hello <b>${name}</b>,</p>
      <p>We received a request to reset the password for your Bazario ${roleLabel} (<code>${to}</code>).</p>
      
      <p style="margin-bottom: 6px;">You can reset your password directly using the secure link below:</p>
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="btn-action" target="_blank">RESET MY PASSWORD →</a>
      </div>

      ${otp ? `
      <div class="otp-card">
        <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Or Enter 6-Digit Reset Code</span>
        <div class="otp-code">${otp}</div>
        <div class="otp-expiry">⏱️ Code expires in 60 minutes</div>
      </div>
      ` : ''}

      <div class="security-notice">
        <b>🔒 Security Tip:</b> If you did not initiate this password recovery request, your account is still secure. You can safely disregard this email or update your password if you suspect unauthorized access.
      </div>
    `;

    const html = getEmailLayout({
      title: `Reset your Bazario Password`,
      preheader: `Click here to reset your Bazario account password.`,
      bodyContent,
    });

    const info = await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject: `[Bazario] Password Reset Request`,
      html,
    });

    console.log(`[Email-Sent] Password reset to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email-Error] Failed to send password reset email to ${to}:`, error);
    throw error;
  }
}

/**
 * 3. Send Welcome Email Upon Successful Verification
 */
export async function sendWelcomeEmail({ to, name = 'User', role = 'Customer' }) {
  try {
    const isSeller = role === 'seller';
    const bodyContent = `
      <h2 class="email-heading">Welcome to Bazario! 🎉</h2>
      <p>Hello <b>${name}</b>,</p>
      <p>Your email has been successfully verified! We are excited to have you on the Bazario platform.</p>
      
      ${isSeller ? `
      <p>Your merchant application has been submitted and is currently being processed by our compliance team. Once verified, you will have access to wholesale order fulfillment and 20% guaranteed profit margins.</p>
      <div style="text-align: center;">
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/seller/login" class="btn-action">GO TO SELLER HUB →</a>
      </div>
      ` : `
      <p>You can now browse thousands of products, enjoy real-time order tracking, and experience instant checkout.</p>
      <div style="text-align: center;">
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/shop" class="btn-action">START SHOPPING →</a>
      </div>
      `}
    `;

    const html = getEmailLayout({
      title: `Welcome to Bazario!`,
      preheader: `Your account is ready. Welcome to Bazario!`,
      bodyContent,
    });

    await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject: `[Bazario] Welcome aboard, ${name}! 🎉`,
      html,
    });
  } catch (error) {
    console.error(`[Email-Error] Failed to send welcome email to ${to}:`, error);
  }
}

/**
 * 4. Send Seller Approval Email Notification
 */
export async function sendSellerApprovalEmail({ to, name, storeName }) {
  try {
    const bodyContent = `
      <h2 class="email-heading" style="color: #16a34a;">Congratulations! Your Merchant Store is Approved 🚀</h2>
      <p>Hello <b>${name}</b>,</p>
      <p>Great news! Your merchant store <b>"${storeName}"</b> has been reviewed and officially approved by the Platform Super Admin.</p>
      
      <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 18px 0;">
        <b style="color: #166534; display: block; margin-bottom: 6px;">✨ What's Next?</b>
        <ul style="margin: 0; padding-left: 18px; color: #166534; font-size: 13.5px;">
          <li>Log in to your Seller Central portal.</li>
          <li>Fund your merchant wallet to start locking wholesale order costs.</li>
          <li>Fulfill orders and earn automatic 20% profit margins on customer delivery.</li>
        </ul>
      </div>

      <div style="text-align: center;">
        <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/seller/login" class="btn-action" style="background: #16a34a;">LOG IN TO SELLER CENTRAL →</a>
      </div>
    `;

    const html = getEmailLayout({
      title: `Merchant Store Approved: ${storeName}`,
      preheader: `Your seller application has been approved. Start selling now!`,
      bodyContent,
    });

    await transporter.sendMail({
      from: DEFAULT_FROM,
      to,
      subject: `[Bazario] Your Merchant Store "${storeName}" is Approved! 🚀`,
      html,
    });
  } catch (error) {
    console.error(`[Email-Error] Failed to send seller approval email to ${to}:`, error);
  }
}

export default {
  transporter,
  sendVerificationOtpEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendSellerApprovalEmail,
};
