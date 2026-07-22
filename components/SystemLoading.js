export default function SystemLoading({ label = "Loading workspace" }) {
  return <div className="system-loading" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="system-loading-head">
      <span className="system-loading-line is-kicker"/>
      <span className="system-loading-line is-title"/>
      <span className="system-loading-line is-copy"/>
    </div>
    <div className="system-loading-metrics" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <span key={index}/>) }
    </div>
    <div className="system-loading-panels" aria-hidden="true">
      <span/>
      <span/>
    </div>
  </div>;
}
