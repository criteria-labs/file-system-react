import { isDirectoryHandle, isFileHandle, visitHandles } from "./utilities";

export type FileSystem = Record<string, FileSystemHandle>;
export type FileSystemFilter = (path: string) => boolean;
export type FileSystemOptions = { filter?: FileSystemFilter };
export type FileSystemListener = () => void;

let fileSystem: FileSystem = {};

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

let filteredFileSystemsCache = new Map<FileSystemFilter, FileSystem>();

export function getFileSystem(options?: FileSystemOptions) {
  const filter = options?.filter;
  if (!filter) {
    return fileSystem;
  }

  const cached = filteredFileSystemsCache.get(filter);
  if (cached) {
    return cached;
  }

  const filteredFileSystem: FileSystem = {};
  Object.entries(fileSystem).forEach(([path, handle]) => {
    if (filter(path)) {
      filteredFileSystem[path] = handle;
    }
  });
  filteredFileSystemsCache.set(filter, filteredFileSystem);
  return filteredFileSystem;
}

export async function createFile(directoryPath: string, name: string) {
  const directory = fileSystem[directoryPath];
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
      fileSystem = { ...fileSystem, [`${directoryPath}/${name}`]: newFile };
      filteredFileSystemsCache.clear();

      notifyFileSystemListeners([directoryPath, `${directoryPath}/${name}`]);
    } else {
      throw error;
    }
  }
}

export async function createDirectory(directoryPath: string, name: string) {
  const directory = fileSystem[directoryPath];
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
      fileSystem = {
        ...fileSystem,
        [`${directoryPath}/${name}`]: newDirectory,
      };
      filteredFileSystemsCache.clear();

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

  const file = fileSystem[filePath];
  if (!file || !isFileHandle) {
    throw new Error("No file at path");
  }

  if ("move" in file && typeof file.move === "function") {
    file.move(newName);

    const directoryPath = filePath.slice(0, filePath.lastIndexOf("/"));
    const newFilePath = `${directoryPath}/${newName}`;

    const { [filePath]: _, ...rest } = fileSystem;
    fileSystem = {
      ...rest,
      [newFilePath]: file,
    };
    filteredFileSystemsCache.clear();

    notifyFileSystemListeners([directoryPath, filePath, newFilePath]);
  }
}

export async function moveFile(filePath: string, directoryPath: string) {
  if (filePath === "") {
    throw new Error("Cannot move file system root");
  }

  const file = fileSystem[filePath];
  const directory = fileSystem[directoryPath];
  if (file && isFileHandle(file) && directory && isDirectoryHandle(directory)) {
    if ("move" in file && typeof file.move === "function") {
      file.move(directory);

      const oldDirectoryPath = filePath.slice(0, filePath.lastIndexOf("/"));
      const newFilePath = `${directoryPath}/${file.name}`;

      const { [filePath]: _, ...rest } = fileSystem;
      fileSystem = {
        ...rest,
        [newFilePath]: file,
      };
      filteredFileSystemsCache.clear();

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
  const directory = fileSystem[directoryPath];
  if (!directory || !isDirectoryHandle(directory)) {
    throw new Error("No directory at path");
  }

  await directory.removeEntry(path.slice(path.lastIndexOf("/") + 1), options);

  const removedPaths = [path];
  if (options?.recursive) {
    for (const candidate of Object.keys(fileSystem)) {
      if (candidate.startsWith(`${path}/`)) {
        removedPaths.push(candidate);
      }
    }
  }
  fileSystem = { ...fileSystem };
  removedPaths.forEach((removedPath) => delete fileSystem[removedPath]);
  filteredFileSystemsCache.clear();

  notifyFileSystemListeners([directoryPath, ...removedPaths]);
}

export async function reloadFileSystem(options?: FileSystemOptions) {
  const filter = options?.filter;

  if (filter) {
    const filteredFileSystem: FileSystem = {};
    const root = await navigator.storage.getDirectory();
    await visitHandles(root, (path, handle) => {
      if (filter(path)) {
        filteredFileSystem[path] = handle;
      }
    });

    const removedPaths: string[] = [];
    for (const path of Object.keys(fileSystem)) {
      if (filter(path) && !(path in filteredFileSystem)) {
        removedPaths.push(path);
      }
    }
    fileSystem = { ...fileSystem, ...filteredFileSystem };
    removedPaths.forEach((removedPath) => delete fileSystem[removedPath]);

    filteredFileSystemsCache.clear();

    notifyFileSystemListeners([
      ...removedPaths,
      ...Object.keys(filteredFileSystem),
    ]);
  } else {
    fileSystem = {};
    const root = await navigator.storage.getDirectory();
    await visitHandles(root, (path, handle) => {
      fileSystem[path] = handle;
    });

    filteredFileSystemsCache.clear();

    notifyFileSystemListeners();
  }
}
