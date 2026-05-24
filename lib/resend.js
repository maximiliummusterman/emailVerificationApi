import { emailConfig } from './config.js';

function verificationHtml(code) {
  return `
    <p>Your Guandan verification code is:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0;">${code}</p>
    <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
  `;
}

export async function sendVerificationEmail(email, code) {
  const config = emailConfig();
  const startedAt = Date.now();

  console.log(JSON.stringify({
    level: 'info',
    event: 'resend_send_start',
    toDomain: email.split('@')[1],
    from: config.from
  }));

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: 'Your Guandan verification code',
      reply_to: config.replyTo,
      html: verificationHtml(code),
      text: `Your Guandan verification code is: ${code}. It expires in 10 minutes.`
    })
  });

  const data = await response.json().catch(() => ({}));

  console.log(JSON.stringify({
    level: response.ok ? 'info' : 'error',
    event: response.ok ? 'resend_send_success' : 'resend_send_failed',
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    resendId: data.id,
    resendError: data.message || data.error
  }));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Resend failed with status ${response.status}`);
  }

  return data;
}
