import { useEffect, useSyncExternalStore } from "react";
import {
  FileSystemOptions,
  addFileSystemListener,
  getFileSystem,
  initializeFileSystemIfNeeded,
  removeFileSystemListener,
} from "./fileSystemStore";

export function useFileSystem(options?: FileSystemOptions) {
  const filter = options?.filter;

  const subscribe = (listener: () => void) => {
    addFileSystemListener(listener, filter ? { filter } : undefined);
    return () => removeFileSystemListener(listener);
  };

  const getSnapshot = () => {
    return getFileSystem(filter ? { filter } : undefined);
  };

  const store = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    initializeFileSystemIfNeeded();
  }, []);

  return store;
}
