import { isDirectoryHandle, isFileHandle, visitHandles } from "./utilities";

export type FileSystemOptions = { filter?: (path: string) => boolean };
export type FileSystemListener = () => void;

let fileSystem = new Map<string, FileSystemHandle>();
let listeners = new Map<FileSystemListener, FileSystemOptions>();

export function addFileSystemListener(
  listener: FileSystemListener,
  options?: FileSystemOptions
) {
  listeners.set(listener, options ?? {});
}

export function removeFileSystemListener(listener: FileSystemListener) {
  listeners.delete(listener);
}

const notifyFileSystemListeners = (changedPaths?: string[]) => {
  listeners.forEach(({ filter }, listener) => {
    if (changedPaths && filter) {
      if (changedPaths.some((path) => filter(path))) {
        listener();
      }
    } else {
      listener();
    }
  });
};

export function getFileSystem(options?: FileSystemOptions) {
  const filter = options?.filter;
  if (!filter) {
    return fileSystem;
  }

  const snapshot = new Map<string, FileSystemHandle>();
  fileSystem.forEach((handle, path) => {
    if (filter(path)) {
      snapshot.set(path, handle);
    }
  });
  return snapshot;
}

export async function createFile(directoryPath: string, name: string) {
  const directory = fileSystem.get(directoryPath);
  if (!directory || !isDirectoryHandle(directory)) {
    throw new Error("No directory at path");
  }

  try {
    const existingFile = await directory.getFileHandle(name, {
      create: false,
    });
    throw new Error(`${existingFile.name} already exists`);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      const newFile = await directory.getFileHandle(name, {
        create: true,
      });
      fileSystem.set(`${directoryPath}/${name}`, newFile);

      notifyFileSystemListeners([directoryPath, `${directoryPath}/${name}`]);
    } else {
      throw error;
    }
  }
}

export async function createDirectory(directoryPath: string, name: string) {
  const directory = fileSystem.get(directoryPath);
  if (!directory || !isDirectoryHandle(directory)) {
    throw new Error("No directory at path");
  }

  try {
    const existingDirectory = await directory.getDirectoryHandle(name, {
      create: false,
    });
    throw new Error(`${existingDirectory.name} already exists`);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      const newDirectory = await directory.getDirectoryHandle(name, {
        create: true,
      });
      fileSystem.set(`${directoryPath}/${name}`, newDirectory);

      notifyFileSystemListeners([directoryPath, `${directoryPath}/${name}`]);
    } else {
      throw error;
    }
  }
}

export async function renameFile(filePath: string, newName: string) {
  if (filePath === "") {
    throw new Error("Cannot rename file system root");
  }

  const file = fileSystem.get(filePath);
  if (!file || !isFileHandle) {
    throw new Error("No file at path");
  }

  if ("move" in file && typeof file.move === "function") {
    file.move(newName);

    const directoryPath = filePath.slice(0, filePath.lastIndexOf("/"));
    const newFilePath = `${directoryPath}/${newName}`;

    fileSystem.delete(filePath);
    fileSystem.set(newFilePath, file);

    notifyFileSystemListeners([directoryPath, filePath, newFilePath]);
  }
}

export async function moveFile(filePath: string, directoryPath: string) {
  if (filePath === "") {
    throw new Error("Cannot move file system root");
  }

  const file = fileSystem.get(filePath);
  const directory = fileSystem.get(directoryPath);
  if (file && isFileHandle(file) && directory && isDirectoryHandle(directory)) {
    if ("move" in file && typeof file.move === "function") {
      file.move(directory);

      const oldDirectoryPath = filePath.slice(0, filePath.lastIndexOf("/"));
      const newFilePath = `${directoryPath}/${file.name}`;

      fileSystem.delete(filePath);
      fileSystem.set(newFilePath, file);

      notifyFileSystemListeners([
        oldDirectoryPath,
        filePath,
        directoryPath,
        newFilePath,
      ]);
    }
  }
}

export async function removeEntry(
  path: string,
  options?: { recursive?: boolean }
) {
  if (path === "") {
    throw new Error("Cannot remove file system root");
  }

  const directoryPath = path.slice(0, path.lastIndexOf("/"));
  const directory = fileSystem.get(directoryPath);
  if (!directory || !isDirectoryHandle(directory)) {
    throw new Error("No directory at path");
  }

  await directory.removeEntry(path.slice(path.lastIndexOf("/") + 1), options);

  const removedPaths = [path];
  if (options?.recursive) {
    for (const candidate of fileSystem.keys()) {
      if (candidate.startsWith(`${path}/`)) {
        removedPaths.push(candidate);
      }
    }
  }
  removedPaths.forEach((removedPath) => fileSystem.delete(removedPath));

  notifyFileSystemListeners([directoryPath, ...removedPaths]);
}

export async function reloadFileSystem(options?: FileSystemOptions) {
  const filter = options?.filter;

  if (filter) {
    const newFileSystem = new Map<string, FileSystemHandle>();
    const root = await navigator.storage.getDirectory();
    await visitHandles(root, (path, handle) => {
      if (filter(path)) {
        newFileSystem.set(path, handle);
      }
    });

    const removedPaths: string[] = [];
    for (const path of fileSystem.keys()) {
      if (filter(path) && !newFileSystem.has(path)) {
        removedPaths.push(path);
      }
    }
    removedPaths.forEach((removedPath) => fileSystem.delete(removedPath));
    newFileSystem.forEach((handle, path) => fileSystem.set(path, handle));

    notifyFileSystemListeners([...removedPaths, ...newFileSystem.keys()]);
  } else {
    fileSystem = new Map<string, FileSystemHandle>();
    const root = await navigator.storage.getDirectory();
    await visitHandles(root, (path, handle) => {
      fileSystem.set(path, handle);
    });

    notifyFileSystemListeners();
  }
}
