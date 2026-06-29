import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    tagline: z.string(),
    // Short categorical bucket powering the index filter.
    category: z.enum(['software', 'product', 'engineering']),
    // Monospace type-code shown in the index (WEB / HW / MECH / SIM / IND ...).
    type: z.string(),
    year: z.string(),
    role: z.string().optional(),
    discipline: z.string().optional(),
    tools: z.string().optional(),
    collaborators: z.array(z.string()).default([]),
    // Short skill tags rendered as animated pills. A bare string is a "tech"
    // skill; use { name, kind: 'biz' } for non-technical ones (strategy,
    // research, marketing…) — they're coloured with the complementary accent.
    skills: z
      .array(
        z.union([
          z.string(),
          z.object({
            name: z.string(),
            kind: z.enum(['tech', 'biz']).default('tech'),
          }),
        ]),
      )
      .default([]),
    status: z.string().optional(),
    // Public-path images (served from /public/images).
    hero: z.string().optional(),
    // True when the hero is a product shot on a white/light background; the
    // hero + index preview then get a radial fade so the white blends into the
    // dark theme instead of reading as a hard white box.
    heroLight: z.boolean().default(false),
    gallery: z
      .array(z.object({ src: z.string(), caption: z.string().optional() }))
      .default([]),
    // Optional scroll/drag-driven image sequence (e.g. a rotating render).
    sequence: z
      .object({
        dir: z.string(), // public dir, e.g. "/guibe-sq"
        count: z.number(),
        pad: z.number().default(4), // zero-pad width of the frame number
        ext: z.string().default('jpg'),
      })
      .optional(),
    featured: z.boolean().default(false),
    isNew: z.boolean().default(false),
    draft: z.boolean().default(false),
    // Lower sorts first in the index.
    order: z.number().default(100),
  }),
});

export const collections = { projects };
