import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wordle — Daily Word Game" },
      { name: "description", content: "A polished, mobile-first daily 5-letter word game clone. Play unlimited or daily challenges." },
      { property: "og:title", content: "Wordle — Daily Word Game" },
      { property: "og:description", content: "A polished, mobile-first daily 5-letter word game clone. Play unlimited or daily challenges." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/game/index.html"
      title="Wordle"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        border: "none",
        background: "#121213",
      }}
    />
  );
}
