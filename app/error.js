"use client";

export default function ErrorPage({ reset }) {
  return <div className="fatal-state"><div><span>Something needs attention</span><h1>The request could not be completed.</h1><p>Review the entered values and your property access, then try again. No successful financial transaction is rolled back silently.</p><div><button className="button primary" onClick={() => reset()}>Try again</button><button className="button secondary" onClick={() => history.back()}>Go back</button></div></div></div>;
}
