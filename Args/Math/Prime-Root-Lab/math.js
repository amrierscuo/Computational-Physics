'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(document.body, {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false }
    ],
    throwOnError: false,
    strict: false
  });
});
