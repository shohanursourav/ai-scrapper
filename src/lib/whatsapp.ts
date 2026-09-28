import { isFound } from "./types";

/** Digits-only international number for wa.me. US 10-digit numbers get the +1 country code. */
export function whatsappNumber(phone: string): string | null {
  if (!isFound(phone)) return null;
  let d = phone.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

/** https://faq.whatsapp.com/5913398998672934 : wa.me/<number>?text=<urlencoded message> */
export function whatsappLink(phone: string, message: string): string | null {
  const n = whatsappNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

/** Plain-text version of an email body for WhatsApp (drops the sign-off block's agency line spacing). */
export function emailToWhatsapp(body: string): string {
  return body.replace(/\n{3,}/g, "\n\n").trim();
}
