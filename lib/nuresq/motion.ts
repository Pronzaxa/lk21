export const motionDuration = {
  fast: 0.12,
  normal: 0.2,
  medium: 0.3,
  slow: 0.5,
} as const;

export const motionEase = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const tactileSpring = {
  type: "spring" as const,
  stiffness: 440,
  damping: 32,
  mass: 0.72,
};

