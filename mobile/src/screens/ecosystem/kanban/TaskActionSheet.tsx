import React, { useEffect, useState } from "react";
import { View } from "react-native";
import type { NanobotSession } from "../../../core/session";
import { validateReviewFeedback, type KanbanTask } from "../../../ecosystem/kanban";
import { useT } from "../../../i18n";
import { Button, Sheet, TextField } from "../../../ui/components";
import { quickActions, runQuickAction, type QuickAction } from "./taskActions";
import { toastKanbanError } from "./TaskEditorSheet";

const LABEL_KEYS: Record<QuickAction, string> = {
  startNow: "kanban.action.startNow",
  approve: "kanban.approve",
  sendBack: "kanban.action.sendBack",
  done: "kanban.action.markDone",
  block: "kanban.action.block",
};

/** The long-press menu of a card: the moves that fit its status, without opening the editor. */
export function TaskActionSheet({
  task,
  boardId,
  session,
  onClose,
  onChanged,
}: {
  task: KanbanTask | null;
  boardId: string;
  session: NanobotSession;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setSendingBack(false);
    setFeedback("");
  }, [task?.id]);

  const close = () => {
    if (!busy) onClose();
  };

  const run = async (action: QuickAction) => {
    if (!task || busy) return;
    setBusy(true);
    try {
      await runQuickAction(session, boardId, task, action, feedback.trim());
      onClose();
      await onChanged();
    } catch (error) {
      toastKanbanError(t, error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!task} onClose={close} title={task?.title}>
      {task && sendingBack ? (
        <View style={{ gap: 8 }}>
          <TextField label={t("kanban.feedback")} value={feedback} onChangeText={setFeedback} />
          <Button
            title={t(LABEL_KEYS.sendBack)}
            onPress={() => void run("sendBack")}
            loading={busy}
            disabled={!validateReviewFeedback(feedback)}
          />
          <Button title={t("common.cancel")} variant="ghost" onPress={() => setSendingBack(false)} disabled={busy} />
        </View>
      ) : task ? (
        <View style={{ gap: 8 }}>
          {quickActions(task).map((action) => (
            <Button
              key={action}
              title={t(LABEL_KEYS[action])}
              variant={action === "startNow" || action === "approve" ? "primary" : "secondary"}
              loading={busy}
              onPress={() => (action === "sendBack" ? setSendingBack(true) : void run(action))}
            />
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
