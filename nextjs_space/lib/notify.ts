/** Envio de e-mails transacionais pela API de notificações. Falhas nunca derrubam o fluxo principal. */

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function emailLayout(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55;color:#1f2937">${escapeHtml(p)}</p>`).join('')
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.url)}" style="background:#1e3a5f;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p><p style="font-size:12px;color:#6b7280;word-break:break-all">Se o botão não funcionar, copie este endereço: ${escapeHtml(cta.url)}</p>`
    : ''
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2 style="color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin:0 0 18px">${escapeHtml(title)}</h2>${body}${button}<p style="font-size:12px;color:#6b7280;margin-top:28px">VotoAudit — auditoria cidadã independente e apartidária das eleições de 2026.</p></div>`
}

export async function sendUserEmail(notificationId: string | undefined, to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (!notificationId || !process.env.ABACUSAI_API_KEY || !to) {
      console.warn('E-mail não enviado: configuração de notificação ausente.')
      return false
    }
    const base = appBaseUrl()
    const host = base ? new URL(base).hostname : 'votoaudit.abacusai.app'
    const res = await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}` },
      body: JSON.stringify({
        app_id: process.env.WEB_APP_ID,
        notification_id: notificationId,
        subject,
        body: html,
        is_html: true,
        recipient_email: to,
        sender_email: `noreply@${host}`,
        sender_alias: 'VotoAudit',
      }),
    })
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; notification_disabled?: boolean; message?: string }
    if (!j?.success) {
      if (!j?.notification_disabled) console.error('Falha ao enviar e-mail', j?.message)
      return false
    }
    return true
  } catch (e) {
    console.error('Erro ao enviar e-mail', e)
    return false
  }
}
