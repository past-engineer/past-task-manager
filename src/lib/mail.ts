// メール通知（Resend）
// - RESEND_API_KEY / MAIL_FROM が未設定なら送信をスキップし、その旨を結果で返す
// - 既存の Resend アカウントに影響を与えないよう、このアプリ専用の API キーを
//   発行して設定する想定（キー単位で失効・管理が独立する）
// - SDK は使わず REST API を直接叩く（依存追加なし）

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type MailSendResult =
  | { sent: true }
  | { sent: false; skipped?: string; error?: string };

export function appUrl(path: string): string | null {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${path}`;
}

/** メール送信。結果（成功／スキップ理由／エラー内容）を返す */
export async function sendMail(entry: {
  to: string;
  subject: string;
  text: string;
}): Promise<MailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey) return { sent: false, skipped: "RESEND_API_KEY が未設定" };
  if (!from) return { sent: false, skipped: "MAIL_FROM が未設定" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [entry.to],
        subject: entry.subject,
        text: entry.text,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(text) as { message?: string; name?: string };
        if (j.message) message += `: ${j.message}`;
        else if (text) message += `: ${text.slice(0, 200)}`;
      } catch {
        if (text) message += `: ${text.slice(0, 200)}`;
      }
      console.error("[mail] send failed", message);
      return { sent: false, error: message };
    }
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラー";
    console.error("[mail]", e);
    return { sent: false, error: message };
  }
}
