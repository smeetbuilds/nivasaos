export default function Flash({ searchParams }) {
  const success = searchParams?.success;
  const error = searchParams?.error;
  if (!success && !error) return null;
  return <div className={`flash ${error ? "flash-error" : "flash-success"}`} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>{error || success}</div>;
}
