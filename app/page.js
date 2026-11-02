import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="inner">
          <h1>Report it once. Watch it get fixed.</h1>
          <p>
            Potholes, broken footpaths, dark street lights, overflowing garbage. File a complaint with its exact
            location, see if your neighbours already reported it, and follow every step until the work is done.
          </p>
          <div className="row" style={{ marginTop: 24 }}>
            <Link href="/register" className="btn">Create a citizen account</Link>
            <Link href="/login" className="btn secondary">Log in</Link>
          </div>
        </div>
      </section>
      <div className="page">
        <h2>How a complaint moves</h2>
        <div className="steps" style={{ marginTop: 14 }}>
          <div>
            <span className="n">1</span>
            <h3>You report</h3>
            <p className="muted small">
              Describe the problem and where it is. Similar existing complaints are shown so the same pothole is not
              reported ten times.
            </p>
          </div>
          <div>
            <span className="n">2</span>
            <h3>The right team is assigned</h3>
            <p className="muted small">
              Each category belongs to a department with a fixed response time. The admin assigns the least busy
              available staff member.
            </p>
          </div>
          <div>
            <span className="n">3</span>
            <h3>Work is tracked</h3>
            <p className="muted small">
              Every status change is recorded with a note and time. Overdue complaints are flagged and escalated.
            </p>
          </div>
          <div>
            <span className="n">4</span>
            <h3>You confirm the fix</h3>
            <p className="muted small">Rate the work once it is resolved. Your feedback closes the complaint.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
