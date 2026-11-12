import { createContext, useContext } from "react";
export const PhotoAuth = createContext<() => Promise<string | null>>(
  async () => null,
);
export function usePhotoToken() {
  return useContext(PhotoAuth);
}
