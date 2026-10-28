"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X } from "lucide-react";

interface ParentTrainingGoal {
  id: string;
  goal: string;
  skillArea?: string;
  status: "ACTIVE" | "MASTERED" | "ON_HOLD" | "ARCHIVED";
  startDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const SKILL_AREAS = [
  "Language & Communication",
  "Social/Emotional",
  "Adaptive Behavior",
  "Challenging Behavior",
  "Executive Functioning",
  "Other",
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-blue-100/50 text-blue-700",
  MASTERED: "bg-emerald-100/50 text-emerald-700",
  ON_HOLD: "bg-amber-100/50 text-amber-700",
  ARCHIVED: "bg-zinc-200/50 text-zinc-700",
};

export function ParentTrainingGoalsTab({ clientId }: { clientId: string }) {
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<ParentTrainingGoal | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    goal: "",
    skillArea: "",
    status: "ACTIVE",
    startDate: "",
    notes: "",
  });

  const queryClient = useQueryClient();

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["parentTrainingGoals", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/parent-training-goals`);
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      console.log("Creating goal with data:", formData);
      const res = await fetch(`/api/clients/${clientId}/parent-training-goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      console.log("Response status:", res.status);
      if (!res.ok) {
        const text = await res.text();
        console.error("API response body:", text);
        let error = {};
        try {
          error = JSON.parse(text);
        } catch {}
        console.error("API error:", res.status, error);
        throw new Error(error.error || "Failed to create goal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parentTrainingGoals", clientId] });
      resetForm();
      setIsAddingGoal(false);
      toast.success("Parent training goal added");
    },
    onError: (error) => {
      console.error("Create goal error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to add goal");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingGoal) throw new Error("No goal to update");
      const res = await fetch(`/api/parent-training-goals/${editingGoal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to update goal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parentTrainingGoals", clientId] });
      resetForm();
      setEditingGoal(null);
      toast.success("Parent training goal updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update goal");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await fetch(`/api/parent-training-goals/${goalId}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to delete goal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parentTrainingGoals", clientId] });
      setDeleteGoalId(null);
      toast.success("Parent training goal deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete goal");
    },
  });

  const resetForm = () => {
    setFormData({ goal: "", skillArea: "", status: "ACTIVE", startDate: "", notes: "" });
  };

  const handleAdd = () => {
    resetForm();
    setEditingGoal(null);
    setIsAddingGoal(true);
  };

  const handleEdit = (goal: ParentTrainingGoal) => {
    setEditingGoal(goal);
    setFormData({
      goal: goal.goal,
      skillArea: goal.skillArea || "",
      status: goal.status,
      startDate: goal.startDate ? goal.startDate.split("T")[0] : "",
      notes: goal.notes || "",
    });
    setIsAddingGoal(true);
  };

  const handleSave = () => {
    if (!formData.goal.trim()) {
      toast.error("Goal text is required");
      return;
    }
    if (editingGoal) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const groupedGoals: Record<string, ParentTrainingGoal[]> = {};
  goals.forEach((goal: ParentTrainingGoal) => {
    const skillArea = goal.skillArea || "Other";
    if (!groupedGoals[skillArea]) groupedGoals[skillArea] = [];
    groupedGoals[skillArea].push(goal);
  });

  if (isLoading) return <div className="p-4 text-zinc-500">Loading parent training goals...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Parent Training Goals</h3>
          <p className="text-sm text-zinc-500 mt-1">Objectives for parents/caregivers to learn and practice</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-white text-sm font-medium hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" /> Add Goal
        </button>
      </div>

      {/* Add/Edit Form */}
      {isAddingGoal && (
        <div className="glass-card rounded-2xl p-6 border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 space-y-4">
          <h4 className="font-semibold text-base">{editingGoal ? "Edit Parent Training Goal" : "New Parent Training Goal"}</h4>
          <div>
            <label className="block text-sm font-medium mb-2">Goal *</label>
            <textarea
              value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              placeholder="E.g., Parent will deliver clear instructions with 5-second processing time"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Skill Area</label>
              <select
                value={formData.skillArea}
                onChange={(e) => setFormData({ ...formData, skillArea: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
              >
                <option value="">Select skill area</option>
                {SKILL_AREAS.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
              >
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="MASTERED">Mastered</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Start Date</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional context or recommendations"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 rounded-lg bg-[var(--accent-cyan)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {editingGoal ? "Update" : "Add"}
            </button>
            <button
              onClick={() => {
                setIsAddingGoal(false);
                resetForm();
              }}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium hover:bg-zinc-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Goals by Skill Area */}
      {Object.keys(groupedGoals).length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p>No parent training goals yet</p>
          <p className="text-sm mt-1">Add one using the button above</p>
        </div>
      ) : (
        Object.entries(groupedGoals).map(([skillArea, goalsInArea]) => (
          <div key={skillArea}>
            <h4 className="font-semibold text-sm text-zinc-700 mb-3">{skillArea}</h4>
            <div className="space-y-2">
              {goalsInArea.map((goal) => (
                <div key={goal.id} className="glass-card rounded-lg p-4 hover:shadow-sm transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{goal.goal}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[goal.status]}`}>
                          {goal.status === "ON_HOLD" ? "On Hold" : goal.status}
                        </span>
                        {goal.startDate && (
                          <span className="text-xs text-zinc-500">
                            Started {new Date(goal.startDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {goal.notes && <p className="text-xs text-zinc-600 mt-2">{goal.notes}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(goal)}
                        className="p-2 hover:bg-zinc-100 rounded-lg transition"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4 text-zinc-600" />
                      </button>
                      <button
                        onClick={() => setDeleteGoalId(goal.id)}
                        className="p-2 hover:bg-red-100 rounded-lg transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Delete Confirmation Dialog */}
      {deleteGoalId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold text-base mb-2">Delete Parent Training Goal?</h3>
            <p className="text-sm text-zinc-600 mb-6">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteGoalId(null)}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium hover:bg-zinc-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteGoalId && deleteMutation.mutate(deleteGoalId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
