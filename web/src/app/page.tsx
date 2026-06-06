// Phase 00 placeholder home/catalog route — renders the shell in a "powered up"
// empty state. Real catalog grid (F-001) lands in Phase 02a.
export default function Home() {
  return (
    <section className="animate-powerOn">
      {/* Roster header — bolt-down sheet with decorative corner screw holes */}
      <div className="mb-8 border-b-8 border-ind-black pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-ind-white p-6 shadow-heavy relative">
        <span
          className="absolute top-2 left-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <span
          className="absolute top-2 right-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <span
          className="absolute bottom-2 left-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />
        <span
          className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-ind-concrete border-2 border-ind-black"
          aria-hidden="true"
        />

        <div className="pl-4">
          <h1 className="font-heading text-5xl font-bold text-ind-black tracking-wide uppercase m-0 leading-none">
            Equipment Roster
          </h1>
          <p className="font-mono text-ind-steel mt-2 text-sm uppercase font-bold tracking-widest">
            &gt;&gt;&gt; Yard online — fleet wiring in progress
          </p>
        </div>
      </div>

      {/* Powered-up empty state */}
      <div className="card-ind p-10 md:p-16 flex flex-col items-center text-center gap-6">
        <svg
          width="72"
          height="72"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-ind-black animate-[spin_10s_linear_infinite]"
          aria-hidden="true"
        >
          <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
        </svg>
        <h2 className="font-heading text-4xl uppercase tracking-wide">System Powered On</h2>
        <p className="font-body text-lg max-w-xl text-ind-black/80">
          The Eastern Rentals foundation is live. Theme, fonts, and app shell are wired. The
          equipment catalog, availability calendar, and reservation flow deploy in later phases.
        </p>
        <button type="button" className="btn-primary">
          Authorize Deployment
        </button>
      </div>
    </section>
  );
}
