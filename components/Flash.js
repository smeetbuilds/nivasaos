export default function Flash({ searchParams }) {
  const success = searchParams?.success;
  const error = searchParams?.error;
  if (!success && !error) return null;
  return <div className={`flash ${error ? "flash-error" : "flash-success"}`}>{error || success}</div>;
}
