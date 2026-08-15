import { ResourceTimeline } from "./ResourceTimeline";

export function App() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p>TIME / SYSTEMS LAB 020</p>
        <span>VIRTUAL SURFACE · SSR GEOMETRY · LOGICAL AXES</span>
      </header>
      <ResourceTimeline />
      <footer className="page-footer">
        <span>TanStack Virtual 3</span>
        <span>500 × 336 logical cells</span>
        <span>2× placement grid</span>
      </footer>
    </main>
  );
}
