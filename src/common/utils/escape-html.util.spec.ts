import { escapeHtml } from './escape-html.util.js';

describe('escapeHtml', () => {
  it('escapes the characters that can break out of text or attributes', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('leaves safe text untouched', () => {
    expect(escapeHtml('Xin chào Nguyễn Văn A')).toBe('Xin chào Nguyễn Văn A');
  });
});
