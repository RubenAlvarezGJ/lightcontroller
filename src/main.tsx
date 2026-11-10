import { render } from 'preact';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './ui/theme.css';
import { App } from './ui/App';
import { createAppServices } from './ui/services';

render(<App services={createAppServices()} />, document.getElementById('app')!);
