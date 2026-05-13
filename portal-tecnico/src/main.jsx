import React from 'react';
import { createRoot } from 'react-dom/client';
import TecnicoApp from './pages/TecnicoApp.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TecnicoApp />
  </React.StrictMode>
);
