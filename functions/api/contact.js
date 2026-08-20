import { EmailMessage } from "cloudflare:email";

const TO_EMAIL = "alyssa@alyssawelt.com";
const FROM_EMAIL = "no-reply@alyssawelt.com";
const FROM_NAME = "Website Contact Form";

const LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  message: 5000,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost(context) {
  try {
    const fields = await readFields(context.request);

    if (isBot(fields)) {
      return json({ success: true });
    }

    const name = clean(fields.name, LIMITS.name);
    const email = clean(fields.email, LIMITS.email).toLowerCase();
    const company = clean(fields.company, LIMITS.company);
    const message = String(fields.message || "").replace(/\r\n/g, "\n").trim().slice(0, LIMITS.message);

    if (!name || !email || !message) {
      return json({ error: "Missing required fields" }, 400);
    }

    if (!EMAIL_RE.test(email)) {
      return json({ error: "Please enter a valid email." }, 400);
    }

    if (!context.env.EMAIL || typeof context.env.EMAIL.send !== "function") {
      console.error("EMAIL binding is missing");
      return json({ error: "Email binding is not configured." }, 500);
    }

    const to = context.env.TO_EMAIL || TO_EMAIL;
    const fromEmail = context.env.FROM_EMAIL || FROM_EMAIL;
    const subject = `New Lead from ${name} (${company || "Independent"})`;
    const text = buildText({ name, email, company, message });
    const html = buildHtml({ name, email, company, message });

    try {
      await context.env.EMAIL.send({
        from: { email: fromEmail, name: FROM_NAME },
        to,
        replyTo: { name, email },
        subject,
        text,
        html,
      });
    } catch (structuredErr) {
      console.error("structured email send failed, using MIME", structuredErr);
      const raw = buildRawMime({
        fromEmail,
        fromName: FROM_NAME,
        to,
        replyName: name,
        replyEmail: email,
        subject,
        text,
      });
      await context.env.EMAIL.send(new EmailMessage(fromEmail, to, raw));
    }

    return json({ success: true, message: "Email sent successfully!" });
  } catch (err) {
    console.error("contact email failed", err);
    return json({ error: "Unable to send right now. Please email alyssa@alyssawelt.com." }, 500);
  }
}

export async function onRequest() {
  return json({ error: "Method not allowed." }, 405);
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

function encodeHeader(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function buildRawMime({ fromEmail, fromName, to, replyName, replyEmail, subject, text }) {
  return [
    `From: ${encodeHeader(fromName)} <${fromEmail}>`,
    `To: ${to}`,
    `Reply-To: ${encodeHeader(replyName)} <${replyEmail}>`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");
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
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || "N/A"}`,
    "",
    "Message:",
    message,
  ].join("\n");
}

function buildHtml({ name, email, company, message }) {
  const rows = [
    ["Name", name],
    ["Email", email],
    ["Company", company || "N/A"],
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
