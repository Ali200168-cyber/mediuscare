module.exports = {
  // All email sending is intentionally disabled/removed.
  isEmailConfigured: () => false,
  sendSmsNotification: async ({ phone, message }) => ({ skipped: true, reason: "email-disabled", phone, message }),
};

const nodemailer = require("nodemailer");

const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || process.env.SMTP_FROM || "";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const hasResendConfig = () => Boolean(RESEND_API_KEY && RESEND_FROM);
const hasSmtpConfig = () => Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

const isEmailConfigured = () => (EMAIL_PROVIDER === "resend" ? hasResendConfig() : hasSmtpConfig());

let transporter = null;
const getSmtpTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  return transporter;
};

const sendViaResend = async ({ toEmail, subject, text, html, attachments }) => {
  if (!hasResendConfig()) throw new Error("Resend is not configured.");
  if (attachments?.length) {
    // Resend supports attachments but needs base64; keep it simple and skip attachments unless you need them.
    console.warn("[email] Attachments are not supported in current Resend integration; sending without attachments.");
  }
  const payload = {
    from: RESEND_FROM,
    to: [toEmail],
    subject,
    text: text || undefined,
    html: html || undefined,
  };
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.message || data?.error || `Resend request failed (${resp.status})`;
    throw new Error(msg);
  }
  return data;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendCriticalHealthAlertEmail = async ({ toEmail, recipientName, patientName, glucose, recordedAt }) => {
  if (!isEmailConfigured()) {
    throw new Error("Email service is not configured.");
  }
  const safeRecipient = recipientName || "User";
  const when = recordedAt ? new Date(recordedAt).toLocaleString() : new Date().toLocaleString();
  const subject = `Critical Glucose Alert - ${patientName || "Patient"}`;
  const text = `Hi ${safeRecipient},\n\nCritical glucose alert detected.\nPatient: ${patientName || "Patient"}\nGlucose: ${glucose} mg/dL\nTime: ${when}\n\nPlease review immediately.`;
  const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin-bottom: 8px; color: #b91c1c;">Critical Glucose Alert</h2>
        <p>Hi ${safeRecipient},</p>
        <p>A critical glucose reading has been recorded.</p>
        <ul>
          <li><strong>Patient:</strong> ${patientName || "Patient"}</li>
          <li><strong>Glucose:</strong> ${glucose} mg/dL</li>
          <li><strong>Time:</strong> ${when}</li>
        </ul>
        <p style="color: #b91c1c;"><strong>Please review immediately.</strong></p>
      </div>
    `;
  return EMAIL_PROVIDER === "resend"
    ? sendViaResend({ toEmail, subject, text, html })
    : getSmtpTransporter().sendMail({ from: SMTP_FROM, to: toEmail, subject, text, html });
};

const sendRichEmail = async ({ toEmail, subject, text, html, attachments }) => {
  if (!isEmailConfigured()) {
    throw new Error("Email service is not configured.");
  }
  return EMAIL_PROVIDER === "resend"
    ? sendViaResend({ toEmail, subject, text, html, attachments })
    : getSmtpTransporter().sendMail({
        from: SMTP_FROM,
        to: toEmail,
        subject,
        text,
        html,
        attachments: attachments?.length ? attachments : undefined,
      });
};

/** @deprecated Prefer appointmentNotificationService + templates */
const sendAppointmentCreatedEmail = async ({
  toEmail,
  recipientName,
  patientName,
  doctorName,
  date,
  time,
  status,
  meetingLink,
}) => {
  const safeRecipient = recipientName || "User";
  const when = date ? `${new Date(date).toLocaleDateString()} ${time || ""}`.trim() : time || "Scheduled time";
  return sendRichEmail({
    toEmail,
    subject: `Appointment Created (${status || "Pending"}) - MediusCare`,
    text: `Hi ${safeRecipient},\n\nAn appointment has been created.\nStatus: ${status || "Pending"}\nPatient: ${patientName || "Patient"}\nDoctor: ${doctorName || "Doctor"}\nDate/Time: ${when}\nZoom/Meeting link: ${meetingLink || "N/A"}\n\nPlease keep this link for your consultation.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">Appointment Created</h2>
        <p>Hi ${safeRecipient},</p>
        <p>Your appointment has been created with status <strong>${status || "Pending"}</strong>.</p>
        <ul>
          <li><strong>Patient:</strong> ${patientName || "Patient"}</li>
          <li><strong>Doctor:</strong> ${doctorName || "Doctor"}</li>
          <li><strong>Date/Time:</strong> ${when}</li>
        </ul>
        <p>
          <strong>Zoom/Meeting link:</strong>
          ${meetingLink ? `<a href="${meetingLink}">${meetingLink}</a>` : "N/A"}
        </p>
        <p>Please keep this link for your consultation.</p>
      </div>
    `,
  });
};

const sendSmsNotification = async ({ phone, message }) => {
  const endpoint = process.env.SMS_WEBHOOK_URL || "";
  if (!endpoint || !phone) return { skipped: true };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: phone, message }),
    });
    return { ok: res.ok, status: res.status };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

module.exports = {
  isEmailConfigured,
  sendCriticalHealthAlertEmail,
  sendRichEmail,
  sendAppointmentCreatedEmail,
  sendSmsNotification,
};

