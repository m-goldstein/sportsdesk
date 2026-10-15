"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="boot">
      <h1>The desk couldn’t load.</h1>
      <p>Try reconnecting to the sports feeds.</p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
