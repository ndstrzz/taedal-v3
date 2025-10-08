// vite.config.mjs
import react from '@vitejs/plugin-react';

/** @type {import('vite').UserConfig} */
export default {
  plugins: [react()],
  resolve: {
    // prevent duplicated React in the bundle (classic cause of hook error #310)
    dedupe: ['react', 'react-dom']
  }
};
