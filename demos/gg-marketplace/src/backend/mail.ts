import type { KV, Mail } from './types.ts';

// The 2020 server sent real email through Gmail with nodemailer. Here
// "sending" appends to an outbox, and each account's inbox is the mail
// addressed to it.

export class Mailer {
  private items: Mail[];

  constructor(
    private kv: KV,
    private key: string,
    private onChange: () => void = () => {},
    private now: () => number = Date.now,
  ) {
    this.items = this.load();
  }

  private load(): Mail[] {
    try {
      const raw = this.kv.get(this.key);
      const parsed = raw ? (JSON.parse(raw) as Mail[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  send(to: string, subject: string, text: string): Mail {
    const mail: Mail = {
      id: `m${this.now().toString(36)}${this.items.length.toString(36)}`,
      from: 'Project GG',
      to,
      subject,
      text,
      at: this.now(),
    };
    this.items.push(mail);
    try {
      this.kv.set(this.key, JSON.stringify(this.items));
    } catch {
      // kept in memory only
    }
    this.onChange();
    return mail;
  }

  /** Newest first. */
  inbox(email: string): Mail[] {
    return this.items.filter((m) => m.to === email).reverse();
  }

  all(): Mail[] {
    return [...this.items].reverse();
  }

  reset(): void {
    this.items = [];
    this.kv.remove(this.key);
    this.onChange();
  }
}
