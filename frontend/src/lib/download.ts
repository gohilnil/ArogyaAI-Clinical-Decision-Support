// Triggering a client-side file download from a Blob.
//
// There is no server involved: the JSON is built in the browser from the data
// the account is already allowed to read, and handed to the browser as an
// object URL. That URL is revoked straight after the click, because an object
// URL pins its Blob in memory for the lifetime of the document — leaving one
// per export would leak memory over a long session.

/** Save `data` as a pretty-printed JSON file named `filename`. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick: revoking synchronously can cancel the download in
  // some browsers before it has read the Blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filesystem-safe stamp like "2026-09-27" for a filename. */
export function fileStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
