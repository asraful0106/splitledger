import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "./Button";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="update-prompt" role="status">
      <span>New version available.</span>
      <Button variant="ghost" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  );
}
