
const features = [
  {
    title: "Discover",
    description: "Find study spaces that match the way you work.",
  },
  {
    title: "Compare",
    description: "Explore noise levels, Wi-Fi, outlets, and amenities.",
  },
  {
    title: "Choose",
    description: "Make informed decisions about where to study.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <span className="text-2xl font-bold tracking-tight">
            Study<span className="text-emerald-400">Space</span>
          </span>
          <span className="text-sm text-slate-400">
            Find your focus.
          </span>
        </header>

        <section className="py-24 md:py-32">
          <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            Your space. Your productivity.
          </p>

          <h1 className="max-w-3xl text-5xl font-bold tracking-tight md:text-7xl">
            Find the perfect place to study.
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate-400">
            Discover and compare study-friendly locations based
            on the things that actually matter to you.
          </p>

          <a
            href="#features"
            className="mt-10 inline-flex rounded-xl bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Explore StudySpace
          </a>
        </section>

        <section
          id="features"
          className="grid gap-5 pb-20 md:grid-cols-3"
        >
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-7"
            >
              <h2 className="text-xl font-semibold">
                {feature.title}
              </h2>
              <p className="mt-3 leading-relaxed text-slate-400">
                {feature.description}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
