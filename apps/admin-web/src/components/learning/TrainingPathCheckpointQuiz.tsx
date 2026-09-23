import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { AdminPanel } from "@/components/ui/AdminPanel";
import type { KbCheckpointQuestion } from "@/lib/learning";
import { adminToast } from "@/lib/adminToast";

type Props = {
  pathSlug: string;
  questions: KbCheckpointQuestion[];
  disabled?: boolean;
  onCompleted?: () => void;
};

export function TrainingPathCheckpointQuiz({ pathSlug, questions, disabled, onCompleted }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () =>
      adminApi.postJson<{
        passed: boolean;
        failed_question_ids: string[];
        completed_at: string | null;
        completion_blocked_reason: string | null;
      }>("/api/admin/learning/training-progress/quiz", {
        path_slug: pathSlug,
        answers,
      }),
    onSuccess: (data) => {
      if (!data.passed) {
        setFailedIds(data.failed_question_ids);
        adminToast.error("Some answers were incorrect. Review the highlighted questions.");
        return;
      }
      setFailedIds([]);
      void qc.invalidateQueries({ queryKey: adminQueryKeys.knowledgeBase.trainingPaths() });
      if (data.completed_at) {
        adminToast.success("Path complete — great work.");
      } else if (data.completion_blocked_reason === "STEPS_INCOMPLETE") {
        adminToast.success("Quiz passed. Sign off remaining steps to finish the path.");
      } else if (data.completion_blocked_reason === "PATH_HAS_UNPUBLISHED_OR_MISSING_STEPS") {
        adminToast.success("Quiz passed. Fix unpublished or missing path steps before completion.");
      } else {
        adminToast.success("Quiz passed.");
      }
      onCompleted?.();
    },
    onError: (err: Error) => adminToast.error(err.message),
  });

  if (questions.length === 0) return null;

  return (
    <AdminPanel className="border-purple-200 bg-purple-50/50">
      <h3 className="text-sm font-semibold text-purple-900">Checkpoint quiz</h3>
      <p className="mt-1 text-xs text-purple-700">
        Answer all questions to finish this training path (after every step is signed off).
      </p>
      <ul className="mt-4 space-y-4">
        {questions.map((q) => (
          <li
            key={q.id}
            className={failedIds.includes(q.id) ? "rounded-lg ring-2 ring-red-300 p-2 -m-2" : undefined}
          >
            <p className="text-sm font-medium text-gray-900">{q.prompt}</p>
            <div className="mt-2 space-y-1.5">
              {q.choices.map((choice, idx) => (
                <label key={idx} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name={`quiz-${q.id}`}
                    disabled={disabled || submit.isPending}
                    checked={answers[q.id] === idx}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    className="h-4 w-4 border-gray-300 text-purple-600"
                  />
                  {choice}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled || submit.isPending || questions.some((q) => answers[q.id] === undefined)}
        onClick={() => submit.mutate()}
        className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
      >
        {submit.isPending ? "Submitting…" : "Submit quiz"}
      </button>
    </AdminPanel>
  );
}
