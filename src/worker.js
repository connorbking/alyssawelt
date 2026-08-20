const TO_EMAIL = "alyassa@alyssawelt.com";
const FROM_EMAIL = "noreply@alyssawelt.com";
const FROM_NAME = "Alyssa Welt Website";

const LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  message: 5000,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405);
      }
      return handleContact(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  let fields;
  try {
    fields = await readFields(request);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (isBot(fields)) {
    return json({ ok: true });
  }

  const name = clean(fields.name, LIMITS.name);
  const email = clean(fields.email, LIMITS.email).toLowerCase();
  const company = clean(fields.company, LIMITS.company);
  const message = String(fields.message || "").replace(/\r\n/g, "\n").trim().slice(0, LIMITS.message);

  if (!name || !email || !company || !message) {
    return json({ error: "Please complete all fields." }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return json({ error: "Please enter a valid email." }, 400);
  }

  try {
    await sendMail(env, { name, email, company, message });
  } catch (err) {
    console.error("contact email failed", err);
    return json({ error: "Unable to send right now." }, 502);
  }

  return json({ ok: true });
}

async function sendMail(env, { name, email, company, message }) {
  const accountId = env.CF_ACCOUNT_ID;
  const token = env.CF_API_TOKEN;

  if (!accountId || !token) {
    throw new Error("Missing CF_ACCOUNT_ID or CF_API_TOKEN");
  }

  const to = env.TO_EMAIL || TO_EMAIL;
  const fromEmail = env.FROM_EMAIL || FROM_EMAIL;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        from: { name: FROM_NAME, email: fromEmail },
        replyTo: { name, email },
        subject: `Website inquiry from ${name} (${company})`,
        text: buildText({ name, email, company, message }),
        html: buildHtml({ name, email, company, message }),
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    console.error("cloudflare email api", response.status, payload);
    throw new Error("Email API rejected the send");
  }
}

async function readFields(request) {
  const type = request.headers.get("content-type") || "";

  if (type.includes("application/json")) {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  }

  const form = await request.formData();
  return Object.fromEntries(form.entries());
}

function isBot(fields) {
  const trap = String(fields.website || fields._gotcha || "").trim();
  return trap.length > 0;
}

function clean(value, max) {
  return String(value || "")
    .replace(/[\r\n\u0000]+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildText({ name, email, company, message }) {
  return [
    "New inquiry from alyssawelt.com",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company}`,
    "",
    message,
  ].join("\n");
}

function buildHtml({ name, email, company, message }) {
  const rows = [
    ["Name", name],
    ["Email", email],
    ["Company", company],
  ]
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:6px 16px 6px 0;color:#5b6b80;white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:6px 0;color:#0c1d33;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f5f8fb;font-family:'Source Sans 3',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #d3deec;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#3d5a80;">Alyssa Welt Consulting</p>
      <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#0c1d33;">New website inquiry</h1>
      <table style="width:100%;border-collapse:collapse;font-size:15px;">${rows}</table>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8eef5;color:#0c1d33;font-size:15px;white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>
  </body>
</html>`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
