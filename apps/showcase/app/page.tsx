import ContractLab from "@/components/contract-lab";
import Link from "next/link";

const principles = [
  ["01", "Own the records", "Adapt application data without surrendering persistence or identity."],
  [
    "02",
    "Keep time exact",
    "Use native Temporal values and explicit half-open interval contracts.",
  ],
  [
    "03",
    "Render your system",
    "Compose headless React primitives inside the product design language.",
  ],
] as const;

export default function HomePage() {
  return (
    <main className="landing-shell">
      <nav aria-label="Primary" className="landing-nav">
        <Link aria-label="Moltenship Time home" className="brand-lockup" href="/">
          <span aria-hidden="true" className="brand-mark">
            24
          </span>
          <span>Moltenship Time</span>
        </Link>
        <div>
          <Link href="/docs">Documentation</Link>
          <a href="https://github.com/Moltenship/time">GitHub</a>
        </div>
      </nav>

      <section className="hero">
        <p className="section-kicker">Calendar infrastructure / React 19</p>
        <h1>
          Time contracts,
          <br />
          <em>not calendar chrome.</em>
        </h1>
        <p className="hero-summary">
          A typed, headless calendar engine for products that need exact time semantics and complete
          control over their interface.
        </p>
        <div className="hero-actions">
          <Link className="primary-action" href="/docs/installation">
            Start building <span aria-hidden="true">↗</span>
          </Link>
          <Link className="text-action" href="/docs/architecture">
            Read the architecture
          </Link>
        </div>
        <div aria-hidden="true" className="time-ruler">
          {Array.from({ length: 12 }, (_, hour) => (
            <span key={hour}>{String(hour * 2).padStart(2, "0")}</span>
          ))}
        </div>
      </section>

      <section aria-labelledby="principles-title" className="principles">
        <div className="section-heading">
          <p className="section-kicker">A deliberate boundary</p>
          <h2 id="principles-title">The engine does less, precisely.</h2>
        </div>
        <div className="principle-grid">
          {principles.map(([number, title, description]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <ContractLab />

      <footer className="landing-footer">
        <p>Built as a consumer of the same public package you install.</p>
        <Link href="/docs/api">Explore the API →</Link>
      </footer>
    </main>
  );
}
