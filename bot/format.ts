export const gb = (mb: number) => (mb / 1024).toFixed(mb % 1024 ? 1 : 0);
