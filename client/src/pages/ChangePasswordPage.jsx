import { useState } from "react";
import api from "../lib/api";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed successfully.");
    } catch (error) {
      setMessage(error?.response?.data?.error || "Failed to change password");
    }
  };

  return (
    <div className="card max-w-xl">
      <h1 className="text-xl font-semibold mb-3 text-slate-900">Change Password</h1>
      <form onSubmit={submit} className="space-y-4">
        <input
          className="saas-input"
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <input
          className="saas-input"
          type="password"
          placeholder="New password (min 8 chars)"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button className="btn-primary">Update Password</button>
      </form>
      {message && <p className="text-sm text-slate-700 mt-3">{message}</p>}
    </div>
  );
}
