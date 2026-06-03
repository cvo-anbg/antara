import { FormEvent, useState } from "react";
import { askTrackQuestion } from "../api";
import type { ComparisonResult } from "../types";

interface Props {
  comparison: ComparisonResult;
  scope?: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
}

const STARTERS = [
  "Did the master lose punch?",
  "Which frequency range changed the most?",
  "Is the post version too loud?",
];

export default function TrackChat({ comparison, scope }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Ask me about this PRE vs POST comparison. I can explain loudness, punch, frequency changes, clipping, and what to check first.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followups, setFollowups] = useState(STARTERS);

  async function submitQuestion(question: string) {
    const clean = question.trim();
    if (!clean || loading) return;

    setDraft("");
    setError(null);
    setLoading(true);
    setMessages((items) => [...items, { role: "user", text: clean }]);

    try {
      const res = await askTrackQuestion(clean, comparison, scope);
      setMessages((items) => [...items, { role: "assistant", text: res.answer }]);
      setFollowups(res.followups.length ? res.followups : STARTERS);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submitQuestion(draft);
  }

  return (
    <div className="track-chat">
      <div className="section-title">Ask About This Track</div>

      <div className="chat-thread" aria-live="polite">
        {messages.map((msg, index) => (
          <div key={`${msg.role}-${index}`} className={`chat-bubble ${msg.role}`}>
            {msg.text}
          </div>
        ))}
        {loading && <div className="chat-bubble assistant">Thinking from the measured data...</div>}
      </div>

      <div className="chat-followups">
        {followups.map((item) => (
          <button key={item} type="button" onClick={() => submitQuestion(item)} disabled={loading}>
            {item}
          </button>
        ))}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a track-specific question..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !draft.trim()}>
          Ask
        </button>
      </form>

      {error && <div className="chat-error">{error}</div>}
    </div>
  );
}
