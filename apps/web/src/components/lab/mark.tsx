/**
 * Thymelab's mark: a flask with lime liquid and a thyme leaf rising in it.
 * Same family as the agency's stopwatch (ink outline, lime, thyme green), so
 * the two read as one company with two products.
 */
export function LabMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="lab-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M12.2 3.5 H19.8" stroke="#EEF5E8" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M13.4 4 V12.2 L6.2 25.6 C5.2 27.5 6.5 29.3 8.6 29.3 H23.4 C25.5 29.3 26.8 27.5 25.8 25.6 L18.6 12.2 V4"
        fill="#16130F"
        stroke="#EEF5E8"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M9.4 20.4 H22.6 L25 25.1 C25.8 26.7 24.8 27.9 23.2 27.9 H8.8 C7.2 27.9 6.2 26.7 7 25.1 Z" fill="#D4F55A" />
      <path d="M15.9 25.6 C13.6 23.4 13.8 20.7 16 18.7 C18.2 20.7 18.4 23.4 16.1 25.6 Z" fill="#0E6B4A" stroke="#16130F" strokeWidth="0.8" />
      <circle className="lab-mark-bubble b1" cx="13.4" cy="16.5" r="1.1" fill="#D4F55A" />
      <circle className="lab-mark-bubble b2" cx="18.6" cy="14.4" r="0.8" fill="#D4F55A" />
    </svg>
  );
}
