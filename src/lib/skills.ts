// Normalises the `skills` frontmatter (string | { name, kind }) into a single
// shape for rendering. Bare strings default to the "tech" kind.
export type Skill = { name: string; kind: 'tech' | 'biz' };

type RawSkill = string | { name: string; kind?: string };

export function normalizeSkills(raw: RawSkill[] | undefined): Skill[] {
  return (raw ?? []).map((s) =>
    typeof s === 'string'
      ? { name: s, kind: 'tech' }
      : { name: s.name, kind: s.kind === 'biz' ? 'biz' : 'tech' },
  );
}
