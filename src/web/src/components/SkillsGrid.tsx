import type { SkillGroup } from '../content/types'

/**
 * Skills are a scanning surface, not a reading one — a recruiter is looking for
 * one word. So the groups are tight sheet cards of chips rather than prose, and
 * the group name is the only thing at full ink.
 */
export default function SkillsGrid({ groups }: { groups: SkillGroup[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {groups.map((group) => (
        <li key={group.name} className="skill-card">
          <h3 className="card-title">{group.name}</h3>
          <ul className="chip-list mt-4">
            {group.items.map((item) => (
              <li key={item}>
                <span className="chip">{item}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
