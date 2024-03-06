import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  FileSystemOptions,
  addFileSystemListener,
  getFileSystem,
  reloadFileSystem,
  removeFileSystemListener,
} from "./fileSystemStore";

export function useFileSystem(options?: FileSystemOptions) {
  const filter = options?.filter;

  const subscribe = useCallback(
    (listener: () => void) => {
      addFileSystemListener(listener, filter ? { filter } : undefined);
      return () => removeFileSystemListener(listener);
    },
    [options?.filter]
  );

  const getSnapshot = useCallback(() => {
    return getFileSystem(filter ? { filter } : undefined);
  }, [filter]);

  const store = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    reloadFileSystem(options);
  });

  return store;
}
