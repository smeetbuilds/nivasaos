import Link from "next/link";
export default function NotFound(){return <main className="fatal-state"><div><span>404</span><h1>That page does not exist.</h1><p>The link may be outdated or the record may no longer be available to your account.</p><Link className="button primary" href="/dashboard">Return to overview</Link></div></main>}
