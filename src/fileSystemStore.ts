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

export async function createFile(
  directoryPath: string,
  name: string,
  data?: FileSystemWriteChunkType
) {
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
      const newPath = `${directoryPath}/${name}`;
      fileSystem = { ...fileSystem, [newPath]: newFile };
      filteredFileSystemsCache.clear();

      if (data) {
        const writable = await newFile.createWritable();
        await writable.truncate(0);
        await writable.write(data);
        await writable.close();
      }

      notifyFileSystemListeners([directoryPath, newPath]);
      return newPath;
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
      const newPath = `${directoryPath}/${name}`;
      fileSystem = {
        ...fileSystem,
        [newPath]: newDirectory,
      };
      filteredFileSystemsCache.clear();

      notifyFileSystemListeners([directoryPath, newPath]);
      return newPath;
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
  if (!file || !isFileHandle(file)) {
    throw new Error("No file at path");
  }

  if ("move" in file && typeof file.move === "function") {
    await file.move(newName);

    const directoryPath = filePath.slice(0, filePath.lastIndexOf("/"));
    const newFilePath = `${directoryPath}/${newName}`;

    const { [filePath]: _, ...rest } = fileSystem;
    fileSystem = {
      ...rest,
      [newFilePath]: file,
    };
    filteredFileSystemsCache.clear();

    notifyFileSystemListeners([directoryPath, filePath, newFilePath]);
    return newFilePath;
  } else {
    return filePath;
  }
}

export async function renameDirectory(directoryPath: string, newName: string) {
  if (directoryPath === "") {
    throw new Error("Cannot rename file system root");
  }

  const directory = fileSystem[directoryPath];
  if (!directory || !isDirectoryHandle(directory)) {
    throw new Error("No directory at path");
  }

  if ("move" in directory && typeof directory.move === "function") {
    await directory.move(newName);

    const parentDirectoryPath = directoryPath.slice(
      0,
      directoryPath.lastIndexOf("/")
    );
    const newDirectoryPath = `${parentDirectoryPath}/${newName}`;

    const { [directoryPath]: _, ...rest } = fileSystem;
    fileSystem = {
      ...rest,
      [newDirectoryPath]: directory,
    };
    filteredFileSystemsCache.clear();

    notifyFileSystemListeners([
      parentDirectoryPath,
      directoryPath,
      newDirectoryPath,
    ]);
    return newDirectoryPath;
  } else {
    return directoryPath;
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
      await file.move(directory);

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
      return newFilePath;
    }
  }
  return filePath;
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

let initialized = false;
export async function initializeFileSystemIfNeeded() {
  if (initialized) {
    return;
  }
  initialized = true;

  const initialFileSystem: FileSystem = {};
  const root = await navigator.storage.getDirectory();
  await visitHandles(root, (path, handle) => {
    initialFileSystem[path] = handle;
  });

  fileSystem = initialFileSystem;
  filteredFileSystemsCache.clear();

  notifyFileSystemListeners();
}
