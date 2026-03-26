export default function GlobalLoading() {
  return (
    <div className="screen-center">
      <div className="card loading-card">
        <div className="spinner" />
        <h1>Loading trace_itself</h1>
        <p className="muted">Preparing your workspace.</p>
      </div>
    </div>
  );
}
