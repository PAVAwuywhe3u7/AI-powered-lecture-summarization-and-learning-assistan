function BrandMarkIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M4.5 12c2.12-3.62 12.88-3.62 15 0-2.12 3.62-12.88 3.62-15 0Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 4.5c3.62 2.12 3.62 12.88 0 15-3.62-2.12-3.62-12.88 0-15Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.86" fill="currentColor" />
      <path
        d="m17.9 6.1.38.9.9.38-.9.38-.38.9-.38-.9-.9-.38.9-.38.38-.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default BrandMarkIcon;
