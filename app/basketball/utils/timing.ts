export function now() {
  return performance.now();
}

export function dtMs(prev: number, curr: number) {
  return (curr - prev);
}
