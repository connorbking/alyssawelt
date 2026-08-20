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

    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      return json({ error: "Contact form is not configured yet." }, 503);
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

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${fromEmail}>`,
        to: [to],
        reply_to: email,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error("resend failed", response.status, body);
      const detail = typeof body.message === "string" ? body.message : "";
      if (detail.toLowerCase().includes("not verified")) {
        return json({ error: "Sending domain is not verified in Resend yet." }, 502);
      }
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
