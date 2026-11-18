/* Число в границах, как CSS clamp(): если min больше max, побеждает min. */
export const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
