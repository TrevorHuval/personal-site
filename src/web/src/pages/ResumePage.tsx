import { profile, resume, skills } from '../content'
import ResumeAction from '../components/ResumeAction'
import { RESUME_PDF } from '../components/ResumeDialog'
import SkillsGrid from '../components/SkillsGrid'
import Timeline from '../components/Timeline'
import { DownloadIcon } from '../components/Icons'
import { ActionLink, Section } from '../components/Ui'
import { formatRange } from '../lib/dates'
import { usePageMeta } from '../lib/usePageMeta'

/**
 * The résumé as a web page, with the PDF one click away for anyone who needs to
 * forward or print it. The HTML version is the primary artefact — it is what
 * gets read, linked and indexed.
 */
export default function ResumePage() {
  usePageMeta({
    title: 'Resume',
    description: 'Work experience, education and skills, with the printable PDF a click away.',
  })

  return (
    <div className="flex flex-col gap-16">
      <ResumeHeader />

      <Section eyebrow="Experience" title="Work" className="editorial-section">
        <Timeline entries={resume.experience} />
      </Section>

      <Section eyebrow="Education" title="Study" className="editorial-section">
        <ul className="flex flex-col gap-4">
          {resume.education.map((entry) => (
            <li
              key={`${entry.institution}-${entry.startDate}`}
              className="resume-sheet flex flex-col gap-1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-base font-semibold text-ink">{entry.institution}</h3>
                <p className="gutter-date">{formatRange(entry.startDate, entry.endDate)}</p>
              </div>
              <p className="text-[0.9375rem] text-[var(--text-secondary)]">
                {entry.degree}
                {entry.field && `, ${entry.field}`}
              </p>
              {entry.notes && <p className="mt-1 text-[0.9375rem] text-[var(--text-secondary)]">{entry.notes}</p>}
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="Toolkit" title="Skills" className="editorial-section">
        <SkillsGrid groups={skills} />
      </Section>
    </div>
  )
}

function ResumeHeader() {
  return (
    <header className="page-heading">
      <p className="gutter-date">Resume</p>

      <h1>{profile.name}</h1>
      <p className="max-w-[48ch] text-base text-[var(--text-secondary)]">{profile.headline}</p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Trevor's real PDF, served straight out of the web root. It is also the
            only place on the site his email and phone number appear. */}
        <ResumeAction variant="primary">View PDF</ResumeAction>
        <ActionLink href={RESUME_PDF} download>
          <DownloadIcon className="size-4" />
          Download
        </ActionLink>
        <ActionLink href={profile.links.linkedIn} external>
          LinkedIn
        </ActionLink>
      </div>
    </header>
  )
}
