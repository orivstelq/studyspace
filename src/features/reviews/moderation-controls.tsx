"use client";

import { useActionState } from "react";
import { moderateContent } from "./actions";

export function ModerationControl({ id, intent, label }: { id: string; intent: "approve-review" | "reject-review" | "hide-review" | "resolve-report"; label: string }) {
    const [message, action, pending] = useActionState(moderateContent, null);
    return (
        <form action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="intent" value={intent} />
            <button type="submit" disabled={pending} className="min-h-11 rounded-lg border border-harbor px-4 py-2 text-sm font-semibold text-harbor disabled:opacity-60">
                {pending ? "Updating…" : label}
            </button>
            {message && <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>}
        </form>
    );
}
