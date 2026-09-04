type MonacoLike = {
  languages: {
    register: (language: { id: string }) => void;
    setLanguageConfiguration: (id: string, configuration: object) => void;
    setMonarchTokensProvider: (id: string, provider: object) => void;
  };
};

let registered = false;

export function ensureLatexLanguage(monaco: MonacoLike | { languages: MonacoLike['languages'] }) {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: 'latex' });
  monaco.languages.setLanguageConfiguration('latex', {
    comments: { lineComment: '%' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' },
    ],
  });
  monaco.languages.setMonarchTokensProvider('latex', {
    tokenizer: {
      root: [
        [/%.*$/, 'comment'],
        [/\\[a-zA-Z@]+/, 'keyword'],
        [/[{}]/, 'delimiter.bracket'],
        [/\$\$/, 'string', '@math'],
        [/\$/, 'string', '@inlinemath'],
        [/\d+/, 'number'],
      ],
      math: [
        [/\$\$/, 'string', '@pop'],
        [/./, 'string'],
      ],
      inlinemath: [
        [/\$/, 'string', '@pop'],
        [/./, 'string'],
      ],
    },
  });
}
