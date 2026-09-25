/**
 * The headline with one word marked, so the mascot knows where to land. The
 * mark is a plain data attribute: without the mascot it does nothing.
 */
export function Seat({ text, word }: { text: string; word: string }) {
  const at = text.indexOf(word);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span data-sprig-seat="">{word}</span>
      {text.slice(at + word.length)}
    </>
  );
}
