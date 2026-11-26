import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <p className="font-bold text-fg">
            Daily<span className="text-brand">Job</span>Updates
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Verified job openings collected from across the web, reviewed by our editors and published daily. Every listing links back to its original source.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-fg">Browse</span>
            <Link href="/search?experience=freshers" className="text-muted hover:text-fg">Fresher jobs</Link>
            <Link href="/search?workMode=WFH,REMOTE" className="text-muted hover:text-fg">Remote & WFH</Link>
            <Link href="/search?employmentType=INTERNSHIP" className="text-muted hover:text-fg">Internships</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-fg">Account</span>
            <Link href="/saved" className="text-muted hover:text-fg">Saved jobs</Link>
            <Link href="/login" className="text-muted hover:text-fg">Sign in</Link>
            <Link href="/register" className="text-muted hover:text-fg">Create account</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-subtle">
        Job details belong to their respective employers. Always apply through the original link. © {new Date().getFullYear()} DailyJobUpdates
      </div>
    </footer>
  );
}
