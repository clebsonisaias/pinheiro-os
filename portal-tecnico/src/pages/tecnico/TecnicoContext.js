import { createContext, useContext } from 'react';

export const Ctx = createContext(null);
export const useTec = () => useContext(Ctx);
