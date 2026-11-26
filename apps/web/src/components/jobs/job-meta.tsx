import {
  EMPLOYMENT_TYPE_LABELS,
  WORK_MODE_LABELS,
  formatExperience,
  formatSalary,
  formatYmd,
  type JobDTO,
} from '@jobs/shared';
import { Briefcase, CalendarClock, GraduationCap, House, IndianRupee, MapPin, Timer, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/components/ui/primitives';
import { daysUntil } from '@/lib/utils';

export function experienceLabel(job: Pick<JobDTO, 'minExperience' | 'maxExperience' | 'isFresherFriendly' | 'experienceText'>) {
  return formatExperience(job.minExperience, job.maxExperience, job.isFresherFriendly, job.experienceText);
}

export interface MetaItem {
  key: string;
  icon: ReactNode;
  label: string;
  value: string;
}

export function jobMetaItems(job: JobDTO): MetaItem[] {
  const items: MetaItem[] = [];
  const exp = experienceLabel(job);
  if (job.location) items.push({ key: 'location', icon: <MapPin />, label: 'Location', value: job.location });
  if (exp) items.push({ key: 'experience', icon: <Briefcase />, label: 'Experience', value: exp });
  if (job.workMode) items.push({ key: 'workMode', icon: <House />, label: 'Work mode', value: WORK_MODE_LABELS[job.workMode] });
  if (job.employmentType) items.push({ key: 'type', icon: <Timer />, label: 'Employment', value: EMPLOYMENT_TYPE_LABELS[job.employmentType] });
  if (job.qualification) items.push({ key: 'qualification', icon: <GraduationCap />, label: 'Qualification', value: job.qualification });
  const salary = formatSalary(job);
  if (salary) items.push({ key: 'salary', icon: <IndianRupee />, label: 'Salary', value: salary });
  if (job.openings) items.push({ key: 'openings', icon: <Users />, label: 'Openings', value: String(job.openings) });
  if (job.walkInDate) items.push({ key: 'walkin', icon: <CalendarClock />, label: 'Walk-in', value: formatYmd(job.walkInDate)! });
  return items;
}

/** "Closes in 3 days" / "Walk-in tomorrow" / "Expired" pill. */
export function DeadlineBadge({ job }: { job: Pick<JobDTO, 'deadline' | 'walkInDate' | 'status'> }) {
  if (job.status === 'EXPIRED') return <Badge tone="danger">Expired</Badge>;
  const date = job.deadline ?? job.walkInDate;
  const days = daysUntil(date);
  if (days === null) return null;
  const prefix = job.deadline ? 'Apply by' : 'Walk-in';
  let tone: Tone = 'neutral';
  let text = `${prefix} ${formatYmd(date)}`;
  if (days < 0) {
    tone = 'danger';
    text = 'Deadline passed';
  } else if (days === 0) {
    tone = 'warning';
    text = job.deadline ? 'Closes today' : 'Walk-in today';
  } else if (days <= 3) {
    tone = 'warning';
    text = job.deadline ? `Closes in ${days} day${days > 1 ? 's' : ''}` : `Walk-in in ${days} day${days > 1 ? 's' : ''}`;
  }
  return (
    <Badge tone={tone} icon={<CalendarClock className="h-3 w-3" />}>
      {text}
    </Badge>
  );
}
