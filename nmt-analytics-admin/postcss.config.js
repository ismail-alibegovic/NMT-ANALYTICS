import tailwindcss from '@tailwindcss/postcss';
import stripEmptyIs from './postcss-strip-empty-is.mjs';

export default {
  plugins: [
    tailwindcss(),
    stripEmptyIs,
  ],
}
