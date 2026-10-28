"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STATUS_COLORS = {
  ACTIVE: "bg-blue-100 text-blue-800",
  MASTERED: "bg-green-100 text-green-800",
  ON_HOLD: "bg-yellow-100 text-yellow-800",
  ARCHIVED: "bg-gray-100 text-gray-800",
};

export function ParentTrainingGoalsTab({ clientId }: { clientId: string }) {
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<ParentTrainingGoal | null>(
    null
  );
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    goal: "",
    skillArea: "",
    status: "ACTIVE",
    startDate: "",
    notes: "",
  });

  const queryClient = useQueryClient();

  // Fetch parent training goals
  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["parentTrainingGoals", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/parent-training-goals`);
      if (!res.ok) throw new Error("Failed to fetch goals");
      return res.json();
    },
  });

  // Create goal
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/clients/${clientId}/parent-training-goals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );
      if (!res.ok) throw new Error("Failed to create goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["parentTrainingGoals", clientId],
      });
      resetForm();
      setIsAddingGoal(false);
      toast.success("Parent training goal added");
    },
    onError: (error) => {
      toast.error("Failed to add goal");
      console.error(error);
    },
  });

  // Update goal
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingGoal) throw new Error("No goal to update");
      const res = await fetch(`/api/parent-training-goals/${editingGoal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to update goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["parentTrainingGoals", clientId],
      });
      resetForm();
      setEditingGoal(null);
      toast.success("Parent training goal updated");
    },
    onError: (error) => {
      toast.error("Failed to update goal");
      console.error(error);
    },
  });

  // Delete goal
  const deleteMutation = useMutation({
    mutationFn: async (goalId: string) => {
      const res = await fetch(`/api/parent-training-goals/${goalId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete goal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["parentTrainingGoals", clientId],
      });
      setDeleteGoalId(null);
      toast.success("Parent training goal deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete goal");
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      goal: "",
      skillArea: "",
      status: "ACTIVE",
      startDate: "",
      notes: "",
    });
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

  const handleSave = async () => {
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

  if (isLoading) {
    return <div className="p-4">Loading parent training goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Parent Training Goals</h3>
          <p className="text-sm text-gray-600 mt-1">
            Objectives for parents/caregivers to learn and practice
          </p>
        </div>
        <Button onClick={handleAdd} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Add Goal
        </Button>
      </div>

      {/* Add/Edit Form */}
      {isAddingGoal && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingGoal ? "Edit Parent Training Goal" : "New Parent Training Goal"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Goal *
              </label>
              <Textarea
                value={formData.goal}
                onChange={(e) =>
                  setFormData({ ...formData, goal: e.target.value })
                }
                placeholder="E.g., Parent will deliver clear instructions with 5-second processing time"
                className="min-h-24"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Skill Area
                </label>
                <Select
                  value={formData.skillArea}
                  onValueChange={(value) =>
                    setFormData({ ...formData, skillArea: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select skill area" />
                  </SelectTrigger>
                  <SelectContent>
                    {SKILL_AREAS.map((area) => (
                      <SelectItem key={area} value={area}>
                        {area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="MASTERED">Mastered</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Start Date
              </label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Additional context or recommendations"
                className="min-h-20"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingGoal ? "Update" : "Add"}
              </Button>
              <Button
                onClick={() => {
                  setIsAddingGoal(false);
                  resetForm();
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Goals by Skill Area */}
      {Object.keys(groupedGoals).length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No parent training goals yet</p>
          <p className="text-sm mt-1">Add one using the button above</p>
        </div>
      ) : (
        Object.entries(groupedGoals).map(([skillArea, goalsInArea]) => (
          <div key={skillArea}>
            <h4 className="font-semibold text-sm text-gray-700 mb-3">
              {skillArea}
            </h4>
            <div className="space-y-2">
              {goalsInArea.map((goal) => (
                <Card key={goal.id} className="hover:shadow-sm transition">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {goal.goal}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <Badge
                            className={STATUS_COLORS[goal.status]}
                            variant="secondary"
                          >
                            {goal.status === "ON_HOLD" ? "On Hold" : goal.status}
                          </Badge>
                          {goal.startDate && (
                            <span className="text-xs text-gray-500">
                              Started{" "}
                              {new Date(goal.startDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {goal.notes && (
                          <p className="text-xs text-gray-600 mt-2">
                            {goal.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleEdit(goal)}
                          size="sm"
                          variant="ghost"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => setDeleteGoalId(goal.id)}
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGoalId} onOpenChange={() => setDeleteGoalId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Parent Training Goal?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteGoalId && deleteMutation.mutate(deleteGoalId)
              }
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
