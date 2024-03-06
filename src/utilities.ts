export function isFileHandle(
  handle: FileSystemHandle
): handle is FileSystemFileHandle {
  return handle.kind === "file";
}

export function isDirectoryHandle(
  handle: FileSystemHandle
): handle is FileSystemDirectoryHandle {
  return handle.kind === "directory";
}

export async function visitHandles(
  root: FileSystemHandle,
  visitor: (path: string, handle: FileSystemHandle) => void
) {
  visitor(root.name, root);
  if (isDirectoryHandle(root)) {
    for await (const child of root.values()) {
      visitHandles(child, (path, handle) =>
        visitor(`${handle.name}/${path}`, handle)
      );
    }
  }
}
