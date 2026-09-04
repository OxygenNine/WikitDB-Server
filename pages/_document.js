import { Html, Head, Main, NextScript } from 'next/document';
const config = require('../wikitdb.config.js');

// 首屏绘制前根据 localStorage / 系统偏好确定主题，避免明暗闪烁（FOUC）。
// 无存储偏好时跟随系统，系统也无偏好时保持暗色（站点历史默认）。
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored
      ? stored === 'dark'
      : !window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function Document() {
  return (
    <Html lang="zh-CN" className="dark">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <title>{config.SITE_NAME}</title>
        <link rel="icon" href="/img/logo.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/img/logo.png" type="image/png" />
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.0/css/all.min.css" rel="stylesheet"></link>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
