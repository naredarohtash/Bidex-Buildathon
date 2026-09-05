"use client";

interface CartoonAvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(arr: T[], n: number): T {
  return arr[Math.abs(n) % arr.length];
}

export function CartoonAvatar({ seed, size = 40, className = "" }: CartoonAvatarProps) {
  const h = hashCode(seed || "default");

  const bgColors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFE66D", "#C3B1E1", "#98FB98", "#FF8C69",
    "#87CEEB", "#F4A460", "#FF69B4", "#00CED1",
  ];
  const skinTones = ["#FDBCB4", "#F1C27D", "#E8BEAC", "#C68642", "#8D5524"];
  const hairColors = [
    "#2C1810", "#8B4513", "#DAA520", "#FF6347",
    "#4169E1", "#9370DB", "#2F4F4F", "#C41E3A",
  ];

  const bgColor   = pick(bgColors,   h);
  const skinColor = pick(skinTones,  h >> 4);
  const hairColor = pick(hairColors, h >> 8);
  const hairStyle = (h >> 12) % 4;   // 0‑3
  const mouthStyle = (h >> 16) % 3;  // 0‑2
  const hasGlasses = (h >> 20) % 5 === 0;
  const hasEar    = (h >> 24) % 2 === 0;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
    >
      {/* ── Background ── */}
      <circle cx="50" cy="50" r="50" fill={bgColor} />

      {/* ── Ears ── */}
      {hasEar && (
        <>
          <ellipse cx="29" cy="56" rx="5" ry="7" fill={skinColor} />
          <ellipse cx="71" cy="56" rx="5" ry="7" fill={skinColor} />
        </>
      )}

      {/* ── Hair ── */}
      {hairStyle === 0 && (
        // Short round top
        <ellipse cx="50" cy="27" rx="22" ry="18" fill={hairColor} />
      )}
      {hairStyle === 1 && (
        // Long with side strands
        <>
          <ellipse cx="50" cy="27" rx="22" ry="18" fill={hairColor} />
          <rect x="28" y="36" width="5" height="24" rx="3" fill={hairColor} />
          <rect x="67" y="36" width="5" height="24" rx="3" fill={hairColor} />
        </>
      )}
      {hairStyle === 2 && (
        // Curly / fluffy
        <>
          <ellipse cx="50" cy="25" rx="24" ry="16" fill={hairColor} />
          <circle cx="28" cy="30" r="8" fill={hairColor} />
          <circle cx="72" cy="30" r="8" fill={hairColor} />
          <circle cx="50" cy="18" r="6" fill={hairColor} />
        </>
      )}
      {hairStyle === 3 && (
        // Spiky
        <>
          <polygon points="50,8 44,26 50,22 56,26" fill={hairColor} />
          <polygon points="38,12 35,28 42,24 44,12" fill={hairColor} />
          <polygon points="62,12 65,28 58,24 56,12" fill={hairColor} />
          <ellipse cx="50" cy="28" rx="20" ry="12" fill={hairColor} />
        </>
      )}

      {/* ── Face ── */}
      <ellipse cx="50" cy="58" rx="20" ry="24" fill={skinColor} />

      {/* ── Eyes ── */}
      <circle cx="41" cy="53" r="5" fill="white" />
      <circle cx="59" cy="53" r="5" fill="white" />
      <circle cx="41" cy="53" r="3" fill="#222" />
      <circle cx="59" cy="53" r="3" fill="#222" />
      {/* eye shine */}
      <circle cx="42.5" cy="51.5" r="1.2" fill="white" />
      <circle cx="60.5" cy="51.5" r="1.2" fill="white" />

      {/* ── Optional Glasses ── */}
      {hasGlasses && (
        <>
          <rect x="33" y="49" width="15" height="10" rx="5" fill="none" stroke="#555" strokeWidth="2.2" />
          <rect x="52" y="49" width="15" height="10" rx="5" fill="none" stroke="#555" strokeWidth="2.2" />
          <line x1="48" y1="54" x2="52" y2="54" stroke="#555" strokeWidth="2.2" />
          <line x1="28" y1="54" x2="33" y2="54" stroke="#555" strokeWidth="2.2" />
          <line x1="67" y1="54" x2="72" y2="54" stroke="#555" strokeWidth="2.2" />
        </>
      )}

      {/* ── Blush ── */}
      <ellipse cx="36" cy="63" rx="6.5" ry="3.5" fill="#FFB3B3" opacity="0.65" />
      <ellipse cx="64" cy="63" rx="6.5" ry="3.5" fill="#FFB3B3" opacity="0.65" />

      {/* ── Mouth ── */}
      {mouthStyle === 0 && (
        // Smile
        <path d="M41 68 Q50 76 59 68" stroke="#555" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
      {mouthStyle === 1 && (
        // Open grin
        <path d="M39 67 Q50 77 61 67" stroke="#555" strokeWidth="2" fill="#FF9999" strokeLinecap="round" />
      )}
      {mouthStyle === 2 && (
        // Smirk
        <path d="M43 70 Q51 74 58 67" stroke="#555" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
