// Save As: the system's own save dialog where the browser has one (the File System Access API: Chrome, Edge, the
// desktop app), else a download. Ask while the player's press still counts: a browser refuses the dialog after a wait.
/**
 * Where a file named `suggestedName` goes: `{ name, write(blob) }`, or null when the player cancelled the dialog.
 * @param {string} suggestedName
 * @param {{ description?: string, type?: string, extension?: string }} [kind]
 * @param {any} [browserWindow] the window, a seam for the tests
 */
export async function askSaveTarget(suggestedName, { description = 'Zip', type = 'application/zip', extension = '.zip' } = {}, browserWindow = globalThis) {
  if (typeof browserWindow.showSaveFilePicker === 'function') {
    let handle = null;
    try {
      handle = await browserWindow.showSaveFilePicker({ suggestedName, types: [{ description, accept: { [type]: [extension] } }] });
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      handle = null; // a page in a frame, or a browser that will not show it: downloaded instead
    }
    if (handle) return { name: String(handle.name ?? suggestedName), write: (blob) => writeToHandle(handle, blob) };
  }
  return { name: suggestedName, write: async (blob) => download(browserWindow.document, blob, suggestedName) };
}

/** The file written whole or not at all: a write that fails is aborted, and the file on disk left as it was. */
async function writeToHandle(handle, blob) {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (e) {
    await writable.abort?.().catch(() => {});
    throw e;
  }
}

/** A link to the file, pressed and gone; its URL let go once the browser has had time to read it. */
function download(pageDocument, blob, name) {
  const url = URL.createObjectURL(blob);
  const link = pageDocument.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  pageDocument.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000)?.unref?.();
}
