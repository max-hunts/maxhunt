// Central site config — used for SEO meta, structured data, and CTAs.
export const SITE = {
  name: 'Max Hunt',
  domain: 'https://maxhunt.design',
  title: 'Max Hunt — Design Engineer & Software Developer',
  description:
    'Design & product engineer turned full-time software developer, with an enduring love for designing physical products. Selected work spanning hardware, mechatronics, and software — 2016 to present.',
  email: 'me@maxhunt.design',
  // GitHub org confirmed from the repo remote.
  github: 'https://github.com/max-hunts',
  linkedin: 'https://www.linkedin.com/in/maxim-hunt-deseng/',
  ogImage: '/og.jpg',
} as const;

// PostHog analytics. The project API key is a PUBLIC, write-only ingestion key
// (safe to ship in client code). Leave `key` empty to disable analytics entirely
// (the <Analytics> component then renders nothing). Region: US vs EU cloud.
export const ANALYTICS = {
  key: 'phc_kXWJWRraWsoKEAXTtaM86wmSqNx5HgN5KRQuM4N2RKJi',
  host: 'https://eu.i.posthog.com', // US users: 'https://us.i.posthog.com'
} as const;
