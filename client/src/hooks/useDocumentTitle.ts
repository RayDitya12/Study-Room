import { useEffect } from 'react';

const BASE_TITLE = 'StudyRoom';

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ?? BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
