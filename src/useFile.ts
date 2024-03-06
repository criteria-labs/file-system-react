import { useCallback, useEffect, useState } from "react";
import { useFileSystem } from "./useFileSystem";
import { isFileHandle } from "./utilities";

export function useFile(filePath: string) {
  const handles = useFileSystem({ filter: (path) => path === filePath });
  const handle = handles.get(filePath);

  const [file, setFile] = useState<File | undefined>(undefined);

  useEffect(() => {
    setFile(undefined);
    if (!handle) {
      return;
    }
    const loadFile = async () => {
      if (isFileHandle(handle)) {
        const file = await handle.getFile();
        setFile(file);
      }
    };
    loadFile();
  }, [handle]);

  const write = useCallback(
    async (data: FileSystemWriteChunkType) => {
      if (handle && isFileHandle(handle)) {
        const writable = await handle.createWritable();
        await writable.truncate(0);
        await writable.write(data);
        await writable.close();
      }
    },
    [handle]
  );

  return [file, write];
}
