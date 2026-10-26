import './styles.css';
import { createApp } from './app.js';

let app = null;

try {
  app = createApp({ document, window });
  app.start();
} catch (error) {
  console.error(error);
  document.title = `BOOT ERR: ${error.message}`;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => app?.dispose());
}
