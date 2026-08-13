import type { Preview } from '@storybook/react-vite';
import '@xgc2/ui-react/styles.css';
import '@xgc2/ui-tokens/base.css';
import '../src/gallery.css';
import '../src/responsive.generated.css';

const preview: Preview = {
  globalTypes: {
    skin: {
      description: 'XGC2 color skin',
      defaultValue: 'dark',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.skin = String(context.globals.skin ?? 'dark');
      return <div className="xgc-gallery-story"><Story /></div>;
    },
  ],
  parameters: {
    a11y: {
      test: 'error',
    },
    controls: {
      expanded: true,
    },
  },
};

export default preview;
