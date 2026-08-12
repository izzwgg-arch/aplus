export default function IntakeFormPage() {
  const download = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
    window.open(`${apiBase}/intake/pdf`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="card max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-900">Intake Form</h1>
      <p className="mb-4 mt-2 text-sm text-slate-600">Download the clinic intake form PDF for new clients.</p>
      <button className="btn-primary" onClick={download}>
        Download intake form
      </button>
    </div>
  );
}
