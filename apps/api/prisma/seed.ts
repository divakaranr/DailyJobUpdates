/**
 * Seeds the super admin, the default tag taxonomy, default settings and
 * (optionally) sample jobs. Idempotent — safe to run repeatedly.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, DEFAULT_TAXONOMY, generalSettingsSchema, todayYmd, type JobInput } from '@jobs/shared';
import { loadEnv } from '../src/config/env';
import { createContainer } from '../src/container';

const env = loadEnv();
const prisma = new PrismaClient();

function daysFromNow(n: number) {
  return todayYmd(addDays(new Date(), n));
}

const SAMPLE_JOBS: (Partial<JobInput> & { title: string; companyName: string; ageDays: number })[] = [
  {
    title: 'Investigation Specialist',
    companyName: 'Northwind Commerce',
    location: 'Bangalore',
    workMode: 'WFH',
    employmentType: 'FULL_TIME',
    qualification: 'Any Graduation',
    experienceText: 'Freshers / Experienced',
    isFresherFriendly: true,
    minExperience: 0,
    skills: ['Investigation', 'Analytical Skills', 'Communication'],
    summary: 'Review and investigate flagged transactions to protect customers and sellers on a large online marketplace.',
    description:
      'Northwind Commerce is hiring Investigation Specialists to join its Trust & Safety operations team. You will review account activity, investigate suspicious transactions and take action according to policy.\n\nThis is a work-from-home role with rotational shifts.',
    responsibilities: ['Investigate flagged orders and accounts', 'Document findings clearly', 'Meet quality and productivity targets'],
    applicationUrl: 'https://careers.northwind.example/jobs/investigation-specialist',
    sourceUrl: 'https://careers.northwind.example/jobs/investigation-specialist',
    ageDays: 0,
  },
  {
    title: 'Senior QA Automation Engineer',
    companyName: 'Contoso Software',
    location: 'Hyderabad',
    workMode: 'HYBRID',
    employmentType: 'FULL_TIME',
    qualification: 'B.E / B.Tech in Computer Science or related field',
    minExperience: 4,
    maxExperience: 7,
    skills: ['Selenium WebDriver', 'Java', 'Rest Assured', 'SQL', 'Jenkins'],
    preferredSkills: ['Playwright', 'TypeScript'],
    summary: 'Own test automation for a SaaS billing platform, building reliable UI and API suites.',
    description: 'Design and maintain automated UI and API test suites, integrate them into CI, and mentor junior testers.',
    responsibilities: ['Build and maintain Selenium + Rest Assured frameworks', 'Integrate tests in Jenkins pipelines', 'Review test plans'],
    salaryMin: 1800000,
    salaryMax: 2600000,
    currency: 'INR',
    salaryType: 'ANNUAL',
    applicationUrl: 'https://jobs.contoso.example/apply/qa-automation-senior',
    deadline: daysFromNow(20),
    ageDays: 1,
  },
  {
    title: 'Frontend Developer (React)',
    companyName: 'Fabrikam Labs',
    location: 'Remote (India)',
    workMode: 'REMOTE',
    employmentType: 'FULL_TIME',
    qualification: 'B.E / B.Tech, BCA or MCA',
    minExperience: 2,
    maxExperience: 4,
    skills: ['React', 'TypeScript', 'JavaScript', 'CSS'],
    preferredSkills: ['Next.js', 'Playwright'],
    summary: 'Build accessible, fast interfaces for a developer-tools product used by thousands of teams.',
    description: 'You will build product features end-to-end in React and TypeScript, working closely with design.',
    applicationUrl: 'https://fabrikam.example/careers/frontend-react',
    deadline: daysFromNow(14),
    ageDays: 1,
  },
  {
    title: 'Customer Support Associate - Voice Process',
    companyName: 'Tailspin Services',
    location: 'Chennai',
    workMode: 'ONSITE',
    employmentType: 'FULL_TIME',
    qualification: 'Any Graduation',
    isFresherFriendly: true,
    minExperience: 0,
    maxExperience: 2,
    skills: ['Communication', 'English', 'Customer Service'],
    summary: 'Handle inbound customer calls for a consumer electronics brand.',
    description: 'Walk-in interviews for freshers and experienced candidates. Rotational shifts, cab facility provided.',
    walkInDate: daysFromNow(5),
    applicationUrl: 'https://tailspin.example/walkin',
    openings: 50,
    ageDays: 2,
  },
  {
    title: 'Data Engineer',
    companyName: 'Litware Analytics',
    location: 'Pune',
    workMode: 'HYBRID',
    employmentType: 'FULL_TIME',
    qualification: 'B.E / B.Tech or Postgraduate',
    minExperience: 3,
    maxExperience: 6,
    skills: ['Python', 'PySpark', 'SQL', 'Airflow', 'AWS'],
    summary: 'Build and operate batch and streaming data pipelines for analytics products.',
    description: 'Design reliable ETL pipelines on AWS, model data for analytics and own data quality.',
    salaryMin: 1500000,
    salaryMax: 2400000,
    currency: 'INR',
    salaryType: 'ANNUAL',
    applicationUrl: 'https://litware.example/jobs/data-engineer',
    ageDays: 3,
  },
  {
    title: 'Machine Learning Engineer',
    companyName: 'Adatum AI',
    location: 'Bangalore',
    workMode: 'ONSITE',
    employmentType: 'FULL_TIME',
    qualification: 'Postgraduate in Computer Science, Statistics or related field',
    minExperience: 2,
    maxExperience: 5,
    skills: ['Python', 'PyTorch', 'Machine Learning', 'NLP'],
    preferredSkills: ['Docker', 'Kubernetes'],
    summary: 'Train and deploy NLP models powering document understanding.',
    description: 'Work on model training, evaluation and production deployment for NLP workloads.',
    applicationUrl: 'https://adatum.example/careers/ml-engineer',
    ageDays: 4,
  },
  {
    title: 'DevOps Engineer',
    companyName: 'Proseware Cloud',
    location: 'Noida',
    workMode: 'HYBRID',
    employmentType: 'CONTRACT',
    qualification: 'B.E / B.Tech',
    minExperience: 5,
    maxExperience: 9,
    skills: ['Kubernetes', 'Terraform', 'AWS', 'Jenkins', 'Docker'],
    summary: '12-month contract to modernise CI/CD and infrastructure-as-code.',
    description: 'Migrate legacy deployments to Kubernetes, codify infrastructure with Terraform and improve observability.',
    applicationUrl: 'https://proseware.example/jobs/devops-contract',
    ageDays: 5,
  },
  {
    title: 'Software Engineering Intern',
    companyName: 'Fabrikam Labs',
    location: 'Bangalore',
    workMode: 'ONSITE',
    employmentType: 'INTERNSHIP',
    qualification: 'B.E / B.Tech students graduating in 2027',
    isFresherFriendly: true,
    skills: ['Java', 'Data Structures', 'Problem Solving'],
    summary: 'Six-month internship working on backend services.',
    description: 'Interns work with a mentor on production backend services in Java.',
    salaryMin: 40000,
    salaryMax: 40000,
    currency: 'INR',
    salaryType: 'MONTHLY',
    applicationUrl: 'https://fabrikam.example/careers/intern-2027',
    deadline: daysFromNow(10),
    ageDays: 6,
  },
  {
    title: 'Business Analyst',
    companyName: 'Woodgrove Bank',
    location: 'Mumbai',
    workMode: 'ONSITE',
    employmentType: 'FULL_TIME',
    qualification: 'MBA',
    minExperience: 2,
    maxExperience: 5,
    skills: ['Requirements Gathering', 'SQL', 'MS Excel', 'Stakeholder Management'],
    summary: 'Translate business needs into requirements for retail banking platforms.',
    description: 'Work with product and engineering to define requirements and acceptance criteria.',
    applicationUrl: 'https://woodgrove.example/careers/ba',
    ageDays: 8,
  },
  {
    title: 'Manual Tester',
    companyName: 'Contoso Software',
    location: 'Kochi',
    workMode: 'WFH',
    employmentType: 'PART_TIME',
    qualification: 'Any Graduation',
    minExperience: 0,
    maxExperience: 1,
    isFresherFriendly: true,
    skills: ['Manual Testing', 'Test Case Design', 'JIRA'],
    summary: 'Part-time functional and regression testing for a mobile app.',
    description: 'Execute test cases, log defects and verify fixes.',
    applicationUrl: 'https://jobs.contoso.example/apply/manual-tester',
    ageDays: 9,
  },
  {
    title: 'Accounts Executive',
    companyName: 'Wide World Importers',
    location: 'Delhi',
    workMode: 'ONSITE',
    employmentType: 'FULL_TIME',
    qualification: 'B.Com / M.Com',
    minExperience: 1,
    maxExperience: 3,
    skills: ['Tally', 'GST', 'Accounts Payable', 'MS Excel'],
    summary: 'Manage day-to-day accounting for an import business.',
    description: 'Handle bookkeeping, vendor payments and GST filings.',
    applicationUrl: 'https://wwi.example/careers/accounts',
    ageDays: 12,
  },
  {
    title: 'Node.js Backend Developer',
    companyName: 'Lucerne Publishing',
    location: 'Gurgaon',
    workMode: 'HYBRID',
    employmentType: 'FULL_TIME',
    qualification: 'B.E / B.Tech or MCA',
    minExperience: 1,
    maxExperience: 3,
    skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'REST APIs'],
    summary: 'Build APIs for a digital publishing platform.',
    description: 'Develop and maintain Node.js services and PostgreSQL schemas.',
    applicationUrl: 'https://lucerne.example/jobs/node-backend',
    deadline: daysFromNow(-3),
    ageDays: 20,
  },
];

async function main() {
  console.log('Seeding database…');

  // Super admin
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 11) },
    update: {},
  });
  console.log(`  ✓ super admin ${email}`);

  // Taxonomy
  for (const t of DEFAULT_TAXONOMY) {
    await prisma.tag.upsert({
      where: { category_slug: { category: t.category, slug: t.slug } },
      create: { name: t.name, slug: t.slug, category: t.category, synonyms: t.synonyms, isSystem: true },
      update: { isSystem: true },
    });
  }
  console.log(`  ✓ ${DEFAULT_TAXONOMY.length} taxonomy tags`);

  // Settings
  const existingGeneral = await prisma.setting.findUnique({ where: { key: 'general' } });
  if (!existingGeneral) {
    await prisma.setting.create({ data: { key: 'general', value: generalSettingsSchema.parse({}) } });
  }

  if (env.SEED_SAMPLE_DATA && (await prisma.job.count()) === 0) {
    const container = createContainer(env, prisma);
    const actor = { id: admin.id, role: 'SUPER_ADMIN' as const };
    for (const sample of SAMPLE_JOBS) {
      const { ageDays, ...rest } = sample;
      const job = await container.jobs.create(
        { skills: [], preferredSkills: [], responsibilities: [], tagIds: [], isFresherFriendly: false, autoTag: true, confirmDuplicate: true, action: 'publish', ...rest } as JobInput,
        actor,
      );
      const publishedAt = addDays(new Date(), -ageDays);
      await prisma.job.update({ where: { id: job.id }, data: { publishedAt, createdAt: publishedAt } });
    }
    await container.maintenance.run();
    await container.close();
    console.log(`  ✓ ${SAMPLE_JOBS.length} sample jobs`);
  }
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
