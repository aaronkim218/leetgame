export function MissionPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold">Why I built leetgame</h1>
        <p className="text-muted-foreground mb-8">
          A verbal pattern recognition drill for people preparing for coding
          interviews — no IDE, no typing, just thinking out loud.
        </p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            LeetCode tests whether you can implement. This tests whether you
            understand.
          </h2>
          <p className="mb-3 text-sm leading-relaxed">
            A verbal walkthrough takes roughly half the time of a full
            implementation — no debugging, no test cases, no environment to set
            up. Lower commitment means you can fit a problem into a lunch break
            or a commute instead of blocking out an hour at a desk.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame isn't a replacement for LeetCode. It's a complement —
            useful when you're preparing for an interview and want to drill
            recall and articulation, and just as useful for staying sharp after,
            when you want to keep the patterns fresh without the overhead of a
            full coding session.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            The gap interviews expose
          </h2>
          <p className="mb-3 text-sm leading-relaxed">
            Most people can recognize a solution when they see it. Fewer can
            explain <em>why</em> sliding window applies, <em>why</em> the
            complexity is O(n), <em>why</em> a greedy approach is correct. That
            gap is what interviews probe — and what most practice methods don't
            address.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame drills pattern recognition and articulation in isolation —
            see the problem, name the pattern, explain why it fits, walk through
            the algorithm. An AI evaluates your reasoning and pushes back when
            it's incomplete. Explaining something clearly forces you to actually
            understand it, and that understanding is exactly what interviewers
            are looking for.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">
            Practice should fit into your life
          </h2>
          <p className="mb-3 text-sm leading-relaxed">
            A coding environment needs a laptop, a quiet space, and a chunk of
            uninterrupted time. That's a high bar. Most days the conditions are
            never quite right, so you don't practice.
          </p>
          <p className="mb-3 text-sm leading-relaxed">
            leetgame works on your phone, takes a few minutes per problem, and
            fits into dead time — a commute, a lunch break, five minutes between
            meetings. Lower friction means you actually practice instead of
            waiting for the perfect conditions that never come.
          </p>
          <p className="text-sm leading-relaxed">
            No account required to start. Just open it and practice. If you do
            sign in, you get streaks, proficiency tracking, and smart practice
            that targets your weak spots — but the core experience is open to
            anyone.
          </p>
        </section>
      </div>
    </div>
  )
}
