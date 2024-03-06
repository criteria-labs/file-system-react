# @criteria/file-system-react

React hooks for working with the [File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API).

## Getting Started

Get all file handles within the [origin private file system (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), including the root directory handle:

```tsx
import { useFileSystem } from "@criteria/file-system-react";

function Component() {
  const handlesByPath = useFileSystem();

  return (
    <ul>
      {handlesByPath.map((handle, path) => (
        <li key={path}>{path}</li>
      ))}
    <ul>
  );
}
```
