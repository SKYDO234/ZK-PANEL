import type { Bootstrap } from "../../shared/types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const binary =
    options.body instanceof ArrayBuffer || options.body instanceof Blob;
  const response = await fetch("/api" + path, {
    method: options.method || (options.body !== undefined ? "POST" : "GET"),
    credentials: "same-origin",
    headers: {
      "X-ZK-Request": "1",
      ...(options.body !== undefined
        ? {
            "Content-Type": binary
              ? options.body instanceof Blob
                ? options.body.type
                : "application/octet-stream"
              : "application/json",
          }
        : {}),
    },
    body:
      options.body === undefined
        ? undefined
        : binary
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
    signal: options.signal,
  });
  if (!response.ok) {
    let message = "Request failed. Please try again.";
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new ApiError(message, response.status);
  }
  return response.json();
}
export async function download(path: string, name: string) {
  const response = await fetch("/api" + path, { credentials: "same-origin" });
  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "Download failed." }));
    throw new Error(data.error);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const money = (paise: number, decimals = false) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: decimals || paise % 100 ? 2 : 0,
  }).format(paise / 100);
export const gb = (mb: number) => (mb / 1024).toFixed(mb % 1024 ? 1 : 0);
export const size = (bytes: number) =>
  bytes >= 1073741824
    ? (bytes / 1073741824).toFixed(2) + " GB"
    : bytes >= 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : bytes >= 1024
        ? (bytes / 1024).toFixed(1) + " KB"
        : bytes + " B";
export function ago(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}
export const date = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const uptime = (seconds: number) =>
  seconds >= 86400
    ? Math.floor(seconds / 86400) +
      "d " +
      Math.floor((seconds % 86400) / 3600) +
      "h"
    : seconds >= 3600
      ? Math.floor(seconds / 3600) +
        "h " +
        Math.floor((seconds % 3600) / 60) +
        "m"
      : Math.floor(seconds / 60) + "m";
export type { Bootstrap };
