
import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-harbor">
            Make room for focus
          </p>

          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-6xl">
            A place for every kind of focus.
          </h1>

          <p className="mt-6 max-w-lg text-lg leading-8 text-muted">
            The right environment can change how you work.
            StudySpace helps you find places worth settling into.
          </p>

          <div className="mt-9">
            <Link
              href="/explore"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-harbor px-6 py-3 font-semibold text-white transition-colors hover:bg-ink"
            >
              Explore study spaces
              <span aria-hidden="true" className="ml-3">
                →
              </span>
            </Link>
          </div>
        </div>

        <div className="relative rounded-2xl bg-linen p-6 sm:p-10">
          <div className="rounded-xl border border-clay bg-paper p-7 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-harbor">
              Find your fit
            </p>

            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              What matters when you study?
            </h2>

            <div className="mt-7 flex flex-wrap gap-3">
              {[
                "A quiet corner",
                "Reliable Wi-Fi",
                "Room to collaborate",
                "Power outlets",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-clay bg-white px-4 py-2 text-sm text-ink"
                >
                  {item}
                </span>
              ))}
            </div>

            <p className="mt-8 border-t border-clay pt-5 text-sm leading-6 text-muted">
              Different spaces work for different people.
              Start with what matters to you.
            </p>
          </div>

          <div
            aria-hidden="true"
            className="absolute -bottom-3 -left-3 h-16 w-16 rounded-xl bg-coastal/40"
          />
        </div>
      </section>

      <section className="border-t border-clay/70 bg-linen/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Less searching. More studying.
            </h2>
            <p className="mt-2 text-sm text-muted">
              Explore spaces with the details you need to decide.
            </p>
          </div>

          <Link
            href="/explore"
            className="text-sm font-semibold text-harbor underline-offset-4 hover:underline"
          >
            Browse spaces →
          </Link>
        </div>
      </section>
    </main>
  );
}
