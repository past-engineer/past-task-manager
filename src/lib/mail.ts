// メール通知（Resend）
// - RESEND_API_KEY / MAIL_FROM が未設定なら何もしない（アプリ内通知のみで動作）
// - 既存の Resend アカウントに影響を与えないよう、このアプリ専用の API キーを
//   発行して設定する想定（キー単位で失効・管理が独立する）
// - SDK は使わず REST API を直接叩く（依存追加なし）

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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

/** メール送信（失敗しても本処理は止めない） */
export async function sendMail(entry: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) return; // 未設定ならスキップ

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
      console.error("[mail] send failed", res.status, await res.text());
    }
  } catch (e) {
    console.error("[mail]", e);
  }
}
