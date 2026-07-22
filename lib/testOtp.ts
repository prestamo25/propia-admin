// Supabase test-OTP pairs ("SMS de rescate"), managed via the Management API.
// A phone registered here makes the auth server accept its fixed code (123456)
// on the normal in-app code screen WITHOUT sending any SMS — the broker's
// signup/login flow is otherwise untouched. This is the same rescue we ran by
// hand during the Cumbre when Twilio wouldn't deliver.
//
// The whole list lives in ONE config string, so every write must be
// read-modify-write: GET current pairs, change ours, PATCH the full list back
// (and always send sms_test_otp_valid_until alongside, or the API 400s).

const PROJECT_REF = "rydwxmfhwxlafanlfoce";
const CONFIG_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

export const RESCUE_OTP = "123456";

// Permanent dev/App-Review test accounts — never shown in the rescue list,
// never removable from the dashboard.
export const CANONICAL_PAIRS = new Set([
  "521234567890",
  "521234567891",
  "521234567892",
]);

export type OtpConfig = {
  pairs: Map<string, string>; // "52<10 digits>" -> otp
  validUntil: string | null;
};

function mgmtHeaders(): HeadersInit {
  const token = process.env.SUPABASE_MGMT_TOKEN;
  if (!token) {
    throw new Error(
      "Missing SUPABASE_MGMT_TOKEN — set it in .env.local (and on the Lambda).",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function getOtpConfig(): Promise<OtpConfig> {
  const res = await fetch(CONFIG_URL, {
    headers: mgmtHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase Management API: ${res.status} ${await res.text()}`);
  }
  const cfg = (await res.json()) as {
    sms_test_otp: string | null;
    sms_test_otp_valid_until: string | null;
  };
  const pairs = new Map<string, string>();
  for (const entry of (cfg.sms_test_otp ?? "").split(",")) {
    const [phone, otp] = entry.trim().split("=");
    if (phone && otp) pairs.set(phone, otp);
  }
  return { pairs, validUntil: cfg.sms_test_otp_valid_until };
}

export async function saveOtpConfig(cfg: OtpConfig): Promise<void> {
  const body = {
    sms_test_otp: [...cfg.pairs.entries()]
      .map(([phone, otp]) => `${phone}=${otp}`)
      .join(","),
    sms_test_otp_valid_until: cfg.validUntil,
  };
  const res = await fetch(CONFIG_URL, {
    method: "PATCH",
    headers: mgmtHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase Management API: ${res.status} ${await res.text()}`);
  }
}
