"use client";

import { useState, useTransition } from "react";
import { acceptGeoReview, keepGeoReview } from "@/app/actions";

// Two decisions, one tap each. «Usar sugerida» rewrites the listing's location
// to what the resolver proposed; «Dejar como está» closes the case and the
// sweep won't raise it again.
export function GeoReviewButtons({ id, hasSuggestion }: { id: string; hasSuggestion: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "kept" | null>(null);

  const run = (fn: (id: string) => Promise<{ error?: string }>, result: "accepted" | "kept") =>
    start(async () => {
      setError(null);
      const res = await fn(id);
      if (res.error) setError(res.error);
      else setDone(result);
    });

  if (done) {
    return (
      <span className="text-xs font-medium text-neutral-500">
        {done === "accepted" ? "Ubicación actualizada" : "Se dejó como estaba"}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasSuggestion && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(acceptGeoReview, "accepted")}
          className="rounded-full bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Usar sugerida
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(keepGeoReview, "kept")}
        className="rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        Dejar como está
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
