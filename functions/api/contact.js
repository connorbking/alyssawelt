const TO_EMAIL = "alyssa@alyssawelt.com";
const FROM_EMAIL = "no-reply@alyssawelt.com";
const FROM_NAME = "Website Contact Form";
const ACCOUNT_ID = "191b6a6ae524ccdd29763caa18587808";

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

    const token = context.env.CF_API_TOKEN;
    const accountId = context.env.CF_ACCOUNT_ID || ACCOUNT_ID;

    if (!token) {
      console.error("CF_API_TOKEN is not set");
      return json({ error: "Email is not configured." }, 500);
    }

    const to = context.env.TO_EMAIL || TO_EMAIL;
    const fromEmail = context.env.FROM_EMAIL || FROM_EMAIL;
    const subject = `New Lead from ${name} (${company || "Independent"})`;
    const text = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Company: ${company || "N/A"}`,
      "",
      "Message:",
      message,
    ].join("\n");

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
          headers: { "Reply-To": `${name} <${email}>` },
          subject,
          text,
        }),
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      console.error("cloudflare email send failed", response.status, payload);
      return json({ error: "Unable to send right now. Please email alyssa@alyssawelt.com." }, 502);
    }

    return json({ success: true, message: "Email sent successfully!" });
  } catch (err) {
    console.error("contact email failed", err);
    return json({ error: "Internal Server Error" }, 500);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
